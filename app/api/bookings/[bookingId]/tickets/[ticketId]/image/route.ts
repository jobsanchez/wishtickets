import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import {
  generateTicketImageForTicketId,
  ticketImageContentTypeFromUrl,
} from "@/lib/ticket-image";

/** Minimum expected size for a full ticket image (base-only or corrupt are typically < 60KB). */
const MIN_VALID_SIZE_BYTES = 60_000;

/**
 * Serves ticket image for a confirmed booking. Verifies ticket belongs to booking.
 * Regenerates if stored image is missing or suspiciously small (base-only/corrupt).
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
    .select("id, ticket_image_url, booking_id")
    .eq("id", ticketId)
    .eq("booking_id", bookingId)
    .single();

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  let url = ticket.ticket_image_url;

  // Check if we need to regenerate (missing or potentially base-only)
  if (url) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength < MIN_VALID_SIZE_BYTES) {
          // Suspiciously small - likely base-only, regenerate
          const regenerated = await generateTicketImageForTicketId(ticketId);
          url = regenerated ?? url;
        }
      } else {
        // Fetch failed, regenerate
        const regenerated = await generateTicketImageForTicketId(ticketId);
        url = regenerated ?? url;
      }
    } catch {
      // Fetch error, try regenerate
      const regenerated = await generateTicketImageForTicketId(ticketId);
      url = regenerated ?? url;
    }
  }

  if (!url) {
    url = await generateTicketImageForTicketId(ticketId);
  }

  if (!url) {
    return NextResponse.json({ error: "Could not generate ticket image" }, { status: 500 });
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to load ticket image" }, { status: 502 });
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const headerCt = res.headers.get("content-type");
    const contentType =
      headerCt && headerCt.trim().length > 0
        ? headerCt
        : ticketImageContentTypeFromUrl(url);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    console.warn("[ticket-image] Fetch failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed to load ticket image" }, { status: 502 });
  }
}
