import type { SupabaseClient as AdminSupabaseClient } from "@supabase/supabase-js";
import {
  canonicalQrDataForSeat,
  ensureSeatEncryptedQrForSale,
} from "@/lib/event-seats/seat-encrypted-qr";
import type { EnsureInventoryResult } from "@/lib/ticket-inventory/types";

const SEAT_CHUNK = 200;

type SeatRow = {
  id: string;
  event_id: string;
  event_section_id: string;
  row_label: string;
  seat_number: string;
  encrypted_qr: string | null;
};

async function loadEventCode(
  admin: AdminSupabaseClient,
  eventId: string
): Promise<{ eventCode: string; sectionCodeById: Map<string, string> }> {
  const { data: eventRow } = await admin
    .from("events")
    .select("event_code")
    .eq("id", eventId)
    .single();
  const { data: sections } = await admin
    .from("event_sections")
    .select("id, section_code")
    .eq("event_id", eventId);
  const sectionCodeById = new Map(
    (sections ?? []).map((s) => [s.id, (s.section_code ?? "000") as string])
  );
  return {
    eventCode: (eventRow?.event_code ?? "XXX") as string,
    sectionCodeById,
  };
}

/**
 * Ensure `print_tickets` inventory rows exist for the given seats (idempotent).
 * Uses `event_seat_id` for all seating types when seats exist.
 */
export async function ensureInventoryForSeats(
  admin: AdminSupabaseClient,
  eventId: string,
  seatIds: string[]
): Promise<EnsureInventoryResult> {
  const uniqueSeatIds = [...new Set(seatIds.filter(Boolean))];
  if (uniqueSeatIds.length === 0) {
    return { created: 0, existing: 0, print_ticket_ids: [], skipped_allocated: 0 };
  }

  const seats: SeatRow[] = [];
  for (let i = 0; i < uniqueSeatIds.length; i += SEAT_CHUNK) {
    const chunk = uniqueSeatIds.slice(i, i + SEAT_CHUNK);
    const { data, error } = await admin
      .from("event_seats")
      .select("id, event_id, event_section_id, row_label, seat_number, encrypted_qr")
      .eq("event_id", eventId)
      .in("id", chunk);
    if (error) throw new Error(error.message);
    seats.push(...((data ?? []) as SeatRow[]));
  }

  if (seats.length === 0) {
    return { created: 0, existing: 0, print_ticket_ids: [], skipped_allocated: 0 };
  }

  const { eventCode, sectionCodeById } = await loadEventCode(admin, eventId);
  const seatIdsLoaded = seats.map((s) => s.id);
  const existingBySeatId = new Map<string, { id: string; allocated_ticket_id: string | null }>();

  for (let i = 0; i < seatIdsLoaded.length; i += SEAT_CHUNK) {
    const chunk = seatIdsLoaded.slice(i, i + SEAT_CHUNK);
    const { data: existingRows } = await admin
      .from("print_tickets")
      .select("id, event_seat_id, allocated_ticket_id")
      .eq("event_id", eventId)
      .in("event_seat_id", chunk);
    for (const row of existingRows ?? []) {
      if (row.event_seat_id) {
        existingBySeatId.set(row.event_seat_id, {
          id: row.id as string,
          allocated_ticket_id: (row.allocated_ticket_id as string | null) ?? null,
        });
      }
    }
  }

  let created = 0;
  let existing = 0;
  let skipped_allocated = 0;
  const print_ticket_ids: string[] = [];

  for (const seat of seats) {
    const prev = existingBySeatId.get(seat.id);
    if (prev) {
      existing += 1;
      print_ticket_ids.push(prev.id);
      if (prev.allocated_ticket_id) skipped_allocated += 1;
      continue;
    }

    const sectionCode = sectionCodeById.get(seat.event_section_id) ?? "000";
    const ctx = {
      eventCode,
      sectionCode,
      rowLabel: seat.row_label ?? "-",
      seatNumber: seat.seat_number ?? "-",
    };
    const qrData = canonicalQrDataForSeat(ctx);
    const encryptedQr =
      (seat.encrypted_qr ?? "").trim().length > 0
        ? seat.encrypted_qr!.trim().toUpperCase()
        : await ensureSeatEncryptedQrForSale(admin, seat.id, ctx);

    const { data: inserted, error: insertError } = await admin
      .from("print_tickets")
      .insert({
        event_id: eventId,
        event_section_id: seat.event_section_id,
        event_seat_id: seat.id,
        section_slot_index: 0,
        qr_data: qrData,
        encrypted_qr: encryptedQr,
      })
      .select("id")
      .single();

    if (insertError) {
      const { data: raced } = await admin
        .from("print_tickets")
        .select("id, allocated_ticket_id")
        .eq("event_id", eventId)
        .eq("event_seat_id", seat.id)
        .maybeSingle();
      if (raced) {
        existing += 1;
        print_ticket_ids.push(raced.id as string);
        if (raced.allocated_ticket_id) skipped_allocated += 1;
        continue;
      }
      throw new Error(insertError.message);
    }

    created += 1;
    print_ticket_ids.push(inserted!.id as string);
  }

  return { created, existing, print_ticket_ids, skipped_allocated };
}

/**
 * Ensure inventory for all seats in one or more sections.
 */
export async function ensureInventoryForSections(
  admin: AdminSupabaseClient,
  eventId: string,
  sectionIds: string[]
): Promise<EnsureInventoryResult> {
  const uniqueSectionIds = [...new Set(sectionIds.filter(Boolean))];
  if (uniqueSectionIds.length === 0) {
    return { created: 0, existing: 0, print_ticket_ids: [], skipped_allocated: 0 };
  }

  const seatIds: string[] = [];
  const PAGE = 1000;
  for (const sectionId of uniqueSectionIds) {
    let from = 0;
    for (;;) {
      const { data, error } = await admin
        .from("event_seats")
        .select("id")
        .eq("event_id", eventId)
        .eq("event_section_id", sectionId)
        .order("row_label")
        .order("seat_number")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const chunk = data ?? [];
      seatIds.push(...chunk.map((r) => r.id as string));
      if (chunk.length < PAGE) break;
      from += PAGE;
    }
  }

  return ensureInventoryForSeats(admin, eventId, seatIds);
}
