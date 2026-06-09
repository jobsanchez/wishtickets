import { generateQRBuffer } from "@/lib/qr";
import { generateTicketImageForTicketId } from "@/lib/ticket-image";
import { loadPngBufferFromUrl } from "@/lib/print-tickets/load-png-from-url";

export type BookingTicketPngRow = {
  id: string;
  qr_data: string | null;
  encrypted_qr?: string | null;
  ticket_image_url: string | null;
};

export async function loadBookingTicketPngBuffer(t: BookingTicketPngRow): Promise<Buffer> {
  let ticketImageUrl = t.ticket_image_url;
  if (!ticketImageUrl) {
    const generated = await generateTicketImageForTicketId(t.id);
    ticketImageUrl = generated ?? null;
  }
  const qrPayload = t.encrypted_qr ?? t.qr_data ?? "";
  if (ticketImageUrl) {
    const fromStorage = await loadPngBufferFromUrl(ticketImageUrl);
    return fromStorage ?? (await generateQRBuffer(qrPayload));
  }
  return generateQRBuffer(qrPayload);
}
