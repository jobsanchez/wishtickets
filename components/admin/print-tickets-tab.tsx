"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Mail,
  Package,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  CLIENT_PRINT_GEN_CONCURRENCY,
  PRINT_GEN_SEQUENTIAL_UNDER,
} from "@/lib/print-tickets/run-pool";
import { cappedFreeStandingSlotCount } from "@/lib/print-tickets/free-standing-slot-cap";
import { isFreeStandingSeatingType } from "@/lib/print-tickets/is-free-standing-section";
import { parseVirtualPrintSlotSeatId } from "@/lib/print-tickets/virtual-print-slot-id";
import { parseRecipientEmails } from "@/lib/print-tickets/parse-recipient-emails";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function formatMmSs(totalSec: number): string {
  const m = Math.floor(Math.max(0, totalSec) / 60);
  const s = Math.max(0, totalSec) % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** In-flight ZIP API work on the Print Tickets tab (build vs delete, section scope). */
type PrintZipBusy =
  | null
  | { op: "build"; scope: "all" | "single" | string }
  | { op: "delete"; scope: "all" | string };

/** Rough upper bound for “send many print tickets” (parallel prep + SMTP). Not a guarantee. */
function estimateSendEmailSeconds(ticketCount: number): number {
  const n = Math.max(1, ticketCount);
  return Math.max(45, Math.ceil(n * 2.2) + 75);
}

function isAbortError(e: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      e instanceof DOMException &&
      e.name === "AbortError") ||
    (e instanceof Error && e.name === "AbortError")
  );
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** After this many successful ticket images, reload print data from the server and pause briefly (memory / gateway breathing room). */
const PRINT_GEN_SYNC_EVERY = 100;

/** Retries transient 5xx / 429 so long bulk runs survive cold starts and short platform blips. */
async function fetchPrintTicketGenerate(body: Record<string, unknown>): Promise<Response> {
  const maxAttempts = 4;
  let last: Response | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await fetch("/api/admin/print-tickets/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (last.ok || last.status === 403 || last.status === 400) return last;
    if (attempt === maxAttempts) return last;
    if (last.status !== 429 && last.status < 500) return last;
    await sleepMs(700 * attempt + Math.floor(Math.random() * 400));
  }
  return last!;
}

interface PrintTicketInfo {
  id: string;
  ticket_image_url: string | null;
}

/** `id` is `event_seats.id` (assigned) or `print_tickets.id` (free/standing slot row). */
interface SeatItem {
  id: string;
  row_label: string;
  seat_number: string;
  printTicket?: PrintTicketInfo;
}

interface SectionItem {
  id: string;
  name: string;
  section_code: string | null;
  section_group?: string | null;
  color?: string | null;
  seating_type: string;
  /** Free/standing section capacity (for totals when no slot rows yet). */
  section_capacity?: number | null;
  seats: SeatItem[];
  /** Present after `?summary=1` load; seat rows load on expand via `?sectionId=`. */
  summaryCounts?: { seatCount: number; generatedCount: number };
}

const UNGROUPED_SECTION_LABEL = "Ungrouped";

function mergeSummarySections(prev: SectionItem[], incoming: SectionItem[]): SectionItem[] {
  return incoming.map((inc) => {
    const old = prev.find((p) => p.id === inc.id);
    if (old && old.seats.length > 0 && inc.seats.length === 0) {
      return { ...inc, seats: old.seats };
    }
    return inc;
  });
}

type SectionZipStatus = {
  sectionId: string;
  status: "none" | "pending" | "processing" | "completed" | "failed";
  zipObjectPath: string | null;
  progressPct: number;
  currentStage: string;
  errorMessage: string | null;
  updatedAt: string | null;
};

function freeStandingSlotTotal(sec: SectionItem): number {
  return cappedFreeStandingSlotCount(sec.section_capacity ?? 0);
}

interface PrintTicketsTabProps {
  eventId: string;
  eventTitle?: string;
}

