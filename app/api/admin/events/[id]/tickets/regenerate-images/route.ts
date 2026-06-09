import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";
import { generateTicketImageForTicketId } from "@/lib/ticket-image";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;

  const denied = await forbiddenUnlessEventSection(eventId, "ticketTemplate");
  if (denied) return denied;

  const admin = createAdminClient();

  const { data: bookings, error: bookingsError } = await admin
    .from("bookings")
    .select("id")
    .eq("event_id", eventId);

  if (bookingsError) {
    return NextResponse.json(
      { error: bookingsError.message },
      { status: 500 }
    );
  }

  const bookingIds = (bookings ?? []).map((b) => (b as { id: string }).id);
  if (bookingIds.length === 0) {
    return NextResponse.json({
      ok: true,
      regenerated: 0,
      message: "No bookings found for this event.",
    });
  }

  const { data: tickets, error: ticketsError } = await admin
    .from("tickets")
    .select("id")
    .in("booking_id", bookingIds);

  if (ticketsError) {
    return NextResponse.json(
      { error: ticketsError.message },
      { status: 500 }
    );
  }

  const ticketIds = (tickets ?? []).map((t) => (t as { id: string }).id);
  if (ticketIds.length === 0) {
    return NextResponse.json({
      ok: true,
      regenerated: 0,
      message: "No tickets found for this event.",
    });
  }

  let regenerated = 0;
  const failed: string[] = [];

  for (const ticketId of ticketIds) {
    try {
      const url = await generateTicketImageForTicketId(ticketId);
      if (url) {
        regenerated += 1;
      } else {
        failed.push(ticketId);
      }
    } catch (err) {
      console.error("[regenerate-ticket-images] failed for ticket", ticketId, err);
      failed.push(ticketId);
    }
  }

  return NextResponse.json({
    ok: true,
    eventId,
    regenerated,
    failedCount: failed.length,
    failedIds: failed.length > 0 ? failed : undefined,
  });
}

