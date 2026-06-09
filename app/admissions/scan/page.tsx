"use client";

import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { RefreshCw, FlipHorizontal, Download, Upload, Loader2 } from "lucide-react";
import { FloatingProgressBar } from "@/components/ui/floating-progress";
import { cn } from "@/lib/utils";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { RouteLoading } from "@/components/ui/route-loading";
import { AdmissionsConnectionIndicator } from "@/components/admissions-connection-indicator";
import { specialRequestTypeLabel } from "@/lib/special-request";
import type { AdmissionsOfflinePackV1 } from "@/lib/admissions/offline-pack-types";
import {
  applyOfflineScan,
  buildOfflineSidebarLists,
  replayAddOnOutboxOverlay,
  replayOutboxOnOverlay,
  resolvePackTicket,
} from "@/lib/admissions/offline-client";
import {
  idbAddOutbox,
  idbClearAdmissionsData,
  idbClearOutbox,
  idbGetPack,
  idbListOutbox,
  idbRemoveOutboxIds,
  idbSetPack,
} from "@/lib/admissions/offline-idb";

const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((mod) => mod.Scanner),
  { ssr: false }
);

type SessionState = { event_id: string; event_title: string } | null;

type ScanMode = "admit" | "re_entry" | "validate";
type ScanDialogAddOn = {
  id: string;
  title: string;
  quantity: number;
  released_quantity: number;
  remaining_quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  fully_released: boolean;
};

