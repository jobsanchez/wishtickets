import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateQRBuffer } from "@/lib/qr";
import { resolveTicketImageUrl } from "@/lib/ticket-inventory";
import { loadPngBufferFromUrl } from "@/lib/print-tickets/load-png-from-url";

export type BookingTicketPngRow = {
  id: string;
  qr_data: string | null;
  encrypted_qr?: string | null;
  ticket_image_url: string | null;
  print_ticket_id?: string | null;
};

export async function loadBookingTicketPngBuffer(t: BookingTicketPngRow): Promise<Buffer> {
  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Ticket images require the service role (${msg}).`);
  }

  const ticketImageUrl =
    (await resolveTicketImageUrl(admin, t, { generateIfMissing: false })) ??
    t.ticket_image_url?.trim() ??
    null;

  if (!ticketImageUrl) {
    throw new Error(
      `Ticket ${t.id} has no image — generate tickets in Seat Configurator before emailing or zipping.`
    );
  }

  const fromStorage = await loadPngBufferFromUrl(ticketImageUrl);
  if (fromStorage) return fromStorage;

  const qrPayload = t.encrypted_qr ?? t.qr_data ?? "";
  if (qrPayload) return generateQRBuffer(qrPayload);

  throw new Error(`Ticket ${t.id}: could not load image from Seat Configurator inventory.`);
}
