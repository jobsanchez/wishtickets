import type { SupabaseClient as AdminSupabaseClient } from "@supabase/supabase-js";
import {
  TICKET_INVENTORY_ENSURE_SEAT_BATCH,
  TICKET_INVENTORY_IMAGE_BATCH_SIZE,
} from "@/lib/ticket-inventory/constants";
import { ensureInventoryForSeats } from "@/lib/ticket-inventory/ensure-inventory";
import { generateInventoryImages } from "@/lib/ticket-inventory/generate-images";
import { getEventInventorySummaries } from "@/lib/ticket-inventory/summary";
import type { SectionInventorySummary } from "@/lib/ticket-inventory/types";

export type GenerateInventoryBatchResult = {
  created: number;
  existing: number;
  skipped_allocated: number;
  images_generated: number;
  images_failed: number;
  ensure_seats_processed: number;
  complete: boolean;
  seats_pending: number;
  images_pending: number;
  inventory_total: number;
};

const SEAT_PAGE = 200;

async function findSeatIdsMissingInventory(
  admin: AdminSupabaseClient,
  eventId: string,
  sectionIds: string[],
  limit: number
): Promise<string[]> {
  const missing: string[] = [];
  for (const sectionId of sectionIds) {
    if (missing.length >= limit) break;
    let from = 0;
    while (missing.length < limit) {
      const { data: seats, error } = await admin
        .from("event_seats")
        .select("id")
        .eq("event_id", eventId)
        .eq("event_section_id", sectionId)
        .order("row_label")
        .order("seat_number")
        .range(from, from + SEAT_PAGE - 1);
      if (error) throw new Error(error.message);
      const chunk = seats ?? [];
      if (chunk.length === 0) break;

      const ids = chunk.map((s) => s.id as string);
      const { data: existing } = await admin
        .from("print_tickets")
        .select("event_seat_id")
        .eq("event_id", eventId)
        .in("event_seat_id", ids);
      const have = new Set(
        (existing ?? []).map((r) => r.event_seat_id as string).filter(Boolean)
      );
      for (const id of ids) {
        if (!have.has(id)) {
          missing.push(id);
          if (missing.length >= limit) break;
        }
      }
      if (chunk.length < SEAT_PAGE) break;
      from += SEAT_PAGE;
    }
  }
  return missing;
}

async function findPrintTicketIdsMissingImages(
  admin: AdminSupabaseClient,
  eventId: string,
  sectionIds: string[],
  limit: number
): Promise<string[]> {
  const ids: string[] = [];
  let from = 0;
  const PAGE = 200;
  while (ids.length < limit) {
    const { data, error } = await admin
      .from("print_tickets")
      .select("id, ticket_image_url")
      .eq("event_id", eventId)
      .in("event_section_id", sectionIds)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    for (const row of chunk) {
      const url = row.ticket_image_url as string | null;
      if (!url || String(url).trim() === "") {
        ids.push(row.id as string);
        if (ids.length >= limit) break;
      }
    }
    if (chunk.length < PAGE) break;
    from += PAGE;
    if (chunk.length === 0) break;
  }
  return ids;
}

function summarizePending(
  summaries: Map<string, SectionInventorySummary>,
  sectionIds: string[]
): Pick<GenerateInventoryBatchResult, "seats_pending" | "images_pending" | "inventory_total"> {
  let seats_pending = 0;
  let images_pending = 0;
  let inventory_total = 0;
  for (const sid of sectionIds) {
    const s = summaries.get(sid);
    if (!s) continue;
    inventory_total += s.inventory_count;
    seats_pending += Math.max(0, s.seats_count - s.inventory_count);
    images_pending += Math.max(0, s.inventory_count - s.images_count);
  }
  return { seats_pending, images_pending, inventory_total };
}

/**
 * One bounded batch: ensure up to {@link TICKET_INVENTORY_ENSURE_SEAT_BATCH} missing inventory
 * rows, or render up to {@link TICKET_INVENTORY_IMAGE_BATCH_SIZE} ticket images when inventory
 * is complete. Call repeatedly until `complete` is true.
 */
export async function generateNextTicketInventoryBatch(
  admin: AdminSupabaseClient,
  eventId: string,
  sectionIds: string[],
  options?: { generate_images?: boolean }
): Promise<GenerateInventoryBatchResult> {
  const uniqueSectionIds = [...new Set(sectionIds.filter(Boolean))];
  const generate_images = options?.generate_images !== false;

  if (uniqueSectionIds.length === 0) {
    return {
      created: 0,
      existing: 0,
      skipped_allocated: 0,
      images_generated: 0,
      images_failed: 0,
      ensure_seats_processed: 0,
      complete: true,
      seats_pending: 0,
      images_pending: 0,
      inventory_total: 0,
    };
  }

  const summaries = await getEventInventorySummaries(admin, eventId, uniqueSectionIds);
  const pendingBefore = summarizePending(summaries, uniqueSectionIds);

  let created = 0;
  let existing = 0;
  let skipped_allocated = 0;
  let ensure_seats_processed = 0;
  let images_generated = 0;
  let images_failed = 0;

  if (pendingBefore.seats_pending > 0) {
    const seatIds = await findSeatIdsMissingInventory(
      admin,
      eventId,
      uniqueSectionIds,
      TICKET_INVENTORY_ENSURE_SEAT_BATCH
    );
    if (seatIds.length > 0) {
      const ensured = await ensureInventoryForSeats(admin, eventId, seatIds);
      created = ensured.created;
      existing = ensured.existing;
      skipped_allocated = ensured.skipped_allocated;
      ensure_seats_processed = seatIds.length;
    }
  } else if (generate_images && pendingBefore.images_pending > 0) {
    const printIds = await findPrintTicketIdsMissingImages(
      admin,
      eventId,
      uniqueSectionIds,
      TICKET_INVENTORY_IMAGE_BATCH_SIZE
    );
    if (printIds.length > 0) {
      const img = await generateInventoryImages(admin, printIds);
      images_generated = img.images_generated;
      images_failed = img.failed;
    }
  }

  const summariesAfter = await getEventInventorySummaries(admin, eventId, uniqueSectionIds);
  const pendingAfter = summarizePending(summariesAfter, uniqueSectionIds);
  const complete =
    pendingAfter.seats_pending === 0 &&
    (!generate_images || pendingAfter.images_pending === 0);

  return {
    created,
    existing,
    skipped_allocated,
    images_generated,
    images_failed,
    ensure_seats_processed,
    complete,
    ...pendingAfter,
  };
}
