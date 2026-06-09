"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { SeatMap, type SeatInfo, type SectionInfo } from "@/components/seat-picker/seat-map";
import { toast } from "@/lib/toast";

interface SeatHoldProps {
  eventId: string;
}

interface ApiSection {
  id: string;
  name: string | null;
  section_code: string | null;
  section_group: string | null;
  color: string | null;
}

interface ApiSeat {
  id: string;
  event_section_id: string;
  row_label: string | null;
  seat_number: string | null;
  status: "available" | "reserved" | "sold" | "hold";
}

interface SeatHoldResponse {
  sections: ApiSection[];
  seats: ApiSeat[];
  hold_batches: Array<{
    batch_id: string;
    description: string | null;
    count: number;
    sections: Array<{
      section_id: string;
      section_name: string;
      count: number;
    }>;
  }>;
}

export function SeatHold({ eventId }: SeatHoldProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<ApiSection[]>([]);
  const [seats, setSeats] = useState<ApiSeat[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState("");
  const [holdBatches, setHoldBatches] = useState<SeatHoldResponse["hold_batches"]>([]);
  const [releasingBatchId, setReleasingBatchId] = useState<string | null>(null);
  const [expandedGroupNames, setExpandedGroupNames] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/seat-hold`);
      const json: SeatHoldResponse | { error?: string } = await res.json();
      if (!res.ok) {
        throw new Error("error" in json ? (json.error ?? "Failed to load seat hold data") : "Failed to load seat hold data");
      }
      const payload = json as SeatHoldResponse;
      setSections(payload.sections ?? []);
      setSeats(payload.seats ?? []);
      setHoldBatches(payload.hold_batches ?? []);
      setSelectedIds(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load seat hold data");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sectionMap = useMemo(() => {
    const map = new Map<string, ApiSection>();
    for (const section of sections) map.set(section.id, section);
    return map;
  }, [sections]);

  const groups = useMemo(() => {
    const grouped = new Map<string, ApiSection[]>();
    for (const section of sections) {
      const groupName = section.section_group?.trim() || "Ungrouped";
      const arr = grouped.get(groupName) ?? [];
      arr.push(section);
      grouped.set(groupName, arr);
    }
    return Array.from(grouped.entries());
  }, [sections]);

  const seatMapBySection = useMemo(() => {
    const map = new Map<string, ApiSeat[]>();
    for (const seat of seats) {
      const arr = map.get(seat.event_section_id) ?? [];
      arr.push(seat);
      map.set(seat.event_section_id, arr);
    }
    return map;
  }, [seats]);

  const selectableSeatIds = useMemo(
    () => seats.filter((s) => s.status !== "sold" && s.status !== "reserved").map((s) => s.id),
    [seats]
  );
  const selectableSeatIdSet = useMemo(() => new Set(selectableSeatIds), [selectableSeatIds]);

  const seatInfoByGroup = useMemo(() => {
    const byGroup = new Map<string, { sections: SectionInfo[]; seats: SeatInfo[] }>();
    for (const [groupName, groupSections] of groups) {
      const sectionInfos: SectionInfo[] = groupSections.map((s) => ({
        id: s.id,
        name: s.name ?? s.section_code ?? "Unnamed",
        section_code: s.section_code,
        color: s.color,
      }));
      const seatInfos: SeatInfo[] = [];
      for (const section of groupSections) {
        const sectionSeats = seatMapBySection.get(section.id) ?? [];
        for (const seat of sectionSeats) {
          const availableForSelection = seat.status !== "sold" && seat.status !== "reserved";
          seatInfos.push({
            id: seat.id,
            row_label: seat.row_label,
            seat_number: seat.seat_number,
            section_id: seat.event_section_id,
            available: availableForSelection,
            status: seat.status,
          });
        }
      }
      byGroup.set(groupName, { sections: sectionInfos, seats: seatInfos });
    }
    return byGroup;
  }, [groups, seatMapBySection]);

  const toggleSeat = useCallback((seatId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(seatId)) next.delete(seatId);
      else next.add(seatId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(selectableSeatIds));
  }, [selectableSeatIds]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleGroupExpanded = useCallback((groupName: string) => {
    setExpandedGroupNames((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  }, []);

  const toggleSectionSelection = useCallback(
    (sectionId: string, selectAllInSection: boolean) => {
      const sectionSeats = (seatMapBySection.get(sectionId) ?? [])
        .filter((seat) => seat.status !== "sold" && seat.status !== "reserved")
        .map((seat) => seat.id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of sectionSeats) {
          if (selectAllInSection) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [seatMapBySection]
  );

  const selectedCount = selectedIds.size;
  const totalSeatHolds = useMemo(
    () => seats.filter((seat) => seat.status === "hold").length,
    [seats]
  );

  const groupSummaries = useMemo(() => {
    const summary = new Map<string, number>();
    for (const seatId of selectedIds) {
      const seat = seats.find((s) => s.id === seatId);
      if (!seat) continue;
      const section = sectionMap.get(seat.event_section_id);
      const groupName = section?.section_group?.trim() || "Ungrouped";
      summary.set(groupName, (summary.get(groupName) ?? 0) + 1);
    }
    return summary;
  }, [selectedIds, seats, sectionMap]);

  const saveChanges = useCallback(async () => {
    if (selectedCount > 0 && description.trim().length === 0) {
      toast.error("Description is required when adding new Seat Hold seats.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/seat-hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seat_ids: Array.from(selectedIds),
          description: description.trim(),
        }),
      });
      const json: SeatHoldResponse | { error?: string } = await res.json();
      if (!res.ok) {
        throw new Error("error" in json ? (json.error ?? "Failed to save seat hold changes") : "Failed to save seat hold changes");
      }
      const payload = json as SeatHoldResponse;
      setSections(payload.sections ?? []);
      setSeats(payload.seats ?? []);
      setHoldBatches(payload.hold_batches ?? []);
      setSelectedIds(new Set());
      setDescription("");
      toast.success("Seat Hold changes saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save seat hold changes");
    } finally {
      setSaving(false);
    }
  }, [description, eventId, selectedCount, selectedIds]);

  const releaseBatch = useCallback(
    async (batchId: string) => {
      setReleasingBatchId(batchId);
      try {
        const res = await fetch(
          `/api/admin/events/${eventId}/seat-hold?batch_id=${encodeURIComponent(batchId)}`,
          { method: "DELETE" }
        );
        const json: SeatHoldResponse | { error?: string } = await res.json();
        if (!res.ok) {
          throw new Error("error" in json ? (json.error ?? "Failed to release hold batch") : "Failed to release hold batch");
        }
        const payload = json as SeatHoldResponse;
        setSections(payload.sections ?? []);
        setSeats(payload.seats ?? []);
        setHoldBatches(payload.hold_batches ?? []);
        setSelectedIds(new Set());
        toast.success("Hold batch released.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to release hold batch");
      } finally {
        setReleasingBatchId(null);
      }
    },
    [eventId]
  );

  if (loading) {
    return (
      <>
        <FloatingProgressBar
          active
          {...FLOATING_PROGRESS_PRESETS.genericLoad}
          message="Loading seat hold…"
          subtitle="This event"
        />
        <div className="glass rounded-xl border border-[var(--glass-border)] p-6 text-foreground-muted">
          Loading Seat Hold data...
        </div>
      </>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">Seat Hold</h2>
        <p className="text-sm text-foreground-muted">
          No sections found. Configure sections first in Seat Configurator.
        </p>
      </div>
    );
  }

  return (
    <>
      <FloatingProgressBar
        active={saving}
        message="Saving seat hold"
        subtitle="This event"
        detail={FLOATING_PROGRESS_PRESETS.genericSave.detail}
      />
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Seat Hold</h2>
          <p className="text-sm text-foreground-muted">
            Mark seats as hold (black) so they are excluded from selling and distribution.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={selectAll}>
            Select all
          </Button>
          <Button type="button" variant="ghost" onClick={deselectAll}>
            Deselect all
          </Button>
        </div>

        <div className="space-y-4">
          {groups.map(([groupName]) => {
            const payload = seatInfoByGroup.get(groupName);
            if (!payload) return null;
            const groupHeldCount = groupSummaries.get(groupName) ?? 0;
            const isExpanded = expandedGroupNames.has(groupName);
            return (
              <div
                key={groupName}
                className="rounded-lg border border-[var(--glass-border)] bg-white/5 p-4 space-y-3"
              >
                <button
                  type="button"
                  onClick={() => toggleGroupExpanded(groupName)}
                  className="flex w-full items-center justify-between gap-4 rounded-md text-left hover:bg-[var(--glass-light-bg)] px-1.5 py-1 transition-colors"
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
                    )}
                    <h3 className="text-sm font-semibold text-foreground">{groupName}</h3>
                  </div>
                  <span className="text-xs text-foreground-muted">
                    Holds in group: {groupHeldCount}
                  </span>
                </button>
                {isExpanded ? (
                  <SeatMap
                    seats={payload.seats}
                    sections={payload.sections}
                    selectedIds={selectedIds}
                    onToggle={(seatId) => toggleSeat(seatId)}
                    onSelectMultiple={(ids, addToExisting) => {
                      setSelectedIds((prev) => {
                        const next = addToExisting ? new Set(prev) : new Set<string>();
                        for (const id of ids) {
                          if (selectableSeatIdSet.has(id)) next.add(id);
                        }
                        return next;
                      });
                    }}
                    collapsible
                    defaultCollapsed
                    onSectionSelectionToggle={toggleSectionSelection}
                    helperText="Black seats are Seat Hold. White/gray seats are conflict seats and cannot be changed. Drag to marquee select. Hold Ctrl/Cmd while dragging to add to current selection."
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-[var(--glass-border)] bg-white/5 p-4 space-y-3">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Seat Hold batches</p>
            {holdBatches.length === 0 ? (
              <p className="text-xs text-foreground-muted">No hold batches yet.</p>
            ) : (
              <div className="space-y-2">
                {holdBatches.map((batch) => {
                  const label = batch.description?.trim() || "Untitled";
                  const breakdown = batch.sections
                    .map((section) => `${section.section_name} ${section.count}`)
                    .join(", ");
                  return (
                    <div
                      key={batch.batch_id}
                      className="rounded-md border border-[var(--glass-border)] bg-white/5 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-foreground">
                          {label} - {batch.count} seat{batch.count !== 1 ? "s" : ""}{" "}
                          <span className="text-foreground-muted">
                            ({breakdown || "No section breakdown"})
                          </span>
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={releasingBatchId === batch.batch_id || saving}
                          onClick={() => releaseBatch(batch.batch_id)}
                        >
                          {releasingBatchId === batch.batch_id ? "Releasing..." : "Release"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground" htmlFor="seat-hold-description">
              Seat Hold batch description
            </label>
            <Input
              id="seat-hold-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tech, Production, VIP sponsor, etc."
              maxLength={120}
            />
            <p className="text-xs text-foreground-muted">
              Required only when adding new Seat Hold seats.
            </p>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-foreground-muted">
              Total Seat Holds: <span className="text-foreground font-medium">{totalSeatHolds}</span>
            </div>
            <Button type="button" onClick={saveChanges} disabled={saving || selectedCount === 0}>
              {saving ? "Saving..." : "Save Seat Hold"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
