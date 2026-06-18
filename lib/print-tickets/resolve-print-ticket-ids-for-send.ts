import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkArray } from "@/lib/array-chunks";
import { isFreeStandingSeatingType } from "@/lib/print-tickets/is-free-standing-section";

/** PostgREST URL length caps large `.in()` lists; chunk UUID arrays to avoid empty/failed lookups. */
const IN_QUERY_CHUNK = 100;

export type SendItemInput = {
  sectionId: string;
  seatId: string | null;
  sectionSlotIndex?: number;
};

/**
 * Resolves UI “send” items to `print_tickets.id` in **item order**, with dedupe.
 * Batches DB reads so free/standing (many slot rows) does not do one query per slot.
 */
export async function resolvePrintTicketIdsForSend(
  supabase: SupabaseClient,
  eventId: string,
  items: SendItemInput[]
): Promise<string[]> {
  const ordered: string[] = [];

  const withSeatId = items.filter((i) => i.seatId);
  const withSlotOnly = items.filter((i) => !i.seatId && i.sectionSlotIndex != null);
  const wholeSection = items.filter((i) => !i.seatId && i.sectionSlotIndex == null);

  const seatIdCandidates = [...new Set(withSeatId.map((i) => i.seatId!))];
  const printIdsFromIdLookup = new Set<string>();
  if (seatIdCandidates.length > 0) {
    for (const batch of chunkArray(seatIdCandidates, IN_QUERY_CHUNK)) {
      const { data, error } = await supabase
        .from("print_tickets")
        .select("id")
        .eq("event_id", eventId)
        .in("id", batch);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) printIdsFromIdLookup.add(r.id);
    }
  }

  const eventSeatBySection = new Map<string, Set<string>>();
  for (const i of withSeatId) {
    if (!i.seatId || printIdsFromIdLookup.has(i.seatId)) continue;
    if (!eventSeatBySection.has(i.sectionId)) eventSeatBySection.set(i.sectionId, new Set());
    eventSeatBySection.get(i.sectionId)!.add(i.seatId);
  }

  const printBySectionSeat = new Map<string, string>();
  for (const [sectionId, seatSet] of eventSeatBySection) {
    const seatArr = [...seatSet];
    if (seatArr.length === 0) continue;
    for (const batch of chunkArray(seatArr, IN_QUERY_CHUNK)) {
      const { data, error } = await supabase
        .from("print_tickets")
        .select("id, event_seat_id")
        .eq("event_id", eventId)
        .eq("event_section_id", sectionId)
        .in("event_seat_id", batch);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        if (r.event_seat_id) printBySectionSeat.set(`${sectionId}:${r.event_seat_id}`, r.id);
      }
    }
  }

  const printBySectionSlot = new Map<string, string>();
  const slotsBySection = new Map<string, number[]>();
  for (const i of withSlotOnly) {
    const slot = Math.max(1, Math.floor(i.sectionSlotIndex!));
    if (!slotsBySection.has(i.sectionId)) slotsBySection.set(i.sectionId, []);
    slotsBySection.get(i.sectionId)!.push(slot);
  }
  for (const [sectionId, slots] of slotsBySection) {
    const uniq = [...new Set(slots)];
    if (uniq.length === 0) continue;
    for (const batch of chunkArray(uniq, IN_QUERY_CHUNK)) {
      const { data, error } = await supabase
        .from("print_tickets")
        .select("id, section_slot_index")
        .eq("event_id", eventId)
        .eq("event_section_id", sectionId)
        .is("event_seat_id", null)
        .in("section_slot_index", batch);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        const sidx = Math.max(
          1,
          Math.floor(Number((r as { section_slot_index?: number }).section_slot_index ?? 1))
        );
        printBySectionSlot.set(`${sectionId}:${sidx}`, r.id);
      }
    }
  }

  const wholeSectionIds = [...new Set(wholeSection.map((i) => i.sectionId))];
  const wholeIdsBySection = new Map<string, string[]>();

  if (wholeSectionIds.length > 0) {
    const { data: sectionRows } = await supabase
      .from("event_sections")
      .select("id, seating_type")
      .in("id", wholeSectionIds);

    const freeSet = new Set<string>();
    for (const row of sectionRows ?? []) {
      if (isFreeStandingSeatingType((row as { seating_type?: string }).seating_type)) {
        freeSet.add(row.id);
      }
    }

    await Promise.all(
      wholeSectionIds.map(async (sectionId) => {
        if (freeSet.has(sectionId)) {
          const { data: seats } = await supabase
            .from("event_seats")
            .select("id")
            .eq("event_section_id", sectionId)
            .order("row_label")
            .order("seat_number");
          const seatIds = (seats ?? []).map((s) => s.id as string);
          if (seatIds.length > 0) {
            const printBySeat = new Map<string, string>();
            for (const batch of chunkArray(seatIds, IN_QUERY_CHUNK)) {
              const { data, error } = await supabase
                .from("print_tickets")
                .select("id, event_seat_id")
                .eq("event_id", eventId)
                .eq("event_section_id", sectionId)
                .in("event_seat_id", batch);
              if (error) throw new Error(error.message);
              for (const r of data ?? []) {
                const esid = (r as { event_seat_id?: string | null }).event_seat_id;
                if (esid) printBySeat.set(esid, (r as { id: string }).id);
              }
            }
            wholeIdsBySection.set(
              sectionId,
              seatIds
                .map((sid) => printBySeat.get(sid))
                .filter((id): id is string => typeof id === "string")
            );
            return;
          }
          const { data } = await supabase
            .from("print_tickets")
            .select("id")
            .eq("event_id", eventId)
            .eq("event_section_id", sectionId)
            .is("event_seat_id", null)
            .order("section_slot_index", { ascending: true });
          wholeIdsBySection.set(sectionId, (data ?? []).map((r) => r.id));
          return;
        }
        const { data: seats } = await supabase
          .from("event_seats")
          .select("id")
          .eq("event_section_id", sectionId)
          .order("row_label")
          .order("seat_number");
        const seatIds = (seats ?? []).map((s) => s.id);
        if (seatIds.length === 0) {
          wholeIdsBySection.set(sectionId, []);
          return;
        }
        const printBySeat = new Map<string, string>();
        for (const batch of chunkArray(seatIds, IN_QUERY_CHUNK)) {
          const { data, error } = await supabase
            .from("print_tickets")
            .select("id, event_seat_id")
            .eq("event_id", eventId)
            .eq("event_section_id", sectionId)
            .in("event_seat_id", batch);
          if (error) throw new Error(error.message);
          for (const r of data ?? []) {
            const esid = (r as { event_seat_id?: string | null }).event_seat_id;
            if (esid) printBySeat.set(esid, (r as { id: string }).id);
          }
        }
        wholeIdsBySection.set(
          sectionId,
          seatIds.map((sid) => printBySeat.get(sid)).filter((id): id is string => typeof id === "string")
        );
      })
    );
  }

  for (const item of items) {
    if (item.seatId) {
      if (printIdsFromIdLookup.has(item.seatId)) {
        ordered.push(item.seatId);
        continue;
      }
      const pid = printBySectionSeat.get(`${item.sectionId}:${item.seatId}`);
      if (pid) ordered.push(pid);
      continue;
    }
    if (item.sectionSlotIndex != null) {
      const slot = Math.max(1, Math.floor(item.sectionSlotIndex));
      const pid = printBySectionSlot.get(`${item.sectionId}:${slot}`);
      if (pid) ordered.push(pid);
      continue;
    }
    const list = wholeIdsBySection.get(item.sectionId) ?? [];
    for (const id of list) ordered.push(id);
  }

  return [...new Set(ordered)];
}
