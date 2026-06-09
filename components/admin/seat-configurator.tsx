"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Copy,
  ChevronDown,
  ChevronRight,
  FileDown,
  GripVertical,
  Minus,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { SeatMapImageCarousel } from "@/components/seat-map-image-carousel";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SeatMap } from "@/components/seat-picker/seat-map";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type SeatingType = "assigned" | "free" | "standing";
const UNGROUPED_GROUP_LABEL = "Ungrouped";

/** Palette for section colors: distinct, high-contrast swatches used across all seating types */
const SECTION_COLORS: { hex: string; name: string }[] = [
  { hex: "#e63946", name: "Red" },
  { hex: "#f97316", name: "Orange" },
  { hex: "#facc15", name: "Yellow" },
  { hex: "#fbbf24", name: "Amber" },
  { hex: "#84cc16", name: "Lime Green" },
  { hex: "#22c55e", name: "Green" },
  { hex: "#4ade80", name: "Emerald" },
  { hex: "#06b6d4", name: "Cyan" },
  { hex: "#2dd4bf", name: "Turquoise" },
  { hex: "#38bdf8", name: "Light Blue" },
  { hex: "#3b82f6", name: "Blue" },
  { hex: "#0ea5e9", name: "Sky" },
  { hex: "#8b5cf6", name: "Purple" },
  { hex: "#a855f7", name: "Violet" },
  { hex: "#d946ef", name: "Magenta" },
  { hex: "#ec4899", name: "Pink" },
  { hex: "#f97373", name: "Coral" },
  { hex: "#f9a8d4", name: "Blush" },
  { hex: "#86efac", name: "Mint" },
  { hex: "#e6e6fa", name: "Lavender" },
  { hex: "#8b2c2c", name: "Dark Red" },
  { hex: "#b45309", name: "Bronze" },
  { hex: "#15803d", name: "Forest Green" },
  { hex: "#000080", name: "Navy Blue" },
  { hex: "#64748b", name: "Slate" },
];

interface Section {
  id: string;
  name: string;
  section_code: string | null;
  section_group?: string | null;
  capacity: number;
  sort_order: number;
  seating_type?: SeatingType;
  color?: string | null;
  show_seat_selection?: boolean;
  remaining?: number;
  column_direction?: string | null;
  inventory_count?: number;
  inventory_images_count?: number;
  inventory_allocated_count?: number;
  inventory_seats_count?: number;
}

interface Seat {
  id: string;
  event_section_id: string;
  row_label: string;
  seat_number: string;
  status?: "available" | "reserved" | "sold" | "hold";
}

interface SeatConfiguratorProps {
  eventId: string;
  venueId: string;
  venueName?: string;
  initialSeatMapUrls?: string[];
}