export function PrintTicketsTab({ eventId }: PrintTicketsTabProps) {
  const [sections, setSections] = useState<SectionItem[]>([]);
  const sectionsRef = useRef<SectionItem[]>([]);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [sendDialog, setSendDialog] = useState<{
    printTicketId?: string;
    eventSectionId?: string;
    label: string;
    mode: "single" | "section";
  } | null>(null);
  const [sendAllSelectedDialog, setSendAllSelectedDialog] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [progress, setProgress] = useState<{
    percent?: number;
    message: string;
    subtitle?: string;
    detail?: string;
  } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [emailSelectedItems, setEmailSelectedItems] = useState<Set<string>>(new Set());
  const [resultDialog, setResultDialog] = useState<{
    title: string;
    description: string;
  } | null>(null);
  /** After first successful load for `eventId`, all sections start collapsed (id in set = collapsed). */
  const initialCollapseAppliedForEventRef = useRef<string | null>(null);
  /** After first successful load for `eventId`, all groups start collapsed (name in set = collapsed). */
  const initialGroupCollapseAppliedForEventRef = useRef<string | null>(null);

  /** User clicked Stop during in-page generation. */
  const stopPrintGenerationRef = useRef(false);
  const sendAbortControllerRef = useRef<AbortController | null>(null);
  /** Polling for async print-email jobs (`send-all-selected`). */
  const sendPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeEmailJobIdRef = useRef<string | null>(null);
  const sendEstimateTotalSecRef = useRef(0);
  const sendSubmitInFlightRef = useRef(false);
  const [sendElapsedSec, setSendElapsedSec] = useState(0);
  const [generateElapsedSec, setGenerateElapsedSec] = useState(0);
  /** Free/standing “Jump to slot” select value per section (slot number string). */
  const [printSlotJump, setPrintSlotJump] = useState<Record<string, string>>({});
  const [zipStatusBySection, setZipStatusBySection] = useState<Record<string, SectionZipStatus>>({});
  const [zipBusy, setZipBusy] = useState<PrintZipBusy>(null);
  const [overwriteZipPrompt, setOverwriteZipPrompt] = useState<{
    mode: "single" | "all";
    sectionIds: string[];
    label: string;
  } | null>(null);
  const [deleteZipPrompt, setDeleteZipPrompt] = useState<{
    mode: "single" | "all";
    sectionId?: string;
    label: string;
  } | null>(null);

  useEffect(() => {
    if (!sendingId || progress?.message !== "Sending email…") return;
    setSendElapsedSec(0);
    const id = setInterval(() => setSendElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [sendingId, progress?.message]);

  useEffect(() => {
    if (generating !== "selected") return;
    setGenerateElapsedSec(0);
    const id = setInterval(() => setGenerateElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [generating]);

  const clearSendPollInterval = useCallback(() => {
    if (sendPollIntervalRef.current != null) {
      clearInterval(sendPollIntervalRef.current);
      sendPollIntervalRef.current = null;
    }
  }, []);

  const handleCancelSend = useCallback(() => {
    sendAbortControllerRef.current?.abort();
    clearSendPollInterval();
    const jid = activeEmailJobIdRef.current;
    activeEmailJobIdRef.current = null;
    if (jid) {
      void fetch(`/api/admin/print-tickets/send-selected-email/jobs/${jid}/cancel`, {
        method: "POST",
        credentials: "same-origin",
      }).catch(() => {});
    }
    setSendingId(null);
    setTimeout(() => setProgress(null), 300);
  }, [clearSendPollInterval]);

  useEffect(() => {
    return () => {
      if (sendPollIntervalRef.current != null) {
        clearInterval(sendPollIntervalRef.current);
        sendPollIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  const refetchSectionDetail = useCallback(async (sectionId: string) => {
    try {
      const res = await fetch(
        `/api/admin/events/${eventId}/print-tickets?sectionId=${encodeURIComponent(sectionId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as { sections?: SectionItem[] };
      const sec = data.sections?.[0];
      if (!sec) return;
      setSections((prev) => prev.map((s) => (s.id === sectionId ? sec : s)));
    } catch {
      // best effort
    }
  }, [eventId]);

  const fetchData = useCallback(async (opts?: { soft?: boolean }) => {
    const soft = opts?.soft === true;
    if (!soft) setLoading(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/print-tickets?summary=1`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoadWarning(null);
        toast.error(data.error ?? "Failed to load sections");
        return;
      }
      const data = (await res.json()) as {
        sections?: SectionItem[];
        warning?: string;
      };
      const incoming = data.sections ?? [];
      if (soft) {
        const detailIds = sectionsRef.current
          .filter((s) => s.seats.length > 0)
          .map((s) => s.id);
        setSections((prev) => mergeSummarySections(prev, incoming));
        await Promise.all(detailIds.map((id) => refetchSectionDetail(id)));
      } else {
        setSections(incoming);
      }
      const w = typeof data.warning === "string" ? data.warning : null;
      setLoadWarning(w);
      if (w) toast.error(w, { duration: 8000 });
      else setLoadWarning(null);
    } catch {
      setLoadWarning(null);
      toast.error("Failed to load sections");
    } finally {
      if (!soft) setLoading(false);
    }
  }, [eventId, refetchSectionDetail]);

  const fetchZipStatuses = useCallback(async (mode: "full" | "summary" = "summary") => {
    try {
      const q = new URLSearchParams({ eventId });
      if (mode === "summary") q.set("summary", "1");
      const res = await fetch(`/api/admin/print-tickets/section-zips?${q}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => ({}))) as {
        bySection?: Record<string, SectionZipStatus>;
      };
      setZipStatusBySection(data.bySection ?? {});
    } catch {
      // best effort only; avoid noisy toasts during polling
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    void fetchZipStatuses("full");
  }, [fetchZipStatuses]);

  useEffect(() => {
    const hasActiveZip = Object.values(zipStatusBySection).some(
      (s) => s.status === "pending" || s.status === "processing"
    );
    const ms = hasActiveZip ? 4000 : 25000;
    const id = setInterval(() => {
      void fetchZipStatuses("summary");
    }, ms);
    return () => clearInterval(id);
  }, [zipStatusBySection, fetchZipStatuses]);

  useEffect(() => {
    const hasActiveZip = Object.values(zipStatusBySection).some(
      (s) => s.status === "pending" || s.status === "processing"
    );
    if (!hasActiveZip) return;
    // Keep the worker nudged from the client during active ZIP runs without relying on DB cron.
    const id = setInterval(() => {
      void fetchZipStatuses("full");
    }, 60_000);
    return () => clearInterval(id);
  }, [zipStatusBySection, fetchZipStatuses]);

  useEffect(() => {
    initialCollapseAppliedForEventRef.current = null;
    initialGroupCollapseAppliedForEventRef.current = null;
  }, [eventId]);

  useEffect(() => {
    setZipStatusBySection({});
    setOverwriteZipPrompt(null);
    setZipBusy(null);
  }, [eventId]);

  useEffect(() => {
    if (loading || sections.length === 0) return;
    if (initialCollapseAppliedForEventRef.current === eventId) return;
    setCollapsedSections(new Set(sections.map((s) => s.id)));
    initialCollapseAppliedForEventRef.current = eventId;
  }, [sections, loading, eventId]);

  useEffect(() => {
    setEmailSelectedItems((prev) => {
      if (prev.size === 0) return prev;
      const allowed = new Set<string>();
      for (const sec of sections) {
        for (const seat of sec.seats) {
          if (seat.printTicket?.ticket_image_url) {
            allowed.add(`seat-${seat.id}`);
          }
        }
      }
      const next = new Set<string>();
      for (const key of prev) {
        if (allowed.has(key)) next.add(key);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [sections]);

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
        const sec = sectionsRef.current.find((s) => s.id === sectionId);
        if (
          sec &&
          sec.seats.length === 0 &&
          (sec.summaryCounts?.seatCount ?? 0) > 0
        ) {
          queueMicrotask(() => {
            void refetchSectionDetail(sectionId);
          });
        }
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, [refetchSectionDetail]);

  const toggleGroup = useCallback((groupName: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  }, []);

  const toggleSectionSelection = useCallback(
    (sectionId: string, isAssigned: boolean, seats: SeatItem[]) => {
      setSelectedItems((prev) => {
        const next = new Set(prev);
        const useSeatRows = isAssigned || seats.length > 0;
        if (useSeatRows) {
          const pending = seats.filter((s) => !s.printTicket?.ticket_image_url);
          const allSelected =
            pending.length > 0 && pending.every((s) => next.has(`seat-${s.id}`));
          if (allSelected) {
            pending.forEach((s) => next.delete(`seat-${s.id}`));
          } else {
            pending.forEach((s) => next.add(`seat-${s.id}`));
          }
        } else {
          const key = `section-${sectionId}`;
          if (next.has(key)) next.delete(key);
          else next.add(key);
        }
        return next;
      });
    },
    []
  );

  const toggleSeatSelection = useCallback((seatId: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      const key = `seat-${seatId}`;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSeatEmailSelection = useCallback((seatId: string) => {
    setEmailSelectedItems((prev) => {
      const next = new Set(prev);
      const key = `seat-${seatId}`;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSectionEmailSelection = useCallback(
    (_sectionId: string, isAssigned: boolean, seats: SeatItem[]) => {
      setEmailSelectedItems((prev) => {
        const next = new Set(prev);
        if (isAssigned || seats.length > 0) {
          const generatedSeats = seats.filter((s) => !!s.printTicket?.ticket_image_url);
          const allSelected =
            generatedSeats.length > 0 &&
            generatedSeats.every((s) => next.has(`seat-${s.id}`));
          if (allSelected) {
            generatedSeats.forEach((s) => next.delete(`seat-${s.id}`));
          } else {
            generatedSeats.forEach((s) => next.add(`seat-${s.id}`));
          }
        }
        return next;
      });
    },
    []
  );

  const handleStopGeneration = useCallback(async () => {
    stopPrintGenerationRef.current = true;
    setGenerating(null);
    setProgress(null);
    toast.info("Stopped. Tickets already generated are kept.");
    void fetchData();
  }, [fetchData]);

  const handleGenerateSelected = useCallback(async () => {
    if (selectedItems.size === 0) return;

    stopPrintGenerationRef.current = false;

    const items: Array<{
      sectionId: string;
      seatId: string | null;
      sectionSlotIndex?: number;
    }> = [];
    for (const key of selectedItems) {
      if (key.startsWith("section-")) {
        const sectionId = key.slice("section-".length);
        items.push({ sectionId, seatId: null });
      } else if (key.startsWith("seat-")) {
        const id = key.slice("seat-".length);
        const virtual = parseVirtualPrintSlotSeatId(id);
        if (virtual) {
          items.push({
            sectionId: virtual.sectionId,
            seatId: null,
            sectionSlotIndex: virtual.slot,
          });
          continue;
        }
        const sec = sections.find((s) => s.seats.some((se) => se.id === id));
        if (!sec) continue;
        const assigned = !isFreeStandingSeatingType(sec.seating_type);
        if (assigned) {
          items.push({ sectionId: sec.id, seatId: id });
        } else {
          const seatRow = sec.seats.find((se) => se.id === id);
          const slot = parseInt(seatRow?.seat_number ?? "1", 10);
          items.push({
            sectionId: sec.id,
            seatId: null,
            sectionSlotIndex: Number.isFinite(slot) && slot >= 1 ? slot : 1,
          });
        }
      }
    }

    if (items.length === 0) {
      toast.error("Nothing to generate");
      return;
    }

    setGenerating("selected");
    setProgress({
      percent: 0,
      message: "Generating tickets…",
      subtitle: "Print tickets",
      detail: "Starting generation. Images are created on the server in batches.",
    });

    try {
      const total = items.length;
      let successCount = 0;
      let showedError = false;
      /** Count 5xx after retries; surfaced in UI without per-request error toasts or console spam from our side. */
      let serverErrorCount = 0;
      let processed = 0;
      let lastSyncedMilestone = 0;
      const conc =
        total < PRINT_GEN_SEQUENTIAL_UNDER ? 1 : CLIENT_PRINT_GEN_CONCURRENCY;
      for (let off = 0; off < items.length; off += conc) {
        if (stopPrintGenerationRef.current) {
          if (successCount > 0) {
            toast.info(`Stopped after ${successCount} ticket(s). Generated images are saved.`);
            void fetchData();
          } else {
            toast.info("Stopped.");
          }
          setGenerating(null);
          setProgress(null);
          return;
        }
        const wave = items.slice(off, off + conc);
        const results = await Promise.all(
          wave.map(async ({ sectionId, seatId, sectionSlotIndex }) => {
            if (stopPrintGenerationRef.current) {
              return { ok: false as const, generated: 0, forbidden: false as const, err: false as const };
            }
            const res = await fetchPrintTicketGenerate({
              eventId,
              eventSectionId: sectionId,
              eventSeatId: seatId,
              sectionSlotIndex,
              generateAllSeats: seatId === null && sectionSlotIndex === undefined,
            });
            const data = (await res.json().catch(() => ({}))) as {
              generated?: number;
              error?: string;
            };
            if (res.status === 403) {
              return { ok: false as const, generated: 0, forbidden: true as const, err: false as const };
            }
            if (res.ok) {
              return {
                ok: true as const,
                generated: typeof data.generated === "number" ? data.generated : 1,
                forbidden: false as const,
                err: false as const,
              };
            }
            const serverError = res.status >= 500;
            return {
              ok: false as const,
              generated: 0,
              forbidden: false as const,
              err: true as const,
              serverError,
              message: data.error,
            };
          })
        );
        let forbiddenWave = false;
        for (const r of results) {
          if (r.forbidden) {
            toast.error("You don't have permission");
            showedError = true;
            forbiddenWave = true;
            break;
          }
          if (r.ok) successCount += r.generated;
          else if ("err" in r && r.err && "serverError" in r && r.serverError) {
            serverErrorCount += 1;
            const detail =
              "message" in r && typeof r.message === "string" && r.message.trim() ? r.message.trim() : "";
            if (serverErrorCount === 1) {
              if (detail) {
                toast.error(detail, { duration: 20000 });
              } else {
                toast.error(
                  "Print generation failed (HTTP 500). Check the dev terminal for [print-tickets/generate] logs.",
                  { duration: 15000 }
                );
              }
            }
          } else if ("err" in r && r.err && !showedError) {
            toast.error(r.message ?? "Failed to generate ticket");
            showedError = true;
          }
        }
        if (stopPrintGenerationRef.current) {
          if (successCount > 0) {
            toast.info(`Stopped after ${successCount} ticket(s). Generated images are saved.`);
            void fetchData();
          } else {
            toast.info("Stopped.");
          }
          setGenerating(null);
          setProgress(null);
          return;
        }
        if (forbiddenWave) break;
        processed += wave.length;
        const p = total > 0 ? Math.round((Math.min(processed, total) / total) * 100) : 0;

        while (successCount >= lastSyncedMilestone + PRINT_GEN_SYNC_EVERY) {
          if (stopPrintGenerationRef.current) break;
          lastSyncedMilestone += PRINT_GEN_SYNC_EVERY;
          setProgress({
            percent: p,
            message: "Syncing progress…",
            subtitle: `${lastSyncedMilestone} generated`,
            detail: [
              "Refreshing this list from the server, then continuing…",
              serverErrorCount > 0
                ? `${serverErrorCount} server error${serverErrorCount === 1 ? "" : "s"} so far`
                : null,
            ]
              .filter(Boolean)
              .join("\n"),
          });
          await fetchData({ soft: true });
          await sleepMs(1200);
        }
        if (stopPrintGenerationRef.current) {
          if (successCount > 0) {
            toast.info(`Stopped after ${successCount} ticket(s). Generated images are saved.`);
            void fetchData();
          } else {
            toast.info("Stopped.");
          }
          setGenerating(null);
          setProgress(null);
          return;
        }

        setProgress({
          percent: p,
          message: "Generating tickets…",
          subtitle: `${Math.min(processed, total)} of ${total}`,
          detail:
            serverErrorCount > 0
              ? `${serverErrorCount} server error${serverErrorCount === 1 ? "" : "s"} — run continues`
              : "Rendering each ticket image on the server.",
        });
      }
      if (successCount > 0) {
        toast.success(successCount > 1 ? `Generated ${successCount} tickets` : "Ticket generated");
        if (serverErrorCount > 0) {
          toast.info(
            `${serverErrorCount} request${serverErrorCount === 1 ? "" : "s"} failed with a server error. Refresh the page and retry any seats that still need images.`,
            { duration: 10000 }
          );
        }
        setResultDialog({
          title: "Ticket generation complete",
          description:
            serverErrorCount > 0
              ? successCount > 1
                ? `Generated ${successCount} tickets. ${serverErrorCount} request(s) hit a server error — use Refresh page if the list looks stale, then retry failed rows.`
                : `Generated 1 ticket. ${serverErrorCount} request(s) hit a server error — refresh if needed, then retry failed rows.`
              : successCount > 1
                ? `Generated ${successCount} tickets successfully.`
                : "Generated 1 ticket successfully.",
        });
        setSelectedItems(new Set());
        fetchData();
      } else if (!showedError) {
        toast.error(
          serverErrorCount > 0
            ? "Generation failed due to server errors. Try Refresh page, then generate again."
            : "Generation failed"
        );
      }
      setGenerating(null);
      setProgress(null);
    } catch {
      toast.error("Failed to generate tickets");
      setGenerating(null);
      setProgress(null);
    }
  }, [eventId, fetchData, sections, selectedItems]);

  const hasSelection = selectedItems.size > 0;
  const emailSelectedCount = emailSelectedItems.size;
  const hasEmailSelection = emailSelectedCount > 0;
  const allGenerateSelectableKeys = useMemo(() => {
    const keys: string[] = [];
    for (const sec of sections) {
      const isAssigned = !isFreeStandingSeatingType(sec.seating_type);
      const freeCap = freeStandingSlotTotal(sec);
      if (isAssigned || sec.seats.length > 0) {
        for (const seat of sec.seats) {
          if (!seat.printTicket?.ticket_image_url) keys.push(`seat-${seat.id}`);
        }
      } else if (freeCap > 0) {
        keys.push(`section-${sec.id}`);
      }
    }
    return keys;
  }, [sections]);
  const allGenerateSelected =
    allGenerateSelectableKeys.length > 0 &&
    allGenerateSelectableKeys.every((k) => selectedItems.has(k));
  const collapsibleSectionIds = useMemo(
    () =>
      sections
        .filter((sec) => sec.seats.length > 0 || (sec.summaryCounts?.seatCount ?? 0) > 0)
        .map((sec) => sec.id),
    [sections]
  );
  const allSectionsCollapsed =
    collapsibleSectionIds.length > 0 &&
    collapsibleSectionIds.every((sectionId) => collapsedSections.has(sectionId));
  const sectionsByGroup = useMemo(() => {
    const grouped = new Map<string, SectionItem[]>();
    for (const section of sections) {
      const groupName = (section.section_group ?? "").trim() || UNGROUPED_SECTION_LABEL;
      const bucket = grouped.get(groupName) ?? [];
      bucket.push(section);
      grouped.set(groupName, bucket);
    }
    return [...grouped.entries()].map(([groupName, groupedSections]) => ({
      groupName,
      sections: groupedSections,
    }));
  }, [sections]);

  useEffect(() => {
    if (loading || sectionsByGroup.length === 0) return;
    if (initialGroupCollapseAppliedForEventRef.current === eventId) return;
    setCollapsedGroups(new Set(sectionsByGroup.map((group) => group.groupName)));
    initialGroupCollapseAppliedForEventRef.current = eventId;
  }, [sectionsByGroup, loading, eventId]);

  useEffect(() => {
    setCollapsedGroups((prev) => {
      if (prev.size === 0) return prev;
      const existing = new Set(sectionsByGroup.map((group) => group.groupName));
      const next = new Set<string>();
      for (const groupName of prev) {
        if (existing.has(groupName)) next.add(groupName);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [sectionsByGroup]);

  const toggleSelectAllGenerate = useCallback(() => {
    if (allGenerateSelectableKeys.length === 0) return;
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (allGenerateSelected) {
        allGenerateSelectableKeys.forEach((k) => next.delete(k));
      } else {
        allGenerateSelectableKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  }, [allGenerateSelectableKeys, allGenerateSelected]);

  const toggleAllSectionsCollapse = useCallback(() => {
    if (collapsibleSectionIds.length === 0) return;
    const groupNames = sectionsByGroup.map((group) => group.groupName);
    const shouldCollapseGroups = !groupNames.every((groupName) =>
      collapsedGroups.has(groupName)
    );
    const sectionIdsNeedingDetail = sectionsRef.current
      .filter(
        (sec) =>
          collapsibleSectionIds.includes(sec.id) &&
          sec.seats.length === 0 &&
          (sec.summaryCounts?.seatCount ?? 0) > 0
      )
      .map((sec) => sec.id);

    setCollapsedSections((prev) => {
      const next = new Set(prev);
      const shouldCollapseAll = !collapsibleSectionIds.every((sectionId) => next.has(sectionId));
      for (const sectionId of collapsibleSectionIds) {
        if (shouldCollapseAll) next.add(sectionId);
        else next.delete(sectionId);
      }
      if (!shouldCollapseAll && sectionIdsNeedingDetail.length > 0) {
        queueMicrotask(() => {
          void Promise.all(
            sectionIdsNeedingDetail.map((sectionId) => refetchSectionDetail(sectionId))
          );
        });
      }
      return next;
    });
    setCollapsedGroups(shouldCollapseGroups ? new Set(groupNames) : new Set<string>());
  }, [collapsibleSectionIds, refetchSectionDetail, sectionsByGroup, collapsedGroups]);

  const handleSendClick = useCallback((printTicketId: string, label: string) => {
    setSendDialog({ printTicketId, label, mode: "single" });
    setRecipientEmail("");
  }, []);

  const handleSendAllSelectedSubmit = useCallback(async () => {
    const email = recipientEmail.trim();
    if (!email) {
      toast.error("Enter at least one recipient email");
      return;
    }
    const parsedRecipients = parseRecipientEmails(email);
    if (!parsedRecipients.ok) {
      toast.error(parsedRecipients.error);
      return;
    }
    const items: Array<{
      sectionId: string;
      seatId: string | null;
      sectionSlotIndex?: number;
    }> = [];
    for (const key of emailSelectedItems) {
      if (key.startsWith("section-")) {
        const sectionId = key.slice("section-".length);
        items.push({ sectionId, seatId: null });
      } else if (key.startsWith("seat-")) {
        const id = key.slice("seat-".length);
        const virtual = parseVirtualPrintSlotSeatId(id);
        if (virtual) {
          items.push({
            sectionId: virtual.sectionId,
            seatId: null,
            sectionSlotIndex: virtual.slot,
          });
          continue;
        }
        const sec = sections.find((s) => s.seats.some((se) => se.id === id));
        if (!sec) continue;
        const assigned = !isFreeStandingSeatingType(sec.seating_type);
        if (assigned) {
          items.push({ sectionId: sec.id, seatId: id });
        } else {
          const seatRow = sec.seats.find((se) => se.id === id);
          const slot = parseInt(seatRow?.seat_number ?? "1", 10);
          items.push({
            sectionId: sec.id,
            seatId: null,
            sectionSlotIndex: Number.isFinite(slot) && slot >= 1 ? slot : 1,
          });
        }
      }
    }
    if (items.length === 0) return;
    sendAbortControllerRef.current?.abort();
    const ac = new AbortController();
    sendAbortControllerRef.current = ac;
    sendEstimateTotalSecRef.current =
      estimateSendEmailSeconds(items.length) * parsedRecipients.emails.length;
    setSendingId("send-all-selected");
    setProgress({
      message: "Sending email…",
      subtitle: "Bulk ZIP send",
      detail:
        "Queuing job… Keep this tab open. You get one email with a ZIP download link for all ticket images (may take a few minutes to generate).",
    });
    const endSendUi = () => {
      clearSendPollInterval();
      activeEmailJobIdRef.current = null;
      setSendingId(null);
      setTimeout(() => setProgress(null), 300);
    };
    try {
      clearSendPollInterval();
      const enqueueRes = await fetch("/api/admin/print-tickets/send-selected-email/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, recipientEmail: email, items }),
        signal: ac.signal,
      });
      const enq = (await enqueueRes.json().catch(() => ({}))) as {
        jobId?: string;
        totalTickets?: number;
        error?: string;
      };
      if (enqueueRes.status === 403) {
        toast.error("You don't have permission");
        endSendUi();
        return;
      }
      if (!enqueueRes.ok) {
        toast.error(enq.error ?? "Failed to queue send job");
        endSendUi();
        return;
      }
      const jobId = typeof enq.jobId === "string" ? enq.jobId : null;
      if (!jobId) {
        toast.error("Invalid server response (missing job id)");
        endSendUi();
        return;
      }
      const totalTickets =
        typeof enq.totalTickets === "number" ? enq.totalTickets : items.length;

      setSendAllSelectedDialog(false);
      activeEmailJobIdRef.current = jobId;
      const pollStartedAt = Date.now();
      setProgress({
        message: "Sending email…",
        subtitle: `${totalTickets} ticket${totalTickets === 1 ? "" : "s"} queued`,
        detail: `Sending from this tab (0 / ${totalTickets}). Do not close until the job finishes.`,
      });

      const pollOnce = async (): Promise<boolean> => {
        if (ac.signal.aborted) return true;
        try {
        const r = await fetch(
          `/api/admin/print-tickets/send-selected-email/jobs/${jobId}/process`,
          {
            method: "POST",
            credentials: "same-origin",
            signal: ac.signal,
          }
        );
        const j = (await r.json().catch(() => ({}))) as {
          status?: string;
          cursor?: number;
          total?: number;
          chunksCompleted?: number;
          errorMessage?: string | null;
          error?: string;
        };
        if (r.status === 503) {
          endSendUi();
          toast.error(
            j.error ??
              "Server missing SUPABASE_SERVICE_ROLE_KEY — add it in hosting env (runtime) to send mail."
          );
          return true;
        }
        if (!r.ok) {
          endSendUi();
          toast.error(j.error ?? "Could not run send job step");
          return true;
        }
        const cur = typeof j.cursor === "number" ? j.cursor : 0;
        const tot = typeof j.total === "number" ? j.total : totalTickets;
        const chunks = typeof j.chunksCompleted === "number" ? j.chunksCompleted : 0;
        const st = j.status ?? "";
        const pct = tot > 0 ? Math.round((Math.min(cur, tot) / tot) * 100) : 0;
        const stalledHint =
          st === "pending" && Date.now() - pollStartedAt > 35_000
            ? " · Still pending: confirm `SUPABASE_SERVICE_ROLE_KEY` on the host (runtime) and migration `00166` applied."
            : "";
        const isZipPhase = st === "processing" && cur >= tot;
        const displayPct = pct;
        const isUploadingPhase = isZipPhase;
        const headline = isZipPhase
          ? isUploadingPhase
            ? "ZIP processing..."
            : `ZIP preparation: ${displayPct}% completed`
          : `Job: ${cur} / ${tot} tickets (${displayPct}% completed) · ${chunks} worker step(s) · ${st}${stalledHint}`;
        setProgress({
          percent: displayPct,
          message: "Sending email…",
          subtitle: isZipPhase ? "ZIP packaging" : "Email job",
          detail: [
            headline,
            isZipPhase ? "Building ZIP files for selected sections." : null,
          ]
            .filter(Boolean)
            .join("\n"),
        });
        if (st === "completed") {
          endSendUi();
          const rc = parsedRecipients.emails.length;
          toast.success(
            rc > 1
              ? `Sent ${tot} tickets to ${rc} recipients (one email each; ZIP download links for bulk files)`
              : tot > 1
                ? `Sent ${tot} tickets — one email with ZIP download link`
                : "Email sent"
          );
          setResultDialog({
            title: "Email sent",
            description:
              chunks > 1
                ? rc > 1
                  ? `Sent ${tot} ticket${tot === 1 ? "" : "s"} to ${rc} recipient${rc === 1 ? "" : "s"}. Each got one email with a ZIP download link for bulk files.`
                  : `Sent ${tot} ticket${tot === 1 ? "" : "s"} to ${email} in one email (ZIP link(s) as needed).`
                : rc > 1
                  ? `Sent ${tot} ticket${tot === 1 ? "" : "s"} to ${rc} recipient${rc === 1 ? "" : "s"}.`
                  : tot > 1
                    ? `Sent ${tot} tickets to ${email}.`
                    : `Sent 1 ticket to ${email}.`,
          });
          setRecipientEmail("");
          setEmailSelectedItems(new Set());
          return true;
        }
        if (st === "failed") {
          endSendUi();
          toast.error(j.errorMessage ?? "Send job failed");
          return true;
        }
        if (st === "cancelled") {
          endSendUi();
          toast.info("Send job cancelled.");
          return true;
        }
        return false;
        } catch (e: unknown) {
          if (isAbortError(e)) return true;
          endSendUi();
          toast.error("Could not poll send job");
          return true;
        }
      };

      const done = await pollOnce();
      if (done) return;
      sendPollIntervalRef.current = setInterval(() => {
        void (async () => {
          const stop = await pollOnce();
          if (stop) {
            clearSendPollInterval();
          }
        })();
      }, 2000);
    } catch (e: unknown) {
      endSendUi();
      if (isAbortError(e)) {
        toast.info("Send cancelled.");
        return;
      }
      toast.error("Failed to send email");
    } finally {
      sendAbortControllerRef.current = null;
    }
  }, [recipientEmail, eventId, sections, emailSelectedItems, clearSendPollInterval]);

  const handleSendSubmit = useCallback(async () => {
    if (sendSubmitInFlightRef.current) return;
    if (!sendDialog) return;
    const email = recipientEmail.trim();
    if (!email) {
      toast.error("Enter at least one recipient email");
      return;
    }
    const parsedRecipients = parseRecipientEmails(email);
    if (!parsedRecipients.ok) {
      toast.error(parsedRecipients.error);
      return;
    }
    const sendKey =
      sendDialog.mode === "section"
        ? `section-${sendDialog.eventSectionId}`
        : sendDialog.printTicketId ?? "";
    sendAbortControllerRef.current?.abort();
    const ac = new AbortController();
    sendAbortControllerRef.current = ac;
    if (sendDialog.mode === "section" && sendDialog.eventSectionId) {
      const sec = sections.find((s) => s.id === sendDialog.eventSectionId);
      const n =
        sec?.seats.filter((st) => !!st.printTicket?.ticket_image_url).length ?? 1;
      sendEstimateTotalSecRef.current =
        estimateSendEmailSeconds(n) * parsedRecipients.emails.length;
    } else {
      sendEstimateTotalSecRef.current = estimateSendEmailSeconds(1);
    }
    setSendingId(sendKey);
    setProgress({
      message: "Sending email…",
      subtitle: sendDialog.label,
      detail:
        "Preparing attachments and sending. This may take a while for many tickets.",
    });
    sendSubmitInFlightRef.current = true;
    try {
      let res: Response;
      let data: {
        sent?: number;
        recipientCount?: number;
        error?: string;
      };
      if (sendDialog.mode === "section" && sendDialog.eventSectionId) {
        res = await fetch("/api/admin/print-tickets/send-section-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            eventSectionId: sendDialog.eventSectionId,
            recipientEmail: email,
          }),
          signal: ac.signal,
        });
        data = await res.json().catch(() => ({}));
      } else if (sendDialog.mode === "single" && sendDialog.printTicketId) {
        res = await fetch(
          `/api/admin/print-tickets/${sendDialog.printTicketId}/send-email`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipientEmail: email }),
            signal: ac.signal,
          }
        );
        data = await res.json().catch(() => ({}));
      } else {
        toast.error("Invalid send configuration");
        return;
      }
      if (res.status === 403) {
        toast.error("You don't have permission");
        return;
      }
      if (!res.ok) {
        toast.error(data.error ?? "Failed to send email");
        return;
      }
      const count = typeof data.sent === "number" ? data.sent : 1;
      const rc =
        typeof data.recipientCount === "number" ? data.recipientCount : parsedRecipients.emails.length;
      toast.success(
        rc > 1 ? `Sent to ${rc} recipients` : count > 1 ? `Sent ${count} tickets` : "Email sent"
      );
      setResultDialog({
        title: "Email sent",
        description:
          rc > 1
            ? `Sent ${count} ticket${count === 1 ? "" : "s"} to ${rc} recipient${rc === 1 ? "" : "s"} for ${sendDialog.label}.`
            : count > 1
              ? `Sent ${count} tickets to ${email} for ${sendDialog.label}.`
              : `Sent 1 ticket to ${email} for ${sendDialog.label}.`,
      });
      setSendDialog(null);
    } catch (e: unknown) {
      if (isAbortError(e)) {
        toast.info("Send cancelled.");
        return;
      }
      toast.error("Failed to send email");
    } finally {
      sendSubmitInFlightRef.current = false;
      sendAbortControllerRef.current = null;
      setSendingId(null);
      setTimeout(() => setProgress(null), 300);
    }
  }, [sendDialog, recipientEmail, eventId, sections]);

  const handleDeleteAll = useCallback(async () => {
    setDeleting(true);
    setProgress({
      percent: 0,
      message: "Deleting tickets…",
      subtitle: "Print tickets",
      detail: FLOATING_PROGRESS_PRESETS.deleting.detail,
    });
    try {
      const res = await fetch(`/api/admin/events/${eventId}/print-tickets`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        toast.error("You don't have permission");
        return;
      }
      if (!res.ok) {
        toast.error(data.error ?? "Failed to delete tickets");
        return;
      }
      const count = typeof data.deleted === "number" ? data.deleted : 0;
      toast.success(count > 0 ? `Deleted ${count} generated tickets` : "No tickets to delete");
      setSelectedItems(new Set());
      fetchData();
    } catch {
      toast.error("Failed to delete tickets");
    } finally {
      setDeleting(false);
      setProgress(null);
      setDeleteDialogOpen(false);
    }
  }, [eventId, fetchData]);

  const enqueueZipJobs = useCallback(
    async (opts: { mode: "single" | "all"; sectionId?: string; overwrite?: boolean }) => {
      setZipBusy({
        op: "build",
        scope: opts.mode === "all" ? "all" : opts.sectionId ?? "single",
      });
      try {
        const res = await fetch("/api/admin/print-tickets/section-zips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            sectionId: opts.sectionId,
            generateAll: opts.mode === "all",
            overwrite: opts.overwrite === true,
          }),
          signal: AbortSignal.timeout(180_000),
        });
        const data = (await res.json().catch(() => ({}))) as {
          queued?: string[];
          existing?: Array<{ sectionId?: string }>;
          requiresOverwrite?: boolean;
          error?: string;
          inlineSkipped?: boolean;
        };
        if (res.status === 403) {
          toast.error("You don't have permission");
          return;
        }
        if (res.status === 409 && data.requiresOverwrite) {
          const sectionIds = (data.existing ?? [])
            .map((x) => x.sectionId)
            .filter((x): x is string => typeof x === "string");
          setOverwriteZipPrompt({
            mode: opts.mode,
            sectionIds,
            label:
              opts.mode === "all"
                ? "ZIP file(s) already exist for some sections. Overwrite and regenerate?"
                : "ZIP file already exists for this section. Overwrite and regenerate?",
          });
          if ((data.queued?.length ?? 0) > 0) {
            toast.info(`Queued ${data.queued!.length} section ZIP job(s).`);
          }
          return;
        }
        if (!res.ok) {
          toast.error(data.error ?? "Failed to queue ZIP job(s)");
          return;
        }
        const q = data.queued?.length ?? 0;
        if (q > 0) {
          toast.success(
            data.inlineSkipped
              ? `Queued ${q} section ZIP job(s). Finishing in the background — status updates every few seconds.`
              : `Queued ${q} section ZIP job(s)`
          );
        } else {
          toast.success("No ZIP jobs queued");
        }
        await fetchZipStatuses("full");
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "TimeoutError") {
          toast.error("ZIP request timed out. Check section ZIP status or try again.");
        } else {
          toast.error("Failed to queue ZIP job(s)");
        }
      } finally {
        setZipBusy(null);
      }
    },
    [eventId, fetchZipStatuses]
  );

  const handleGenerateSectionZip = useCallback(
    async (sectionId: string, overwrite = false) => {
      await enqueueZipJobs({ mode: "single", sectionId, overwrite });
    },
    [enqueueZipJobs]
  );

  const handleGenerateAllZips = useCallback(
    async (overwrite = false) => {
      await enqueueZipJobs({ mode: "all", overwrite });
    },
    [enqueueZipJobs]
  );

  const handleDeleteSectionZip = useCallback(
    async (sectionId: string) => {
      setZipBusy({ op: "delete", scope: sectionId });
      try {
        const res = await fetch("/api/admin/print-tickets/section-zips", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, sectionId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          deletedSections?: number;
          deletedZipObjects?: number;
          error?: string;
        };
        if (res.status === 403) {
          toast.error("You don't have permission");
          return;
        }
        if (!res.ok) {
          toast.error(data.error ?? "Failed to delete ZIP");
          return;
        }
        toast.success(
          `Deleted ZIP for section (${data.deletedZipObjects ?? 0} file${(data.deletedZipObjects ?? 0) === 1 ? "" : "s"})`
        );
        await fetchZipStatuses("summary");
      } catch {
        toast.error("Failed to delete ZIP");
      } finally {
        setZipBusy(null);
      }
    },
    [eventId, fetchZipStatuses]
  );

  const handleDeleteAllZips = useCallback(
    async () => {
      setZipBusy({ op: "delete", scope: "all" });
      try {
        const res = await fetch("/api/admin/print-tickets/section-zips", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, deleteAll: true }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          deletedSections?: number;
          deletedZipObjects?: number;
          error?: string;
        };
        if (res.status === 403) {
          toast.error("You don't have permission");
          return;
        }
        if (!res.ok) {
          toast.error(data.error ?? "Failed to delete all ZIPs");
          return;
        }
        toast.success(
          `Deleted ${data.deletedZipObjects ?? 0} ZIP file${(data.deletedZipObjects ?? 0) === 1 ? "" : "s"} across ${data.deletedSections ?? 0} section${(data.deletedSections ?? 0) === 1 ? "" : "s"}`
        );
        await fetchZipStatuses("summary");
      } catch {
        toast.error("Failed to delete all ZIPs");
      } finally {
        setZipBusy(null);
      }
    },
    [eventId, fetchZipStatuses]
  );

  const hasGeneratedTickets = sections.some(
    (s) =>
      (s.summaryCounts?.generatedCount ?? 0) > 0 ||
      s.seats.some((seat) => seat.printTicket?.ticket_image_url)
  );

  const busy =
    loading || generating !== null || sendingId !== null || deleting || zipBusy !== null;

  const printTicketsBarProps = useMemo(() => {
    if (loading) {
      return {
        message: "Loading sections…",
        subtitle: "Print tickets",
        detail: FLOATING_PROGRESS_PRESETS.genericLoad.detail,
        percent: undefined,
      };
    }
    if (deleting) {
      return {
        message: progress?.message ?? "Deleting tickets…",
        subtitle: progress?.subtitle ?? "Print tickets",
        detail: progress?.detail ?? FLOATING_PROGRESS_PRESETS.deleting.detail,
        percent: progress?.percent,
      };
    }
    if (zipBusy !== null) {
      if (zipBusy.op === "delete") {
        return {
          message:
            zipBusy.scope === "all" ? "Removing ZIP files…" : "Removing section ZIP…",
          subtitle: "Print tickets",
          detail: "Deleting stored ZIP artifacts from storage.",
          percent: undefined,
        };
      }
      const sectionName =
        zipBusy.scope !== "all" && zipBusy.scope !== "single"
          ? sections.find((s) => s.id === zipBusy.scope)?.name ?? null
          : null;
      return {
        message:
          zipBusy.scope === "all" ? "Building section ZIPs…" : "Building section ZIP…",
        subtitle: "Print tickets",
        detail:
          zipBusy.scope === "all"
            ? "Queuing jobs and packaging ticket images. Large sections can take a minute."
            : zipBusy.scope === "single"
              ? "Packaging images for the selected section."
              : sectionName
                ? `Packaging images for ${sectionName}.`
                : "Packaging images for this section.",
        percent: undefined,
      };
    }
    if (progress) {
      let detail = progress.detail;
      if (sendingId !== null && progress.message === "Sending email…") {
        detail = [detail, `Elapsed ${formatMmSs(sendElapsedSec)}`]
          .filter(Boolean)
          .join("\n");
      } else if (
        generating === "selected" &&
        (progress.message === "Generating tickets…" ||
          progress.message === "Syncing progress…")
      ) {
        detail = [detail, `Elapsed ${formatMmSs(generateElapsedSec)}`]
          .filter(Boolean)
          .join("\n");
      }
      return {
        message: progress.message,
        subtitle: progress.subtitle,
        detail,
        percent: progress.percent,
      };
    }
    return {
      message: "Working…",
      subtitle: "Print tickets",
      detail: FLOATING_PROGRESS_PRESETS.genericLoad.detail,
      percent: undefined,
    };
  }, [
    loading,
    deleting,
    zipBusy,
    sections,
    progress,
    sendingId,
    generating,
    sendElapsedSec,
    generateElapsedSec,
  ]);

  /** Close recipient dialogs while the floating “Sending email…” overlay is active so they do not stack visually. */
  const hideSendDialogsForEmailProgress =
    sendingId !== null && progress?.message === "Sending email…";

  if (loading && sections.length === 0) {
    return (
      <>
        <FloatingProgressBar
          active
          {...FLOATING_PROGRESS_PRESETS.genericLoad}
          message="Loading sections…"
          subtitle="Print tickets"
        />
        <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
          <div className="text-foreground-muted">Loading sections…</div>
        </div>
      </>
    );
  }

  return (
    <div>
      <FloatingProgressBar
        active={busy}
        message={printTicketsBarProps.message}
        subtitle={printTicketsBarProps.subtitle}
        detail={printTicketsBarProps.detail}
        percent={printTicketsBarProps.percent}
        footer={
          generating === "selected" &&
          (progress?.message === "Generating tickets…" || progress?.message === "Syncing progress…") ? (
            <div className="flex max-w-md flex-col items-center gap-3 px-2">
              <p className="text-center text-xs leading-relaxed text-amber-900 dark:text-amber-100/95">
                Do not close this window or tab. Closing it will disrupt ticket generation and stop the process.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/30 bg-white/10 text-foreground hover:bg-white/15"
                onClick={() => void handleStopGeneration()}
              >
                Stop generation
              </Button>
            </div>
          ) : sendingId !== null && progress?.message === "Sending email…" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/30 bg-white/10 text-foreground hover:bg-white/15"
              onClick={handleCancelSend}
            >
              Cancel send
            </Button>
          ) : undefined
        }
      />
      <h2 className="text-lg font-semibold text-foreground mb-2">Print Tickets</h2>
      <p className="text-sm text-foreground-muted mb-2">
        Generate ticket images for sections or seats without marking them sold. Send tickets via email for printing.
      </p>
      <p className="text-xs text-foreground-muted mb-4 max-w-3xl leading-relaxed">
        Pre-print rows live in <code className="text-foreground/90">print_tickets</code> (generate from Seat
        Configurator or top up here). Buyer sales allocate from that inventory when available. Free/standing slot
        lists are capped by{" "}
        <code className="text-foreground/90">MAX_FREE_STANDING_PRINT_SLOTS</code> on the server (defaults to 2000 if
        unset).
      </p>
      {loadWarning && (
        <div
          className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100"
          role="alert"
        >
          {loadWarning}
        </div>
      )}
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="button"
            tabIndex={busy || allGenerateSelectableKeys.length === 0 ? -1 : 0}
            className="inline-flex items-center gap-2 text-sm text-foreground-muted hover:text-foreground"
            onClick={toggleSelectAllGenerate}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleSelectAllGenerate();
              }
            }}
            aria-disabled={busy || allGenerateSelectableKeys.length === 0}
          >
            <Checkbox
              checked={allGenerateSelected}
              className="data-[state=checked]:bg-[var(--wish-orange)] data-[state=checked]:border-[var(--wish-orange)]"
            />
            Select all for generation
          </div>
          <span className="self-end text-xs text-foreground-muted tabular-nums sm:self-auto">
            {allGenerateSelectableKeys.length} pending
          </span>
        </div>
        <div className="mb-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={toggleAllSectionsCollapse}
            disabled={busy || collapsibleSectionIds.length === 0}
          >
            {allSectionsCollapsed ? "Expand all sections" : "Collapse all sections"}
          </Button>
        </div>
        <div className="mb-4 flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <Button
            size="sm"
            variant="secondary"
            className="w-full justify-center text-[var(--wish-orange)] border border-[var(--wish-orange)]/30 bg-[var(--wish-orange)]/10 hover:bg-[var(--wish-orange)]/15 sm:w-auto"
            onClick={handleGenerateSelected}
            disabled={!hasSelection || busy}
          >
            <ImageIcon className="h-4 w-4 mr-1" />
            Generate
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="w-full justify-center text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 sm:w-auto"
            onClick={() => {
              setSendAllSelectedDialog(true);
              setRecipientEmail("");
            }}
            disabled={!hasEmailSelection || busy}
            aria-label={`Send selected tickets via email, ${emailSelectedCount} selected for email`}
          >
            <Mail className="h-4 w-4 mr-1" />
            Send selected
            <span className="ml-1.5 tabular-nums text-emerald-700/90 dark:text-emerald-200/90">({emailSelectedCount})</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="w-full justify-center text-sky-700 dark:text-sky-300 border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/15 sm:w-auto"
            onClick={() => void handleGenerateAllZips()}
            disabled={busy}
          >
            <Package className="h-4 w-4 mr-1" />
            Generate all ZIPs
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="w-full justify-center text-rose-700 dark:text-rose-300 border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/15 sm:w-auto"
            onClick={() =>
              setDeleteZipPrompt({
                mode: "all",
                label: "Delete all generated ZIP files for this event?",
              })
            }
            disabled={busy}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete all ZIPs
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="w-full justify-center sm:w-auto"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={!hasGeneratedTickets || deleting || generating !== null || sendingId !== null}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete all generated tickets
          </Button>
        </div>
        {sections.length === 0 ? (
          <div className="text-foreground-muted">
            No sections found. Configure seating in the Seat Configurator first.
          </div>
        ) : (
          <div className="space-y-1">
            {sectionsByGroup.map(({ groupName, sections: groupedSections }) => {
              const isGroupCollapsed = collapsedGroups.has(groupName);
              return (
              <div
                key={groupName}
                className="mb-3 overflow-hidden rounded-lg border border-[var(--glass-border)] bg-black/10"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5"
                  onClick={() => toggleGroup(groupName)}
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                      {groupName}
                    </p>
                    <p className="text-[11px] text-foreground-muted">
                      {groupedSections.length} section{groupedSections.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  {isGroupCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-foreground-muted" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-foreground-muted" />
                  )}
                </button>
                {!isGroupCollapsed && (
                  <div className="space-y-1 border-t border-[var(--glass-border)] p-2">
                {groupedSections.map((sec) => {
              const isAssigned = !isFreeStandingSeatingType(sec.seating_type);
              const summarySeatTotal = sec.summaryCounts?.seatCount ?? 0;
              const hasSeats = sec.seats.length > 0 || summarySeatTotal > 0;
              const isCollapsed = collapsedSections.has(sec.id);
              const freeCap = freeStandingSlotTotal(sec);
              const needsSeatDetail = sec.seats.length === 0 && summarySeatTotal > 0;
              const sectionHasGeneratedTickets =
                sec.seats.some((s) => !!s.printTicket?.ticket_image_url) ||
                (sec.summaryCounts?.generatedCount ?? 0) > 0;
              const sectionGeneratedSeats = sec.seats.filter(
                (s) => !!s.printTicket?.ticket_image_url
              );
              const sectionEmailChecked =
                sectionGeneratedSeats.length > 0 &&
                sectionGeneratedSeats.every((s) => emailSelectedItems.has(`seat-${s.id}`));
              const sectionEmailIndeterminate =
                sectionGeneratedSeats.some((s) => emailSelectedItems.has(`seat-${s.id}`)) &&
                !sectionEmailChecked;
              const zipStatus = zipStatusBySection[sec.id];
              const zipState = zipStatus?.status ?? "none";
              const zipLabel =
                zipState === "completed"
                  ? "Ready"
                  : zipState === "processing"
                    ? `Processing ${zipStatus?.progressPct ?? 0}%`
                    : zipState === "pending"
                      ? "Queued"
                      : zipState === "failed"
                        ? "Failed"
                        : "No ZIP";

              /** Orange “Generate” selection count vs total seats or capped free/standing slots. */
              const totalGenerateUnits = isAssigned
                ? sec.seats.length > 0
                  ? sec.seats.length
                  : summarySeatTotal
                : freeCap;
              const selectedGenerateCount = needsSeatDetail
                ? 0
                : isAssigned
                  ? sec.seats.filter(
                      (s) =>
                        !!s.printTicket?.ticket_image_url ||
                        selectedItems.has(`seat-${s.id}`)
                    ).length
                  : sec.seats.length > 0
                    ? sec.seats.filter(
                        (s) =>
                          !!s.printTicket?.ticket_image_url ||
                          selectedItems.has(`seat-${s.id}`)
                      ).length
                    : selectedItems.has(`section-${sec.id}`)
                      ? freeCap
                      : 0;

              return (
                <div
                  key={sec.id}
                  className="rounded-lg border border-[var(--glass-border)] overflow-hidden"
                  style={sec.color ? { borderColor: sec.color } : undefined}
                >
                  {/* Section row */}
                  <div
                    className={cn(
                      "flex flex-wrap items-center gap-3 p-3 bg-white/5",
                      hasSeats && "cursor-pointer hover:bg-white/10"
                    )}
                    onClick={hasSeats ? () => toggleSection(sec.id) : undefined}
                  >
                    {hasSeats ? (
                      isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
                      )
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    <span className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {sectionHasGeneratedTickets && (
                        <Checkbox
                          checked={
                            sectionEmailIndeterminate
                              ? "indeterminate"
                              : sectionEmailChecked
                          }
                          className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500 data-[state=indeterminate]:bg-emerald-500 data-[state=indeterminate]:border-emerald-500"
                          onCheckedChange={() =>
                            toggleSectionEmailSelection(sec.id, isAssigned, sec.seats)
                          }
                          disabled={sendingId !== null || (needsSeatDetail && sec.seats.length === 0)}
                        />
                      )}
                      <Checkbox
                        checked={
                          isAssigned
                            ? sec.seats.length > 0 &&
                              (sec.seats.every((s) => s.printTicket?.ticket_image_url) ||
                                sec.seats
                                  .filter((s) => !s.printTicket?.ticket_image_url)
                                  .every((s) => selectedItems.has(`seat-${s.id}`)))
                            : sec.seats.length > 0
                              ? sec.seats.every((s) => s.printTicket?.ticket_image_url) ||
                                sec.seats
                                  .filter((s) => !s.printTicket?.ticket_image_url)
                                  .every((s) => selectedItems.has(`seat-${s.id}`))
                              : selectedItems.has(`section-${sec.id}`)
                        }
                        disabled={
                          needsSeatDetail ||
                          (isAssigned
                            ? sec.seats.length > 0 && sec.seats.every((s) => s.printTicket?.ticket_image_url)
                            : sec.seats.length > 0
                              ? sec.seats.every((s) => s.printTicket?.ticket_image_url)
                              : freeCap === 0)
                        }
                        className="data-[state=checked]:bg-[var(--wish-orange)] data-[state=checked]:border-[var(--wish-orange)] data-[state=indeterminate]:bg-[var(--wish-orange)] data-[state=indeterminate]:border-[var(--wish-orange)]"
                        onCheckedChange={() =>
                          toggleSectionSelection(sec.id, isAssigned, sec.seats)
                        }
                      />
                    </span>
                    <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={cn(
                          "font-medium",
                          sectionHasGeneratedTickets && !isAssigned
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-foreground"
                        )}
                      >
                        {sec.name}
                        {sec.section_code && (
                          <span className="ml-2 text-foreground-muted font-normal">
                            ({sec.section_code})
                          </span>
                        )}
                        {!isAssigned && (
                          <span className="ml-2 text-foreground-muted text-sm">
                            {sec.seating_type === "standing" ? "Standing" : "Free"}
                          </span>
                        )}
                      </span>
                      <span className="text-foreground-muted text-sm font-normal tabular-nums whitespace-nowrap shrink-0">
                        {selectedGenerateCount} / {totalGenerateUnits} selected
                      </span>
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                          zipState === "completed"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                            : zipState === "processing"
                              ? "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30"
                              : zipState === "pending"
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                                : zipState === "failed"
                                  ? "bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30"
                                  : "bg-white/10 text-foreground-muted border border-white/20"
                        )}
                        title={zipStatus?.errorMessage ?? undefined}
                      >
                        ZIP: {zipLabel}
                      </span>
                    </div>
                    <div className="ml-auto flex w-full items-center justify-end gap-1 sm:w-auto sm:gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 flex-1 text-xs text-sky-700 dark:text-sky-300 hover:text-sky-800 dark:hover:text-sky-200 hover:bg-sky-500/10 sm:flex-none"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleGenerateSectionZip(sec.id);
                        }}
                        disabled={busy}
                      >
                        <Package className="h-3 w-3 mr-1" />
                        Generate ZIP
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 flex-1 text-xs text-rose-700 dark:text-rose-300 hover:text-rose-800 dark:hover:text-rose-200 hover:bg-rose-500/10 sm:flex-none"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteZipPrompt({
                            mode: "single",
                            sectionId: sec.id,
                            label: `Delete ZIP for ${sec.name}?`,
                          });
                        }}
                        disabled={busy}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete ZIP
                      </Button>
                    </div>
                  </div>

                  {/* Seats (assigned + free/standing slot rows) */}
                  {hasSeats && !isCollapsed && (
                    <>
                      {needsSeatDetail && sec.seats.length === 0 ? (
                        <div className="px-3 py-6 pl-12 text-sm text-foreground-muted">
                          Loading seats…
                        </div>
                      ) : (
                        <>
                      {!isAssigned && sec.seats.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--glass-border)] bg-white/[0.03] px-3 py-2 pl-12">
                          <span className="text-xs text-foreground-muted shrink-0">Jump to slot</span>
                          <Select
                            value={printSlotJump[sec.id] ?? sec.seats[0]!.seat_number}
                            onValueChange={(v) => {
                              setPrintSlotJump((p) => ({ ...p, [sec.id]: v }));
                              requestAnimationFrame(() => {
                                document
                                  .querySelector(`[data-print-slot="${sec.id}:${v}"]`)
                                  ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                              });
                            }}
                          >
                            <SelectTrigger className="h-9 w-full max-w-[220px] text-xs" aria-label="Jump to free seating slot">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                              {sec.seats.map((st) => (
                                <SelectItem key={st.id} value={st.seat_number}>
                                  Slot {st.seat_number}
                                  {st.printTicket?.ticket_image_url ? " · Generated" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="divide-y divide-[var(--glass-border)]">
                      {sec.seats.map((seat) => (
                          <div
                            key={seat.id}
                            data-print-slot={`${sec.id}:${seat.seat_number}`}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 pl-12 bg-white/[0.02]"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              {seat.printTicket?.ticket_image_url && (
                                <Checkbox
                                  checked={emailSelectedItems.has(`seat-${seat.id}`)}
                                  className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500 data-[state=indeterminate]:bg-emerald-500 data-[state=indeterminate]:border-emerald-500"
                                  onCheckedChange={() => toggleSeatEmailSelection(seat.id)}
                                  disabled={sendingId !== null}
                                />
                              )}
                              <Checkbox
                                checked={
                                  !!seat.printTicket?.ticket_image_url ||
                                  selectedItems.has(`seat-${seat.id}`)
                                }
                                disabled={!!seat.printTicket?.ticket_image_url}
                                className="data-[state=checked]:bg-[var(--wish-orange)] data-[state=checked]:border-[var(--wish-orange)] data-[state=indeterminate]:bg-[var(--wish-orange)] data-[state=indeterminate]:border-[var(--wish-orange)]"
                                onCheckedChange={() => toggleSeatSelection(seat.id)}
                              />
                            </div>
                            <span
                              className={cn(
                                "flex-1 text-sm",
                                seat.printTicket?.ticket_image_url
                                  ? "text-emerald-700 dark:text-emerald-300"
                                  : "text-foreground-muted"
                              )}
                            >
                              {isAssigned ? (
                                <>
                                  Row {seat.row_label} Seat {seat.seat_number}
                                </>
                              ) : (
                                <>
                                  Ticket {seat.seat_number}
                                  {sec.seating_type === "standing" ? " (standing)" : " (free)"}
                                </>
                              )}
                            </span>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200 hover:bg-emerald-500/10"
                                onClick={() => {
                                  if (seat.printTicket) {
                                    handleSendClick(
                                      seat.printTicket.id,
                                      isAssigned
                                        ? `Row ${seat.row_label} Seat ${seat.seat_number}`
                                        : `${sec.name} · Ticket ${seat.seat_number}`
                                    );
                                  } else {
                                    toast.error("Generate ticket first");
                                  }
                                }}
                                disabled={!seat.printTicket || sendingId !== null}
                              >
                                <Mail className="h-3 w-3 mr-1" />
                                Send
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              );
            })}
                  </div>
                )}
              </div>
            );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={!!sendDialog && !hideSendDialogsForEmailProgress}
        onOpenChange={() => setSendDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send ticket via email</DialogTitle>
            <DialogDescription>
              {sendDialog
                ? `Enter one or more recipient emails for ${sendDialog.label} (comma-separated).`
                : "Enter recipient email(s)"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Recipient email(s)</Label>
              <Input
                id="email"
                type="text"
                autoComplete="email"
                placeholder="you@example.com, print@example.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  e.stopPropagation();
                  void handleSendSubmit();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setSendDialog(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15"
              onClick={handleSendSubmit}
              disabled={!recipientEmail.trim() || sendingId !== null}
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={sendAllSelectedDialog && !hideSendDialogsForEmailProgress}
        onOpenChange={(open) => {
          setSendAllSelectedDialog(open);
          if (!open) setRecipientEmail("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send selected tickets via email</DialogTitle>
            <DialogDescription>
              Enter one or more recipient emails (comma-separated) to send the tickets you selected
              with the email checkbox. Sends are queued and processed by a scheduled cron (see
              deployment docs); large sends may arrive as multiple emails.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="send-all-email">Recipient email(s)</Label>
              <Input
                id="send-all-email"
                type="text"
                autoComplete="email"
                placeholder="you@example.com, print@example.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  e.stopPropagation();
                  void handleSendAllSelectedSubmit();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSendAllSelectedDialog(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15"
              onClick={handleSendAllSelectedSubmit}
              disabled={!recipientEmail.trim() || sendingId !== null}
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete all generated tickets"
        description="This will remove all generated tickets for this event. Continue?"
        confirmLabel="Delete all"
        variant="destructive"
        onConfirm={handleDeleteAll}
      />

      <ConfirmDialog
        open={!!overwriteZipPrompt}
        onOpenChange={(open) => {
          if (!open) setOverwriteZipPrompt(null);
        }}
        title="Overwrite existing ZIP?"
        description={overwriteZipPrompt?.label ?? "Overwrite existing ZIP and regenerate?"}
        confirmLabel="Overwrite ZIP"
        onConfirm={async () => {
          if (!overwriteZipPrompt) return;
          if (overwriteZipPrompt.mode === "all") {
            await handleGenerateAllZips(true);
          } else {
            const target = overwriteZipPrompt.sectionIds[0];
            if (target) await handleGenerateSectionZip(target, true);
          }
          setOverwriteZipPrompt(null);
        }}
      />

      <ConfirmDialog
        open={!!deleteZipPrompt}
        onOpenChange={(open) => {
          if (!open) setDeleteZipPrompt(null);
        }}
        title="Delete ZIP file(s)?"
        description={deleteZipPrompt?.label ?? "Delete ZIP file(s)?"}
        confirmLabel="Delete ZIP"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteZipPrompt) return;
          if (deleteZipPrompt.mode === "all") {
            await handleDeleteAllZips();
          } else if (deleteZipPrompt.sectionId) {
            await handleDeleteSectionZip(deleteZipPrompt.sectionId);
          }
          setDeleteZipPrompt(null);
        }}
      />

      <Dialog open={!!resultDialog} onOpenChange={() => setResultDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{resultDialog?.title ?? "Done"}</DialogTitle>
            <DialogDescription>
              {resultDialog?.description ?? "Operation completed successfully."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              className="text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15"
              onClick={() => setResultDialog(null)}
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
