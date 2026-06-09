import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";

async function canManageAssignments() {
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
  const { id: assignmentId } = await params;
  if (!(await canManageAssignments())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  const { data: assignment, error: assignError } = await supabase
    .from("admin_seat_assignments")
    .select("id, event_id, status, booking_id")
    .eq("id", assignmentId)
    .single();

  if (assignError || !assignment || assignment.status !== "confirmed") {
    return NextResponse.json(
      { error: "Manual distribution not found or not confirmed" },
      { status: 400 }
    );
  }

  const bookingId = assignment.booking_id;
  if (!bookingId) {
    return NextResponse.json(
      { error: "Manual distribution has no linked booking" },
      { status: 400 }
    );
  }

  const { data: tickets } = await supabase
    .from("tickets")
    .select("id, seat_id")
    .eq("booking_id", bookingId);
  const ticketRows = (tickets ?? []) as { id: string; seat_id: string | null }[];
  const ticketIds = ticketRows.map((t) => t.id);
  const seatIds = ticketRows
    .filter((t): t is { id: string; seat_id: string } => t.seat_id != null)
    .map((t) => t.seat_id);

  if (ticketIds.length > 0) {
    const { error: admissionsError } = await supabase
      .from("admission_records")
      .delete()
      .in("ticket_id", ticketIds);
    if (admissionsError) {
      return NextResponse.json(
        { error: admissionsError.message ?? "Failed to delete admission records" },
        { status: 500 }
      );
    }
  }

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

  const { error: promoError } = await supabase
    .from("booking_promo_codes")
    .delete()
    .eq("booking_id", bookingId);

  if (promoError) {
    return NextResponse.json(
      { error: promoError.message ?? "Failed to delete booking promos" },
      { status: 500 }
    );
  }

  const { error: updateError } = await supabase
    .from("admin_seat_assignments")
    .update({ status: "reserved", booking_id: null })
    .eq("id", assignmentId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message ?? "Failed to reverse manual distribution" },
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

  if (seatIds.length > 0) {
    const { error: seatsError } = await supabase
      .from("event_seats")
      .update({ status: "reserved", assignment_id: assignmentId })
      .in("id", seatIds);

    if (seatsError) {
      return NextResponse.json(
        { error: seatsError.message ?? "Failed to restore seats to reserved" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true });
}
