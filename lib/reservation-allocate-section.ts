import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pick up to `quantity` available event_seats in a section (excludes sold, other carts, admin holds).
 * Shared by POST /api/reservations and admin flows that allocate seats.
 */
export async function allocateSeatsForSection(
  supabase: SupabaseClient,
  eventId: string,
  sectionId: string,
  quantity: number,
  excludeCartId: string | null
): Promise<{ seat_ids: string[]; error?: string }> {
  const { data: section } = await supabase
    .from("event_sections")
    .select("id")
    .eq("id", sectionId)
    .eq("event_id", eventId)
    .single();

  if (!section) {
    return { seat_ids: [], error: "Section not found" };
  }

  const { data: bookingIds } = await supabase
    .from("bookings")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "confirmed");
  const bidList = (bookingIds ?? []).map((b) => b.id);

  let bookedSeatIds: string[] = [];
  if (bidList.length > 0) {
    const { data: tk } = await supabase
      .from("tickets")
      .select("seat_id")
      .in("booking_id", bidList)
      .not("seat_id", "is", null);
    bookedSeatIds = (tk ?? []).map((t) => t.seat_id as string);
  }

  const { data: activeCarts } = await supabase
    .from("reservation_carts")
    .select("id")
    .eq("event_id", eventId)
    .gt("expires_at", new Date().toISOString());
  const cartIds = (activeCarts ?? [])
    .map((c) => c.id)
    .filter((id) => id !== excludeCartId);

  let reservedSeatIds: string[] = [];
  if (cartIds.length > 0) {
    const { data: ri } = await supabase
      .from("reservation_items")
      .select("seat_id")
      .in("cart_id", cartIds)
      .not("seat_id", "is", null);
    reservedSeatIds = (ri ?? []).map((r) => r.seat_id as string);
  }

  const { data: adminReserved } = await supabase
    .from("event_seats")
    .select("id")
    .eq("event_id", eventId)
    .eq("event_section_id", sectionId)
    .or("assignment_id.not.is.null,status.eq.reserved,status.eq.hold,status.eq.sold");
  const adminReservedIds = (adminReserved ?? []).map((s) => s.id);

  const taken = new Set([...bookedSeatIds, ...reservedSeatIds, ...adminReservedIds]);

  const { data: availableSeats } = await supabase
    .from("event_seats")
    .select("id")
    .eq("event_id", eventId)
    .eq("event_section_id", sectionId)
    .order("row_label")
    .order("seat_number")
    .limit(quantity + 100);

  const usable = (availableSeats ?? []).filter((s) => !taken.has(s.id)).slice(0, quantity);

  return { seat_ids: usable.map((s) => s.id) };
}
