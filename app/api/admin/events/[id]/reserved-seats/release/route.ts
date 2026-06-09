import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";
import { releaseFailedBooking } from "@/lib/release-failed-booking";
import { confirmBookingStatusOnly } from "@/lib/confirm-booking";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const denied = await forbiddenUnlessEventSection(eventId, "reservedSeats");
  if (denied) return denied;

  let body: {
    seat_id?: string;
    section_id?: string;
    reservation_item_id?: string;
    booking_id?: string;
    mark_sold_booking_id?: string;
    release_all_pending_bookings?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    seat_id,
    section_id,
    reservation_item_id,
    booking_id,
    mark_sold_booking_id,
    release_all_pending_bookings,
  } = body;
  const populated =
    Number(Boolean(seat_id)) +
    Number(Boolean(section_id)) +
    Number(Boolean(reservation_item_id)) +
    Number(Boolean(booking_id)) +
    Number(Boolean(mark_sold_booking_id)) +
    Number(Boolean(release_all_pending_bookings));
  if (populated === 0) {
    return NextResponse.json(
      {
        error:
          "Provide one of seat_id, section_id, reservation_item_id, booking_id, mark_sold_booking_id, or release_all_pending_bookings",
      },
      { status: 400 }
    );
  }
  if (populated > 1) {
    return NextResponse.json(
      { error: "Provide only one release target at a time" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  if (release_all_pending_bookings) {
    const { data: pendingBookings } = await supabase
      .from("bookings")
      .select("id")
      .eq("event_id", eventId)
      .eq("status", "pending");
    const bookingIds = (pendingBookings ?? []).map((b) => b.id);
    if (bookingIds.length === 0) {
      return NextResponse.json({ success: true, released: 0 });
    }
    let released = 0;
    for (const bId of bookingIds) {
      await releaseFailedBooking(supabase, bId);
      await supabase.from("bookings").update({ status: "failed" }).eq("id", bId);
      await supabase
        .from("payments")
        .update({ status: "failed" })
        .eq("booking_id", bId)
        .eq("status", "pending");
      released += 1;
    }
    return NextResponse.json({ success: true, released });
  }

  if (booking_id) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", booking_id)
      .eq("event_id", eventId)
      .eq("status", "pending")
      .maybeSingle();
    if (!booking) {
      return NextResponse.json({ error: "Pending booking hold not found" }, { status: 404 });
    }
    await releaseFailedBooking(supabase, booking_id);
    await supabase.from("bookings").update({ status: "failed" }).eq("id", booking_id);
    await supabase
      .from("payments")
      .update({ status: "failed" })
      .eq("booking_id", booking_id)
      .eq("status", "pending");
    return NextResponse.json({ success: true, released: 1 });
  }

  if (mark_sold_booking_id) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", mark_sold_booking_id)
      .eq("event_id", eventId)
      .eq("status", "pending")
      .maybeSingle();
    if (!booking) {
      return NextResponse.json({ error: "Pending booking not found" }, { status: 404 });
    }

    const confirmed = await confirmBookingStatusOnly(supabase, mark_sold_booking_id);
    if (!confirmed) {
      return NextResponse.json({ error: "Failed to mark booking as sold" }, { status: 500 });
    }

    return NextResponse.json({ success: true, marked_sold: 1 });
  }

  if (reservation_item_id) {
    const now = new Date().toISOString();
    const { data: hold } = await supabase
      .from("reservation_items")
      .select("id, cart_id, seat_id, reservation_carts!inner(id, event_id, expires_at)")
      .eq("id", reservation_item_id)
      .not("seat_id", "is", null)
      .eq("reservation_carts.event_id", eventId)
      .gt("reservation_carts.expires_at", now)
      .maybeSingle();

    if (!hold) {
      return NextResponse.json({ error: "Active cart hold not found" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("reservation_items")
      .delete()
      .eq("id", reservation_item_id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, released: 1 });
  }

  let seatIds: string[];

  if (seat_id) {
    const { data: seat } = await supabase
      .from("event_seats")
      .select("id")
      .eq("id", seat_id)
      .eq("event_id", eventId)
      .single();
    if (!seat) {
      return NextResponse.json({ error: "Seat not found" }, { status: 404 });
    }
    seatIds = [seat_id];
  } else {
    const { data: seats } = await supabase
      .from("event_seats")
      .select("id")
      .eq("event_id", eventId)
      .eq("event_section_id", section_id!)
      .or("status.eq.reserved,assignment_id.not.is.null");
    seatIds = (seats ?? []).map((s) => s.id);
  }

  if (seatIds.length === 0) {
    return NextResponse.json({ success: true, released: 0 });
  }

  const { error: seatsError } = await supabase
    .from("event_seats")
    .update({ status: "available", assignment_id: null })
    .in("id", seatIds);

  if (seatsError) {
    return NextResponse.json({ error: seatsError.message }, { status: 500 });
  }

  await supabase
    .from("admin_assignment_items")
    .delete()
    .in("seat_id", seatIds);

  return NextResponse.json({ success: true, released: seatIds.length });
}
