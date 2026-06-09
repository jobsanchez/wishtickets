import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import {
  generateTicketImageForTicketId,
  ticketImageContentTypeFromUrl,
} from "@/lib/ticket-image";
import { resolveTicketImageUrl } from "@/lib/ticket-inventory";

/** Minimum expected size for a legacy per-ticket image (base-only or corrupt are typically < 60KB). */
const MIN_VALID_SIZE_BYTES = 60_000;

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Serves ticket image for a confirmed booking. Verifies ticket belongs to booking.
 * Inventory-backed tickets (`print_ticket_id`) reuse Seat Configurator / print pool PNGs.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bookingId: string; ticketId: string }> }
) {
  const { bookingId, ticketId } = await params;

  const supabase = createAdminClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("id", bookingId)
    .single();

  if (!booking || booking.status !== "confirmed") {
    return NextResponse.json({ error: "Booking not found or not confirmed" }, { status: 404 });
  }

  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, ticket_image_url, booking_id, print_ticket_id")
    .eq("id", ticketId)
    .eq("booking_id", bookingId)
    .single();

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const fromInventory = Boolean((ticket.print_ticket_id ?? "").trim());

  let url =
    (await resolveTicketImageUrl(supabase, ticket, { generateIfMissing: fromInventory })) ??
    ticket.ticket_image_url;

  if (!fromInventory) {
    if (url) {
      const buf = await fetchImageBuffer(url);
      if (!buf || buf.byteLength < MIN_VALID_SIZE_BYTES) {
        const regenerated = await generateTicketImageForTicketId(ticketId);
        url = regenerated ?? url;
      }
    } else {
      url = await generateTicketImageForTicketId(ticketId);
    }
  }

  if (!url) {
    return NextResponse.json({ error: "Could not resolve ticket image" }, { status: 500 });
  }

  const buffer = await fetchImageBuffer(url);
  if (!buffer) {
    return NextResponse.json({ error: "Failed to load ticket image" }, { status: 502 });
  }

  const contentType = ticketImageContentTypeFromUrl(url);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buffer.length),
      "Cache-Control": "public, max-age=300",
    },
  });
}
