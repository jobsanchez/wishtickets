import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BULK_PRINT_ZIP_MAX_TICKETS_PER_PART,
  ZIP_BYTES_PER_FILE_SLOP,
  getZipPartUncompressedBudgetBytes,
} from "@/lib/print-tickets/bulk-zip-email";
import { loadBookingTicketPngBuffer } from "@/lib/manual-assignment-email/load-booking-ticket-png";

export type ManualDistTicketRow = {
  id: string;
  qr_data: string | null;
  encrypted_qr?: string | null;
  ticket_image_url: string | null;
  print_ticket_id?: string | null;
  seat_id: string | null;
  section_id: string | null;
  quantity: number | null;
};

export type BookingZipBudgetBatch = {
  ticketIds: string[];
  ticketRows: ManualDistTicketRow[];
  pngBuffers: Buffer[];
};

/**
 * From `orderedTicketIds[startIndex]`, load PNGs in order and return the longest prefix that fits
 * one ZIP part: uncompressed byte budget (default ~50 MiB) and at most `BULK_PRINT_ZIP_MAX_TICKETS_PER_PART` tickets.
 */
export async function collectNextBookingTicketsForZipBudget(
  supabase: SupabaseClient,
  opts: {
    bookingId: string;
    orderedTicketIds: readonly string[];
    startIndex: number;
    budgetBytes?: number;
  }
): Promise<BookingZipBudgetBatch> {
  const { bookingId, orderedTicketIds, startIndex } = opts;
  const budget = opts.budgetBytes ?? getZipPartUncompressedBudgetBytes();

  const remainingIds = orderedTicketIds.slice(Math.max(0, startIndex));
  if (remainingIds.length === 0) {
    return { ticketIds: [], ticketRows: [], pngBuffers: [] };
  }

  const { data: ticketsRaw, error } = await supabase
    .from("tickets")
    .select("id, qr_data, encrypted_qr, ticket_image_url, print_ticket_id, seat_id, section_id, quantity")
    .in("id", remainingIds)
    .eq("booking_id", bookingId);

  if (error) {
    throw new Error(error.message ?? "Failed to load tickets for batch sizing");
  }

  const byId = new Map(
    (ticketsRaw ?? []).map((t) => [(t as ManualDistTicketRow).id, t as ManualDistTicketRow])
  );

  const ticketIds: string[] = [];
  const ticketRows: ManualDistTicketRow[] = [];
  const pngBuffers: Buffer[] = [];
  let sum = 0;

  for (const id of remainingIds) {
    const row = byId.get(id);
    if (!row) continue;

    const buf = await loadBookingTicketPngBuffer(row);
    const need = buf.byteLength + ZIP_BYTES_PER_FILE_SLOP;

    if (need > budget) {
      if (ticketIds.length === 0) {
        ticketIds.push(id);
        ticketRows.push(row);
        pngBuffers.push(buf);
      }
      break;
    }

    if (sum + need > budget && ticketIds.length > 0) {
      break;
    }

    ticketIds.push(id);
    ticketRows.push(row);
    pngBuffers.push(buf);
    sum += need;

    if (ticketIds.length >= BULK_PRINT_ZIP_MAX_TICKETS_PER_PART) {
      break;
    }
  }

  return { ticketIds, ticketRows, pngBuffers };
}
