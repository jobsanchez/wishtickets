import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";

async function canRelease() {
  const role = await getProfileRole();
  if (role === "super_admin" || role === "admin" || role === "admissions_staff")
    return true;
  const userId = await getCurrentUserId();
  if (!userId) return false;
  return (
    hasCapability(userId, "manage_seats") ||
    hasCapability(userId, "manage_assignments")
  );
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;
  if (!(await canRelease())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  const { data: booking, error: bookError } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("id", bookingId)
    .single();

  if (bookError || !booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (booking.status !== "confirmed") {
    return NextResponse.json(
      { error: "Only confirmed bookings can be released" },
      { status: 400 }
    );
  }

  const { data: assignment } = await supabase
    .from("admin_seat_assignments")
    .select("id")
    .eq("booking_id", bookingId)
    .single();

  const { data: tickets } = await supabase
    .from("tickets")
    .select("seat_id")
    .eq("booking_id", bookingId);
  const ticketRows = (tickets ?? []) as { seat_id: string | null }[];
  const seatIds = ticketRows
    .filter((t): t is { seat_id: string } => t.seat_id != null)
    .map((t) => t.seat_id);

  const { error: ticketsError } = await supabase
    .from("tickets")
    .delete()
    .eq("booking_id", bookingId);

  if (ticketsError) {
    return NextResponse.json(
      { error: ticketsError.message ?? "Failed to delete tickets" },
      { status: 500 }
    );
  }

  const { error: paymentError } = await supabase
    .from("payments")
    .delete()
    .eq("booking_id", bookingId);

  if (paymentError) {
    return NextResponse.json(
      { error: paymentError.message ?? "Failed to delete payments" },
      { status: 500 }
    );
  }

  const { error: bookingError, count: deletedBookings } = await supabase
    .from("bookings")
    .delete({ count: "exact" })
    .eq("id", bookingId);

  if (bookingError) {
    return NextResponse.json(
      { error: bookingError.message ?? "Failed to delete booking" },
      { status: 500 }
    );
  }
  if ((deletedBookings ?? 0) < 1) {
    const { data: bookingStill } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingStill) {
      return NextResponse.json(
        {
          error:
            "Failed to delete booking (no rows removed). Check RLS policies for bookings, payments, or booking_promo_codes DELETE.",
        },
        { status: 500 }
      );
    }
  }

  if (assignment) {
    await supabase
      .from("admin_seat_assignments")
      .update({ status: "reserved", booking_id: null })
      .eq("id", assignment.id);

    if (seatIds.length > 0) {
      await supabase
        .from("event_seats")
        .update({ status: "reserved", assignment_id: assignment.id })
        .in("id", seatIds);
    }
  } else if (seatIds.length > 0) {
    await supabase
      .from("event_seats")
      .update({ status: "available" })
      .in("id", seatIds);
  }

  return NextResponse.json({ success: true });
}