export function SeatConfigurator({ eventId, venueId, venueName = "", initialSeatMapUrls = [] }: SeatConfiguratorProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionCode, setNewSectionCode] = useState("");
  const [newSectionGroup, setNewSectionGroup] = useState("");
  const [newSectionSeatingType, setNewSectionSeatingType] = useState<SeatingType>("assigned");
  const [deleteSectionId, setDeleteSectionId] = useState<string | null>(null);
  const [deleteSelectedSectionId, setDeleteSelectedSectionId] = useState<string | null>(null);
  const [generateSectionId, setGenerateSectionId] = useState<string | null>(null);
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(new Set());
  const [collapsedGroupNames, setCollapsedGroupNames] = useState<Set<string>>(new Set());
  const [loadedSeatSectionIds, setLoadedSeatSectionIds] = useState<Set<string>>(new Set());
  const [loadingSeatSectionIds, setLoadingSeatSectionIds] = useState<Set<string>>(new Set());
  const [selectedSeatIdsBySection, setSelectedSeatIdsBySection] = useState<
    Record<string, Set<string>>
  >({});
  const [generateConfig, setGenerateConfig] = useState<
    Record<
      string,
      { numRows: string; numColumns: string; capacity?: string; direction?: "left-to-right" | "right-to-left" }
    >
  >({});
  const [seatMapUrls, setSeatMapUrls] = useState<string[]>(initialSeatMapUrls);
  const [seatMapUploading, setSeatMapUploading] = useState(false);
  const [seatMapSaving, setSeatMapSaving] = useState(false);
  const [seatMapCardCollapsed, setSeatMapCardCollapsed] = useState(true);
  const [groupingSummaryCollapsed, setGroupingSummaryCollapsed] = useState(false);
  const hasInitializedGroupCollapseRef = useRef(false);
  const seatMapFileInputRef = useRef<HTMLInputElement>(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [saveTemplateSaving, setSaveTemplateSaving] = useState(false);
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false);
  const [templates, setTemplates] = useState<Array<{ id: string; display_name: string; section_count: number; total_seats: number }>>([]);
  const [templateSearch, setTemplateSearch] = useState("");
  const debouncedTemplateSearch = useDebouncedValue(templateSearch, 350);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templatePreview, setTemplatePreview] = useState<{
    sections: Array<{ name: string; section_code: string | null; seating_type: string; seats: unknown[] }>;
    prices: Array<{ section_index: number; price_cents: number }>;
    early_bird: Array<{ section_index: number; discount_percent?: number; price_cents?: number }>;
    early_bird_starts_at: string | null;
    early_bird_ends_at: string | null;
  } | null>(null);
  const [applyTemplateSaving, setApplyTemplateSaving] = useState(false);
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const [applyConfirmData, setApplyConfirmData] = useState<{ existing_section_count: number; existing_seat_count: number } | null>(null);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [deleteTemplateSaving, setDeleteTemplateSaving] = useState(false);
  const [duplicateSectionDialogMessage, setDuplicateSectionDialogMessage] = useState<string | null>(null);
  const [generatingTickets, setGeneratingTickets] = useState(false);
  const [deletingTickets, setDeletingTickets] = useState(false);
  const [deleteTicketsTarget, setDeleteTicketsTarget] = useState<
    { mode: "section"; sectionId: string } | { mode: "all" } | null
  >(null);
  const [ticketGenProgress, setTicketGenProgress] = useState<{
    percent: number;
    message: string;
    subtitle: string;
    detail: string;
  } | null>(null);

  function deletableInventoryCount(sec: Section): number {
    return Math.max(
      0,
      (sec.inventory_count ?? 0) - (sec.inventory_allocated_count ?? 0)
    );
  }

  const totalDeletableInventory = useMemo(
    () => sections.reduce((sum, sec) => sum + deletableInventoryCount(sec), 0),
    [sections]
  );

  useEffect(() => {
    setSeatMapUrls(initialSeatMapUrls);
  }, [initialSeatMapUrls]);

  function deriveConfigFromSeats(
    sectionSeats: Seat[],
    sec: Section,
    defaults: {
      numRows: string;
      numColumns: string;
      capacity?: string;
      direction?: "left-to-right" | "right-to-left";
    }
  ): {
    numRows: string;
    numColumns: string;
    capacity?: string;
    direction?: "left-to-right" | "right-to-left";
  } {
    if (sectionSeats.length === 0) return defaults;
    const isFs = sec.seating_type === "free" || sec.seating_type === "standing";
    if (isFs) {
      return {
        numRows: "3",
        numColumns: "5",
        capacity: String(sectionSeats.length),
        direction: defaults.direction ?? "left-to-right",
      };
    }
    const byRow = new Map<string, number>();
    for (const s of sectionSeats) {
      const r = String(s.row_label ?? "").trim();
      if (!r) continue;
      byRow.set(r, (byRow.get(r) ?? 0) + 1);
    }
    const numRows = Math.max(1, byRow.size);
    let maxSeatsInRow = 0;
    for (const c of byRow.values()) maxSeatsInRow = Math.max(maxSeatsInRow, c);
    const numColumns = Math.max(1, maxSeatsInRow);
    return {
      numRows: String(numRows),
      numColumns: String(numColumns),
      direction: defaults.direction ?? "left-to-right",
    };
  }

  const fetchSeating = useCallback(
    async (opts?: {
      preserveExpanded?: boolean;
      silent?: boolean;
      /** After derive, overlay these values (e.g. duplicate section copies source Rows/Columns UI). */
      mergeGenerateForSectionIds?: Record<
        string,
        {
          numRows: string;
          numColumns: string;
          capacity?: string;
          direction: "left-to-right" | "right-to-left";
        }
      >;
    }) => {
      const showLoading = !opts?.silent;
      if (showLoading) {
        setLoading(true);
      }
      try {
        const res = await fetch(`/api/admin/events/${eventId}/seating?includeSeats=0`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (res.ok) {
          const secs = data.sections ?? [];
          const seatList: Seat[] = [];
          const sectionIds = new Set((secs as Section[]).map((s) => s.id));
          setSections(secs);
          setSeats(seatList);
          setLoadedSeatSectionIds((prev) => {
            const next = new Set<string>();
            for (const id of prev) {
              if (sectionIds.has(id)) next.add(id);
            }
            return next;
          });
          setLoadingSeatSectionIds((prev) => {
            const next = new Set<string>();
            for (const id of prev) {
              if (sectionIds.has(id)) next.add(id);
            }
            return next;
          });
          if (!opts?.preserveExpanded) {
            setExpandedSectionIds(new Set());
          }
          setGenerateConfig((prev) => {
            const next = { ...prev };
            for (const sec of secs) {
              const secSeats = seatList.filter((s: Seat) => s.event_section_id === sec.id);
              const derived = deriveConfigFromSeats(secSeats, sec, {
                numRows: prev[sec.id]?.numRows ?? "3",
                numColumns: prev[sec.id]?.numColumns ?? "5",
                capacity: prev[sec.id]?.capacity ?? String(sec.capacity || 50),
                direction:
                  prev[sec.id]?.direction ??
                  (sec.column_direction === "right-to-left" ? "right-to-left" : "left-to-right"),
              });
              next[sec.id] = derived;
            }
            const merge = opts?.mergeGenerateForSectionIds;
            if (merge) {
              for (const [mergeId, snap] of Object.entries(merge)) {
                const cur = next[mergeId];
                if (cur) {
                  next[mergeId] = { ...cur, ...snap };
                } else {
                  next[mergeId] = {
                    numRows: snap.numRows,
                    numColumns: snap.numColumns,
                    capacity: snap.capacity,
                    direction: snap.direction,
                  };
                }
              }
            }
            return next;
          });
        } else {
          toast.error(data.error ?? "Failed to load seating");
        }
      } catch {
        toast.error("Failed to load seating");
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [eventId]
  );

  const loadSeatDetailsForSections = useCallback(
    async (sectionIds: string[]) => {
      const uniqueSectionIds = Array.from(new Set(sectionIds.filter(Boolean)));
      if (uniqueSectionIds.length === 0) return;
      const pendingIds = uniqueSectionIds.filter(
        (id) => !loadedSeatSectionIds.has(id) && !loadingSeatSectionIds.has(id)
      );
      if (pendingIds.length === 0) return;

      setLoadingSeatSectionIds((prev) => {
        const next = new Set(prev);
        for (const id of pendingIds) next.add(id);
        return next;
      });

      try {
        const params = new URLSearchParams();
        params.set("includeSeats", "1");
        params.set("sectionIds", pendingIds.join(","));
        const res = await fetch(`/api/admin/events/${eventId}/seating?${params.toString()}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to load seat details");
        }
        const seatList = Array.isArray(data?.seats) ? (data.seats as Seat[]) : [];
        const pendingSet = new Set(pendingIds);
        setSeats((prev) => {
          const kept = prev.filter((s) => !pendingSet.has(s.event_section_id));
          return [...kept, ...seatList];
        });
        setLoadedSeatSectionIds((prev) => {
          const next = new Set(prev);
          for (const id of pendingIds) next.add(id);
          return next;
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to load seat details";
        toast.error(message);
      } finally {
        setLoadingSeatSectionIds((prev) => {
          const next = new Set(prev);
          for (const id of pendingIds) next.delete(id);
          return next;
        });
      }
    },
    [eventId, loadedSeatSectionIds, loadingSeatSectionIds]
  );

  useEffect(() => {
    if (expandedSectionIds.size === 0) return;
    void loadSeatDetailsForSections(Array.from(expandedSectionIds));
  }, [expandedSectionIds, loadSeatDetailsForSections]);

  useEffect(() => {
    fetchSeating();
  }, [fetchSeating]);

  function toggleSection(sectionId: string) {
    let opening = false;
    setExpandedSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else {
        next.add(sectionId);
        opening = true;
      }
      return next;
    });
    if (opening) {
      void loadSeatDetailsForSections([sectionId]);
    }
  }

  function getSectionGroupName(sec: Section) {
    const groupName = (sec.section_group ?? "").trim();
    return groupName || UNGROUPED_GROUP_LABEL;
  }

  function toggleGroup(groupName: string) {
    const sectionIdsInGroup = sections
      .filter((sec) => getSectionGroupName(sec) === groupName)
      .map((sec) => sec.id);
    let opening = false;
    setCollapsedGroupNames((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else {
        next.add(groupName);
      }
      opening = !next.has(groupName);
      return next;
    });
    if (opening) {
      void loadSeatDetailsForSections(sectionIdsInGroup);
    }
  }

  function getGenerateConfig(sectionId: string) {
    return (
      generateConfig[sectionId] ?? {
        numRows: "3",
        numColumns: "5",
        capacity: "50",
        direction: "left-to-right" as const,
      }
    );
  }

  function setGenerateConfigFor(
    sectionId: string,
    field: "numRows" | "numColumns" | "capacity" | "direction",
    value: string | "left-to-right" | "right-to-left"
  ) {
    setGenerateConfig((prev) => ({
      ...prev,
      [sectionId]: {
        ...getGenerateConfig(sectionId),
        [field]: value,
      },
    }));
  }

  const groupingSummary = (() => {
    const grouped = new Map<
      string,
      { groupName: string; totalSeats: number; sectionCount: number }
    >();
    let totalSeats = 0;
    for (const sec of sections) {
      const groupName = getSectionGroupName(sec);
      const sectionSeats =
        sec.seating_type === "assigned"
          ? seats.filter((s) => s.event_section_id === sec.id).length || sec.capacity
          : sec.capacity;
      totalSeats += sectionSeats;
      const existing = grouped.get(groupName) ?? {
        groupName,
        totalSeats: 0,
        sectionCount: 0,
      };
      existing.totalSeats += sectionSeats;
      existing.sectionCount += 1;
      grouped.set(groupName, existing);
    }
    return {
      rows: [...grouped.values()].sort((a, b) => b.totalSeats - a.totalSeats),
      totalSeats,
    };
  })();

  const sectionsByGroup = useMemo(() => {
    const grouped = new Map<
      string,
      { groupName: string; sections: Section[]; totalSeats: number }
    >();

    for (const sec of sections) {
      const groupName = getSectionGroupName(sec);
      const sectionSeats =
        sec.seating_type === "assigned"
          ? seats.filter((s) => s.event_section_id === sec.id).length || sec.capacity
          : sec.capacity;
      const existing = grouped.get(groupName) ?? {
        groupName,
        sections: [],
        totalSeats: 0,
      };
      existing.sections.push(sec);
      existing.totalSeats += sectionSeats;
      grouped.set(groupName, existing);
    }

    return [...grouped.values()];
  }, [sections, seats]);

  useEffect(() => {
    setCollapsedGroupNames((prev) => {
      const existingGroupNames = new Set(sectionsByGroup.map((group) => group.groupName));
      if (!hasInitializedGroupCollapseRef.current) {
        if (existingGroupNames.size === 0) {
          return prev;
        }
        hasInitializedGroupCollapseRef.current = true;
        return new Set(existingGroupNames);
      }
      const next = new Set<string>();
      for (const groupName of prev) {
        if (existingGroupNames.has(groupName)) {
          next.add(groupName);
        }
      }
      return next;
    });
  }, [sectionsByGroup]);

  async function handleSaveTemplate() {
    const name = saveTemplateName.trim();
    if (!name) {
      toast.error("Custom name is required");
      return;
    }
    setSaveTemplateSaving(true);
    try {
      const res = await fetch("/api/admin/seat-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venue_id: venueId,
          custom_name: name,
          event_id: eventId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save template");
        return;
      }
      toast.success(`Template saved: ${data.name}`);
      setSaveTemplateOpen(false);
      setSaveTemplateName("");
    } catch {
      toast.error("Failed to save template");
    } finally {
      setSaveTemplateSaving(false);
    }
  }

  const fetchTemplates = useCallback(async () => {
    const params = new URLSearchParams();
    if (debouncedTemplateSearch.trim()) params.set("q", debouncedTemplateSearch.trim());
    if (venueId) params.set("venue_id", venueId);
    const res = await fetch(`/api/admin/seat-templates?${params.toString()}`);
    const data = await res.json();
    if (res.ok && Array.isArray(data)) {
      setTemplates(data);
    }
  }, [debouncedTemplateSearch, venueId]);

  useEffect(() => {
    if (applyTemplateOpen) {
      void fetchTemplates();
    }
  }, [applyTemplateOpen, debouncedTemplateSearch, fetchTemplates]);

  async function handleSelectTemplate(tid: string) {
    setSelectedTemplateId(tid);
    const res = await fetch(`/api/admin/seat-templates/${tid}`);
    const data = await res.json();
    if (res.ok && data.payload) {
      setTemplatePreview({
        sections: data.payload.sections ?? [],
        prices: data.payload.prices ?? [],
        early_bird: data.payload.early_bird ?? [],
        early_bird_starts_at: data.payload.early_bird_starts_at ?? null,
        early_bird_ends_at: data.payload.early_bird_ends_at ?? null,
      });
    }
  }

  async function handleApplyTemplate(confirmed = false) {
    if (!selectedTemplateId) return;
    setApplyTemplateSaving(true);
    try {
      const url = `/api/admin/events/${eventId}/seating/apply-template?${confirmed ? "confirm=1" : ""}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: selectedTemplateId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to apply template");
        return;
      }
      if (data.requires_confirmation) {
        setApplyConfirmData({
          existing_section_count: data.existing_section_count,
          existing_seat_count: data.existing_seat_count,
        });
        setApplyConfirmOpen(true);
      } else {
        toast.success("Template applied");
        setApplyTemplateOpen(false);
        setSelectedTemplateId(null);
        setTemplatePreview(null);
        fetchSeating({ silent: true });
      }
    } catch {
      toast.error("Failed to apply template");
    } finally {
      setApplyTemplateSaving(false);
    }
  }

  async function handleApplyConfirm() {
    if (!selectedTemplateId) return;
    setApplyConfirmOpen(false);
    setApplyTemplateSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/seating/apply-template?confirm=1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: selectedTemplateId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to apply template");
        return;
      }
      toast.success("Template applied");
      setApplyTemplateOpen(false);
      setSelectedTemplateId(null);
      setTemplatePreview(null);
      setApplyConfirmData(null);
      fetchSeating({ silent: true });
    } catch {
      toast.error("Failed to apply template");
    } finally {
      setApplyTemplateSaving(false);
    }
  }

  async function handleDeleteTemplate() {
    if (!deleteTemplateId) return;
    setDeleteTemplateSaving(true);
    try {
      const res = await fetch(`/api/admin/seat-templates/${deleteTemplateId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to delete template");
        throw new Error("Delete failed");
      }
      toast.success("Template deleted");
      setDeleteTemplateId(null);
      setTemplates((prev) => prev.filter((t) => t.id !== deleteTemplateId));
      if (selectedTemplateId === deleteTemplateId) {
        setSelectedTemplateId(null);
        setTemplatePreview(null);
      }
    } catch (e) {
      if ((e as Error).message !== "Delete failed") {
        toast.error("Failed to delete template");
      }
      throw e;
    } finally {
      setDeleteTemplateSaving(false);
    }
  }

  async function handleSeatMapFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setSeatMapUploading(true);
    const urls: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fd = new FormData();
        fd.append("file", file);
        fd.append("bucket", "seat-map-images");
        fd.append("eventId", eventId);
        const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        urls.push(data.url);
      }
      setSeatMapUrls((prev) => [...prev, ...urls]);
      await saveSeatMapUrls([...seatMapUrls, ...urls]);
      toast.success(`${urls.length} image(s) uploaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSeatMapUploading(false);
      e.target.value = "";
    }
  }

  async function saveSeatMapUrls(urls: string[]) {
    setSeatMapSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/seat-map-images`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSeatMapSaving(false);
    }
  }

  function handleRemoveSeatMapUrl(index: number) {
    const next = seatMapUrls.filter((_, i) => i !== index);
    setSeatMapUrls(next);
    saveSeatMapUrls(next);
  }

  function normalizeSectionName(value: string | null | undefined): string {
    return (value ?? "").trim().toLowerCase();
  }

  function normalizeSectionCode(value: string | null | undefined): string {
    return (value ?? "").trim().toUpperCase();
  }

  function findDuplicateSection(
    opts: {
      name: string;
      sectionCode: string;
      excludeSectionId?: string;
    }
  ): { hasDuplicateName: boolean; hasDuplicateCode: boolean } {
    const normalizedName = normalizeSectionName(opts.name);
    const normalizedCode = normalizeSectionCode(opts.sectionCode);
    const matches = sections.filter((section) => {
      if (opts.excludeSectionId && section.id === opts.excludeSectionId) return false;
      return true;
    });
    const hasDuplicateName = matches.some(
      (section) => normalizeSectionName(section.name) === normalizedName
    );
    const hasDuplicateCode = matches.some(
      (section) => normalizeSectionCode(section.section_code) === normalizedCode
    );
    return { hasDuplicateName, hasDuplicateCode };
  }

  async function handleAddSection() {
    const name = newSectionName.trim();
    const sectionCode = newSectionCode.trim();
    if (!name) {
      toast.error("Section name is required");
      return;
    }
    if (!sectionCode) {
      toast.error("Section code is required");
      return;
    }
    const duplicate = findDuplicateSection({ name, sectionCode });
    if (duplicate.hasDuplicateName) {
      setDuplicateSectionDialogMessage("Section name already exists. Please use a different section name.");
      return;
    }
    if (duplicate.hasDuplicateCode) {
      setDuplicateSectionDialogMessage("Section code already exists. Please use a different section code.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/seating/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          section_code: sectionCode,
          section_group: newSectionGroup.trim() || null,
          sort_order: sections.length,
          seating_type: newSectionSeatingType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setDuplicateSectionDialogMessage(
            data.error ?? "A duplicate section name or code already exists."
          );
          return;
        }
        toast.error(data.error ?? "Failed to add section");
        return;
      }
      setSections((prev) => [...prev, data]);
      setExpandedSectionIds((prev) => new Set([...prev, data.id]));
      setNewSectionName("");
      setNewSectionCode("");
      setNewSectionGroup("");
      toast.success("Section added");
    } catch {
      toast.error("Failed to add section");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateSection(
    sectionId: string,
    updates: {
      name?: string;
      section_code?: string | null;
      section_group?: string | null;
      seating_type?: SeatingType;
      capacity?: number;
      color?: string | null;
      show_seat_selection?: boolean;
    }
  ) {
    const merged = sections.find((s) => s.id === sectionId)
      ? { ...sections.find((s) => s.id === sectionId), ...updates }
      : updates;
    const name = (merged as { name?: string }).name ?? "";
    const sectionCode = (merged as { section_code?: string | null }).section_code ?? "";
    const revertEditedNameCode = async () => {
      await fetchSeating({ preserveExpanded: true, silent: true });
    };
    if (updates.name !== undefined && !name.trim()) {
      toast.error("Section name is required");
      await revertEditedNameCode();
      return;
    }
    if (updates.section_code !== undefined && !String(sectionCode).trim()) {
      toast.error("Section code is required");
      await revertEditedNameCode();
      return;
    }
    if (updates.name !== undefined || updates.section_code !== undefined) {
      const duplicate = findDuplicateSection({
        name: String(name),
        sectionCode: String(sectionCode),
        excludeSectionId: sectionId,
      });
      if (duplicate.hasDuplicateName) {
        setDuplicateSectionDialogMessage(
          "Section name already exists. Please use a different section name."
        );
        await revertEditedNameCode();
        return;
      }
      if (duplicate.hasDuplicateCode) {
        setDuplicateSectionDialogMessage(
          "Section code already exists. Please use a different section code."
        );
        await revertEditedNameCode();
        return;
      }
    }
    try {
      const res = await fetch(`/api/admin/events/${eventId}/seating/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json();
        if (res.status === 409) {
          setDuplicateSectionDialogMessage(
            data.error ?? "A duplicate section name or code already exists."
          );
          await revertEditedNameCode();
          return;
        }
        toast.error(data.error ?? "Failed to update");
        return;
      }
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId ? { ...s, ...updates } : s
        )
      );
    } catch {
      toast.error("Failed to update");
    }
  }

  async function handleDeleteSection(sectionId: string) {
    setDeleteSectionId(sectionId);
  }

  async function handleDeleteSelectedSeats(sectionId: string) {
    const selectedIds = Array.from(selectedSeatIdsBySection[sectionId] ?? []);
    if (selectedIds.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/events/${eventId}/seating/seats/bulk-delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_section_id: sectionId,
            seat_ids: selectedIds,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to delete selected seats");
        return;
      }
      setSelectedSeatIdsBySection((prev) => {
        const next = { ...prev };
        delete next[sectionId];
        return next;
      });
      toast.success(
        `Deleted ${data.deleted ?? selectedIds.length} seat(s).`
      );
      await fetchSeating({ preserveExpanded: true, silent: true });
    } catch {
      toast.error("Failed to delete selected seats");
    } finally {
      setSaving(false);
      setDeleteSelectedSectionId(null);
    }
  }

  async function handleDuplicateSection(sectionId: string) {
    setSaving(true);
    const srcCfg = getGenerateConfig(sectionId);
    const srcSec = sections.find((s) => s.id === sectionId);
    const srcDirection =
      srcCfg.direction ??
      (srcSec?.column_direction === "right-to-left" ? "right-to-left" : "left-to-right");
    try {
      const res = await fetch(`/api/admin/events/${eventId}/seating/sections/${sectionId}/duplicate`, {
        method: "POST",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((data as { error?: string }).error ?? "Failed to duplicate section");
        return;
      }
      const newId = (data as { section?: { id?: string } }).section?.id;
      await fetchSeating({
        preserveExpanded: true,
        silent: true,
        mergeGenerateForSectionIds:
          newId != null
            ? {
                [newId]: {
                  numRows: srcCfg.numRows,
                  numColumns: srcCfg.numColumns,
                  capacity:
                    srcCfg.capacity ?? String(srcSec?.capacity ?? 50),
                  direction: srcDirection,
                },
              }
            : undefined,
      });
      if (newId) {
        setExpandedSectionIds((prev) => new Set([...prev, newId]));
      }
      toast.success("Section duplicated");
    } catch {
      toast.error("Failed to duplicate section");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteSection() {
    if (!deleteSectionId) return;
    try {
      const res = await fetch(`/api/admin/events/${eventId}/seating/sections/${deleteSectionId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to delete");
        return;
      }
      setSections((prev) => prev.filter((s) => s.id !== deleteSectionId));
      setSeats((prev) => prev.filter((s) => s.event_section_id !== deleteSectionId));
      setExpandedSectionIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteSectionId);
        return next;
      });
      toast.success("Section deleted");
      setDeleteSectionId(null);
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteSectionId(null);
    }
  }

  function requestGenerateSeats(sectionId: string) {
    const sectionSeats = seats.filter((s) => s.event_section_id === sectionId);
    if (sectionSeats.length > 0) {
      setGenerateSectionId(sectionId);
    } else {
      handleGenerateSeats(sectionId);
    }
  }

  async function handleAddRow(sectionId: string, count: number) {
    setSaving(true);
    try {
      let totalSeats = 0;
      for (let i = 0; i < count; i++) {
        const res = await fetch(`/api/admin/events/${eventId}/seating/seats/add-row`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_section_id: sectionId }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Failed to add row");
          return;
        }
        totalSeats += data.count ?? 0;
      }
      toast.success(`Added ${count} row${count !== 1 ? "s" : ""} (${totalSeats} seats)`);
      fetchSeating({ preserveExpanded: true, silent: true });
    } catch {
      toast.error("Failed to add row");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddColumn(sectionId: string, count: number) {
    setSaving(true);
    try {
      let totalSeats = 0;
      for (let i = 0; i < count; i++) {
        const res = await fetch(`/api/admin/events/${eventId}/seating/seats/add-column`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_section_id: sectionId }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Failed to add column");
          return;
        }
        totalSeats += data.count ?? 0;
      }
      toast.success(`Added ${count} column${count !== 1 ? "s" : ""} (${totalSeats} seats)`);
      fetchSeating({ preserveExpanded: true, silent: true });
    } catch {
      toast.error("Failed to add column");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddColumnToRow(sectionId: string, rowLabel: string) {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/events/${eventId}/seating/seats/add-column-row`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_section_id: sectionId,
            row_label: rowLabel,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to add seat in row");
        return;
      }
      toast.success(`Added 1 seat to row ${rowLabel}`);
      await fetchSeating({ preserveExpanded: true, silent: true });
    } catch {
      toast.error("Failed to add seat in row");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveColumnFromRow(sectionId: string, rowLabel: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/seating/seats/remove-column-row`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_section_id: sectionId,
          row_label: rowLabel,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to remove column from row");
        return;
      }
      toast.success(`Removed 1 seat from row ${rowLabel}`);
      await fetchSeating({ preserveExpanded: true, silent: true });
    } catch {
      toast.error("Failed to remove column from row");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveColumn(sectionId: string, count: number) {
    setSaving(true);
    try {
      let totalSeats = 0;
      for (let i = 0; i < count; i++) {
        const res = await fetch(`/api/admin/events/${eventId}/seating/seats/remove-column`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_section_id: sectionId }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Failed to remove column");
          return;
        }
        totalSeats += data.count ?? 0;
      }
      toast.success(`Removed ${count} column${count !== 1 ? "s" : ""} (${totalSeats} seats)`);
      fetchSeating({ preserveExpanded: true, silent: true });
    } catch {
      toast.error("Failed to remove column");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveRow(sectionId: string, count: number) {
    setSaving(true);
    try {
      let totalSeats = 0;
      for (let i = 0; i < count; i++) {
        const res = await fetch(`/api/admin/events/${eventId}/seating/seats/remove-row`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_section_id: sectionId }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Failed to remove row");
          return;
        }
        totalSeats += data.count ?? 0;
      }
      toast.success(`Removed ${count} row${count !== 1 ? "s" : ""} (${totalSeats} seats)`);
      fetchSeating({ preserveExpanded: true, silent: true });
    } catch {
      toast.error("Failed to remove row");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateSeats(sectionId: string) {
    const sec = sections.find((s) => s.id === sectionId);
    const cfg = getGenerateConfig(sectionId);
    const isFreeStanding =
      sec && (sec.seating_type === "free" || sec.seating_type === "standing");

    let body: {
      event_section_id: string;
      num_rows?: number;
      num_columns?: number;
      capacity?: number;
      column_direction?: "left-to-right" | "right-to-left";
    };
    if (isFreeStanding) {
      const capacity = parseInt(cfg.capacity ?? String(sec?.capacity ?? 50), 10);
      if (isNaN(capacity) || capacity < 1) {
        toast.error("Enter capacity (at least 1)");
        return;
      }
      body = { event_section_id: sectionId, capacity };
    } else {
      const numRows = parseInt(cfg.numRows ?? "3", 10);
      const numColumns = parseInt(cfg.numColumns ?? "5", 10);
      if (isNaN(numRows) || numRows < 1 || isNaN(numColumns) || numColumns < 1) {
        toast.error("Enter number of rows and columns");
        return;
      }
      const direction = cfg.direction ?? "left-to-right";
      body = {
        event_section_id: sectionId,
        num_rows: numRows,
        num_columns: numColumns,
        column_direction: direction,
      };
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/seating/seats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to generate seats");
        return;
      }
      toast.success(`Generated ${data.count} seats`);
      fetchSeating({ preserveExpanded: true, silent: true });
      setGenerateSectionId(null);
    } catch {
      toast.error("Failed to generate seats");
    } finally {
      setSaving(false);
      setGenerateSectionId(null);
    }
  }

  async function confirmGenerateSeats() {
    if (!generateSectionId) return;
    await handleGenerateSeats(generateSectionId);
  }

  async function handleGenerateTickets(sectionIds?: string[]) {
    const targetIds =
      sectionIds && sectionIds.length > 0 ? sectionIds : sections.map((s) => s.id);
    if (targetIds.length === 0) {
      toast.error("Add sections first");
      return;
    }

    const seatsReady = targetIds.every((sid) => {
      const sec = sections.find((s) => s.id === sid);
      const count =
        seats.filter((s) => s.event_section_id === sid).length ||
        sec?.inventory_seats_count ||
        sec?.capacity ||
        0;
      return count > 0;
    });
    if (!seatsReady) {
      toast.error("Generate seats in each section before generating tickets");
      return;
    }

    setGeneratingTickets(true);
    setTicketGenProgress({
      percent: 10,
      message: "Generating ticket inventory",
      subtitle: "Seat configurator",
      detail: "Creating print ticket rows and rendering images on the server.",
    });

    try {
      const res = await fetch(
        `/api/admin/events/${eventId}/seating/ticket-inventory/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section_ids: targetIds,
            generate_images: true,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to generate tickets");
        return;
      }
      setTicketGenProgress({
        percent: 100,
        message: "Ticket inventory ready",
        subtitle: "Seat configurator",
        detail: `${data.created ?? 0} new, ${data.existing ?? 0} existing, ${data.images_generated ?? 0} images rendered.`,
      });
      toast.success(
        `Tickets: ${data.inventory_total ?? 0} inventory rows (${data.images_generated ?? 0} images)`
      );
      await fetchSeating({ preserveExpanded: true, silent: true });
    } catch {
      toast.error("Failed to generate tickets");
    } finally {
      setGeneratingTickets(false);
      setTicketGenProgress(null);
    }
  }

  async function handleDeleteTickets(sectionIds?: string[]) {
    const targetIds =
      sectionIds && sectionIds.length > 0 ? sectionIds : sections.map((s) => s.id);
    if (targetIds.length === 0) {
      toast.error("No sections to clear");
      return;
    }

    setDeletingTickets(true);
    setTicketGenProgress({
      percent: 20,
      message: "Deleting generated tickets",
      subtitle: "Seat configurator",
      detail: "Removing unallocated print ticket rows and storage images. Sold tickets are kept.",
    });

    try {
      const res = await fetch(
        `/api/admin/events/${eventId}/seating/ticket-inventory/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section_ids: targetIds }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to delete tickets");
        return;
      }
      const deleted = data.deleted ?? 0;
      const kept = data.skipped_allocated ?? 0;
      setTicketGenProgress({
        percent: 100,
        message: "Ticket inventory cleared",
        subtitle: "Seat configurator",
        detail:
          deleted > 0
            ? `Removed ${deleted} ticket${deleted === 1 ? "" : "s"}${kept > 0 ? `; ${kept} sold ticket${kept === 1 ? "" : "s"} kept` : ""}.`
            : kept > 0
              ? `No unallocated tickets to remove (${kept} sold kept).`
              : "No generated tickets to remove.",
      });
      if (deleted > 0) {
        toast.success(
          `Deleted ${deleted} generated ticket${deleted === 1 ? "" : "s"}${
            kept > 0 ? ` (${kept} sold kept)` : ""
          }`
        );
      } else {
        toast.message(
          kept > 0
            ? `No unallocated tickets to delete (${kept} sold kept)`
            : "No generated tickets to delete"
        );
      }
      await fetchSeating({ preserveExpanded: true, silent: true });
    } catch {
      toast.error("Failed to delete tickets");
    } finally {
      setDeletingTickets(false);
      setDeleteTicketsTarget(null);
      setTicketGenProgress(null);
    }
  }

  async function confirmDeleteTickets() {
    if (!deleteTicketsTarget) return;
    if (deleteTicketsTarget.mode === "all") {
      await handleDeleteTickets();
      return;
    }
    await handleDeleteTickets([deleteTicketsTarget.sectionId]);
  }

  async function handleReorder(newOrder: Section[]) {
    const sectionIds = newOrder.map((s) => s.id);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/seating/sections/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_ids: sectionIds }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to reorder");
        setSections(sections);
        return;
      }
      setSections(newOrder);
    } catch {
      toast.error("Failed to reorder");
      setSections(sections);
    } finally {
      setSaving(false);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(sections, oldIndex, newIndex);
    handleReorder(newOrder);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const seatConfiguratorBusy =
    saving ||
    seatMapUploading ||
    seatMapSaving ||
    saveTemplateSaving ||
    applyTemplateSaving ||
    generatingTickets ||
    deletingTickets;

  const seatConfiguratorProgress = useMemo(() => {
    if (seatMapUploading) {
      return {
        message: "Uploading seat map images",
        subtitle: "Seat configurator",
        detail: FLOATING_PROGRESS_PRESETS.uploading.detail,
      };
    }
    if (seatMapSaving) {
      return {
        message: "Saving seat map",
        subtitle: "Seat configurator",
        detail: "Updating uploaded map references for this event.",
      };
    }
    if (saveTemplateSaving) {
      return {
        message: "Saving seats template",
        subtitle: "Templates",
        detail: "Storing your current layout as a reusable template.",
      };
    }
    if (applyTemplateSaving) {
      return {
        message: "Applying template",
        subtitle: "Templates",
        detail: "Loading seats and sections from the selected template.",
      };
    }
    if (deletingTickets && ticketGenProgress) {
      return {
        message: ticketGenProgress.message,
        subtitle: ticketGenProgress.subtitle,
        detail: ticketGenProgress.detail,
        percent: ticketGenProgress.percent,
      };
    }
    if (generatingTickets && ticketGenProgress) {
      return ticketGenProgress;
    }
    if (saving) {
      return {
        message: "Saving seating layout",
        subtitle: "Seat configurator",
        detail: FLOATING_PROGRESS_PRESETS.genericSave.detail,
      };
    }
    return { message: "Saving…", subtitle: undefined, detail: undefined };
  }, [
    saving,
    seatMapUploading,
    seatMapSaving,
    saveTemplateSaving,
    applyTemplateSaving,
  ]);

  if (loading) {
    return (
      <>
        <FloatingProgressBar
          active
          {...FLOATING_PROGRESS_PRESETS.genericLoad}
          message="Loading seating…"
          subtitle="Seat configurator"
        />
        <div className="glass rounded-xl border border-[var(--glass-border)] p-6 text-foreground-muted">
          Loading seating...
        </div>
      </>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setSaveTemplateOpen(true)}
          disabled={saving || sections.length === 0}
        >
          <Save className="h-4 w-4 mr-2" />
          Save Seats Template
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setApplyTemplateOpen(true);
            setSelectedTemplateId(null);
            setTemplatePreview(null);
          }}
          disabled={saving}
        >
          <FileDown className="h-4 w-4 mr-2" />
          Load Seats Template
        </Button>
      </div>

      <div className="glass rounded-xl border border-[var(--glass-border)] p-6 mb-4">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setSeatMapCardCollapsed((prev) => !prev)}
        >
          <div>
            <h3 className="font-medium text-foreground">Overall seat map images</h3>
            <p className="text-sm text-foreground-muted">
              Upload images for buyers to view before selecting seats. Multiple images supported.
            </p>
          </div>
          {seatMapCardCollapsed ? (
            <ChevronRight className="h-4 w-4 text-foreground-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-foreground-muted" />
          )}
        </button>

        {!seatMapCardCollapsed && (
          <div className="space-y-3 mt-4">
            <div className="flex flex-wrap items-center gap-4">
              <input
                ref={seatMapFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={handleSeatMapFileUpload}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => seatMapFileInputRef.current?.click()}
                disabled={seatMapUploading}
                className="border-[var(--glass-border)]"
              >
                <Upload className="h-4 w-4 mr-2" />
                {seatMapUploading ? "Uploading..." : "Upload images"}
              </Button>
            </div>
            {seatMapUrls.length > 0 && (
              <SeatMapImageCarousel
                images={seatMapUrls}
                onDelete={handleRemoveSeatMapUrl}
              />
            )}
          </div>
        )}
      </div>

      <div className="glass rounded-xl border border-[var(--glass-border)] p-6 space-y-6">
        <FloatingProgressBar
          active={seatConfiguratorBusy}
          message={seatConfiguratorProgress.message}
          subtitle={seatConfiguratorProgress.subtitle}
          detail={seatConfiguratorProgress.detail}
        />
        <h2 className="text-lg font-semibold text-foreground">Seat Configurator</h2>
        <p className="text-sm text-foreground-muted">
          Configure sections and seat numbering for this event. Create from scratch or load a saved template.
          Generate tickets here to create the inventory used for printing and buyer sales.
        </p>

        {sections.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={generatingTickets || deletingTickets || saving}
              onClick={() => void handleGenerateTickets()}
              className="border-[var(--glass-border)]"
            >
              Generate all tickets
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={
                generatingTickets || deletingTickets || saving || totalDeletableInventory === 0
              }
              onClick={() => setDeleteTicketsTarget({ mode: "all" })}
              className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              title={
                totalDeletableInventory === 0
                  ? "No unallocated generated tickets to delete"
                  : `Remove ${totalDeletableInventory} unallocated ticket(s) across all sections`
              }
            >
              Delete all tickets
            </Button>
            <span className="text-xs text-foreground-muted">
              Creates or removes unallocated print ticket inventory. Sold tickets are always kept.
            </span>
          </div>
        )}

        <div>
          <h3 className="font-medium text-foreground mb-3">Sections</h3>
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            <Input
              placeholder="Section name *"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              className="max-w-[200px] shadow-none [backdrop-filter:none] bg-background/80"
              aria-required="true"
            />
            <Input
              placeholder="Section code *"
              value={newSectionCode}
              onChange={(e) => setNewSectionCode(e.target.value)}
              className="max-w-[140px] shadow-none [backdrop-filter:none] bg-background/80"
              aria-required="true"
            />
            <Input
              placeholder="Section group (optional)"
              value={newSectionGroup}
              onChange={(e) => setNewSectionGroup(e.target.value)}
              className="max-w-[180px] shadow-none [backdrop-filter:none] bg-background/80"
            />
            <Select
              value={newSectionSeatingType}
              onValueChange={(v) => setNewSectionSeatingType(v as SeatingType)}
            >
              <SelectTrigger className="h-9 w-[200px] max-w-[200px] border-[var(--glass-border)] bg-white/5 text-sm text-foreground">
                <SelectValue placeholder="Seating type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="assigned">Assigned Seating</SelectItem>
                <SelectItem value="free">Free Seating (FCFS)</SelectItem>
                <SelectItem value="standing">Standing Section</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" size="sm" onClick={handleAddSection} disabled={saving}>
              <Plus className="h-4 w-4 mr-1" />
              Add section
            </Button>
          </div>

          {sections.length === 0 ? (
            <p className="text-sm text-foreground-muted">No sections yet.</p>
          ) : (
            <>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={sections.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4">
                    {sectionsByGroup.map((group) => {
                      const isCollapsed = collapsedGroupNames.has(group.groupName);
                      return (
                        <div
                          key={group.groupName}
                          className="rounded-lg border border-[var(--glass-border)] bg-black/10"
                        >
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-white/5"
                            onClick={() => toggleGroup(group.groupName)}
                          >
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {group.groupName}
                              </p>
                              <p className="text-xs text-foreground-muted">
                                {group.sections.length} section{group.sections.length === 1 ? "" : "s"} •{" "}
                                {group.totalSeats} seats
                              </p>
                            </div>
                            {isCollapsed ? (
                              <ChevronRight className="h-4 w-4 text-foreground-muted" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-foreground-muted" />
                            )}
                          </button>
                          {!isCollapsed && (
                            <div className="space-y-3 border-t border-[var(--glass-border)] p-3">
                              {group.sections.map((sec) => (
                                <SortableSectionCard
                                  key={sec.id}
                                  sec={sec}
                                  seatCount={seats.filter((s) => s.event_section_id === sec.id).length || sec.capacity}
                                  remaining={sec.remaining}
                                  cfg={getGenerateConfig(sec.id)}
                                  setGenerateConfigFor={setGenerateConfigFor}
                                  isExpanded={expandedSectionIds.has(sec.id)}
                                  onToggle={() => toggleSection(sec.id)}
                                  onSectionChange={(sectionId, updates) =>
                                    setSections((prev) =>
                                      prev.map((s) => (s.id === sectionId ? { ...s, ...updates } : s))
                                    )
                                  }
                                  onUpdateSection={handleUpdateSection}
                                  onDeleteSection={handleDeleteSection}
                                  onDuplicateSection={handleDuplicateSection}
                                  onRequestGenerateSeats={requestGenerateSeats}
                                  onAddRow={handleAddRow}
                                  onRemoveRow={handleRemoveRow}
                                  onAddColumn={handleAddColumn}
                                  onAddColumnToRow={handleAddColumnToRow}
                                  onRemoveColumnFromRow={handleRemoveColumnFromRow}
                                  onRemoveColumn={handleRemoveColumn}
                                  selectedSeatIds={selectedSeatIdsBySection[sec.id] ?? new Set<string>()}
                                  onSelectedSeatIdsChange={(next) =>
                                    setSelectedSeatIdsBySection((prev) => ({
                                      ...prev,
                                      [sec.id]: next,
                                    }))
                                  }
                                  onRequestDeleteSelectedSeats={() => setDeleteSelectedSectionId(sec.id)}
                                  sectionSeats={seats.filter((s) => s.event_section_id === sec.id)}
                                  saving={saving}
                                  generatingTickets={generatingTickets}
                                  deletingTickets={deletingTickets}
                                  deletableInventoryCount={deletableInventoryCount(sec)}
                                  onGenerateTickets={(sectionId) =>
                                    void handleGenerateTickets([sectionId])
                                  }
                                  onDeleteTickets={(sectionId) =>
                                    setDeleteTicketsTarget({ mode: "section", sectionId })
                                  }
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>

              <div className="mt-4 rounded-lg border border-[var(--glass-border)] bg-white/5 p-4">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 text-left"
                  onClick={() => setGroupingSummaryCollapsed((prev) => !prev)}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <h4 className="text-sm font-semibold text-foreground">Grouping Summary</h4>
                    <p className="text-sm text-foreground-muted">
                      Total seats: <span className="font-medium text-foreground">{groupingSummary.totalSeats}</span>
                    </p>
                  </div>
                  {groupingSummaryCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-foreground-muted" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-foreground-muted" />
                  )}
                </button>
                {!groupingSummaryCollapsed && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[420px] text-sm">
                      <thead>
                        <tr className="text-left text-foreground-muted">
                          <th className="py-2 pr-4">Group</th>
                          <th className="py-2 pr-4">Sections</th>
                          <th className="py-2 pr-4">Total seats</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupingSummary.rows.map((row) => (
                          <tr key={row.groupName} className="border-t border-[var(--glass-border)]">
                            <td className="py-2 pr-4 text-foreground">{row.groupName}</td>
                            <td className="py-2 pr-4 text-foreground-muted">{row.sectionCount}</td>
                            <td className="py-2 pr-4 text-foreground">{row.totalSeats}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Seats Template</DialogTitle>
            <DialogDescription>
              Save the current seating configuration (sections, seats, pricing) as a reusable template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-foreground-muted">
              Template will be saved as: <strong className="text-foreground">{venueName || "Venue"}{saveTemplateName.trim() ? ` - ${saveTemplateName.trim()}` : " - {custom name}"}</strong>
            </p>
            <div>
              <label className="text-sm text-foreground-muted block mb-1">Custom name</label>
              <Input
                placeholder="e.g. Standard Layout, VIP Heavy"
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                className="bg-white/5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTemplateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={saveTemplateSaving || !saveTemplateName.trim()}
            >
              {saveTemplateSaving ? "Saving..." : "Save Seats Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={applyTemplateOpen} onOpenChange={(open) => {
        setApplyTemplateOpen(open);
        if (!open) {
          setSelectedTemplateId(null);
          setTemplatePreview(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Load Seats Template</DialogTitle>
            <DialogDescription>
              Select a seat template to apply to this event. This will replace existing sections and seats.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="Search templates..."
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              className="bg-white/5"
            />
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(400px,1.5fr)] gap-6">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground-muted">Templates</p>
                <div className="border border-[var(--glass-border)] rounded-lg divide-y divide-[var(--glass-border)] max-h-64 overflow-y-auto">
                  {templates.length === 0 ? (
                    <p className="p-4 text-sm text-foreground-muted">No templates found</p>
                  ) : (
                    templates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleSelectTemplate(t.id)}
                        className={`w-full p-3 text-left hover:bg-white/5 transition-colors ${
                          selectedTemplateId === t.id ? "bg-white/10" : ""
                        }`}
                      >
                        <p className="font-medium text-foreground">{t.display_name}</p>
                        <p className="text-sm text-foreground-muted">
                          {t.section_count} sections, {t.total_seats} seats
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground-muted">Preview</p>
                {templatePreview ? (
                  <div className="border border-[var(--glass-border)] rounded-lg p-4 space-y-3 max-h-80 overflow-auto min-w-[360px]">
                    <table className="w-full min-w-[380px] text-sm table-fixed">
                      <colgroup>
                        <col style={{ width: "32%" }} />
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "20%" }} />
                        <col style={{ width: "22%" }} />
                      </colgroup>
                      <thead>
                        <tr className="text-left text-foreground-muted">
                          <th className="py-2 pr-4">Section</th>
                          <th className="py-2 pr-4">Type</th>
                          <th className="py-2 pr-4">Seats</th>
                          <th className="py-2 pr-4">Price (PHP)</th>
                          <th className="py-2 pr-4">Early bird</th>
                        </tr>
                      </thead>
                      <tbody>
                        {templatePreview.sections.map((sec, i) => {
                          const price = templatePreview.prices.find((p) => p.section_index === i);
                          const eb = templatePreview.early_bird.find((e) => e.section_index === i);
                          const seatCount = Array.isArray(sec.seats) ? sec.seats.length : 0;
                          return (
                            <tr key={i} className="border-t border-[var(--glass-border)]">
                              <td className="py-2 pr-4 text-foreground" title={`${sec.name} (${sec.section_code ?? "-"})`}>{sec.name} ({sec.section_code ?? "-"})</td>
                              <td className="py-2 pr-4 text-foreground-muted whitespace-nowrap">{sec.seating_type ?? "assigned"}</td>
                              <td className="py-2 pr-4 text-foreground-muted whitespace-nowrap">{seatCount}</td>
                              <td className="py-2 pr-4 text-foreground-muted whitespace-nowrap">{price ? (price.price_cents / 100).toFixed(2) : "—"}</td>
                              <td className="py-2 pr-4 text-foreground-muted whitespace-nowrap">
                                {eb
                                  ? eb.discount_percent != null
                                    ? (() => {
                                        const base = price?.price_cents ?? 0;
                                        const computed = Math.floor((base * (100 - eb.discount_percent!)) / 100);
                                        return `${eb.discount_percent}% off (₱${(computed / 100).toFixed(2)})`;
                                      })()
                                    : eb.price_cents != null
                                      ? `₱${(eb.price_cents / 100).toFixed(2)}`
                                      : "—"
                                  : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {(templatePreview.early_bird_starts_at || templatePreview.early_bird_ends_at) && (
                      <p className="text-xs text-foreground-muted">
                        Early bird: {templatePreview.early_bird_starts_at ? new Date(templatePreview.early_bird_starts_at).toLocaleString() : "—"} to{" "}
                        {templatePreview.early_bird_ends_at ? new Date(templatePreview.early_bird_ends_at).toLocaleString() : "—"}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="border border-[var(--glass-border)] rounded-lg p-4 text-sm text-foreground-muted">
                    Select a template to preview
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyTemplateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => selectedTemplateId && setDeleteTemplateId(selectedTemplateId)}
              disabled={!selectedTemplateId || deleteTemplateSaving}
            >
              Delete Template
            </Button>
            <Button
              onClick={() => handleApplyTemplate(false)}
              disabled={applyTemplateSaving || !selectedTemplateId}
            >
              {applyTemplateSaving ? "Loading..." : "Load"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(duplicateSectionDialogMessage)}
        onOpenChange={(open) => {
          if (!open) setDuplicateSectionDialogMessage(null);
        }}
      >
        <DialogContent hideClose className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Duplicate Section</DialogTitle>
            <DialogDescription className="mt-1">
              {duplicateSectionDialogMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDuplicateSectionDialogMessage(null)}
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={applyConfirmOpen}
        onOpenChange={setApplyConfirmOpen}
        title="Overwrite existing seating?"
        description={
          applyConfirmData
            ? `This will replace ${applyConfirmData.existing_section_count} sections and ${applyConfirmData.existing_seat_count} seats. Continue?`
            : "This will replace existing sections and seats. Continue?"
        }
        confirmLabel="Overwrite"
        onConfirm={handleApplyConfirm}
      />

      <ConfirmDialog
        open={!!deleteTemplateId}
        onOpenChange={(open) => !open && setDeleteTemplateId(null)}
        title="Delete template"
        description="Delete this seat template? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteTemplate}
      />

      <ConfirmDialog
        open={!!deleteSectionId}
        onOpenChange={(open) => !open && setDeleteSectionId(null)}
        onConfirm={confirmDeleteSection}
        title="Delete section"
        description="Delete this section and all its seats? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
      />
      <ConfirmDialog
        open={!!deleteSelectedSectionId}
        onOpenChange={(open) => !open && setDeleteSelectedSectionId(null)}
        onConfirm={() =>
          deleteSelectedSectionId
            ? handleDeleteSelectedSeats(deleteSelectedSectionId)
            : Promise.resolve()
        }
        title="Delete selected seats permanently"
        description="Only available seats are deletable. This action permanently deletes the selected seats and renumbers remaining seats in each affected row."
        confirmLabel="Delete selected seats"
        variant="destructive"
      />
      <ConfirmDialog
        open={!!generateSectionId}
        onOpenChange={(open) => !open && setGenerateSectionId(null)}
        onConfirm={confirmGenerateSeats}
        title="Replace existing seats"
        description="This section already has seats. Generating new seats will delete all current seats and create new ones. Continue?"
        confirmLabel="Replace seats"
      />
      <ConfirmDialog
        open={!!deleteTicketsTarget}
        onOpenChange={(open) => !open && setDeleteTicketsTarget(null)}
        onConfirm={confirmDeleteTickets}
        title={
          deleteTicketsTarget?.mode === "all"
            ? "Delete all generated tickets?"
            : "Delete generated tickets?"
        }
        description={(() => {
          if (!deleteTicketsTarget) return "";
          if (deleteTicketsTarget.mode === "all") {
            const sold = sections.reduce(
              (sum, sec) => sum + (sec.inventory_allocated_count ?? 0),
              0
            );
            return `Remove ${totalDeletableInventory} unallocated ticket${
              totalDeletableInventory === 1 ? "" : "s"
            } across all sections?${
              sold > 0
                ? ` ${sold} sold ticket${sold === 1 ? "" : "s"} will be kept.`
                : ""
            } Storage images for removed tickets are deleted. You can regenerate tickets afterward.`;
          }
          const sec = sections.find((s) => s.id === deleteTicketsTarget.sectionId);
          const deletable = sec ? deletableInventoryCount(sec) : 0;
          const sold = sec?.inventory_allocated_count ?? 0;
          return `Remove ${deletable} unallocated generated ticket${
            deletable === 1 ? "" : "s"
          } for ${sec?.name ?? "this section"}?${
            sold > 0 ? ` ${sold} sold ticket${sold === 1 ? "" : "s"} will be kept.` : ""
          } Storage images for removed tickets are deleted.`;
        })()}
        confirmLabel="Delete tickets"
        variant="destructive"
      />
    </div>
  );
}

interface SortableSectionCardProps {
  sec: Section;
  seatCount: number;
  remaining?: number;
  cfg: {
    numRows: string;
    numColumns: string;
    capacity?: string;
    direction?: "left-to-right" | "right-to-left";
  };
  setGenerateConfigFor: (
    sectionId: string,
    field: "numRows" | "numColumns" | "capacity" | "direction",
    value: string | "left-to-right" | "right-to-left"
  ) => void;
  isExpanded: boolean;
  onToggle: () => void;
  onSectionChange: (
    sectionId: string,
    updates: {
      name?: string;
      section_code?: string | null;
      section_group?: string | null;
      seating_type?: SeatingType;
      capacity?: number;
      color?: string | null;
      show_seat_selection?: boolean;
    }
  ) => void;
  onUpdateSection: (
    sectionId: string,
    updates: {
      name?: string;
      section_code?: string;
      section_group?: string | null;
      seating_type?: SeatingType;
      capacity?: number;
      color?: string | null;
      show_seat_selection?: boolean;
    }
  ) => void;
  onDeleteSection: (sectionId: string) => void;
  onDuplicateSection: (sectionId: string) => void;
  onRequestGenerateSeats: (sectionId: string) => void;
  onAddRow: (sectionId: string, count: number) => void;
  onRemoveRow: (sectionId: string, count: number) => void;
  onAddColumn: (sectionId: string, count: number) => void;
  onAddColumnToRow: (sectionId: string, rowLabel: string) => void;
  onRemoveColumnFromRow: (sectionId: string, rowLabel: string) => void;
  onRemoveColumn: (sectionId: string, count: number) => void;
  selectedSeatIds: Set<string>;
  onSelectedSeatIdsChange: (next: Set<string>) => void;
  onRequestDeleteSelectedSeats: () => void;
  sectionSeats: Seat[];
  saving: boolean;
  generatingTickets: boolean;
  deletingTickets: boolean;
  deletableInventoryCount: number;
  onGenerateTickets: (sectionId: string) => void;
  onDeleteTickets: (sectionId: string) => void;
}

function SortableSectionCard({
  sec,
  seatCount,
  remaining,
  cfg,
  setGenerateConfigFor,
  isExpanded,
  onToggle,
  onSectionChange,
  onUpdateSection,
  onDeleteSection,
  onDuplicateSection,
  onRequestGenerateSeats,
  onAddRow,
  onRemoveRow,
  onAddColumn,
  onAddColumnToRow,
  onRemoveColumnFromRow,
  onRemoveColumn,
  selectedSeatIds,
  onSelectedSeatIdsChange,
  onRequestDeleteSelectedSeats,
  sectionSeats,
  saving,
  generatingTickets,
  deletingTickets,
  deletableInventoryCount,
  onGenerateTickets,
  onDeleteTickets,
}: SortableSectionCardProps) {
  const [addRowsCount, setAddRowsCount] = useState(1);
  const [removeRowsCount, setRemoveRowsCount] = useState(1);
  const [addColumnsCount, setAddColumnsCount] = useState(1);
  const [removeColumnsCount, setRemoveColumnsCount] = useState(1);
  const [addSeatsCount, setAddSeatsCount] = useState(1);
  const [removeSeatsCount, setRemoveSeatsCount] = useState(1);
  const [blockedRemoveDialogOpen, setBlockedRemoveDialogOpen] = useState(false);
  const [sectionGroupDraft, setSectionGroupDraft] = useState(sec.section_group ?? "");
  const [isEditingSectionGroup, setIsEditingSectionGroup] = useState(false);

  const rowCount = sectionSeats.length > 0 ? new Set(sectionSeats.map((s) => s.row_label)).size : 0;
  const colCount = sectionSeats.length > 0 ? new Set(sectionSeats.map((s) => s.seat_number)).size : 0;
  const maxRemoveRows = Math.max(1, rowCount - 1);
  const maxRemoveCols = Math.max(1, colCount - 1);

  useEffect(() => {
    setRemoveRowsCount((v) => Math.min(v, maxRemoveRows));
  }, [maxRemoveRows]);
  useEffect(() => {
    setRemoveColumnsCount((v) => Math.min(v, maxRemoveCols));
  }, [maxRemoveCols]);

  const maxRemoveSeats = Math.max(1, sectionSeats.length - 1);
  useEffect(() => {
    setRemoveSeatsCount((v) => Math.min(v, maxRemoveSeats));
  }, [maxRemoveSeats]);

  useEffect(() => {
    if (!isEditingSectionGroup) {
      setSectionGroupDraft(sec.section_group ?? "");
    }
  }, [sec.id, sec.section_group, isEditingSectionGroup]);

  function sortRowLabels(a: string, b: string): number {
    if (a.length !== b.length) return a.length - b.length;
    return a.localeCompare(b);
  }
  function sortSeatNumbers(a: string, b: string): number {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  }

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sec.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const seatMapSeats = sectionSeats.map((s) => ({
    id: s.id,
    row_label: s.row_label,
    seat_number: s.seat_number,
    section_id: s.event_section_id,
    available: s.status === "available",
    status: s.status,
  }));

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border border-[var(--glass-border)] bg-white/5 ${isDragging ? "opacity-50" : ""}`}
    >
      <div
        className="flex items-center gap-2 p-4 cursor-pointer hover:bg-white/5 rounded-t-lg"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, input")) return;
          onToggle();
        }}
      >
        <button
          type="button"
          className="p-1 -m-1 rounded hover:bg-white/10 text-foreground-muted"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        <div
          {...attributes}
          {...listeners}
          className="p-1 -m-1 rounded hover:bg-white/10 text-foreground-muted cursor-grab active:cursor-grabbing touch-none"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="flex flex-wrap gap-2 items-center flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
          <Input
            value={sec.name}
            onChange={(e) =>
              onSectionChange(sec.id, { name: (e.target as HTMLInputElement).value })
            }
            onBlur={(e) =>
              onUpdateSection(sec.id, { name: e.target.value })
            }
            className="max-w-[200px] font-medium shadow-none [backdrop-filter:none] bg-background/80"
            placeholder="Section name *"
            aria-required="true"
            onClick={(e) => e.stopPropagation()}
          />
          <Input
            value={sec.section_code ?? ""}
            onChange={(e) => {
              const v = (e.target as HTMLInputElement).value;
              onSectionChange(sec.id, { section_code: v || null });
            }}
            onBlur={(e) =>
              onUpdateSection(sec.id, {
                section_code: e.target.value.trim() || undefined,
              })
            }
            className="max-w-[120px] text-sm shadow-none [backdrop-filter:none] bg-background/80"
            placeholder="Section code *"
            aria-required="true"
            onClick={(e) => e.stopPropagation()}
          />
          <Input
            value={sectionGroupDraft}
            onChange={(e) => {
              setSectionGroupDraft((e.target as HTMLInputElement).value);
            }}
            onFocus={() => setIsEditingSectionGroup(true)}
            onBlur={(e) => {
              setIsEditingSectionGroup(false);
              const nextGroup = e.target.value.trim() || null;
              onSectionChange(sec.id, { section_group: nextGroup });
              onUpdateSection(sec.id, { section_group: nextGroup });
            }}
            className="max-w-[160px] text-sm shadow-none [backdrop-filter:none] bg-background/80"
            placeholder="Section group"
            onClick={(e) => e.stopPropagation()}
          />
          <Select
            value={sec.seating_type ?? "assigned"}
            onValueChange={(v) => {
              const next = v as SeatingType;
              onSectionChange(sec.id, { seating_type: next });
              onUpdateSection(sec.id, { seating_type: next });
            }}
          >
            <SelectTrigger
              className="h-9 w-[200px] max-w-[200px] shrink-0 border-[var(--glass-border)] bg-white/5 text-sm text-foreground"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <SelectValue placeholder="Seating type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="assigned">Assigned Seating</SelectItem>
              <SelectItem value="free">Free Seating (FCFS)</SelectItem>
              <SelectItem value="standing">Standing Section</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-9 w-9 rounded-lg border border-[var(--glass-border)] shrink-0 flex items-center justify-center hover:ring-2 hover:ring-white/20"
                style={{ backgroundColor: sec.color ?? SECTION_COLORS[0].hex }}
                title={
                  SECTION_COLORS.find((c) => c.hex === (sec.color ?? SECTION_COLORS[0].hex))?.name ?? "Pick color"
                }
                onClick={(e) => e.stopPropagation()}
                aria-label="Section color"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="p-2 w-56">
              <div className="grid grid-cols-5 gap-1">
                {SECTION_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    className="h-8 w-8 rounded border border-[var(--glass-border)] hover:ring-2 hover:ring-white/30 transition-shadow"
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSectionChange(sec.id, { color: c.hex });
                      onUpdateSection(sec.id, { color: c.hex });
                    }}
                    aria-label={`Select ${c.name}`}
                  />
                ))}
              </div>
              <p className="text-xs text-foreground-muted mt-2">
                {SECTION_COLORS.find((c) => c.hex === (sec.color ?? SECTION_COLORS[0].hex))?.name ?? "Default"}
              </p>
            </DropdownMenuContent>
          </DropdownMenu>
          {sec.seating_type === "assigned" && (
            <label
              className="flex items-center gap-2 text-sm text-foreground-muted cursor-pointer shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <span>Show seat selection</span>
              <Switch
                checked={sec.show_seat_selection !== false}
                onCheckedChange={(checked) => {
                  onSectionChange(sec.id, { show_seat_selection: checked });
                  onUpdateSection(sec.id, { show_seat_selection: checked });
                }}
                aria-label="Show seat selection on buyer side"
                title={sec.show_seat_selection !== false ? "Hide (use grid on buyer side)" : "Show (use map on buyer side)"}
              />
            </label>
          )}
          <span className="text-sm text-foreground-muted">
            ({(sec.seating_type === "free" || sec.seating_type === "standing")
              ? `${remaining ?? sec.capacity} remaining`
              : `${remaining ?? seatCount} remaining`})
          </span>
          <span className="text-sm text-foreground-muted">
            {sec.seating_type === "assigned"
              ? "Assigned Seating"
              : sec.seating_type === "free"
                ? "Free Seating (FCFS)"
                : "Standing Section"}
          </span>
          <span className="text-xs rounded-md border border-[var(--glass-border)] px-2 py-0.5 text-foreground-muted">
            Tickets: {sec.inventory_images_count ?? 0}/{sec.inventory_count ?? 0}
            {(sec.inventory_allocated_count ?? 0) > 0
              ? ` · ${sec.inventory_allocated_count} sold`
              : ""}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs border-[var(--glass-border)] shrink-0"
            disabled={
              saving ||
              generatingTickets ||
              deletingTickets ||
              seatCount === 0
            }
            onClick={(e) => {
              e.stopPropagation();
              onGenerateTickets(sec.id);
            }}
            title={
              seatCount === 0
                ? "Generate seats in this section first"
                : "Create ticket inventory for printing and buyer sales"
            }
          >
            Generate tickets
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300 shrink-0"
            disabled={
              saving ||
              generatingTickets ||
              deletingTickets ||
              deletableInventoryCount === 0
            }
            onClick={(e) => {
              e.stopPropagation();
              onDeleteTickets(sec.id);
            }}
            title={
              deletableInventoryCount === 0
                ? (sec.inventory_allocated_count ?? 0) > 0
                  ? "All generated tickets are sold — nothing to delete"
                  : "No generated tickets to delete"
                : `Delete ${deletableInventoryCount} unallocated generated ticket${
                    deletableInventoryCount === 1 ? "" : "s"
                  }`
            }
          >
            Delete tickets
          </Button>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="text-foreground-muted hover:text-foreground shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicateSection(sec.id);
          }}
          disabled={saving}
          aria-label="Duplicate section"
          title="Duplicate section"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="text-red-400 hover:text-red-300 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteSection(sec.id);
          }}
          aria-label="Delete section"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-[var(--glass-border)] mt-0">
          {(sec.seating_type === "free" || sec.seating_type === "standing") ? (
            <div className="mt-3">
              <p className="text-sm text-foreground-muted">
                Generate individual seats (FS or ST row) with unique scan codes for QR.
              </p>
              <div className="flex flex-wrap gap-2 mt-2 items-center">
                <span className="text-sm text-foreground-muted">Capacity:</span>
                <div className="flex items-center rounded-lg overflow-hidden border border-[var(--glass-border)]">
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="h-9 w-9 rounded-none border-0 border-r border-[var(--glass-border)] hover:bg-white/15"
                    onClick={() => {
                      const v = parseInt(cfg.capacity ?? String(sec.capacity), 10) || 1;
                      setGenerateConfigFor(sec.id, "capacity", String(Math.max(1, v - 1)));
                    }}
                    disabled={(parseInt(cfg.capacity ?? String(sec.capacity), 10) || 1) <= 1}
                    aria-label="Decrease capacity"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    max={10000}
                    value={cfg.capacity ?? sec.capacity}
                    onChange={(e) => setGenerateConfigFor(sec.id, "capacity", e.target.value)}
                    onBlur={(e) => {
                      const v = Math.min(10000, Math.max(1, parseInt(e.target.value, 10) || 1));
                      setGenerateConfigFor(sec.id, "capacity", String(v));
                    }}
                    className="h-9 w-20 min-w-[5rem] rounded-none border-0 border-x border-[var(--glass-border)] bg-white/5 text-center text-sm font-medium tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="h-9 w-9 rounded-none border-0 border-l border-[var(--glass-border)] hover:bg-white/15"
                    onClick={() => {
                      const v = parseInt(cfg.capacity ?? String(sec.capacity), 10) || 1;
                      setGenerateConfigFor(sec.id, "capacity", String(Math.min(10000, v + 1)));
                    }}
                    aria-label="Increase capacity"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="success"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestGenerateSeats(sec.id);
                  }}
                  disabled={saving}
                >
                  Generate seats
                </Button>
              </div>
              {sectionSeats.length > 0 && (
                <div className="flex flex-wrap gap-4 mt-3 items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground-muted whitespace-nowrap">Add seats:</span>
                    <div className="flex items-center rounded-lg overflow-hidden border border-[var(--glass-border)]">
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="h-9 w-9 rounded-none border-0 border-r border-[var(--glass-border)] hover:bg-white/15"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddSeatsCount((v) => Math.max(1, v - 1));
                        }}
                        disabled={saving}
                        aria-label="Decrease add seats"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        max={999}
                        value={addSeatsCount}
                        onChange={(e) => setAddSeatsCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        onBlur={(e) => setAddSeatsCount(Math.min(999, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                        className="h-9 w-14 min-w-[4rem] rounded-none border-0 border-x border-[var(--glass-border)] bg-white/5 text-center text-sm font-medium tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="h-9 w-9 rounded-none border-0 border-l border-[var(--glass-border)] hover:bg-white/15"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddSeatsCount((v) => Math.min(999, v + 1));
                        }}
                        disabled={saving}
                        aria-label="Increase add seats"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="success"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddColumn(sec.id, addSeatsCount);
                        setAddSeatsCount(1);
                      }}
                      disabled={saving}
                    >
                      Add
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground-muted whitespace-nowrap">Remove seats:</span>
                    <div className="flex items-center rounded-lg overflow-hidden border border-[var(--glass-border)]">
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="h-9 w-9 rounded-none border-0 border-r border-[var(--glass-border)] hover:bg-white/15"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRemoveSeatsCount((v) => Math.max(1, v - 1));
                        }}
                        disabled={saving || sectionSeats.length <= 1}
                        aria-label="Decrease remove seats"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        max={maxRemoveSeats}
                        value={removeSeatsCount}
                        onChange={(e) => setRemoveSeatsCount(Math.max(1, Math.min(maxRemoveSeats, parseInt(e.target.value, 10) || 1)))}
                        onBlur={(e) => setRemoveSeatsCount(Math.min(maxRemoveSeats, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                        className="h-9 w-14 min-w-[4rem] rounded-none border-0 border-x border-[var(--glass-border)] bg-white/5 text-center text-sm font-medium tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="h-9 w-9 rounded-none border-0 border-l border-[var(--glass-border)] hover:bg-white/15"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRemoveSeatsCount((v) => Math.min(maxRemoveSeats, v + 1));
                        }}
                        disabled={saving || sectionSeats.length <= 1}
                        aria-label="Increase remove seats"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        const columns = [...new Set(sectionSeats.map((s) => s.seat_number))].sort(sortSeatNumbers);
                        const colsToRemove = new Set(columns.slice(-removeSeatsCount));
                        const hasReservedOrSold = sectionSeats.some(
                          (s) => colsToRemove.has(s.seat_number) && (s.status === "reserved" || s.status === "sold" || s.status === "hold")
                        );
                        if (hasReservedOrSold) {
                          setBlockedRemoveDialogOpen(true);
                          return;
                        }
                        onRemoveColumn(sec.id, removeSeatsCount);
                        setRemoveSeatsCount(1);
                      }}
                      disabled={saving || sectionSeats.length <= 1}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
          <>
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            <div className="flex items-center gap-1">
              <span className="text-sm text-foreground-muted whitespace-nowrap">Rows</span>
              <div className="flex items-center rounded-lg overflow-hidden border border-[var(--glass-border)]">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9 rounded-none border-0 border-r border-[var(--glass-border)] hover:bg-white/15"
                  onClick={() => {
                    const v = parseInt(cfg.numRows, 10) || 1;
                    setGenerateConfigFor(sec.id, "numRows", String(Math.max(1, v - 1)));
                  }}
                  disabled={(parseInt(cfg.numRows, 10) || 1) <= 1}
                  aria-label="Remove row"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={cfg.numRows}
                  onChange={(e) => setGenerateConfigFor(sec.id, "numRows", e.target.value)}
                  onBlur={(e) => {
                    const v = Math.min(999, Math.max(1, parseInt(e.target.value, 10) || 1));
                    setGenerateConfigFor(sec.id, "numRows", String(v));
                  }}
                  className="h-9 w-14 min-w-[4rem] rounded-none border-0 border-x border-[var(--glass-border)] bg-white/5 text-center text-sm font-medium tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  onClick={(e) => e.stopPropagation()}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9 rounded-none border-0 border-l border-[var(--glass-border)] hover:bg-white/15"
                  onClick={() => {
                    const v = parseInt(cfg.numRows, 10) || 1;
                    setGenerateConfigFor(sec.id, "numRows", String(Math.min(999, v + 1)));
                  }}
                  aria-label="Add row"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <span className="text-sm text-foreground-muted">(A, B, C…)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm text-foreground-muted whitespace-nowrap">Columns</span>
              <div className="flex items-center rounded-lg overflow-hidden border border-[var(--glass-border)]">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9 rounded-none border-0 border-r border-[var(--glass-border)] hover:bg-white/15"
                  onClick={() => {
                    const v = parseInt(cfg.numColumns, 10) || 1;
                    setGenerateConfigFor(sec.id, "numColumns", String(Math.max(1, v - 1)));
                  }}
                  disabled={(parseInt(cfg.numColumns, 10) || 1) <= 1}
                  aria-label="Remove column"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={cfg.numColumns}
                  onChange={(e) => setGenerateConfigFor(sec.id, "numColumns", e.target.value)}
                  onBlur={(e) => {
                    const v = Math.min(999, Math.max(1, parseInt(e.target.value, 10) || 1));
                    setGenerateConfigFor(sec.id, "numColumns", String(v));
                  }}
                  className="h-9 w-14 min-w-[4rem] rounded-none border-0 border-x border-[var(--glass-border)] bg-white/5 text-center text-sm font-medium tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  onClick={(e) => e.stopPropagation()}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9 rounded-none border-0 border-l border-[var(--glass-border)] hover:bg-white/15"
                  onClick={() => {
                    const v = parseInt(cfg.numColumns, 10) || 1;
                    setGenerateConfigFor(sec.id, "numColumns", String(Math.min(999, v + 1)));
                  }}
                  aria-label="Add column"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <span className="text-sm text-foreground-muted">(1, 2, 3…)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm text-foreground-muted whitespace-nowrap">Direction:</span>
              <div className="flex rounded-lg overflow-hidden border border-[var(--glass-border)]">
                <Button
                  type="button"
                  variant={cfg.direction === "left-to-right" ? "default" : "secondary"}
                  size="sm"
                  className="h-9 rounded-none border-0 border-r border-[var(--glass-border)]"
                  onClick={() => setGenerateConfigFor(sec.id, "direction", "left-to-right")}
                  disabled={saving}
                  title="1, 2, 3… 10"
                >
                  Left to Right
                </Button>
                <Button
                  type="button"
                  variant={cfg.direction === "right-to-left" ? "default" : "secondary"}
                  size="sm"
                  className="h-9 rounded-none border-0"
                  onClick={() => setGenerateConfigFor(sec.id, "direction", "right-to-left")}
                  disabled={saving}
                  title="10, 9, 8… 1"
                >
                  Right to Left
                </Button>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="success"
              onClick={() => onRequestGenerateSeats(sec.id)}
              disabled={saving}
            >
              Generate seats
            </Button>
          </div>
          {sectionSeats.length > 0 && (
            <>
              <SeatMap
                seats={seatMapSeats}
                selectedIds={selectedSeatIds}
                sections={[
                  {
                    id: sec.id,
                    name: sec.name,
                    section_code: sec.section_code,
                    color: sec.color,
                  },
                ]}
                onToggle={(seatId, available) => {
                  if (!available) return;
                  onSelectedSeatIdsChange(
                    (() => {
                      const next = new Set(selectedSeatIds);
                      if (next.has(seatId)) next.delete(seatId);
                      else next.add(seatId);
                      return next;
                    })()
                  );
                }}
                onSelectMultiple={(ids, addToExisting) => {
                  onSelectedSeatIdsChange(
                    (() => {
                      const next = addToExisting
                        ? new Set(selectedSeatIds)
                        : new Set<string>();
                      const availableIds = new Set(
                        seatMapSeats.filter((s) => s.available).map((s) => s.id)
                      );
                      for (const id of ids) {
                        if (availableIds.has(id)) next.add(id);
                      }
                      return next;
                    })()
                  );
                }}
                helperText="Click seats to select. Drag to marquee-select multiple seats. Hold Ctrl/Cmd while dragging to add to existing selection."
                collapsible={false}
                className="mt-3"
                renderRowActions={({ sectionId, rowLabel }) => {
                  const seatsInRow = sectionSeats.filter((s) => s.row_label === rowLabel);
                  const canRemoveFromRow = seatsInRow.length > 1;
                  return (
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs border-[var(--glass-border)]"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onAddColumnToRow(sectionId, rowLabel);
                        }}
                        disabled={saving}
                        title={`Add 1 seat in row ${rowLabel}`}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add column
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onRemoveColumnFromRow(sectionId, rowLabel);
                        }}
                        disabled={saving || !canRemoveFromRow}
                        title={
                          canRemoveFromRow
                            ? `Remove last seat in row ${rowLabel}`
                            : "Cannot remove columns — row must keep at least one seat"
                        }
                      >
                        <Minus className="h-3 w-3 mr-1" />
                        Remove column
                      </Button>
                    </div>
                  );
                }}
              />
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDeleteSelectedSeats();
                    }}
                    disabled={saving || selectedSeatIds.size === 0}
                  >
                    Delete selected seats ({selectedSeatIds.size})
                  </Button>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <div className="flex w-fit items-center gap-2 rounded-lg border border-emerald-300/45 bg-emerald-200/10 p-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="success"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddRow(sec.id, addRowsCount);
                        setAddRowsCount(1);
                      }}
                      disabled={saving}
                    >
                      Add
                    </Button>
                    <div className="flex items-center rounded-lg overflow-hidden border border-[var(--glass-border)]">
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="h-9 w-9 rounded-none border-0 border-r border-[var(--glass-border)] hover:bg-white/15"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddRowsCount((v) => Math.max(1, v - 1));
                        }}
                        disabled={saving}
                        aria-label="Decrease add rows"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        max={999}
                        value={addRowsCount}
                        onChange={(e) =>
                          setAddRowsCount(Math.max(1, parseInt(e.target.value, 10) || 1))
                        }
                        onBlur={(e) =>
                          setAddRowsCount(
                            Math.min(999, Math.max(1, parseInt(e.target.value, 10) || 1))
                          )
                        }
                        className="h-9 w-14 min-w-[4rem] rounded-none border-0 border-x border-[var(--glass-border)] bg-white/5 text-center text-sm font-medium tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="h-9 w-9 rounded-none border-0 border-l border-[var(--glass-border)] hover:bg-white/15"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddRowsCount((v) => Math.min(999, v + 1));
                        }}
                        disabled={saving}
                        aria-label="Increase add rows"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <span className="text-sm text-foreground-muted whitespace-nowrap">Rows</span>
                  </div>

                  <div className="flex w-fit items-center gap-2 rounded-lg border border-emerald-300/45 bg-emerald-200/10 p-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="success"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddColumn(sec.id, addColumnsCount);
                        setAddColumnsCount(1);
                      }}
                      disabled={saving}
                    >
                      Add
                    </Button>
                    <div className="flex items-center rounded-lg overflow-hidden border border-[var(--glass-border)]">
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="h-9 w-9 rounded-none border-0 border-r border-[var(--glass-border)] hover:bg-white/15"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddColumnsCount((v) => Math.max(1, v - 1));
                        }}
                        disabled={saving}
                        aria-label="Decrease add columns"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        max={999}
                        value={addColumnsCount}
                        onChange={(e) =>
                          setAddColumnsCount(Math.max(1, parseInt(e.target.value, 10) || 1))
                        }
                        onBlur={(e) =>
                          setAddColumnsCount(
                            Math.min(999, Math.max(1, parseInt(e.target.value, 10) || 1))
                          )
                        }
                        className="h-9 w-14 min-w-[4rem] rounded-none border-0 border-x border-[var(--glass-border)] bg-white/5 text-center text-sm font-medium tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="h-9 w-9 rounded-none border-0 border-l border-[var(--glass-border)] hover:bg-white/15"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddColumnsCount((v) => Math.min(999, v + 1));
                        }}
                        disabled={saving}
                        aria-label="Increase add columns"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <span className="text-sm text-foreground-muted whitespace-nowrap">Columns</span>
                  </div>

                  <div className="flex w-fit items-center gap-2 rounded-lg border border-rose-300/45 bg-rose-200/10 p-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rowLabels = [...new Set(sectionSeats.map((s) => s.row_label))].sort(
                          sortRowLabels
                        );
                        const rowsToRemove = new Set(rowLabels.slice(-removeRowsCount));
                        const hasReservedOrSold = sectionSeats.some(
                          (s) =>
                            rowsToRemove.has(s.row_label) &&
                            (s.status === "reserved" || s.status === "sold" || s.status === "hold")
                        );
                        if (hasReservedOrSold) {
                          setBlockedRemoveDialogOpen(true);
                          return;
                        }
                        onRemoveRow(sec.id, removeRowsCount);
                        setRemoveRowsCount(1);
                      }}
                      disabled={saving || rowCount <= 1}
                    >
                      Remove
                    </Button>
                    <div className="flex items-center rounded-lg overflow-hidden border border-[var(--glass-border)]">
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="h-9 w-9 rounded-none border-0 border-r border-[var(--glass-border)] hover:bg-white/15"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRemoveRowsCount((v) => Math.max(1, v - 1));
                        }}
                        disabled={saving || rowCount <= 1}
                        aria-label="Decrease remove rows"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        max={maxRemoveRows}
                        value={removeRowsCount}
                        onChange={(e) =>
                          setRemoveRowsCount(
                            Math.max(1, Math.min(maxRemoveRows, parseInt(e.target.value, 10) || 1))
                          )
                        }
                        onBlur={(e) =>
                          setRemoveRowsCount(
                            Math.min(maxRemoveRows, Math.max(1, parseInt(e.target.value, 10) || 1))
                          )
                        }
                        className="h-9 w-14 min-w-[4rem] rounded-none border-0 border-x border-[var(--glass-border)] bg-white/5 text-center text-sm font-medium tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="h-9 w-9 rounded-none border-0 border-l border-[var(--glass-border)] hover:bg-white/15"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRemoveRowsCount((v) => Math.min(maxRemoveRows, v + 1));
                        }}
                        disabled={saving || rowCount <= 1}
                        aria-label="Increase remove rows"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <span className="text-sm text-foreground-muted whitespace-nowrap">Rows</span>
                  </div>

                  <div className="flex w-fit items-center gap-2 rounded-lg border border-rose-300/45 bg-rose-200/10 p-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        const columns = [...new Set(sectionSeats.map((s) => s.seat_number))].sort(
                          sortSeatNumbers
                        );
                        const colsToRemove = new Set(columns.slice(-removeColumnsCount));
                        const hasReservedOrSold = sectionSeats.some(
                          (s) =>
                            colsToRemove.has(s.seat_number) &&
                            (s.status === "reserved" || s.status === "sold" || s.status === "hold")
                        );
                        if (hasReservedOrSold) {
                          setBlockedRemoveDialogOpen(true);
                          return;
                        }
                        onRemoveColumn(sec.id, removeColumnsCount);
                        setRemoveColumnsCount(1);
                      }}
                      disabled={saving || colCount <= 1}
                    >
                      Remove
                    </Button>
                    <div className="flex items-center rounded-lg overflow-hidden border border-[var(--glass-border)]">
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="h-9 w-9 rounded-none border-0 border-r border-[var(--glass-border)] hover:bg-white/15"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRemoveColumnsCount((v) => Math.max(1, v - 1));
                        }}
                        disabled={saving || colCount <= 1}
                        aria-label="Decrease remove columns"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        max={maxRemoveCols}
                        value={removeColumnsCount}
                        onChange={(e) =>
                          setRemoveColumnsCount(
                            Math.max(1, Math.min(maxRemoveCols, parseInt(e.target.value, 10) || 1))
                          )
                        }
                        onBlur={(e) =>
                          setRemoveColumnsCount(
                            Math.min(maxRemoveCols, Math.max(1, parseInt(e.target.value, 10) || 1))
                          )
                        }
                        className="h-9 w-14 min-w-[4rem] rounded-none border-0 border-x border-[var(--glass-border)] bg-white/5 text-center text-sm font-medium tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="h-9 w-9 rounded-none border-0 border-l border-[var(--glass-border)] hover:bg-white/15"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRemoveColumnsCount((v) => Math.min(maxRemoveCols, v + 1));
                        }}
                        disabled={saving || colCount <= 1}
                        aria-label="Increase remove columns"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <span className="text-sm text-foreground-muted whitespace-nowrap">Columns</span>
                  </div>
                </div>
              </div>
            </>
          )}
          </>
          )}
        </div>
      )}
      <Dialog open={blockedRemoveDialogOpen} onOpenChange={setBlockedRemoveDialogOpen}>
        <DialogContent hideClose className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Action Not Allowed</DialogTitle>
            <DialogDescription className="mt-1">
              Oops... you can&apos;t remove this row or column right now. Some seats in this section are already reserved or sold, so deleting it would affect existing ticket holders.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setBlockedRemoveDialogOpen(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
