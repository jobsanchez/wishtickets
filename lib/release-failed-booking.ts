import type { SupabaseClient } from "@supabase/supabase-js";

/** Release seats and delete tickets for a failed booking. Call when payment fails. */
export async function releaseFailedBooking(
  supabase: SupabaseClient,
  bookingId: string
): Promise<void> {
  const { data: tickets, error: ticketSelectError } = await supabase
    .from("tickets")
    .select("seat_id")
    .eq("booking_id", bookingId)
    .not("seat_id", "is", null);
  if (ticketSelectError) {
    throw new Error(`Failed to read tickets for release: ${ticketSelectError.message}`);
  }

  const seatIds = [...new Set((tickets ?? []).map((t) => t.seat_id).filter(Boolean))];

  const { error: ticketDeleteError } = await supabase
    .from("tickets")
    .delete()
    .eq("booking_id", bookingId);
  if (ticketDeleteError) {
    throw new Error(`Failed to delete tickets during release: ${ticketDeleteError.message}`);
  }

  // Release seats referenced by ticket rows (normal path).
  if (seatIds.length > 0) {
    const { error: seatReleaseError } = await supabase
      .from("event_seats")
      .update({
        status: "available",
        assignment_id: null,
      })
      .in("id", seatIds);
    if (seatReleaseError) {
      throw new Error(`Failed to release seats: ${seatReleaseError.message}`);
    }
  }

  // Safety net: release any seats still linked to this booking_id,
  // even if ticket rows were missing or already cleaned.
  const { error: bookingSeatReleaseError } = await supabase
    .from("event_seats")
    .update({
      status: "available",
      assignment_id: null,
    })
    .eq("booking_id", bookingId);
  if (bookingSeatReleaseError) {
    const msg = bookingSeatReleaseError.message ?? "";
    // Some environments do not have event_seats.booking_id yet.
    // Do not fail cancellation in that case; ticket-linked release above still runs.
    if (!/booking_id/i.test(msg)) {
      throw new Error(
        `Failed to release booking-linked seats: ${bookingSeatReleaseError.message}`
      );
    }
  }
}
