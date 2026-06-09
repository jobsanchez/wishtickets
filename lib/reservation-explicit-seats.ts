import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Validates that explicit seat picks can be placed on the given cart for the event:
 * seats must belong to the event, not sold, not admin-reserved, and not held by another active cart.
 */
export async function validateExplicitSeatsForReservation(
  supabase: SupabaseClient,
  eventId: string,
  excludeCartId: string,
  seatIds: string[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const unique = [...new Set(seatIds.filter(Boolean))];
  if (unique.length === 0) {
    return { ok: true };
  }

  const now = new Date().toISOString();

  const { data: seatRows, error: seatErr } = await supabase
    .from("event_seats")
    .select("id")
    .eq("event_id", eventId)
    .in("id", unique);

  if (seatErr) {
    return { ok: false, message: seatErr.message ?? "Failed to validate seats" };
  }

  const found = new Set((seatRows ?? []).map((r) => r.id as string));
  for (const sid of unique) {
    if (!found.has(sid)) {
      return {
        ok: false,
        message: "One or more seats are not valid for this event.",
      };
    }
  }

  const { data: bookingIds } = await supabase
    .from("bookings")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "confirmed");
  const bidList = (bookingIds ?? []).map((b) => b.id);

  if (bidList.length > 0) {
    const { data: tk } = await supabase
      .from("tickets")
      .select("seat_id")
      .in("booking_id", bidList)
      .in("seat_id", unique)
      .not("seat_id", "is", null);
    if ((tk ?? []).length > 0) {
      return {
        ok: false,
        message: "One or more seats are already sold.",
      };
    }
  }

  const { data: activeCarts } = await supabase
    .from("reservation_carts")
    .select("id")
    .eq("event_id", eventId)
    .gt("expires_at", now);
  const otherCartIds = (activeCarts ?? [])
    .map((c) => c.id)
    .filter((id) => id !== excludeCartId);

  if (otherCartIds.length > 0) {
    const { data: taken } = await supabase
      .from("reservation_items")
      .select("seat_id")
      .in("cart_id", otherCartIds)
      .in("seat_id", unique)
      .not("seat_id", "is", null);
    if ((taken ?? []).length > 0) {
      return {
        ok: false,
        message: "One or more seats are held by another cart. Refresh and try again.",
      };
    }
  }

  const { data: adminReserved } = await supabase
    .from("event_seats")
    .select("id")
    .eq("event_id", eventId)
    .in("id", unique)
    .or("assignment_id.not.is.null,status.eq.reserved,status.eq.hold,status.eq.sold");

  if ((adminReserved ?? []).length > 0) {
    return {
      ok: false,
      message: "One or more seats are reserved by the venue.",
    };
  }

  return { ok: true };
}
