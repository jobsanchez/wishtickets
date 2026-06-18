"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { SeatMap, type SeatInfo as SeatMapSeatInfo } from "@/components/seat-picker/seat-map";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { usePermissionDialog } from "@/components/providers/permission-dialog-provider";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { RouteLoading } from "@/components/ui/route-loading";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { AssignSeatsDistributionColumn } from "./assign-seats-distribution-column";
import { FreeStandingChipPicker } from "./free-standing-chip-picker";
import {
  assignmentTicketCount,
  estimateManualDistributionSendSeconds,
  formatMmSs,
  getSectionCardStyle,
  isAbortError,
  sleep,
  sortAllocationSeatsChronological,
} from "./assign-seats-helpers";
import type {
  AllocationAdjustGroup,
  AllocationAdjustSection,
  Assignment,
  SeatInfo,
  SectionInfo,
  SectionZipStatus,
} from "./assign-seats-types";

interface AssignSeatsClientProps {
  eventId: string;
}

export default function AssignSeatsClient({ eventId }: AssignSeatsClientProps) {
  const [eventTitle, setEventTitle] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [availability, setAvailability] = useState<{
    seats: SeatInfo[];
    sections: SectionInfo[];
  } | null>(null);
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(new Set());
  const [sectionQuantities, setSectionQuantities] = useState<Record<string, number>>({});
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [distributionCategory, setDistributionCategory] = useState<"sales" | "complementary">("sales");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const distributionSendAbortRef = useRef<AbortController | null>(null);
  const distributionSendEstimateTotalSecRef = useRef(0);
  const [distributionSendElapsedSec, setDistributionSendElapsedSec] = useState(0);
  const distributionEmailJobIdRef = useRef<string | null>(null);
  const distributionEmailAssignmentIdRef = useRef<string | null>(null);
  const distributionEmailPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [distributionSendWorkerLine, setDistributionSendWorkerLine] = useState("");
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [editingEmailValue, setEditingEmailValue] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    type: "release" | "reverse";
    assignmentId: string;
  } | null>(null);
  const [emailSentDialogOpen, setEmailSentDialogOpen] = useState(false);
  const [emailSentRecipient, setEmailSentRecipient] = useState<string | null>(null);
  const [confirmedDialogOpen, setConfirmedDialogOpen] = useState(false);
  const [manageSeatsAssignment, setManageSeatsAssignment] = useState<Assignment | null>(null);
  const [adjustAllocationAssignment, setAdjustAllocationAssignment] = useState<Assignment | null>(null);
  const [adjustAllocationLoading, setAdjustAllocationLoading] = useState(false);
  const [adjustAllocationGroups, setAdjustAllocationGroups] = useState<AllocationAdjustGroup[]>([]);
  /** Second step inside Adjust Allocation: user must confirm before tickets are released */
  const [adjustAllocationReleaseConfirm, setAdjustAllocationReleaseConfirm] = useState(false);
  /** Dedicated overlay copy while releasing seats from Adjust Allocation (incl. ZIP cleanup) */
  const [allocationReleaseOverlay, setAllocationReleaseOverlay] = useState(false);
  const [selectedAdjustTicketIds, setSelectedAdjustTicketIds] = useState<Set<string>>(new Set());
  const [collapsedAdjustGroupKeys, setCollapsedAdjustGroupKeys] = useState<Set<string>>(new Set());
  const [collapsedAdjustSectionKeys, setCollapsedAdjustSectionKeys] = useState<Set<string>>(new Set());
  const [removingSeatId, setRemovingSeatId] = useState<string | null>(null);
  const [removingSection, setRemovingSection] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  /** Free/standing section ids — when present, that card’s body is collapsed. */
  const [collapsedFreeStandingIds, setCollapsedFreeStandingIds] = useState<
    Set<string>
  >(() => new Set());
  const freeStandingCollapseInitRef = useRef(false);
  const [expandedRecipients, setExpandedRecipients] = useState<Set<string>>(new Set());
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [zipStatusBySection, setZipStatusBySection] = useState<Record<string, SectionZipStatus>>({});
  const [zippingAssignmentId, setZippingAssignmentId] = useState<string | null>(null);
  const { showPermissionDialog } = usePermissionDialog() ?? { showPermissionDialog: () => {} };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [assignRes, availRes, eventRes] = await Promise.all([
        fetch(`/api/admin/events/${eventId}/assignments`, { cache: "no-store" }),
        fetch(`/api/admin/events/${eventId}/assign-seats-bootstrap`, { cache: "no-store" }),
        fetch(`/api/admin/events/${eventId}`, { cache: "no-store" }),
      ]);
      if (assignRes.ok) {
        const data = await assignRes.json();
        setAssignments(Array.isArray(data) ? data : []);
      } else {
        setAssignments([]);
        if (assignRes.status === 403) {
          showPermissionDialog();
        } else {
          const err = await assignRes.json().catch(() => ({}));
          toast.error(err?.error ?? "Failed to load manual distribution");
        }
      }
      if (availRes.ok) {
        const data = await availRes.json();
        setAvailability(data);
      }
      if (eventRes.ok) {
        const data = await eventRes.json();
        if (data?.title) setEventTitle(data.title);
      }
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [eventId, showPermissionDialog]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      // best effort for polling
    }
  }, [eventId]);

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

  /** Tighter poll while Create Zip / Delete ZIP is in flight so progress updates feel live. */
  useEffect(() => {
    if (!zippingAssignmentId) return;
    void fetchZipStatuses("summary");
    const id = setInterval(() => {
      void fetchZipStatuses("summary");
    }, 1500);
    return () => clearInterval(id);
  }, [zippingAssignmentId, fetchZipStatuses]);

  useEffect(() => {
    if (!sendingEmailId) return;
    setDistributionSendElapsedSec(0);
    const id = setInterval(() => setDistributionSendElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [sendingEmailId]);

  const clearDistributionEmailPoll = useCallback(() => {
    if (distributionEmailPollIntervalRef.current) {
      clearInterval(distributionEmailPollIntervalRef.current);
      distributionEmailPollIntervalRef.current = null;
    }
    distributionEmailJobIdRef.current = null;
    distributionEmailAssignmentIdRef.current = null;
    setDistributionSendWorkerLine("");
  }, []);

  const handleCancelDistributionSend = useCallback(() => {
    const aid = distributionEmailAssignmentIdRef.current;
    const jid = distributionEmailJobIdRef.current;
    if (aid && jid) {
      void fetch(`/api/admin/assignments/${aid}/send-email/jobs/${jid}/cancel`, {
        method: "POST",
      });
    }
    clearDistributionEmailPoll();
    distributionSendAbortRef.current?.abort();
  }, [clearDistributionEmailPoll]);

  const seats = useMemo(() => availability?.seats ?? [], [availability?.seats]);
  const sections = useMemo(
    () => availability?.sections ?? [],
    [availability?.sections]
  );

  const seatsById = useMemo(() => {
    const map = new Map<string, SeatInfo>();
    for (const seat of seats) map.set(seat.id, seat);
    return map;
  }, [seats]);

  const assignedSections = useMemo(
    () =>
      sections.filter(
        (s) => s.seating_type !== "free" && s.seating_type !== "standing"
      ),
    [sections]
  );
  const assignedSeats = useMemo(
    () =>
      seats.filter((seat) =>
        assignedSections.some((sec) => sec.id === seat.section_id)
      ),
    [seats, assignedSections]
  );

  const assignedSeatsById = useMemo(() => {
    const m = new Map<string, (typeof assignedSeats)[number]>();
    for (const s of assignedSeats) m.set(s.id, s);
    return m;
  }, [assignedSeats]);

  const freeStandingSections = useMemo(
    () =>
      sections.filter(
        (s) =>
          (s.seating_type === "free" || s.seating_type === "standing") &&
          (s.available ?? 0) > 0
      ),
    [sections]
  );

  useEffect(() => {
    if (freeStandingSections.length === 0 || freeStandingCollapseInitRef.current) {
      return;
    }
    freeStandingCollapseInitRef.current = true;
    setCollapsedFreeStandingIds(
      new Set(freeStandingSections.map((s) => s.id))
    );
  }, [freeStandingSections]);

  const toggleFreeStandingCollapsed = useCallback((sectionId: string) => {
    setCollapsedFreeStandingIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  /** Free/standing sections that have real `event_seats` rows — pick exact seats visually. */
  const sectionIdsWithFsPhysicalSeats = useMemo(() => {
    const ids = new Set<string>();
    for (const s of seats) {
      const sec = sections.find((x) => x.id === s.section_id);
      if (
        sec &&
        (sec.seating_type === "free" || sec.seating_type === "standing")
      ) {
        ids.add(sec.id);
      }
    }
    return ids;
  }, [seats, sections]);

  const totalCapacityOnlySectionQty = useMemo(
    () =>
      Object.entries(sectionQuantities).reduce((sum, [sectionId, q]) => {
        if (q <= 0) return sum;
        if (sectionIdsWithFsPhysicalSeats.has(sectionId)) return sum;
        return sum + q;
      }, 0),
    [sectionQuantities, sectionIdsWithFsPhysicalSeats]
  );

  /** Seats + capacity-only free/standing quantities (no double-count for physical FS). */
  const totalAssignableTickets = useMemo(
    () => selectedSeatIds.size + totalCapacityOnlySectionQty,
    [selectedSeatIds, totalCapacityOnlySectionQty]
  );

  const sortedFreeStandingSeats = useCallback(
    (sectionId: string) =>
      seats
        .filter((s) => s.section_id === sectionId)
        .sort((a, b) => {
          const ra = (a.row_label ?? "").toString();
          const rb = (b.row_label ?? "").toString();
          if (ra !== rb) return ra.localeCompare(rb, undefined, { numeric: true });
          const na = (a.seat_number ?? "").toString();
          const nb = (b.seat_number ?? "").toString();
          return na.localeCompare(nb, undefined, { numeric: true });
        }),
    [seats]
  );

  const selectAllAvailableFsPhysical = useCallback(
    (sectionId: string) => {
      const list = sortedFreeStandingSeats(sectionId).filter((s) => s.available);
      setSelectedSeatIds((prev) => {
        const next = new Set(prev);
        list.forEach((s) => next.add(s.id));
        return next;
      });
    },
    [sortedFreeStandingSeats]
  );

  const clearFsPhysicalSelection = useCallback((sectionId: string) => {
    const ids = new Set(sortedFreeStandingSeats(sectionId).map((s) => s.id));
    setSelectedSeatIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }, [sortedFreeStandingSeats]);

  const setSectionQty = useCallback((sectionId: string, qty: number) => {
    setSectionQuantities((prev) => {
      if (qty <= 0) {
        const next = { ...prev };
        delete next[sectionId];
        return next;
      }
      return { ...prev, [sectionId]: qty };
    });
  }, []);

  const incSectionQty = useCallback(
    (sectionId: string) => {
      const sec = sections.find((s) => s.id === sectionId);
      const max = sec?.available ?? 0;
      setSectionQuantities((prev) => {
        const cur = prev[sectionId] ?? 0;
        return { ...prev, [sectionId]: Math.min(max, cur + 1) };
      });
    },
    [sections]
  );

  const decSectionQty = useCallback((sectionId: string) => {
    setSectionQuantities((prev) => {
      const cur = prev[sectionId] ?? 0;
      if (cur <= 1) {
        const next = { ...prev };
        delete next[sectionId];
        return next;
      }
      return { ...prev, [sectionId]: cur - 1 };
    });
  }, []);

  const groupedByRecipient = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const key = (a.recipient_name ?? "").trim().toLowerCase() || "__unnamed__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return Array.from(map.entries());
  }, [assignments]);

  const recipientSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const a of assignments) {
      const name = (a.recipient_name ?? "").trim();
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        names.push(name);
      }
    }
    return names.sort((a, b) => a.localeCompare(b));
  }, [assignments]);

  const toggleSeat = useCallback((seatId: string, available: boolean) => {
    if (!available) return;
    setSelectedSeatIds((prev) => {
      const next = new Set(prev);
      if (next.has(seatId)) next.delete(seatId);
      else next.add(seatId);
      return next;
    });
  }, []);

  const handleSectionSelectionToggle = useCallback(
    (sectionId: string, selectAll: boolean) => {
      const sectionSeats = assignedSeats.filter((s) => s.section_id === sectionId);
      const availableIds = sectionSeats
        .filter((s) => s.available)
        .map((s) => s.id);
      setSelectedSeatIds((prev) => {
        const next = new Set(prev);
        if (selectAll) {
          availableIds.forEach((id) => next.add(id));
        } else {
          availableIds.forEach((id) => next.delete(id));
        }
        return next;
      });
    },
    [assignedSeats]
  );

  const handleAssign = useCallback(async () => {
    const name = recipientName.trim();
    if (!name) {
      toast.error("Enter recipient name");
      return;
    }
    const seatCount = selectedSeatIds.size;
    const sectionItems = Object.entries(sectionQuantities)
      .filter(
        ([section_id, q]) =>
          q > 0 && !sectionIdsWithFsPhysicalSeats.has(section_id)
      )
      .map(([section_id, quantity]) => ({ section_id, quantity }));
    if (seatCount === 0 && sectionItems.length === 0) {
      toast.error("Select at least one seat or section quantity");
      return;
    }
    setSubmitting(true);
    try {
      const body: {
        recipient_name: string;
        recipient_email?: string;
        distribution_category?: "sales" | "complementary";
        seat_ids?: string[];
        section_assignments?: { section_id: string; quantity: number }[];
      } = { recipient_name: name, distribution_category: distributionCategory };
      if (recipientEmail.trim()) body.recipient_email = recipientEmail.trim();
      if (seatCount > 0) body.seat_ids = Array.from(selectedSeatIds);
      if (sectionItems.length > 0) body.section_assignments = sectionItems;

      const res = await fetch(`/api/admin/events/${eventId}/assign-seats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        showPermissionDialog();
        return;
      }
      if (!res.ok) {
        toast.error(data.error ?? "Failed to assign");
        return;
      }
      const total =
        seatCount + sectionItems.reduce((s, i) => s + i.quantity, 0);
      toast.success(`Assigned ${total} ticket(s) to ${name}`);
      setCategoryDialogOpen(false);
      setSelectedSeatIds(new Set());
      setSectionQuantities({});
      setRecipientName("");
      setRecipientEmail("");
      fetchData();
    } catch {
      toast.error("Failed to assign");
    } finally {
      setSubmitting(false);
    }
  }, [
    eventId,
    recipientName,
    recipientEmail,
    distributionCategory,
    selectedSeatIds,
    sectionQuantities,
    sectionIdsWithFsPhysicalSeats,
    fetchData,
    showPermissionDialog,
  ]);

  const handleConfirm = useCallback(
    async (assignmentId: string) => {
      setSubmitting(true);
      try {
        const res = await fetch(`/api/admin/assignments/${assignmentId}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (res.status === 403) {
          showPermissionDialog();
          return;
        }
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          booking_id?: string;
          error?: string;
        };
        if (!res.ok || !data?.success || !data.booking_id) {
          toast.error(data.error ?? "Failed to confirm");
          return;
        }

        setConfirmedDialogOpen(true);
        fetchData();
      } catch {
        await fetchData();
        toast.error("Failed to confirm");
      } finally {
        setSubmitting(false);
      }
    },
    [fetchData, showPermissionDialog]
  );

  const handleReleaseClick = useCallback((assignmentId: string) => {
    setConfirmDialog({ type: "release", assignmentId });
  }, []);

  const handleManageSeatsClick = useCallback((assignment: Assignment) => {
    const seatItems = (assignment.items ?? []).filter((i) => i.seat_id);
    const allSectionKeys = new Set(
      seatItems.map((i) => (i.seat_label ?? "").split(/\s+/)[0] || "Other")
    );
    setCollapsedSections(allSectionKeys);
    setManageSeatsAssignment(assignment);
  }, []);

  const handleRemoveSeat = useCallback(
    async (assignmentId: string, seatId: string) => {
      setRemovingSeatId(seatId);
      try {
        const res = await fetch(
          `/api/admin/assignments/${assignmentId}/seats/${seatId}`,
          { method: "DELETE" }
        );
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) {
          showPermissionDialog();
          return;
        }
        if (!res.ok) {
          toast.error(data.error ?? "Failed to remove seat");
          return;
        }
        toast.success("Seat removed");
        fetchData();
        setManageSeatsAssignment((prev) => {
          if (!prev || prev.id !== assignmentId) return prev;
          const items = prev.items?.filter((i) => i.seat_id !== seatId) ?? [];
          if (items.length === 0) return null;
          return { ...prev, items };
        });
      } catch {
        toast.error("Failed to remove seat");
      } finally {
        setRemovingSeatId(null);
      }
    },
    [fetchData, showPermissionDialog]
  );

  const handleRemoveSection = useCallback(
    async (assignmentId: string, section: string, seatIds: string[]) => {
      if (seatIds.length === 0) return;
      setRemovingSection(section);
      try {
        const results = await Promise.all(
          seatIds.map((seatId) =>
            fetch(`/api/admin/assignments/${assignmentId}/seats/${seatId}`, {
              method: "DELETE",
            })
          )
        );
        const failed = results.filter((r) => !r.ok);
        if (failed.length > 0) {
          toast.error("Failed to remove some seats");
          return;
        }
        if (results.some((r) => r.status === 403)) {
          showPermissionDialog();
          return;
        }
        toast.success(`Section removed (${seatIds.length} seat${seatIds.length === 1 ? "" : "s"})`);
        fetchData();
        setManageSeatsAssignment((prev) => {
          if (!prev || prev.id !== assignmentId) return prev;
          const remaining = new Set(seatIds);
          const items = prev.items?.filter((i) => !i.seat_id || !remaining.has(i.seat_id)) ?? [];
          if (items.length === 0) return null;
          return { ...prev, items };
        });
      } catch {
        toast.error("Failed to remove section");
      } finally {
        setRemovingSection(null);
      }
    },
    [fetchData, showPermissionDialog]
  );

  const toggleSectionCollapsed = useCallback((section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const sectionTicketIds = useCallback((section: AllocationAdjustSection): string[] => {
    return section.sold_tickets.map((t) => t.ticket_id);
  }, []);

  const groupTicketIds = useCallback((group: AllocationAdjustGroup): string[] => {
    return group.sections.flatMap((section) => section.sold_tickets.map((t) => t.ticket_id));
  }, []);

  const openAdjustAllocation = useCallback(
    async (assignment: Assignment) => {
      setAdjustAllocationAssignment(assignment);
      setAdjustAllocationReleaseConfirm(false);
      setSelectedAdjustTicketIds(new Set());
      setAdjustAllocationGroups([]);
      setAdjustAllocationLoading(true);
      try {
        const res = await fetch(
          `/api/admin/assignments/${assignment.id}/allocation-adjustments`,
          { cache: "no-store" }
        );
        const data = (await res.json().catch(() => ({}))) as {
          groups?: AllocationAdjustGroup[];
          error?: string;
        };
        if (res.status === 403) {
          showPermissionDialog();
          setAdjustAllocationAssignment(null);
          return;
        }
        if (!res.ok) {
          toast.error(data.error ?? "Failed to load allocation details");
          setAdjustAllocationAssignment(null);
          return;
        }
        setAdjustAllocationGroups(Array.isArray(data.groups) ? data.groups : []);
      } catch {
        toast.error("Failed to load allocation details");
        setAdjustAllocationAssignment(null);
      } finally {
        setAdjustAllocationLoading(false);
      }
    },
    [showPermissionDialog]
  );

  const closeAdjustAllocation = useCallback(() => {
    setAdjustAllocationAssignment(null);
    setAdjustAllocationGroups([]);
    setSelectedAdjustTicketIds(new Set());
    setCollapsedAdjustGroupKeys(new Set());
    setCollapsedAdjustSectionKeys(new Set());
    setAdjustAllocationLoading(false);
    setAdjustAllocationReleaseConfirm(false);
    setAllocationReleaseOverlay(false);
  }, []);

  const toggleAdjustGroupCollapsed = useCallback((groupKey: string) => {
    setCollapsedAdjustGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  const toggleAdjustSectionCollapsed = useCallback((sectionKey: string) => {
    setCollapsedAdjustSectionKeys((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  }, []);

  const toggleAdjustTicket = useCallback((ticketId: string, checked: boolean) => {
    setAdjustAllocationReleaseConfirm(false);
    setSelectedAdjustTicketIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(ticketId);
      else next.delete(ticketId);
      return next;
    });
  }, []);

  const toggleAdjustSection = useCallback(
    (section: AllocationAdjustSection, checked: boolean) => {
      setAdjustAllocationReleaseConfirm(false);
      const ids = sectionTicketIds(section);
      setSelectedAdjustTicketIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          if (checked) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [sectionTicketIds]
  );

  const toggleAdjustGroup = useCallback(
    (group: AllocationAdjustGroup, checked: boolean) => {
      setAdjustAllocationReleaseConfirm(false);
      const ids = groupTicketIds(group);
      setSelectedAdjustTicketIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          if (checked) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [groupTicketIds]
  );

  const handleReverseClick = useCallback((assignmentId: string) => {
    setConfirmDialog({ type: "reverse", assignmentId });
  }, []);

  const handleSendEmail = useCallback(
    async (assignmentId: string) => {
      const assignment = assignments.find((a) => a.id === assignmentId);
      const ticketCount = assignment ? assignmentTicketCount(assignment) : 1;
      distributionSendAbortRef.current?.abort();
      clearDistributionEmailPoll();
      const ac = new AbortController();
      distributionSendAbortRef.current = ac;
      distributionSendEstimateTotalSecRef.current =
        estimateManualDistributionSendSeconds(ticketCount);
      setSendingEmailId(assignmentId);
      setDistributionSendWorkerLine("Queuing send…");

      const endSendUi = () => {
        clearDistributionEmailPoll();
        distributionSendAbortRef.current = null;
        setSendingEmailId(null);
        setDistributionSendWorkerLine("");
      };

      try {
        const enqueueRes = await fetch(
          `/api/admin/assignments/${assignmentId}/send-email/jobs`,
          { method: "POST", signal: ac.signal }
        );
        const enq = (await enqueueRes.json().catch(() => ({}))) as {
          jobId?: string;
          totalTickets?: number;
          error?: string;
        };
        if (enqueueRes.status === 403) {
          showPermissionDialog();
          endSendUi();
          return;
        }
        if (!enqueueRes.ok) {
          toast.error(enq.error ?? "Failed to queue send");
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
          typeof enq.totalTickets === "number" ? enq.totalTickets : ticketCount;

        distributionEmailJobIdRef.current = jobId;
        distributionEmailAssignmentIdRef.current = assignmentId;
        setDistributionSendWorkerLine(
          `Queued ${totalTickets} tickets. Processing now…`
        );

        const pollStartedAt = Date.now();
        const triggerProcess = async (): Promise<{ stop: boolean; forcedStatus?: string }> => {
          const pr = await fetch(
            `/api/admin/assignments/${assignmentId}/send-email/jobs/${jobId}/process`,
            { method: "POST", cache: "no-store", signal: ac.signal }
          );
          const pj = (await pr.json().catch(() => ({}))) as { status?: string; error?: string };
          if (pr.status === 403) {
            showPermissionDialog();
            endSendUi();
            return { stop: true };
          }
          if (pr.status === 503) {
            endSendUi();
            toast.error(
              pj.error ??
                "Server missing SUPABASE_SERVICE_ROLE_KEY — needed for ZIP uploads and worker locks."
            );
            return { stop: true };
          }
          // Ignore non-ok process errors here; GET status below remains source of truth.
          return { stop: false, forcedStatus: typeof pj.status === "string" ? pj.status : undefined };
        };

        const pollOnce = async (): Promise<boolean> => {
          if (ac.signal.aborted) return true;
          try {
            const processRes = await triggerProcess();
            if (processRes.stop) return true;

            const r = await fetch(
              `/api/admin/assignments/${assignmentId}/send-email/jobs/${jobId}`,
              { cache: "no-store", signal: ac.signal }
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
                  "Server missing SUPABASE_SERVICE_ROLE_KEY — needed for ZIP uploads."
              );
              return true;
            }
            if (!r.ok) {
              endSendUi();
              toast.error(j.error ?? "Send step failed");
              return true;
            }
            const cur = typeof j.cursor === "number" ? j.cursor : 0;
            const tot = typeof j.total === "number" ? j.total : totalTickets;
            const chunks = typeof j.chunksCompleted === "number" ? j.chunksCompleted : 0;
            const st = processRes.forcedStatus ?? j.status ?? "";
            const stalledHint =
              st === "pending" && Date.now() - pollStartedAt > 35_000
                ? " · Still pending: retrying processing..."
                : "";
            setDistributionSendWorkerLine(
              `Worker: ${cur} / ${tot} tickets · ${chunks} batch email(s) · ${st}${stalledHint}`
            );
            if (st === "completed") {
              endSendUi();
              setEmailSentRecipient(assignment?.recipient_email ?? null);
              setEmailSentDialogOpen(true);
              fetchData();
              toast.success(
                tot > 1 && chunks > 1
                  ? `Sent ${tot} tickets (${chunks} emails)`
                  : "Email sent"
              );
              return true;
            }
            if (st === "failed") {
              endSendUi();
              toast.error(j.errorMessage ?? "Send failed");
              return true;
            }
            if (st === "cancelled") {
              endSendUi();
              toast.info("Send cancelled.");
              return true;
            }
            return false;
          } catch (e: unknown) {
            if (isAbortError(e)) return true;
            endSendUi();
            toast.error("Could not send tickets");
            return true;
          }
        };

        const doneImmediately = await pollOnce();
        if (!doneImmediately) {
          distributionEmailPollIntervalRef.current = setInterval(() => {
            void (async () => {
              const done = await pollOnce();
              if (done) clearDistributionEmailPoll();
            })();
          }, 2000);
        }
      } catch (e: unknown) {
        if (isAbortError(e)) {
          toast.info("Send cancelled.");
        } else {
          toast.error("Failed to send email");
        }
        endSendUi();
      }
    },
    [assignments, fetchData, showPermissionDialog, clearDistributionEmailPoll]
  );

  const getAssignmentSectionIds = useCallback(
    (assignment: Assignment): string[] => {
      if (Array.isArray(assignment.section_ids) && assignment.section_ids.length > 0) {
        return [...new Set(assignment.section_ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
      }
      const ids = new Set<string>();
      for (const item of assignment.items ?? []) {
        if (item.section_id) {
          ids.add(item.section_id);
          continue;
        }
        if (item.seat_id) {
          const seat = seatsById.get(item.seat_id);
          if (seat?.section_id) ids.add(seat.section_id);
        }
      }
      return [...ids];
    },
    [seatsById]
  );

  /** Delete stored section ZIPs for this assignment (same API as manual Delete ZIP). */
  const deleteSectionZipsForAssignment = useCallback(
    async (assignment: Assignment): Promise<{ deleted: number; error?: string; forbidden?: boolean }> => {
      const sectionIds = getAssignmentSectionIds(assignment);
      if (sectionIds.length === 0) return { deleted: 0 };
      let deleted = 0;
      for (const sectionId of sectionIds) {
        const res = await fetch("/api/admin/print-tickets/section-zips", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, sectionId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          deletedZipObjects?: number;
          error?: string;
        };
        if (res.status === 403) return { deleted, forbidden: true };
        if (!res.ok) {
          return { deleted, error: data.error ?? "Failed to delete ZIP" };
        }
        deleted += data.deletedZipObjects ?? 0;
      }
      return { deleted };
    },
    [eventId, getAssignmentSectionIds]
  );

  const handleRezipAssignment = useCallback(
    async (assignment: Assignment) => {
      const sectionIds = getAssignmentSectionIds(assignment);
      if (sectionIds.length === 0 && !assignment.booking_id) {
        toast.error("No section data found for this distribution");
        return;
      }
      setZippingAssignmentId(assignment.id);
      try {
        let queued = 0;
        let completedInline = 0;
        let failedInline = 0;
        let anyInlineSkipped = false;
        const targets = sectionIds.length > 0 ? sectionIds : [""];
        for (const sectionId of targets) {
          const res = await fetch("/api/admin/print-tickets/section-zips", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              eventId,
              sectionId: sectionId || undefined,
              bookingId: assignment.booking_id ?? undefined,
              generateAll: false,
              overwrite: true,
            }),
            signal: AbortSignal.timeout(180_000),
          });
          const data = (await res.json().catch(() => ({}))) as {
            queued?: string[];
            error?: string;
            sectionResults?: Array<{ sectionId: string; action: "queued" | "exists" }>;
            inlineDebug?: Array<{ outcome?: string }>;
            inlineSkipped?: boolean;
          };
          if (res.status === 403) {
            showPermissionDialog();
            return;
          }
          if (!res.ok) {
            toast.error(data.error ?? "Failed to queue ZIP");
            return;
          }
          queued += data.queued?.length ?? 0;
          if (data.inlineSkipped) anyInlineSkipped = true;
          const inlineRows = Array.isArray(data.inlineDebug) ? data.inlineDebug : [];
          completedInline += inlineRows.filter((x) => x.outcome === "completed").length;
          failedInline += inlineRows.filter((x) => x.outcome === "failed").length;
        }
        const toastMsg =
          completedInline > 0
            ? `ZIP ready for ${completedInline} section(s)`
            : queued > 0
              ? anyInlineSkipped
                ? `Queued ${queued} ZIP job(s); finishing in the background.`
                : `Queued ${queued} ZIP job(s)`
              : "ZIP already up to date";
        if (failedInline > 0) {
          toast.error(`${toastMsg}; ${failedInline} section(s) failed`);
        } else {
          toast.success(toastMsg);
        }
        await fetchZipStatuses("full");
        setTimeout(() => {
          void fetchZipStatuses("summary");
        }, 1200);
        setTimeout(() => {
          void fetchZipStatuses("summary");
        }, 3000);
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "TimeoutError") {
          toast.error("ZIP request timed out. Check section ZIP status or try again.");
        } else {
          toast.error("Failed to queue ZIP");
        }
      } finally {
        setZippingAssignmentId(null);
      }
    },
    [eventId, fetchZipStatuses, getAssignmentSectionIds, showPermissionDialog]
  );

  const handleDeleteAssignmentZip = useCallback(
    async (assignment: Assignment) => {
      const sectionIds = getAssignmentSectionIds(assignment);
      if (sectionIds.length === 0) {
        toast.error("No section data found for this distribution");
        return;
      }
      setZippingAssignmentId(assignment.id);
      try {
        const { deleted, error, forbidden } = await deleteSectionZipsForAssignment(assignment);
        if (forbidden) {
          showPermissionDialog();
          return;
        }
        if (error) {
          toast.error(error);
          return;
        }
        toast.success(`Deleted ${deleted} ZIP file${deleted === 1 ? "" : "s"}`);
        await fetchZipStatuses("summary");
      } catch {
        toast.error("Failed to delete ZIP");
      } finally {
        setZippingAssignmentId(null);
      }
    },
    [deleteSectionZipsForAssignment, fetchZipStatuses, getAssignmentSectionIds, showPermissionDialog]
  );

  const performAdjustAllocationRelease = useCallback(async () => {
    if (!adjustAllocationAssignment) return;
    const ids = Array.from(selectedAdjustTicketIds);
    if (ids.length === 0) {
      toast.error("Select at least one ticket to release");
      return;
    }
    setAdjustAllocationReleaseConfirm(false);
    setSubmitting(true);
    setAllocationReleaseOverlay(true);
    try {
      const res = await fetch(
        `/api/admin/assignments/${adjustAllocationAssignment.id}/allocation-adjustments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket_ids: ids }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        deleted_tickets?: number;
        error?: string;
      };
      if (res.status === 403) {
        showPermissionDialog();
        return;
      }
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Failed to adjust allocation");
        return;
      }
      const released = data.deleted_tickets ?? ids.length;
      const zipResult = await deleteSectionZipsForAssignment(adjustAllocationAssignment);
      if (zipResult.forbidden) {
        showPermissionDialog();
      }
      await fetchZipStatuses("summary");
      const zipCleared = zipResult.deleted > 0;
      if (zipResult.error) {
        toast.error(
          `Released ${released} ticket${released === 1 ? "" : "s"}, but clearing section ZIPs failed: ${zipResult.error}`
        );
      } else if (zipCleared) {
        toast.success(
          `Released ${released} ticket${released === 1 ? "" : "s"}. Section ZIP removed — use Create Zip when you want a fresh export.`
        );
      } else {
        toast.success(
          `Released ${released} ticket${released === 1 ? "" : "s"}`
        );
      }
      closeAdjustAllocation();
      await fetchData();
    } catch {
      toast.error("Failed to adjust allocation");
    } finally {
      setSubmitting(false);
      setAllocationReleaseOverlay(false);
    }
  }, [
    adjustAllocationAssignment,
    closeAdjustAllocation,
    deleteSectionZipsForAssignment,
    fetchData,
    fetchZipStatuses,
    selectedAdjustTicketIds,
    showPermissionDialog,
  ]);

  const onAdjustAllocationReleaseClick = useCallback(() => {
    if (!adjustAllocationAssignment) return;
    if (selectedAdjustTicketIds.size === 0) {
      toast.error("Select at least one ticket to release");
      return;
    }
    if (!adjustAllocationReleaseConfirm) {
      setAdjustAllocationReleaseConfirm(true);
      return;
    }
    void performAdjustAllocationRelease();
  }, [
    adjustAllocationAssignment,
    adjustAllocationReleaseConfirm,
    performAdjustAllocationRelease,
    selectedAdjustTicketIds.size,
  ]);

  const handleSaveEmail = useCallback(
    async (assignmentId: string, email: string) => {
      const trimmed = email.trim();
      if (!trimmed) return;
      setSubmitting(true);
      setEditingEmailId(null);
      setEditingEmailValue("");
      try {
        const res = await fetch(`/api/admin/assignments/${assignmentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient_email: trimmed }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) {
          showPermissionDialog();
          return;
        }
        if (!res.ok) {
          toast.error(data.error ?? "Failed to save email");
          return;
        }
        toast.success("Email saved");
        fetchData();
      } catch {
        toast.error("Failed to save email");
      } finally {
        setSubmitting(false);
      }
    },
    [fetchData, showPermissionDialog]
  );

  const handleConfirmAction = useCallback(async () => {
    if (!confirmDialog) return;
    const { type, assignmentId } = confirmDialog;
    setConfirmDialog(null);
    setSubmitting(true);
    try {
      const url =
        type === "release"
          ? `/api/admin/assignments/${assignmentId}`
          : `/api/admin/assignments/${assignmentId}/reverse`;
      const res = await fetch(url, {
        method: type === "release" ? "DELETE" : "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        showPermissionDialog();
        return;
      }
      if (!res.ok) {
        toast.error(data.error ?? (type === "release" ? "Failed to release" : "Failed to reverse"));
        return;
      }
      toast.success(
        type === "release" ? "Manual distribution released" : "Manual distribution reversed to reserved"
      );
      fetchData();
    } catch {
      toast.error(type === "release" ? "Failed to release" : "Failed to reverse");
    } finally {
      setSubmitting(false);
    }
  }, [confirmDialog, fetchData, showPermissionDialog]);

  const floatingProgressCopy = useMemo(() => {
    if (sendingEmailId) {
      const elapsed = formatMmSs(distributionSendElapsedSec);
      const remaining = formatMmSs(
        Math.max(0, distributionSendEstimateTotalSecRef.current - distributionSendElapsedSec)
      );
      return {
        message: "Preparing your tickets…",
        subtitle: distributionSendWorkerLine.trim() || "Processing send queue",
        detail: `This tab processes batches and ZIP links directly. Keep it open to watch progress.\nElapsed ${elapsed} · ~${remaining} remaining (estimate)`,
      };
    }
    if (allocationReleaseOverlay) {
      const n = selectedAdjustTicketIds.size;
      return {
        message: "Releasing seats",
        subtitle: `${adjustAllocationAssignment?.recipient_name ?? "Manual distribution"} · ${n} ticket${n === 1 ? "" : "s"}`,
        detail:
          "Updating allocation, then clearing section ZIP files so your next export is fresh.",
      };
    }
    if (submitting) {
      return {
        ...FLOATING_PROGRESS_PRESETS.genericSave,
        message: "Confirming distribution",
        subtitle: eventTitle || "Manual distribution",
        detail: "Allocating tickets from Seat Configurator inventory. Keep this tab open.",
      };
    }
    return {
      message: "Saving…",
      subtitle: undefined as string | undefined,
      detail: undefined as string | undefined,
    };
  }, [
    sendingEmailId,
    distributionSendWorkerLine,
    distributionSendElapsedSec,
    allocationReleaseOverlay,
    adjustAllocationAssignment?.recipient_name,
    selectedAdjustTicketIds.size,
    submitting,
    eventTitle,
  ]);

  if (loading) {
    return (
      <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-12">
        <RouteLoading
          variant="panel"
          message="Loading…"
          subtitle="Seat map and distribution data."
        />
      </div>
    );
  }

  return (
    <>
      <FloatingProgressBar
        active={!!sendingEmailId || submitting}
        message={floatingProgressCopy.message}
        subtitle={floatingProgressCopy.subtitle}
        detail={floatingProgressCopy.detail}
        footer={
          sendingEmailId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/30 bg-white/10 text-foreground hover:bg-white/15"
              onClick={handleCancelDistributionSend}
            >
              Cancel send
            </Button>
          ) : undefined
        }
      />
    <div className="container mx-auto px-4 py-12">
      <NavButtonWithProgress
        href={`/admin/events/${eventId}`}
        variant="secondary"
        size="sm"
        className="mb-4 bg-amber-400 text-black hover:bg-amber-300 border-transparent"
        loadingMessage="Loading event…"
      >
        ← Back to event
      </NavButtonWithProgress>
      <h1 className="text-2xl font-bold text-foreground mb-2">Manual Distribution</h1>
      <p className="text-foreground-muted text-sm mb-6">
        {eventTitle || "Event"} — Select seats and assign to a recipient.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Select seats</h2>
          {assignedSeats.length > 0 && (
            <>
              <p className="text-sm text-foreground-muted mb-2">
                Section color = available, white = reserved, gray = sold
              </p>
              <SeatMap
                seats={assignedSeats as SeatMapSeatInfo[]}
                selectedIds={selectedSeatIds}
                onToggle={toggleSeat}
                sections={assignedSections}
                defaultCollapsed
                onSectionSelectionToggle={handleSectionSelectionToggle}
                onMarqueeToggle={(ids) => {
                  setSelectedSeatIds((prev) => {
                    const next = new Set(prev);
                    for (const id of ids) {
                      const s = assignedSeatsById.get(id);
                      if (!s?.available) continue;
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                    }
                    return next;
                  });
                }}
                onShiftRangeSelect={(ids) => {
                  setSelectedSeatIds((prev) => {
                    const next = new Set(prev);
                    for (const id of ids) {
                      const s = assignedSeatsById.get(id);
                      if (s?.available) next.add(id);
                    }
                    return next;
                  });
                }}
              />
            </>
          )}
          {freeStandingSections.length > 0 && (
            <div className={assignedSeats.length > 0 ? "mt-6" : ""}>
              <p className="text-sm font-medium text-foreground mb-1">
                Free seating / standing
              </p>
              <p className="text-xs text-foreground-muted mb-3">
                Numbered seats: click to toggle, Shift+click for a range. Drag a short distance
                (from a chip or a gap) to marquee — each seat in the box toggles on/off.
                For capacity-only sections (no seat rows), use quantity.
              </p>
              <div className="flex flex-col gap-4">
                {freeStandingSections.map((sec) => {
                  const qty = sectionQuantities[sec.id] ?? 0;
                  const hasPhysical = sectionIdsWithFsPhysicalSeats.has(sec.id);
                  const fsSeats = sortedFreeStandingSeats(sec.id);
                  const selectedInSection = fsSeats.filter((s) =>
                    selectedSeatIds.has(s.id)
                  ).length;
                  const isFsCollapsed = collapsedFreeStandingIds.has(sec.id);
                  const sectionCardStyle = getSectionCardStyle(sec.color);

                  return (
                    <div
                      key={sec.id}
                      className="rounded-lg border border-[var(--glass-border)] bg-white/[0.02] overflow-hidden"
                      style={sectionCardStyle}
                    >
                      <div className="flex flex-wrap items-center gap-2 p-3">
                        <button
                          type="button"
                          onClick={() => toggleFreeStandingCollapsed(sec.id)}
                          className={cn(
                            "flex items-center gap-2 text-left flex-1 min-w-0 rounded-md -m-1 p-1",
                            "hover:bg-white/[0.02]"
                          )}
                        >
                          <span className="text-foreground-muted shrink-0">
                            {isFsCollapsed ? (
                              <ChevronRight className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {sec.section_code || sec.name}
                            </p>
                            <p className="text-xs text-foreground-muted mt-0.5">
                              {sec.available ?? 0} remaining
                              {hasPhysical && fsSeats.length > 0
                                ? ` · ${selectedInSection} selected`
                                : null}
                            </p>
                          </div>
                        </button>
                        {hasPhysical && fsSeats.length > 0 ? (
                          <div className="flex gap-1 shrink-0">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs shrink-0 border-[var(--glass-border)]"
                              onClick={() => selectAllAvailableFsPhysical(sec.id)}
                            >
                              All available
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs shrink-0"
                              onClick={() => clearFsPhysicalSelection(sec.id)}
                              disabled={selectedInSection === 0}
                            >
                              Clear
                            </Button>
                          </div>
                        ) : null}
                      </div>

                      {!isFsCollapsed &&
                        (hasPhysical && fsSeats.length > 0 ? (
                          <div className="px-3 pb-3 pt-0">
                            <FreeStandingChipPicker
                              fsSeats={fsSeats}
                              selectedSeatIds={selectedSeatIds}
                              setSelectedSeatIds={setSelectedSeatIds}
                              accentColor={sec.color}
                            />
                          </div>
                        ) : (
                          <div className="px-3 pb-3 pt-0">
                            <div className="flex items-center rounded-lg overflow-hidden border border-[var(--glass-border)] w-fit">
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 rounded-none border-0 border-r border-[var(--glass-border)]"
                                onClick={() => decSectionQty(sec.id)}
                                disabled={qty <= 0}
                                aria-label="Decrease"
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <Input
                                type="number"
                                min={0}
                                max={sec.available ?? 0}
                                value={qty || ""}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  setSectionQty(sec.id, isNaN(v) ? 0 : Math.max(0, v));
                                }}
                                onBlur={(e) => {
                                  const v = Math.min(
                                    sec.available ?? 0,
                                    Math.max(0, parseInt(e.target.value, 10) || 0)
                                  );
                                  setSectionQty(sec.id, v);
                                }}
                                className="h-8 w-12 min-w-[2.5rem] rounded-none border-0 border-x border-[var(--glass-border)] bg-white/5 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 rounded-none border-0 border-l border-[var(--glass-border)]"
                                onClick={() => incSectionQty(sec.id)}
                                disabled={(sec.available ?? 0) <= qty}
                                aria-label="Increase"
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {(assignedSeats.length > 0 || freeStandingSections.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-2 items-end">
              <div>
                <label className="block text-sm text-foreground-muted mb-1">
                  Recipient name
                </label>
                <Input
                  list="recipient-names"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="max-w-[200px]"
                />
                <datalist id="recipient-names">
                  {recipientSuggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm text-foreground-muted mb-1">
                  Recipient email (optional)
                </label>
                <Input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="e.g. john@example.com"
                  className="max-w-[200px]"
                />
              </div>
              <Button
                onClick={() => {
                  setDistributionCategory("sales");
                  setCategoryDialogOpen(true);
                }}
                disabled={
                  submitting ||
                  totalAssignableTickets === 0 ||
                  !recipientName.trim()
                }
              >
                Assign{" "}
                {totalAssignableTickets > 0 ? totalAssignableTickets : ""}{" "}
                seat{totalAssignableTickets !== 1 ? "s" : ""}
              </Button>
            </div>
          )}
          {assignedSeats.length === 0 && freeStandingSections.length === 0 && (
            <p className="text-foreground-muted">
              No seats or capacity-based sections for this event. Add sections in
              the Seat Configurator.
            </p>
          )}
        </div>

        <AssignSeatsDistributionColumn
          assignmentsEmpty={assignments.length === 0}
          groupedByRecipient={groupedByRecipient}
          seatsById={seatsById}
          sections={sections}
          expandedRecipients={expandedRecipients}
          setExpandedRecipients={setExpandedRecipients}
          zipStatusBySection={zipStatusBySection}
          zippingAssignmentId={zippingAssignmentId}
          submitting={submitting}
          sendingEmailId={sendingEmailId}
          editingEmailId={editingEmailId}
          editingEmailValue={editingEmailValue}
          setEditingEmailId={setEditingEmailId}
          setEditingEmailValue={setEditingEmailValue}
          getAssignmentSectionIds={getAssignmentSectionIds}
          onManageSeatsClick={handleManageSeatsClick}
          onConfirm={handleConfirm}
          onReleaseClick={handleReleaseClick}
          onOpenAdjustAllocation={openAdjustAllocation}
          onReverseClick={handleReverseClick}
          onSendEmail={handleSendEmail}
          onRezipAssignment={handleRezipAssignment}
          onDeleteAssignmentZip={handleDeleteAssignmentZip}
          onSaveEmail={handleSaveEmail}
        />
      </div>

      <Dialog
        open={!!confirmDialog}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
      >
        <DialogContent
          hideClose
          highZIndex
          className="max-w-md"
        >
          <DialogHeader>
            <div className="flex items-center gap-3">
              {confirmDialog?.type === "reverse" ? (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                  <RotateCcw className="h-5 w-5 text-amber-400" />
                </div>
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                </div>
              )}
              <div>
                <DialogTitle className="text-foreground">
                  {confirmDialog?.type === "release"
                    ? "Release manual distribution?"
                    : "Are you sure you want to reverse?"}
                </DialogTitle>
                <DialogDescription className="mt-1 text-left">
                  {confirmDialog?.type === "release"
                    ? "The seats will be released and become available for others."
                    : "This will remove the booking and tickets and return the seats to reserved status. This cannot be undone from here."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="secondary"
              onClick={() => setConfirmDialog(null)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant={confirmDialog?.type === "reverse" ? "destructive" : "default"}
              onClick={handleConfirmAction}
              disabled={submitting}
            >
              {submitting ? "Processing…" : confirmDialog?.type === "release" ? "Release" : "Reverse"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={categoryDialogOpen}
        onOpenChange={(open) => !open && setCategoryDialogOpen(false)}
      >
        <DialogContent hideClose className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Please select how these seats will be categorized:
            </DialogTitle>
            <DialogDescription className="mt-1 text-left text-zinc-400">
              Choose whether these tickets are sold or given as complimentary.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="category-dialog"
                  value="sales"
                  checked={distributionCategory === "sales"}
                  onChange={() => setDistributionCategory("sales")}
                  className="rounded-full border-neutral-500"
                />
                <span className="text-sm text-foreground">Sales</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="category-dialog"
                  value="complementary"
                  checked={distributionCategory === "complementary"}
                  onChange={() => setDistributionCategory("complementary")}
                  className="rounded-full border-neutral-500"
                />
                <span className="text-sm text-foreground">Complimentary</span>
              </label>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="secondary"
              onClick={() => setCategoryDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              disabled={submitting}
            >
              {submitting ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!manageSeatsAssignment}
        onOpenChange={(open) => {
          if (!open) {
            setManageSeatsAssignment(null);
            setCollapsedSections(new Set());
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Manage seats — {manageSeatsAssignment?.recipient_name}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Remove individual seats from this distribution. Removed seats become available for others.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 flex-1 min-h-0 overflow-y-auto">
            {(() => {
              const seatItems = (manageSeatsAssignment?.items ?? []).filter((i) => i.seat_id);
              if (seatItems.length === 0) {
                return (
                  <p className="text-sm text-foreground-muted py-4 text-center">No seats to manage</p>
                );
              }
              const bySection = seatItems.reduce<Record<string, typeof seatItems>>((acc, item) => {
                const section = (item.seat_label ?? "").split(/\s+/)[0] || "Other";
                (acc[section] ??= []).push(item);
                return acc;
              }, {});
              const sections = Object.keys(bySection).sort();
              return sections.map((section) => {
                const isCollapsed = collapsedSections.has(section);
                const seatIds = bySection[section].map((i) => i.seat_id!).filter(Boolean);
                return (
                <div key={section}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => toggleSectionCollapsed(section)}
                      className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted uppercase tracking-wider hover:text-foreground-muted transition-colors"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3 shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3 shrink-0" />
                      )}
                      {section}
                      <span className="text-foreground-muted font-normal normal-case">
                        ({seatIds.length})
                      </span>
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/20 h-7 text-xs"
                      onClick={() =>
                        manageSeatsAssignment &&
                        handleRemoveSection(manageSeatsAssignment.id, section, seatIds)
                      }
                      disabled={removingSection === section}
                    >
                      {removingSection === section ? (
                        "Removing…"
                      ) : (
                        <>
                          <Trash2 className="h-3 w-3 mr-1" />
                          Remove section
                        </>
                      )}
                    </Button>
                  </div>
                  {!isCollapsed && (
                  <div className="space-y-2">
                    {bySection[section].map((item, index) => (
                      <div
                        key={`${section}-${item.seat_id ?? "s"}-${index}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-2"
                      >
                        <span className="text-sm text-foreground">{item.seat_label ?? item.seat_id}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
                          onClick={() =>
                            item.seat_id && handleRemoveSeat(manageSeatsAssignment!.id, item.seat_id)
                          }
                          disabled={removingSeatId === item.seat_id}
                        >
                          {removingSeatId === item.seat_id ? (
                            "Removing…"
                          ) : (
                            <>
                              <Trash2 className="h-3.5 w-3 mr-1" />
                              Remove
                            </>
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
              );
              });
            })()}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setManageSeatsAssignment(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!adjustAllocationAssignment}
        onOpenChange={(open) => {
          if (!open) closeAdjustAllocation();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Adjust Allocation — {adjustAllocationAssignment?.recipient_name}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Select groups, sections, or seats to release. Released seats become available for booking again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto rounded-md border border-[var(--glass-border)] bg-black/20 p-3">
            {adjustAllocationLoading ? (
              <p className="text-sm text-foreground-muted text-center py-6">
                Loading allocation details...
              </p>
            ) : adjustAllocationGroups.length === 0 ? (
              <p className="text-sm text-foreground-muted text-center py-6">
                No sold tickets found for this assignment.
              </p>
            ) : (
              <div className="space-y-3">
                {adjustAllocationGroups.map((group) => {
                  const groupIds = groupTicketIds(group);
                  const groupSelectedCount = groupIds.filter((id) =>
                    selectedAdjustTicketIds.has(id)
                  ).length;
                  const isGroupChecked =
                    groupIds.length > 0 && groupSelectedCount === groupIds.length;
                  const isGroupCollapsed = collapsedAdjustGroupKeys.has(group.group_key);
                  return (
                    <div
                      key={group.group_key}
                      className="rounded-lg border border-[var(--glass-border)] bg-white/5 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleAdjustGroupCollapsed(group.group_key)}
                          className="text-foreground-muted hover:text-foreground transition-colors"
                          aria-label={isGroupCollapsed ? "Expand group" : "Collapse group"}
                        >
                          {isGroupCollapsed ? (
                            <ChevronRight className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                        <Checkbox
                          checked={isGroupChecked}
                          onCheckedChange={(checked) =>
                            toggleAdjustGroup(group, checked === true)
                          }
                        />
                        <span className="text-sm font-semibold text-foreground">
                          {group.group_label}
                        </span>
                        <span className="text-xs text-foreground-muted">
                          ({groupSelectedCount}/{groupIds.length} selected)
                        </span>
                      </div>
                      {!isGroupCollapsed && (
                      <div className="mt-3 space-y-3 pl-2">
                        {group.sections.map((section) => {
                          const sectionKey = `${group.group_key}:${section.section_id}`;
                          const sectionIds = sectionTicketIds(section);
                          const sectionSelectedCount = sectionIds.filter((id) =>
                            selectedAdjustTicketIds.has(id)
                          ).length;
                          const isSectionChecked =
                            sectionIds.length > 0 &&
                            sectionSelectedCount === sectionIds.length;
                          const isSectionCollapsed = collapsedAdjustSectionKeys.has(sectionKey);
                          return (
                            <div key={section.section_id} className="rounded-md border border-[var(--glass-border)]/70 p-3">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleAdjustSectionCollapsed(sectionKey)}
                                  className="text-foreground-muted hover:text-foreground transition-colors"
                                  aria-label={isSectionCollapsed ? "Expand section" : "Collapse section"}
                                >
                                  {isSectionCollapsed ? (
                                    <ChevronRight className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </button>
                                <Checkbox
                                  checked={isSectionChecked}
                                  onCheckedChange={(checked) =>
                                    toggleAdjustSection(section, checked === true)
                                  }
                                />
                                <span className="text-sm text-foreground">
                                  {section.section_name}
                                </span>
                                <span className="text-xs text-foreground-muted">
                                  ({sectionSelectedCount}/{sectionIds.length} selected)
                                </span>
                              </div>
                              {!isSectionCollapsed && (
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                {sortAllocationSeatsChronological(section.sold_tickets).map((seat) => (
                                  <label
                                    key={seat.ticket_id}
                                    className="flex items-center gap-2 rounded-md border border-[var(--glass-border)]/50 px-2 py-1.5 text-xs text-foreground"
                                  >
                                    <Checkbox
                                      checked={selectedAdjustTicketIds.has(seat.ticket_id)}
                                      onCheckedChange={(checked) =>
                                        toggleAdjustTicket(seat.ticket_id, checked === true)
                                      }
                                    />
                                    <span>{seat.seat_label}</span>
                                  </label>
                                ))}
                              </div>
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
          <DialogFooter className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
            {adjustAllocationReleaseConfirm && (
              <div className="w-full rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-left text-xs text-amber-100 sm:order-first sm:w-full">
                <AlertTriangle className="mb-1 inline h-3.5 w-3.5 align-text-bottom text-amber-400" />
                <span className="font-medium text-amber-50">Confirm release</span>
                <p className="mt-1 text-amber-100/95 leading-relaxed">
                  Selected tickets will be removed from this distribution and seats will go back on sale.
                  Stored section ZIP files will be deleted automatically so you can run{" "}
                  <span className="font-medium">Create Zip</span> for a new export.
                </p>
              </div>
            )}
            <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:ml-auto sm:w-auto">
              <span className="text-xs text-foreground-muted">
                Selected: {selectedAdjustTicketIds.size} ticket{selectedAdjustTicketIds.size === 1 ? "" : "s"}
              </span>
              <div className="flex flex-wrap justify-end gap-2">
                {adjustAllocationReleaseConfirm ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setAdjustAllocationReleaseConfirm(false)}
                    disabled={submitting}
                  >
                    Go back
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={closeAdjustAllocation} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={onAdjustAllocationReleaseClick}
                  disabled={submitting || selectedAdjustTicketIds.size === 0 || adjustAllocationLoading}
                >
                  {submitting
                    ? "Releasing…"
                    : adjustAllocationReleaseConfirm
                      ? "Confirm release"
                      : "Release selected"}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmedDialogOpen}
        onOpenChange={(open) => !open && setConfirmedDialogOpen(false)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/40">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <DialogTitle className="text-foreground">
                  Manual distribution confirmed
                </DialogTitle>
                <DialogDescription className="mt-1 text-left text-zinc-400">
                  The tickets have been confirmed and a booking has been created. You can now send the ticket email to the recipient.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setConfirmedDialogOpen(false)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Ok
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={emailSentDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEmailSentDialogOpen(false);
            setEmailSentRecipient(null);
          }
        }}
      >
        <DialogContent
          className="max-w-md"
        >
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/40">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <DialogTitle className="text-foreground">
                  Email sent successfully
                </DialogTitle>
                <DialogDescription className="mt-1 text-left text-zinc-400">
                  {emailSentRecipient
                    ? `The ticket email was delivered to ${emailSentRecipient}.`
                    : "The ticket email has been sent to the recipient."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                setEmailSentDialogOpen(false);
                setEmailSentRecipient(null);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Ok
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}
