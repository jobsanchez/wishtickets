import type { SupabaseClient } from "@supabase/supabase-js";
import { generateTicketImageForPrint } from "@/lib/ticket-image";
import { loadPngBufferFromUrl } from "@/lib/print-tickets/load-png-from-url";
import type { PrintTicketEmailRow } from "@/lib/print-tickets/run-print-tickets-email-from-rows";

/**
 * Ensure a print ticket has an image URL, then load the PNG bytes (same path as bulk email send).
 */
export async function loadPrintTicketEmailPngBuffer(
  supabase: SupabaseClient,
  row: PrintTicketEmailRow
): Promise<Buffer> {
  let ticketImageUrl = row.ticket_image_url;
  if (!ticketImageUrl) {
    const slot =
      row.event_seat_id == null ? Math.max(1, Math.floor(row.section_slot_index ?? 1)) : undefined;
    const url = await generateTicketImageForPrint({
      eventId: row.event_id,
      eventSectionId: row.event_section_id,
      eventSeatId: row.event_seat_id,
      printTicketId: row.id,
      qrData: row.encrypted_qr ?? undefined,
      ticketNumberData: row.qr_data ?? undefined,
      sectionSlotIndex: slot,
    });
    if (url) {
      await supabase.from("print_tickets").update({ ticket_image_url: url }).eq("id", row.id);
      ticketImageUrl = url;
      row.ticket_image_url = url;
    }
  }
  if (ticketImageUrl) {
    const fromStorage = await loadPngBufferFromUrl(ticketImageUrl);
    if (fromStorage) return fromStorage;
  }
  throw new Error(`Could not load PNG for print ticket ${row.id}`);
}
