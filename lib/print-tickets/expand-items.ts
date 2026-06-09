import type { SupabaseClient } from "@supabase/supabase-js";
import { cappedFreeStandingSlotCount } from "@/lib/print-tickets/free-standing-slot-cap";
import { isFreeStandingSeatingType } from "@/lib/print-tickets/is-free-standing-section";

export interface InputItem {
  sectionId: string;
  seatId?: string | null;
  /** When set with free/standing and no seatId, generate only this slot (1-based). */
  sectionSlotIndex?: number | null;
}

export interface WorkItem {
  eventSectionId: string;
  eventSeatId: string | null;
  /** 1-based for free/standing section-level work; omit when `eventSeatId` is set. */
  sectionSlotIndex?: number;
}

type SectionRow = { id: string; seating_type?: string | null; capacity?: number | null };

/** Expands items to work units: seats, single free/standing slot, or all slots up to capped capacity. */
export async function expandItems(
  supabase: SupabaseClient,
  items: InputItem[]
): Promise<WorkItem[]> {
  const sectionIdsNeeded = new Set<string>();
  for (const item of items) {
    if (!item.seatId) sectionIdsNeeded.add(item.sectionId);
  }

  const sectionById = new Map<string, SectionRow>();
  if (sectionIdsNeeded.size > 0) {
    const { data: sectionRows } = await supabase
      .from("event_sections")
      .select("id, seating_type, capacity")
      .in("id", [...sectionIdsNeeded]);

    for (const row of sectionRows ?? []) {
      if (row?.id) sectionById.set(row.id, row as SectionRow);
    }
  }

  /** Assigned sections: reuse one `event_seats` query per section (avoids N round-trips). */
  const assignedSeatIdsBySection = new Map<string, string[]>();

  const workItems: WorkItem[] = [];
  for (const item of items) {
    if (item.seatId) {
      workItems.push({ eventSectionId: item.sectionId, eventSeatId: item.seatId });
      continue;
    }

    const explicitSlot =
      typeof item.sectionSlotIndex === "number" &&
      Number.isFinite(item.sectionSlotIndex) &&
      item.sectionSlotIndex >= 1
        ? Math.floor(item.sectionSlotIndex)
        : null;

    const section = sectionById.get(item.sectionId);
    const isAssigned = !isFreeStandingSeatingType(section?.seating_type);

    if (isAssigned) {
      let seatIds = assignedSeatIdsBySection.get(item.sectionId);
      if (!seatIds) {
        const { data: seats } = await supabase
          .from("event_seats")
          .select("id")
          .eq("event_section_id", item.sectionId)
          .order("row_label")
          .order("seat_number");

        seatIds = (seats ?? []).map((s) => s.id as string);
        assignedSeatIdsBySection.set(item.sectionId, seatIds);
      }
      for (const id of seatIds) {
        workItems.push({ eventSectionId: item.sectionId, eventSeatId: id });
      }
      continue;
    }

    if (explicitSlot != null) {
      workItems.push({
        eventSectionId: item.sectionId,
        eventSeatId: null,
        sectionSlotIndex: explicitSlot,
      });
      continue;
    }

    const capacity = Math.max(0, Math.floor(section?.capacity ?? 0));
    const n = cappedFreeStandingSlotCount(capacity);
    for (let slot = 1; slot <= n; slot++) {
      workItems.push({
        eventSectionId: item.sectionId,
        eventSeatId: null,
        sectionSlotIndex: slot,
      });
    }
  }
  return workItems;
}