/** Hide entirely when there is no request type (other than none) and no details text. */
function scanSpecialRequestBlock(typeRaw: unknown, detailsRaw: unknown): ReactNode | null {
  const rawType =
    typeRaw == null || typeRaw === ""
      ? ""
      : typeof typeRaw === "string"
        ? typeRaw.trim()
        : String(typeRaw).trim();
  const hasType = Boolean(rawType && rawType.toLowerCase() !== "none");
  const details =
    detailsRaw == null || detailsRaw === ""
      ? ""
      : typeof detailsRaw === "string"
        ? detailsRaw.trim()
        : String(detailsRaw).trim();
  if (!hasType && !details) return null;

  const typeDisplay = hasType ? specialRequestTypeLabel(rawType) : "";

  return (
    <div className="mb-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 text-left text-foreground">
      <p className="text-sm font-semibold text-yellow-400">Special request</p>
      <div className="mt-2 space-y-0.5">
        {hasType ? (
          <p className="text-sm text-foreground">{typeDisplay}</p>
        ) : null}
        {details ? (
          <>
            <p
              className={`text-xs font-medium uppercase tracking-wide text-foreground-muted ${hasType ? "pt-2" : ""}`}
            >
              Details
            </p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{details}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Stacked headline: group (e.g. Patron), section name (e.g. Test Section), then Free Seating / Standing / Row · Seat.
 */
function scanSeatHeadlineBelowTitle(data: {
  section?: string;
  section_group?: string | null;
  section_display_name?: string | null;
  row?: string;
  seatNumber?: string;
  seating_type?: string | null;
}): ReactNode | null {
  const group = (data.section_group ?? "").trim();
  const displayName = (data.section_display_name ?? "").trim();
  const code = (data.section ?? "").trim();
  const sectionLine = displayName || code;
  const st = String(data.seating_type ?? "assigned").toLowerCase();
  const row = data.row ?? "";
  const seatNumber = data.seatNumber ?? "";
  const val = (s: string) => (s.trim() ? s : "-");

  const line =
    "w-full text-center text-xl font-bold leading-snug tracking-tight sm:text-2xl";
  const wrap = "w-full text-center space-y-1.5 sm:space-y-2";

  const valueOnly = `${line} text-yellow-400`;

  if (st === "free") {
    if (!group && !sectionLine) return null;
    return (
      <div className={wrap}>
        {group ? <p className={valueOnly}>{group}</p> : null}
        {sectionLine ? <p className={valueOnly}>{sectionLine}</p> : null}
        <p className={valueOnly}>Free Seating</p>
      </div>
    );
  }
  if (st === "standing") {
    if (!group && !sectionLine) return null;
    return (
      <div className={wrap}>
        {group ? <p className={valueOnly}>{group}</p> : null}
        {sectionLine ? <p className={valueOnly}>{sectionLine}</p> : null}
        <p className={valueOnly}>Standing</p>
      </div>
    );
  }

  if (!group && !sectionLine && !row.trim() && !seatNumber.trim()) return null;
  return (
    <div className={wrap}>
      {group ? <p className={valueOnly}>{group}</p> : null}
      {sectionLine ? <p className={valueOnly}>{sectionLine}</p> : null}
      <p className={line}>
        <span className="text-white">Row: </span>
        <span className="text-yellow-400">{val(row)}</span>
        <span className="text-white"> · Seat: </span>
        <span className="text-yellow-400">{val(seatNumber)}</span>
      </p>
    </div>
  );
}

function buyerNotice(name: string | null | undefined, email: string | null | undefined): ReactNode | null {
  const n = name?.trim();
  const e = email?.trim();
  if (!n && !e) return null;
  return (
    <div className="mb-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-left text-foreground">
      <p className="text-sm font-semibold text-sky-300">Buyer</p>
      {n ? <p className="text-sm mt-1">{n}</p> : null}
      {e ? <p className="text-sm mt-1 text-foreground-muted break-all">{e}</p> : null}
    </div>
  );
}

function parseScanDialogAddOns(raw: unknown): ScanDialogAddOn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : "";
      if (!id) return null;
      const quantity = Math.max(0, Number(row.quantity ?? 0));
      const released = Math.max(0, Math.min(quantity, Number(row.released_quantity ?? 0)));
      const unit = Math.max(0, Number(row.unit_price_cents ?? 0));
      return {
        id,
        title:
          typeof row.title === "string" && row.title.trim().length > 0
            ? row.title.trim()
            : "Add-on",
        quantity,
        released_quantity: released,
        remaining_quantity: Math.max(0, quantity - released),
        unit_price_cents: unit,
        line_total_cents: quantity * unit,
        fully_released: released >= quantity,
      } satisfies ScanDialogAddOn;
    })
    .filter((row): row is ScanDialogAddOn => row != null);
}

function formatPhpFromCents(cents: number): string {
  return `PHP ${(Math.max(0, Number(cents || 0)) / 100).toFixed(2)}`;
}

export default function AdmissionsScanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<SessionState>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [admissionsCode, setAdmissionsCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    belowTitle?: ReactNode;
    description: string | ReactNode;
    titleClassName?: string;
    buttonLabel?: string;
    buttonClassName?: string;
    switchToAdmitOnClose?: boolean;
  }>({ open: false, title: "", description: "" });

  const [lastAdmittedCode, setLastAdmittedCode] = useState<string | null>(null);
  const [dialogAddOns, setDialogAddOns] = useState<ScanDialogAddOn[]>([]);
  const [dialogReleaseQty, setDialogReleaseQty] = useState<Record<string, number>>({});
  const [releasingAddOnId, setReleasingAddOnId] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<ScanMode>("admit");
  const [admittedTickets, setAdmittedTickets] = useState<
    Array<{ code: string; at: Date; section: string; row: string; seatNumber: string }>
  >([]);
  const [grantedReEntryTickets, setGrantedReEntryTickets] = useState<
    Array<{ code: string; at: Date; section: string; row: string; seatNumber: string }>
  >([]);
  const [listSearch, setListSearch] = useState("");
  const videoDimensionsRef = useRef<{ width: number; height: number } | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const [scannerKey, setScannerKey] = useState(0);
  const [idbPack, setIdbPack] = useState<AdmissionsOfflinePackV1 | null>(null);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [packDownloadBusy, setPackDownloadBusy] = useState(false);
  const [packDownloadProgress, setPackDownloadProgress] = useState(0);
  const [packDownloadComputable, setPackDownloadComputable] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncComputable, setSyncComputable] = useState(false);
  /** Visible feedback: app-wide `toast` is currently a no-op. */
  const [offlineBanner, setOfflineBanner] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!offlineBanner) return;
    const t = window.setTimeout(() => setOfflineBanner(null), 12_000);
    return () => window.clearTimeout(t);
  }, [offlineBanner]);

  const scanPageFloatingProgress = useMemo(() => {
    if (!session) return { active: false as const };
    if (scanLoading) {
      return {
        active: true as const,
        message: scanMode === "validate" ? "Validating ticket" : "Processing scan",
        subtitle: session.event_title,
        detail:
          scanMode === "validate"
            ? "Checking without recording admission."
            : "Validating the ticket with the server and recording admission.",
        percent: undefined as number | undefined,
      };
    }
    if (packDownloadBusy) {
      return {
        active: true as const,
        message: "Saving offline ticket list",
        subtitle: session.event_title,
        detail:
          "Loading ticket codes from the server and storing them in this browser (IndexedDB). There is no phone “files” download — look for “Last Downloaded Data” below when this finishes. Keep this tab open.",
        percent: packDownloadComputable ? packDownloadProgress : undefined,
      };
    }
    if (syncBusy) {
      return {
        active: true as const,
        message: "Uploading offline admissions",
        subtitle: session.event_title,
        detail: "Sending queued scans to the server. Keep this tab open until this finishes.",
        percent: syncComputable ? syncProgress : undefined,
      };
    }
    return { active: false as const };
  }, [
    session,
    scanLoading,
    scanMode,
    packDownloadBusy,
    packDownloadComputable,
    packDownloadProgress,
    syncBusy,
    syncComputable,
    syncProgress,
  ]);

  const postJsonWithUploadProgress = useCallback(
    <T,>(
      url: string,
      payload: unknown,
      onProgress: (percent: number) => void,
      onComputable: (computable: boolean) => void
    ): Promise<{ ok: boolean; status: number; data: T | { error?: string } }> =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url, true);
        xhr.setRequestHeader("Content-Type", "application/json");

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable || event.total <= 0) return;
          onComputable(true);
          const percent = Math.max(0, Math.min(99, Math.round((event.loaded / event.total) * 100)));
          onProgress(percent);
        };

        xhr.onload = () => {
          let parsed: T | { error?: string } = {};
          try {
            parsed = xhr.responseText ? (JSON.parse(xhr.responseText) as T | { error?: string }) : {};
          } catch {
            parsed = {};
          }
          onProgress(100);
          resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data: parsed });
        };

        xhr.onerror = () => reject(new Error("Upload request failed"));
        xhr.send(JSON.stringify(payload));
      }),
    []
  );

  useEffect(() => {
    if (!packDownloadBusy || packDownloadComputable) return;
    const timer = window.setInterval(() => {
      setPackDownloadProgress((prev) => {
        if (prev >= 95) return prev;
        const step = prev < 30 ? 4 : prev < 70 ? 2 : 1;
        return Math.min(prev + step, 95);
      });
    }, 240);
    return () => window.clearInterval(timer);
  }, [packDownloadBusy, packDownloadComputable]);

  useEffect(() => {
    if (!syncBusy || syncComputable) return;
    const timer = window.setInterval(() => {
      setSyncProgress((prev) => {
        if (prev >= 95) return prev;
        const step = prev < 35 ? 5 : prev < 75 ? 3 : 1;
        return Math.min(prev + step, 95);
      });
    }, 220);
    return () => window.clearInterval(timer);
  }, [syncBusy, syncComputable]);

  const loadIdbMeta = useCallback(async () => {
    const p = await idbGetPack();
    setIdbPack(p);
    const o = await idbListOutbox();
    setPendingOutboxCount(o.length);
    return { pack: p, outbox: o };
  }, []);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/admissions/session");
      const data = await res.json();
      if (data.session) {
        setSession(data.session);
        return;
      }
    } catch {
      /* offline */
    }
    const p = await idbGetPack();
    if (p) {
      setSession({ event_id: p.event_id, event_title: p.event_title });
    } else {
      setSession(null);
    }
  }, []);

  const fetchRecords = useCallback(async () => {
    const res = await fetch("/api/admissions/records");
    const data = await res.json();
    if (res.ok && data.admitted && data.grantedReEntry) {
      setAdmittedTickets(
        data.admitted.map(
          (r: { code: string; at: string; section?: string; row?: string; seatNumber?: string }) => ({
            code: r.code,
            at: new Date(r.at),
            section: r.section ?? "",
            row: r.row ?? "",
            seatNumber: r.seatNumber ?? "",
          })
        )
      );
      setGrantedReEntryTickets(
        data.grantedReEntry.map(
          (r: { code: string; at: string; section?: string; row?: string; seatNumber?: string }) => ({
            code: r.code,
            at: new Date(r.at),
            section: r.section ?? "",
            row: r.row ?? "",
            seatNumber: r.seatNumber ?? "",
          })
        )
      );
    }
  }, []);

  useEffect(() => {
    fetchSession().finally(() => setSessionLoading(false));
  }, [fetchSession]);

  useEffect(() => {
    if (!session) return;
    void (async () => {
      const { pack, outbox } = await loadIdbMeta();
      if (pack?.event_id === session.event_id) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const lists = buildOfflineSidebarLists(pack, outbox);
          setAdmittedTickets(lists.admitted);
          setGrantedReEntryTickets(lists.grantedReEntry);
        }
      }
    })();
  }, [session, loadIdbMeta]);

  useEffect(() => {
    if (session && typeof navigator !== "undefined" && navigator.onLine) {
      void fetchRecords();
    }
  }, [session, fetchRecords]);

  const syncOutbox = useCallback(async () => {
    if (!session) return;
    const out = await idbListOutbox();
    if (out.length === 0) {
      setPendingOutboxCount(0);
      await fetchRecords();
      return;
    }
    setSyncBusy(true);
    setSyncProgress(0);
    setSyncComputable(false);
    try {
      const payload = {
        ops: out.map((o) =>
          o.mode === "release_add_on"
            ? {
                id: o.id,
                mode: o.mode,
                booking_add_on_id: o.booking_add_on_id,
                release_quantity: o.release_quantity,
                event_id: session.event_id,
              }
            : { id: o.id, qr_data: o.qr_data, mode: o.mode }
        ),
      };
      const { ok, data: j } = await postJsonWithUploadProgress<{ ok?: boolean; error?: string }>(
        "/api/admissions/sync",
        payload,
        setSyncProgress,
        setSyncComputable
      );
      if (!ok) {
        setOfflineBanner({
          tone: "error",
          message: (j as { error?: string }).error ?? "Sync failed",
        });
        return;
      }
      const syncResults = (
        j as {
          results?: Array<{
            id?: string;
            httpStatus?: number;
            body?: { ok?: boolean; deduped?: boolean };
          }>;
        }
      ).results;
      const okIds = new Set<string>();
      if (Array.isArray(syncResults)) {
        for (const r of syncResults) {
          const id = typeof r?.id === "string" ? r.id : null;
          const httpStatus = typeof r?.httpStatus === "number" ? r.httpStatus : 0;
          const body = r?.body ?? {};
          const success =
            body.deduped === true ||
            (httpStatus >= 200 && httpStatus < 300 && body.ok !== false);
          if (id && success) okIds.add(id);
        }
      }
      if (okIds.size > 0) {
        await idbRemoveOutboxIds(Array.from(okIds));
      } else if (!Array.isArray(syncResults)) {
        // Backward-compatible fallback for older sync response shapes.
        await idbClearOutbox();
      }
      const remainingOutbox = await idbListOutbox();
      setPendingOutboxCount(remainingOutbox.length);
      setSyncProgress(100);
      if (remainingOutbox.length === 0) {
        setOfflineBanner({
          tone: "success",
          message: "Offline admissions synced to the server.",
        });
      } else {
        setOfflineBanner({
          tone: "error",
          message: `Synced with partial failures. ${remainingOutbox.length} pending operation${remainingOutbox.length === 1 ? "" : "s"} remain and will retry.`,
        });
      }
      await fetchRecords();
      const p = await idbGetPack();
      setIdbPack(p);
    } catch {
      setOfflineBanner({
        tone: "error",
        message: "Could not sync. Try again when online.",
      });
    } finally {
      setSyncBusy(false);
      setSyncProgress(0);
      setSyncComputable(false);
    }
  }, [session, fetchRecords, postJsonWithUploadProgress]);

  useEffect(() => {
    const onOnline = () => {
      void syncOutbox();
    };
    if (typeof window === "undefined") return;
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [syncOutbox]);

  // Capture video dimensions for scan region filtering (finder is center 70%)
  useEffect(() => {
    if (!session) return;
    const updateDimensions = () => {
      const video = scannerContainerRef.current?.querySelector("video");
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        videoDimensionsRef.current = { width: video.videoWidth, height: video.videoHeight };
      }
    };
    const id = setInterval(updateDimensions, 500);
    updateDimensions();
    return () => clearInterval(id);
  }, [session]);

  // Auto-validate code from URL ?code=XXX
  useEffect(() => {
    const codeParam = searchParams?.get("code");
    if (!sessionLoading && !session && codeParam?.trim()) {
      (async () => {
        setCodeLoading(true);
        try {
          const res = await fetch("/api/admissions/validate-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: codeParam.trim() }),
          });
          const data = await res.json();
          if (res.ok) {
            setSession({ event_id: data.event_id, event_title: data.event_title });
            router.replace("/admissions/scan", { scroll: false });
          }
        } finally {
          setCodeLoading(false);
        }
      })();
    }
  }, [sessionLoading, session, searchParams, router]);

  async function handleValidateCode(code: string) {
    if (!code.trim()) {
      toast.error("Enter admissions code");
      return;
    }
    setCodeLoading(true);
    try {
      const res = await fetch("/api/admissions/validate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Invalid code");
        setCodeLoading(false);
        return;
      }
      setSession({ event_id: data.event_id, event_title: data.event_title });
      setAdmissionsCode("");
      router.replace("/admissions/scan", { scroll: false });
    } catch {
      toast.error("Request failed");
    }
    setCodeLoading(false);
  }

  async function handleClearSession() {
    await fetch("/api/admissions/clear-session", { method: "POST" });
    await idbClearAdmissionsData();
    setIdbPack(null);
    setPendingOutboxCount(0);
    setSession(null);
    setAdmittedTickets([]);
    setGrantedReEntryTickets([]);
    router.refresh();
  }

  async function handlePrepareOffline() {
    if (!session) return;
    setPackDownloadBusy(true);
    setPackDownloadProgress(0);
    setPackDownloadComputable(false);
    const controller = new AbortController();
    const timeoutMs = 180_000;
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch("/api/admissions/offline-pack", {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      const raw = await res.text().catch(() => "");
      let data: AdmissionsOfflinePackV1 | { error?: string; ticket_count?: number };
      try {
        data = (raw ? JSON.parse(raw) : {}) as
          | AdmissionsOfflinePackV1
          | { error?: string; ticket_count?: number };
      } catch {
        setOfflineBanner({
          tone: "error",
          message: "Could not read offline data (invalid response). Try again.",
        });
        return;
      }
      if (!res.ok) {
        const errBody = (data as { error?: string }).error?.trim();
        const statusBit =
          res.status > 0 ? ` (HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""})` : "";
        setOfflineBanner({
          tone: "error",
          message:
            errBody ||
            `Could not load offline data from the server${statusBit}. Try again. If this only happens on one phone, close every tab for this site and open a new one so the latest update loads.`,
        });
        return;
      }
      const pack = data as AdmissionsOfflinePackV1;
      if (pack.event_id !== session.event_id) {
        setOfflineBanner({ tone: "error", message: "Event mismatch. Try again." });
        return;
      }
      const savedAt = new Date().toISOString();
      const normalizedPack: AdmissionsOfflinePackV1 = {
        ...pack,
        generated_at:
          typeof pack.generated_at === "string" && pack.generated_at.trim().length > 0
            ? pack.generated_at
            : savedAt,
      };
      await idbSetPack(normalizedPack);
      setPackDownloadProgress(100);
      setIdbPack(normalizedPack);
      setOfflineBanner({
        tone: "success",
        message: (() => {
          const n = normalizedPack.ticket_count;
          const q = normalizedPack.ticket_quantity_total;
          const base = `Offline data saved in this browser · ${n} ticket row${n === 1 ? "" : "s"}`;
          const units =
            typeof q === "number" && q !== n
              ? ` (${q} admission units with quantity)`
              : "";
          return `${base}${units}. Count is what exists in the database for this event, not total venue capacity. You can scan without signal after this.`;
        })(),
      });
    } catch (e) {
      const aborted =
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError");
      if (aborted) {
        setOfflineBanner({
          tone: "error",
          message: `Offline save timed out after ${Math.round(timeoutMs / 60000)} minutes. Check your connection and try again.`,
        });
        return;
      }
      const msg = e instanceof Error ? e.message : "";
      if (
        /storage|quota|IndexedDB|indexeddb|localStorage|sessionStorage|offline storage|too large for localStorage/i.test(
          msg
        )
      ) {
        setOfflineBanner({
          tone: "error",
          message:
            "Could not persist offline data. Check storage permissions, free space, or turn off private browsing.",
        });
      } else {
        setOfflineBanner({
          tone: "error",
          message: msg ? `Could not save offline data: ${msg}` : "Could not save offline data.",
        });
      }
    } finally {
      window.clearTimeout(timeoutId);
      setPackDownloadBusy(false);
      setPackDownloadProgress(0);
      setPackDownloadComputable(false);
    }
  }

  const refreshRecords = useCallback(() => {
    if (session) fetchRecords();
  }, [session, fetchRecords]);

  function handleRefreshScanner() {
    setScannerKey((k) => k + 1);
    refreshRecords();
  }

  const primeDialogAddOns = useCallback((data: Record<string, unknown>) => {
    const next = parseScanDialogAddOns(data.add_ons);
    setDialogAddOns(next);
    setDialogReleaseQty(
      Object.fromEntries(next.map((item) => [item.id, item.remaining_quantity > 0 ? 1 : 0]))
    );
  }, []);

  async function handleReleaseAddOn(addOnId: string) {
    if (!session) return;
    const row = dialogAddOns.find((x) => x.id === addOnId);
    if (!row || row.remaining_quantity <= 0) return;
    const requested = Math.max(1, Math.floor(dialogReleaseQty[addOnId] ?? 1));
    const qty = Math.min(requested, row.remaining_quantity);
    if (qty <= 0) return;

    const online = typeof navigator !== "undefined" && navigator.onLine;
    setReleasingAddOnId(addOnId);
    try {
      if (online) {
        const res = await fetch("/api/admissions/add-ons/release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            booking_add_on_id: addOnId,
            event_id: session.event_id,
            release_quantity: qty,
          }),
        });
        const json = (await res.json().catch(() => null)) as
          | { add_on?: unknown; error?: string }
          | null;
        if (!res.ok) {
          toast.error(json?.error ?? "Failed to release add-on");
          return;
        }
        const updated = parseScanDialogAddOns(
          json?.add_on && typeof json.add_on === "object" ? [json.add_on] : []
        )[0];
        if (!updated) return;
        setDialogAddOns((prev) =>
          prev.map((x) => (x.id === updated.id ? updated : x))
        );
        setDialogReleaseQty((prev) => ({
          ...prev,
          [updated.id]: updated.remaining_quantity > 0 ? 1 : 0,
        }));
        return;
      }

      await idbAddOutbox({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        mode: "release_add_on",
        booking_add_on_id: addOnId,
        release_quantity: qty,
      });
      const outbox = await idbListOutbox();
      setPendingOutboxCount(outbox.length);
      setDialogAddOns((prev) =>
        prev.map((x) => {
          if (x.id !== addOnId) return x;
          const released = Math.min(x.quantity, x.released_quantity + qty);
          return {
            ...x,
            released_quantity: released,
            remaining_quantity: Math.max(0, x.quantity - released),
            fully_released: released >= x.quantity,
          };
        })
      );
      setDialogReleaseQty((prev) => ({ ...prev, [addOnId]: 1 }));
      setOfflineBanner({
        tone: "success",
        message: "Add-on release queued offline and will sync when online.",
      });
    } finally {
      setReleasingAddOnId(null);
    }
  }

  const bumpReleaseQty = useCallback(
    (addOnId: string, delta: number, max: number) => {
      setDialogReleaseQty((prev) => {
        const current = Math.max(1, Math.floor(Number(prev[addOnId] ?? 1)));
        const next = Math.max(1, Math.min(max, current + delta));
        return { ...prev, [addOnId]: next };
      });
    },
    []
  );

  const dialogAddOnsBlock: ReactNode = dialogAddOns.length > 0 ? (
    <div className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-left text-foreground">
      <p className="text-sm font-semibold text-emerald-300">Purchased add-ons</p>
      <div className="mt-2 space-y-2">
        {dialogAddOns.map((item) => {
          const statusLabel =
            item.fully_released
              ? "Released"
              : item.released_quantity > 0
                ? "Partial"
                : "Pending";
          const canRelease = item.remaining_quantity > 0;
          const releaseQty = Math.max(1, dialogReleaseQty[item.id] ?? 1);
          return (
            <div key={item.id} className="rounded-md border border-emerald-400/30 bg-black/20 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-foreground">{item.title}</p>
                  <p className="text-xs text-foreground-muted">
                    {item.released_quantity}/{item.quantity} released • {formatPhpFromCents(item.line_total_cents)}
                  </p>
                </div>
                <span className="rounded-full border border-emerald-300/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200">
                  {statusLabel}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={!canRelease || releasingAddOnId === item.id || releaseQty <= 1}
                    onClick={() => bumpReleaseQty(item.id, -1, Math.max(1, item.remaining_quantity))}
                    aria-label="Decrease release quantity"
                  >
                    -
                  </Button>
                  <div
                    className="h-8 min-w-16 rounded-md border border-[var(--glass-border)] bg-white/5 px-3 text-center text-sm leading-8 tabular-nums"
                    aria-live="polite"
                    aria-label="Release quantity"
                  >
                    {canRelease ? Math.min(releaseQty, item.remaining_quantity) : 0}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={
                      !canRelease ||
                      releasingAddOnId === item.id ||
                      releaseQty >= Math.max(1, item.remaining_quantity)
                    }
                    onClick={() => bumpReleaseQty(item.id, 1, Math.max(1, item.remaining_quantity))}
                    aria-label="Increase release quantity"
                  >
                    +
                  </Button>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={!canRelease || releasingAddOnId === item.id}
                  onClick={() => void handleReleaseAddOn(item.id)}
                >
                  {releasingAddOnId === item.id ? "Releasing..." : "Release"}
                </Button>
                {!canRelease ? (
                  <p className="text-xs text-foreground-muted">Buyer already received this add-on.</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  ) : null;

  async function handleScan(codeInput?: string) {
    const code = (codeInput ?? manualCode).trim();
    if (!code) {
      toast.error("Enter ticket code");
      return;
    }
    if (!session) return;
    const modeAtStart = scanMode;
    setScanLoading(true);

    let fromOffline = false;
    let data: Record<string, unknown> = {};
    let scanResOk = true;

    const runTryLocal = async (): Promise<boolean> => {
      if (!idbPack || idbPack.event_id !== session.event_id) {
        return false;
      }
      fromOffline = true;
      const t = resolvePackTicket(idbPack, code);
      if (!t) {
        data = { ok: false, error: "Ticket not found" };
        return true;
      }
      const o = await idbListOutbox();
      const ov = replayOutboxOnOverlay(idbPack, o);
      const addOnOverlay = replayAddOnOutboxOverlay(idbPack, o);
      const st = ov.get(t.ticket_id);
      if (!st) {
        data = { ok: false, error: "Ticket not found" };
        return true;
      }
      const mode: "admit" | "re_entry" | "validate" =
        modeAtStart === "validate"
          ? "validate"
          : modeAtStart === "re_entry"
            ? "re_entry"
            : "admit";
      const outcome = applyOfflineScan(t, st, addOnOverlay, code, mode);
      if (outcome.outbox) {
        await idbAddOutbox(outcome.outbox);
      }
      const o2 = await idbListOutbox();
      setPendingOutboxCount(o2.length);
      if (idbPack) {
        const lists = buildOfflineSidebarLists(idbPack, o2);
        setAdmittedTickets(lists.admitted);
        setGrantedReEntryTickets(lists.grantedReEntry);
      }
      data = outcome.body;
      return true;
    };

    const online = typeof navigator !== "undefined" && navigator.onLine;

    try {
      if (!online) {
        const ok = await runTryLocal();
        if (!ok) {
          toast.error("No offline data for this event. Connect to the internet and tap Prepare for offline.");
          setScanLoading(false);
          return;
        }
        scanResOk = true;
      } else {
        try {
          const res = await fetch("/api/admissions/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              qr_data: code,
              event_id: session.event_id,
              ...(modeAtStart === "validate"
                ? { validate_only: true }
                : { re_entry: modeAtStart === "re_entry" }),
            }),
          });
          data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          scanResOk = res.ok;
        } catch {
          const ok = await runTryLocal();
          if (ok) {
            scanResOk = true;
          } else {
            setAlertDialog({
              open: true,
              title: "Request failed",
              description: "Could not connect and no offline data is available for this event.",
              titleClassName: "text-xl text-red-500",
              buttonLabel: "Scan another",
            });
            setScanLoading(false);
            return;
          }
        }
      }

      const isValidateOnly =
        data?.validate_only === true ||
        data?.validate_only === "true" ||
        data?.validate_only === 1;
      primeDialogAddOns(data);
      if (scanResOk && isValidateOnly) {
        setScanLoading(false);
        let statusText: string;
        if (!data.admitted) {
          statusText = "Not yet admitted — ready to admit at the door.";
        } else if (data.re_entry_granted) {
          statusText =
            "Already admitted — re-entry permission is active (holder may be outside).";
        } else {
          statusText = "Already admitted.";
        }
        setAlertDialog({
          open: true,
          title: "Valid ticket",
          belowTitle: scanSeatHeadlineBelowTitle(data),
          description: (
            <>
              {buyerNotice(data.buyer_name as string | undefined, data.buyer_email as string | undefined)}
              {scanSpecialRequestBlock(data.special_request_type, data.special_request_details)}
              <p className="text-foreground-muted mb-2">{statusText}</p>
              <p className="text-sm text-foreground-muted">
                This check did not record admission or re-entry.
              </p>
            </>
          ),
          titleClassName: "text-xl text-sky-400",
          buttonLabel: "Scan another",
        });
        if (!codeInput) setManualCode("");
        return;
      }
      if (scanResOk && data.ok === false && data.error === "Ticket not found") {
        setAlertDialog({
          open: true,
          title: "Ticket not found",
          description: "No ticket exists with this code. Check the QR code or enter the code manually.",
          titleClassName: "text-xl text-red-500",
          buttonLabel: "Scan another",
        });
        setScanLoading(false);
        return;
      }
      if (
        scanResOk &&
        data.ok === false &&
        (data.code === "ticket_not_admitted_yet" || data.error === "Ticket not admitted yet")
      ) {
        setAlertDialog({
          open: true,
          title: "Admit this ticket first",
          belowTitle: scanSeatHeadlineBelowTitle(data),
          description: (
            <>
              {buyerNotice(data.buyer_name as string | undefined, data.buyer_email as string | undefined)}
              {scanSpecialRequestBlock(data.special_request_type, data.special_request_details)}
              <p className="text-foreground-muted">
                Re-entry can only be granted after the guest has been admitted. Use{" "}
                <span className="text-foreground font-medium">Admit Ticket</span>, scan this code again,
                then choose <span className="text-foreground font-medium">Grant Re-entry</span> if they
                need to leave and return.
              </p>
            </>
          ),
          titleClassName: "text-xl text-amber-500",
          buttonLabel: "Scan another",
        });
        setScanLoading(false);
        return;
      }
      if (
        scanResOk &&
        data.ok === false &&
        (data.code === "re_entry_already_granted" || data.error === "Re-entry already granted")
      ) {
        setAlertDialog({
          open: true,
          title: "Re-Entry is already granted",
          belowTitle: scanSeatHeadlineBelowTitle(data),
          description: (
            <>
              {buyerNotice(data.buyer_name as string | undefined, data.buyer_email as string | undefined)}
              {scanSpecialRequestBlock(data.special_request_type, data.special_request_details)}
              <p className="text-foreground-muted">
                This ticket already has re-entry permission. You cannot grant it again.
              </p>
            </>
          ),
          titleClassName: "text-xl text-red-500",
          buttonLabel: "Scan another",
        });
        setScanLoading(false);
        return;
      }
      if (scanResOk && data.already_admitted === true) {
        const buyerBlock = (
          <>
            {buyerNotice(data.buyer_name as string | undefined, data.buyer_email as string | undefined)}
            {scanSpecialRequestBlock(data.special_request_type, data.special_request_details)}
          </>
        );
        if (code === lastAdmittedCode) {
          setAlertDialog({
            open: true,
            title: "Latest ticket already admitted",
            belowTitle: scanSeatHeadlineBelowTitle(data),
            description: (
              <>
                {buyerBlock}
                <p>This ticket is the most recently admitted ticket. No further action is needed.</p>
              </>
            ),
            titleClassName: "text-xl text-green-500",
            buttonLabel: "Okay",
            buttonClassName: "w-full bg-green-600 hover:bg-green-700 text-white",
          });
        } else {
          if (codeInput) setManualCode(codeInput);
          setAlertDialog({
            open: true,
            title: "Ticket already admitted",
            belowTitle: scanSeatHeadlineBelowTitle(data),
            description: (
              <>
                {buyerBlock}
                <p>
                  This ticket has already been used. Use Grant Re-Entry if the person needs to leave
                  and return.
                </p>
              </>
            ),
            titleClassName: "text-xl text-red-500",
            buttonLabel: "Scan another",
          });
        }
        setScanLoading(false);
        return;
      }
      if (!scanResOk) {
        if (data.code === "re_entry_already_granted" || data.error === "Re-entry already granted") {
          setAlertDialog({
            open: true,
            title: "Re-Entry is already granted",
            description: "This ticket already has re-entry permission. You cannot grant it again.",
            titleClassName: "text-xl text-red-500",
          });
          setScanLoading(false);
          return;
        }
        if (data.error === "Ticket not found") {
          setAlertDialog({
            open: true,
            title: "Ticket not found",
            description: "No ticket exists with this code. Check the QR code or enter the code manually.",
            titleClassName: "text-xl text-red-500",
            buttonLabel: "Scan another",
          });
          setScanLoading(false);
          return;
        }
        if (data.error === "Ticket is for a different event") {
          setAlertDialog({
            open: true,
            title: "Wrong event",
            description: "This ticket is not for the current event. The QR code belongs to a different event.",
            titleClassName: "text-xl text-red-500",
            buttonLabel: "Scan another",
          });
          setScanLoading(false);
          return;
        }
        setAlertDialog({
          open: true,
          title: "Invalid or already used",
          description:
            (typeof data.error === "string" && data.error) ||
            "The ticket could not be admitted. Please try again or check the QR code.",
          titleClassName: "text-xl text-red-500",
          buttonLabel: "Scan another",
        });
        setScanLoading(false);
        return;
      }
      if (data.re_entry_used) {
        if (!fromOffline) refreshRecords();
        setLastAdmittedCode(code);
        setScanLoading(false);
        if (!codeInput) setManualCode("");
        setAlertDialog({
          open: true,
          title: "Re-entry used",
          belowTitle: scanSeatHeadlineBelowTitle(data),
          description: (
            <>
              {buyerNotice(data.buyer_name as string | undefined, data.buyer_email as string | undefined)}
              {scanSpecialRequestBlock(data.special_request_type, data.special_request_details)}
              <p className="text-foreground-muted">
                The person has re-entered. Re-entry permission has been used.
              </p>
            </>
          ),
          titleClassName: "text-xl text-green-500",
          buttonLabel: "Scan New",
        });
        return;
      }
      setScanLoading(false);
      if (modeAtStart === "re_entry") {
        if (!fromOffline) refreshRecords();
        setAlertDialog({
          open: true,
          title: "Re-entry granted",
          belowTitle: scanSeatHeadlineBelowTitle(data),
          description: (
            <>
              {buyerNotice(data.buyer_name as string | undefined, data.buyer_email as string | undefined)}
              {scanSpecialRequestBlock(data.special_request_type, data.special_request_details)}
              <p className="text-foreground-muted">
                Re-entry permission has been granted. The person can leave and return.
              </p>
            </>
          ),
          titleClassName: "text-xl text-green-500",
          buttonLabel: "Scan New",
        });
      } else {
        if (!fromOffline) refreshRecords();
        setLastAdmittedCode(code);
        setAlertDialog({
          open: true,
          title: "Ticket admitted",
          belowTitle: scanSeatHeadlineBelowTitle(data),
          description: (
            <>
              {buyerNotice(data.buyer_name as string | undefined, data.buyer_email as string | undefined)}
              {scanSpecialRequestBlock(data.special_request_type, data.special_request_details)}
              <p className="text-foreground-muted">Ticket admitted successfully.</p>
            </>
          ),
          titleClassName: "text-xl text-green-500",
          buttonLabel: "Scan New",
        });
      }
      if (!codeInput) setManualCode("");
    } catch {
      setAlertDialog({
        open: true,
        title: "Request failed",
        description: "Could not connect. Please check your connection and try again.",
        titleClassName: "text-xl text-red-500",
        buttonLabel: "Scan another",
      });
    }
    setScanLoading(false);
  }

  if (sessionLoading) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading…"
        subtitle="Checking your admissions session."
        className="container mx-auto max-w-md px-4"
      />
    );
  }

  // No session: show admissions code form
  if (!session) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-md">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
          <h1 className="text-2xl font-bold text-foreground">Admissions Staff Login</h1>
          <AdmissionsConnectionIndicator className="shrink-0" />
        </div>
        <p className="text-foreground-muted text-sm mb-6">
          Enter the admissions code for your event to scan tickets.
        </p>
        <div className="glass rounded-xl border border-[var(--glass-border)] p-6 space-y-4">
          <div>
            <Label htmlFor="admissions-code">Admissions code</Label>
            <Input
              id="admissions-code"
              value={admissionsCode}
              onChange={(e) => setAdmissionsCode(e.target.value)}
              placeholder="e.g. ABC12XYZ"
              onKeyDown={(e) => e.key === "Enter" && handleValidateCode(admissionsCode)}
              disabled={codeLoading}
            />
          </div>
          <Button
            className="w-full bg-[var(--wish-orange)] hover:bg-[var(--wish-orange-hover)]"
            onClick={() => handleValidateCode(admissionsCode)}
            disabled={codeLoading || !admissionsCode.trim()}
          >
            {codeLoading ? "Validating..." : "Continue"}
          </Button>
        </div>
        <NavButtonWithProgress
          href="/"
          variant="ghost"
          className="mt-4"
          loadingMessage="Loading…"
        >
          Back to home
        </NavButtonWithProgress>
      </div>
    );
  }

  const formatDateTime = (d: Date) =>
    d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  const searchLower = listSearch.toLowerCase().trim();
  const filteredAdmitted = admittedTickets.filter(({ code }) =>
    code.toLowerCase().includes(searchLower)
  );
  const filteredGranted = grantedReEntryTickets.filter(({ code }) =>
    code.toLowerCase().includes(searchLower)
  );

  // Has session: show scan form
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-start">
      <div className="container mx-auto px-4 pt-4 pb-8">
        <FloatingProgressBar
          active={scanPageFloatingProgress.active}
          {...(scanPageFloatingProgress.active
            ? {
                message: scanPageFloatingProgress.message,
                subtitle: scanPageFloatingProgress.subtitle,
                detail: scanPageFloatingProgress.detail,
                ...(typeof scanPageFloatingProgress.percent === "number"
                  ? { percent: scanPageFloatingProgress.percent }
                  : {}),
              }
            : {})}
        />
        <div className="max-w-5xl mx-auto mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="text-center sm:text-left min-w-0 flex-1">
            <h1 className="text-xl font-bold text-foreground mb-2">Admit Guests</h1>
            <p className="text-yellow-500 text-lg">{session.event_title}</p>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0 w-full sm:w-auto">
            <div className="flex justify-center sm:justify-end">
              <AdmissionsConnectionIndicator
                offlinePackOnDevice={Boolean(
                  idbPack && idbPack.event_id === session.event_id
                )}
                pendingSync={pendingOutboxCount}
              />
            </div>
            <div className="flex flex-wrap justify-center sm:justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={packDownloadBusy}
                onClick={() => void handlePrepareOffline()}
                className="border border-emerald-300 bg-emerald-200/95 text-emerald-950 hover:bg-emerald-200"
              >
                {packDownloadBusy ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    {packDownloadProgress > 0 ? `Saving ${packDownloadProgress}%` : "Saving…"}
                  </>
                ) : (
                  <>
                    <Download className="mr-1.5 h-4 w-4" />
                    Save for offline scanning
                  </>
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={syncBusy || pendingOutboxCount === 0}
                onClick={() => void syncOutbox()}
                className="border border-rose-300 bg-rose-200/95 text-rose-950 hover:bg-rose-200"
              >
                {syncBusy ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    {syncProgress > 0 ? `Uploading ${syncProgress}%` : "Uploading…"}
                  </>
                ) : (
                  <>
                    <Upload className="mr-1.5 h-4 w-4" />
                    {`Upload Offline Data${pendingOutboxCount > 0 ? ` (${pendingOutboxCount})` : ""}`}
                  </>
                )}
              </Button>
            </div>
            {offlineBanner ? (
              <p
                className={cn(
                  "text-sm text-center sm:text-right leading-snug rounded-lg px-3 py-2 border w-full min-w-0",
                  offlineBanner.tone === "success"
                    ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-100"
                    : "border-red-500/50 bg-red-950/30 text-red-100"
                )}
                role="status"
              >
                {offlineBanner.message}
              </p>
            ) : null}
            <p className="text-[11px] text-foreground-muted text-center sm:text-right leading-snug w-full max-w-sm sm:max-w-xs sm:ml-auto">
              Saves ticket data in this browser for offline scanning — not a file in your Downloads folder.
            </p>
            {(() => {
              if (!idbPack || idbPack.event_id !== session.event_id) {
                return null;
              }
              const raw =
                typeof idbPack.generated_at === "string" ? idbPack.generated_at.trim() : "";
              const prepAt = raw ? new Date(raw) : null;
              const label =
                prepAt && !Number.isNaN(prepAt.getTime())
                  ? formatDateTime(prepAt)
                  : "Saved on this device (re-download to refresh the timestamp)";
              return (
                <p className="text-xs text-foreground-muted text-center sm:text-right leading-snug w-full min-w-0">
                  Last Downloaded Data:{" "}
                  <span className="text-foreground tabular-nums break-words">{label}</span>
                </p>
              );
            })()}
          </div>
        </div>
        <div className="flex flex-col lg:flex-row gap-6 lg:items-start lg:justify-center max-w-6xl mx-auto w-full">
        <div className="hidden lg:block lg:flex-1 lg:min-w-0" aria-hidden />
        <div className="w-full max-w-md shrink-0 flex flex-col mx-auto">
          <div
            className={cn(
              "rounded-xl border-2 p-6 space-y-4 flex-1 flex flex-col min-h-0 backdrop-blur-md transition-[border-color,background,box-shadow] duration-300",
              scanMode === "admit" &&
                "border-yellow-500/50 bg-[linear-gradient(165deg,rgba(234,179,8,0.2)_0%,var(--glass-bg)_100%)] shadow-[0_8px_36px_-10px_rgba(234,179,8,0.28)]",
              scanMode === "re_entry" &&
                "border-emerald-400/55 bg-[linear-gradient(165deg,rgba(134,239,172,0.22)_0%,var(--glass-bg)_100%)] shadow-[0_8px_36px_-10px_rgba(52,211,153,0.3)]",
              scanMode === "validate" &&
                "border-sky-400/50 bg-[linear-gradient(165deg,rgba(125,211,252,0.22)_0%,var(--glass-bg)_100%)] shadow-[0_8px_36px_-10px_rgba(56,189,248,0.3)]"
            )}
          >
            <div className="shrink-0">
              <h2 className="text-base font-semibold text-foreground mb-4 text-center">
                Scan QR code with camera
                <br />
                or enter ticket code manually.
              </h2>
            </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefreshScanner}
              className="gap-1.5"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh Scanner
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFacingMode((f) => (f === "environment" ? "user" : "environment"))}
                className="gap-1.5"
              >
                <RefreshCw className="h-4 w-4" />
                Flip camera
              </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setFlipHorizontal((f) => !f)}
              className={`gap-1.5 ${flipHorizontal ? "bg-[var(--wish-orange)] text-white hover:bg-[var(--wish-orange-hover)]" : ""}`}
            >
              <FlipHorizontal className="h-4 w-4" />
              Flip H
            </Button>
            </div>
          </div>
          <div ref={scannerContainerRef} className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            {!alertDialog.open && !scanLoading && (
              <Scanner
                key={`${facingMode}-${scannerKey}`}
                styles={flipHorizontal ? { video: { transform: "scaleX(-1)" } } : undefined}
                onScan={(detectedCodes) => {
                  const first = detectedCodes?.[0];
                  if (!first?.rawValue || scanLoading || alertDialog.open) return;
                  const dims = videoDimensionsRef.current;
                  if (dims) {
                    const box = (first as { boundingBox?: { x: number; y: number; width: number; height: number } }).boundingBox;
                    if (box) {
                      const cx = box.x + box.width / 2;
                      const cy = box.y + box.height / 2;
                      const minX = 0.15 * dims.width;
                      const maxX = 0.85 * dims.width;
                      const minY = 0.15 * dims.height;
                      const maxY = 0.85 * dims.height;
                      if (cx < minX || cx > maxX || cy < minY || cy > maxY) return;
                    }
                  }
                  handleScan(first.rawValue);
                }}
                onError={(err) => {
                  const msg = err instanceof Error ? err.message : "Camera access failed";
                  if (!msg.includes("NotFoundError")) toast.error(msg);
                }}
                constraints={{ facingMode }}
                formats={["qr_code"]}
                scanDelay={1500}
                components={{ finder: true }}
              />
            )}
          </div>
        </div>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-[var(--glass-border)]" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[var(--background)] px-2 text-foreground-muted">or enter manually</span>
          </div>
        </div>
        <div>
          <Label htmlFor="code">Ticket code (QR data)</Label>
          <Input
            id="code"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="WT-..."
            onKeyDown={(e) => e.key === "Enter" && handleScan(undefined)}
          />
        </div>
        <Button
          variant="default"
          className={cn(
            "w-full shadow-sm",
            scanMode === "admit" &&
              "!bg-yellow-500 !text-neutral-950 hover:!bg-yellow-600 hover:!text-neutral-950",
            scanMode === "re_entry" &&
              "!bg-emerald-400 !text-slate-950 hover:!bg-emerald-300 hover:!text-slate-950",
            scanMode === "validate" &&
              "!bg-sky-400 !text-slate-950 hover:!bg-sky-300 hover:!text-slate-950"
          )}
          onClick={() => handleScan(undefined)}
          disabled={scanLoading}
        >
          {scanLoading
            ? "Checking..."
            : scanMode === "admit"
              ? "Admit Ticket"
              : scanMode === "re_entry"
                ? "Grant Ticket Re-entry"
                : "Validate Ticket"}
        </Button>
        <div className="space-y-2">
          <p className="text-xs text-center text-foreground-muted">Select Scan Action</p>
          <div className="flex flex-col gap-1.5 rounded-lg border-2 border-white/45 bg-[var(--surface)]/50 p-1.5 [html[data-theme=light]_&]:border-black/12 [html[data-theme=light]_&]:bg-black/[0.04]">
            {(
              [
                { mode: "admit" as const, label: "Admit Ticket" },
                { mode: "re_entry" as const, label: "Grant Ticket Re-entry" },
                { mode: "validate" as const, label: "Validate Ticket" },
              ] as const
            ).map(({ mode, label }) => (
              <Button
                key={mode}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-auto min-h-10 w-full justify-center rounded-md border px-3 py-2.5 text-center text-xs font-medium leading-snug sm:text-sm !whitespace-normal !shadow-none transition-colors",
                  scanMode === mode
                    ? mode === "validate"
                      ? "border-sky-300/55 bg-sky-500/15 text-sky-400 hover:bg-sky-500/15 hover:text-sky-400 [html[data-theme=light]_&]:border-sky-600/55 [html[data-theme=light]_&]:bg-sky-500/18 [html[data-theme=light]_&]:text-sky-900 [html[data-theme=light]_&]:hover:bg-sky-500/18 [html[data-theme=light]_&]:hover:text-sky-900"
                      : mode === "re_entry"
                        ? "border-emerald-300/55 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-400 [html[data-theme=light]_&]:border-emerald-600/55 [html[data-theme=light]_&]:bg-emerald-500/18 [html[data-theme=light]_&]:text-emerald-900 [html[data-theme=light]_&]:hover:bg-emerald-500/18 [html[data-theme=light]_&]:hover:text-emerald-900"
                        : "border-yellow-300/60 bg-yellow-500/16 text-yellow-400 hover:bg-yellow-500/16 hover:text-yellow-400 [html[data-theme=light]_&]:border-amber-600/55 [html[data-theme=light]_&]:bg-amber-500/18 [html[data-theme=light]_&]:text-amber-900 [html[data-theme=light]_&]:hover:bg-amber-500/18 [html[data-theme=light]_&]:hover:text-amber-900"
                    : mode === "validate"
                      ? "border-sky-300/30 bg-sky-500/8 text-sky-400/95 hover:bg-sky-500/12 hover:text-sky-400 [html[data-theme=light]_&]:border-sky-500/45 [html[data-theme=light]_&]:bg-sky-500/12 [html[data-theme=light]_&]:text-sky-800 [html[data-theme=light]_&]:hover:bg-sky-500/16 [html[data-theme=light]_&]:hover:text-sky-900"
                      : mode === "re_entry"
                        ? "border-emerald-300/30 bg-emerald-500/8 text-emerald-400/95 hover:bg-emerald-500/12 hover:text-emerald-400 [html[data-theme=light]_&]:border-emerald-500/45 [html[data-theme=light]_&]:bg-emerald-500/12 [html[data-theme=light]_&]:text-emerald-800 [html[data-theme=light]_&]:hover:bg-emerald-500/16 [html[data-theme=light]_&]:hover:text-emerald-900"
                        : "border-yellow-300/30 bg-yellow-500/8 text-yellow-400/95 hover:bg-yellow-500/12 hover:text-yellow-400 [html[data-theme=light]_&]:border-amber-500/45 [html[data-theme=light]_&]:bg-amber-500/12 [html[data-theme=light]_&]:text-amber-800 [html[data-theme=light]_&]:hover:bg-amber-500/16 [html[data-theme=light]_&]:hover:text-amber-900"
                )}
                onClick={() => setScanMode(mode)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
          </div>
          <div className="mt-4 flex justify-center gap-4 shrink-0">
            <Button
              variant="default"
              onClick={handleClearSession}
              className="!bg-violet-300 !text-violet-950 hover:!bg-violet-400 hover:!text-violet-950 px-4"
            >
              Switch Event
            </Button>
            <NavButtonWithProgress
              href="/"
              variant="default"
              className="!bg-violet-300 !text-violet-950 hover:!bg-violet-400 hover:!text-violet-950 px-4"
              loadingMessage="Loading…"
            >
              Back to home
            </NavButtonWithProgress>
          </div>
        </div>
        <div className="glass rounded-xl border border-[var(--glass-border)] p-4 min-w-0 flex-1 lg:min-w-[320px] lg:max-w-md flex flex-col min-h-0">
          <div className="space-y-3 flex flex-col flex-1 min-h-0">
            <Input
              placeholder="Search ticket code..."
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              className="bg-neutral-900/50 shrink-0 [html[data-theme=light]_&]:border-black/16 [html[data-theme=light]_&]:bg-black/[0.045]"
            />
            <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
              <div className="space-y-2 flex flex-col min-h-0">
                <h3 className="text-sm font-medium text-foreground shrink-0">
                  Admitted ({admittedTickets.length})
                </h3>
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1 rounded-lg bg-neutral-900/50 p-2 [html[data-theme=light]_&]:bg-black/[0.045]">
                  {filteredAdmitted.length === 0 ? (
                    <p className="text-xs text-foreground-muted">
                      {admittedTickets.length === 0 ? "None yet" : "No matches"}
                    </p>
                  ) : (
                    filteredAdmitted.map(({ code, at, section, row, seatNumber }) => (
                      <div key={code} className="text-sm">
                        <p className="font-mono text-foreground-muted truncate">{code}</p>
                        <p className="text-xs text-foreground-muted">{formatDateTime(at)}</p>
                        {(section || row || seatNumber) && (
                          <p className="text-xs text-yellow-400">
                            Section: {section || "-"} · Row: {row || "-"} · Seat: {seatNumber || "-"}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="space-y-2 flex flex-col min-h-0">
                <h3 className="text-sm font-medium text-foreground shrink-0">
                  Grant Re-Entry ({grantedReEntryTickets.length})
                </h3>
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1 rounded-lg bg-neutral-900/50 p-2 [html[data-theme=light]_&]:bg-black/[0.045]">
                  {filteredGranted.length === 0 ? (
                    <p className="text-xs text-foreground-muted">
                      {grantedReEntryTickets.length === 0 ? "None yet" : "No matches"}
                    </p>
                  ) : (
                    filteredGranted.map(({ code, at, section, row, seatNumber }, i) => (
                      <div key={`${code}-${at.getTime()}-${i}`} className="text-sm">
                        <p className="font-mono text-foreground-muted truncate">{code}</p>
                        <p className="text-xs text-foreground-muted">{formatDateTime(at)}</p>
                        {(section || row || seatNumber) && (
                          <p className="text-xs text-yellow-400">
                            Section: {section || "-"} · Row: {row || "-"} · Seat: {seatNumber || "-"}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => {
          setAlertDialog((d) => {
            if (!open && d.switchToAdmitOnClose) {
              setScanMode("admit");
            }
            return { ...d, open };
          });
        }}
        title={alertDialog.title}
        belowTitle={alertDialog.belowTitle}
        extraContent={dialogAddOnsBlock}
        description={alertDialog.description}
        titleClassName={alertDialog.titleClassName}
        buttonLabel={alertDialog.buttonLabel}
        buttonClassName={alertDialog.buttonClassName}
      />
    </div>
  );
}
