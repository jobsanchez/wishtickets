import type { SupabaseClient } from "@supabase/supabase-js";

/** PostgREST puts `.in()` filters on the query string; large lists return 400 Bad Request. */
const IN_CHUNK_SIZE = 100;

function chunkIds<T>(ids: T[], size: number): T[][] {
  if (ids.length <= size) return ids.length ? [ids] : [];
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}

/**
 * Reconciles non-hold/non-assignment seat states for an event:
 * - Releases orphan `reserved` seats not backed by active carts or valid bookings.
 * - Fixes stale `sold` seats that are not from confirmed bookings.
 *
 * Backing sources:
 * - active reservation carts
 * - confirmed bookings (tickets)
 * - valid pending bookings (latest payment still pending and unexpired)
 * - admin assignment locks
 */
export async function cleanupOrphanReservedSeatsForEvent(
  supabase: SupabaseClient,
  eventId: string
): Promise<{
  releasedOrphanReservedCount: number;
  soldToReservedCount: number;
  soldToAvailableCount: number;
}> {
  const nowIso = new Date().toISOString();

  const { data: reservedRows, error: reservedError } = await supabase
    .from("event_seats")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "reserved")
    .is("assignment_id", null);
  if (reservedError) {
    throw new Error(`Failed to load reserved seats for cleanup: ${reservedError.message}`);
  }
  const reservedSeatIds = (reservedRows ?? []).map((r) => r.id);

  const { data: soldRows, error: soldError } = await supabase
    .from("event_seats")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "sold")
    .is("assignment_id", null);
  if (soldError) {
    throw new Error(`Failed to load sold seats for cleanup: ${soldError.message}`);
  }
  const soldSeatIds = (soldRows ?? []).map((r) => r.id);
  if (reservedSeatIds.length === 0 && soldSeatIds.length === 0) {
    return {
      releasedOrphanReservedCount: 0,
      soldToReservedCount: 0,
      soldToAvailableCount: 0,
    };
  }

  const { data: activeCarts, error: cartsError } = await supabase
    .from("reservation_carts")
    .select("id")
    .eq("event_id", eventId)
    .gt("expires_at", nowIso);
  if (cartsError) {
    throw new Error(`Failed to load active carts for cleanup: ${cartsError.message}`);
  }
  const activeCartIds = (activeCarts ?? []).map((c) => c.id);

  const activeCartSeatIds: string[] = [];
  if (activeCartIds.length > 0) {
    const batches = chunkIds(activeCartIds, IN_CHUNK_SIZE);
    for (const batch of batches) {
      const { data: activeItems, error: activeItemsError } = await supabase
        .from("reservation_items")
        .select("seat_id")
        .in("cart_id", batch)
        .not("seat_id", "is", null);
      if (activeItemsError) {
        throw new Error(`Failed to load active cart seats for cleanup: ${activeItemsError.message}`);
      }
      activeCartSeatIds.push(...(activeItems ?? []).map((i) => i.seat_id as string));
    }
  }

  const [{ data: confirmedBookings, error: confirmedError }, { data: pendingBookings, error: pendingError }] =
    await Promise.all([
      supabase
        .from("bookings")
        .select("id")
        .eq("event_id", eventId)
        .eq("status", "confirmed"),
      supabase
        .from("bookings")
        .select("id")
        .eq("event_id", eventId)
        .eq("status", "pending"),
    ]);
  if (confirmedError) {
    throw new Error(`Failed to load confirmed bookings for cleanup: ${confirmedError.message}`);
  }
  if (pendingError) {
    throw new Error(`Failed to load pending bookings for cleanup: ${pendingError.message}`);
  }

  const confirmedBookingIds = (confirmedBookings ?? []).map((b) => b.id);
  const pendingBookingIds = (pendingBookings ?? []).map((b) => b.id);

  const validPendingBookingIds = new Set<string>();
  if (pendingBookingIds.length > 0) {
    const payments: {
      booking_id: string;
      status: string | null;
      expires_at: string | null;
      created_at: string | null;
    }[] = [];
    for (const batch of chunkIds(pendingBookingIds, IN_CHUNK_SIZE)) {
      const { data: rows, error: paymentsError } = await supabase
        .from("payments")
        .select("booking_id, status, expires_at, created_at")
        .in("booking_id", batch);
      if (paymentsError) {
        throw new Error(`Failed to load payments for cleanup: ${paymentsError.message}`);
      }
      payments.push(...(rows ?? []));
    }

    const latestByBooking = new Map<
      string,
      { status: string | null; expires_at: string | null; created_at: string | null }
    >();
    for (const p of payments) {
      const curr = latestByBooking.get(p.booking_id);
      const currTs = curr?.created_at ? new Date(curr.created_at).getTime() : 0;
      const nextTs = p.created_at ? new Date(p.created_at).getTime() : 0;
      if (!curr || nextTs >= currTs) {
        latestByBooking.set(p.booking_id, {
          status: p.status ?? null,
          expires_at: p.expires_at ?? null,
          created_at: p.created_at ?? null,
        });
      }
    }

    const nowMs = Date.now();
    for (const bookingId of pendingBookingIds) {
      const payment = latestByBooking.get(bookingId);
      if (!payment) continue;
      const status = (payment.status ?? "").toLowerCase();
      const notExpired =
        !payment.expires_at || new Date(payment.expires_at).getTime() > nowMs;
      if (status === "pending" && notExpired) {
        validPendingBookingIds.add(bookingId);
      }
    }
  }

  const confirmedBookingIdSet = new Set<string>(confirmedBookingIds);
  const protectedBookingIds = [
    ...confirmedBookingIds,
    ...Array.from(validPendingBookingIds),
  ];

  const confirmedTicketSeatIds: string[] = [];
  const validPendingTicketSeatIds: string[] = [];
  if (protectedBookingIds.length > 0) {
    for (const batch of chunkIds(protectedBookingIds, IN_CHUNK_SIZE)) {
      const { data: ticketRows, error: ticketRowsError } = await supabase
        .from("tickets")
        .select("seat_id, booking_id")
        .in("booking_id", batch)
        .not("seat_id", "is", null);
      if (ticketRowsError) {
        throw new Error(`Failed to load protected ticket seats for cleanup: ${ticketRowsError.message}`);
      }
      for (const row of ticketRows ?? []) {
        const seatId = row.seat_id as string;
        if (confirmedBookingIdSet.has(row.booking_id)) {
          confirmedTicketSeatIds.push(seatId);
        } else if (validPendingBookingIds.has(row.booking_id)) {
          validPendingTicketSeatIds.push(seatId);
        }
      }
    }
  }

  const protectedSeatIds = new Set<string>([
    ...activeCartSeatIds,
    ...confirmedTicketSeatIds,
    ...validPendingTicketSeatIds,
  ]);
  const orphanSeatIds = reservedSeatIds.filter((id) => !protectedSeatIds.has(id));
  let releasedOrphanReservedCount = 0;
  if (orphanSeatIds.length > 0) {
    for (const batch of chunkIds(orphanSeatIds, IN_CHUNK_SIZE)) {
      const { error: releaseError } = await supabase
        .from("event_seats")
        .update({ status: "available" })
        .in("id", batch)
        .eq("status", "reserved")
        .is("assignment_id", null);
      if (releaseError) {
        throw new Error(`Failed to release orphan reserved seats: ${releaseError.message}`);
      }
      releasedOrphanReservedCount += batch.length;
    }
  }

  // Correct stale sold seats:
  // - confirmed-ticket seats stay sold
  // - active-cart or valid-pending seats should be reserved
  // - everything else should be available
  const confirmedSeatSet = new Set<string>(confirmedTicketSeatIds);
  const reservedSeatSet = new Set<string>([
    ...activeCartSeatIds,
    ...validPendingTicketSeatIds,
  ]);
  const soldToReservedSeatIds: string[] = [];
  const soldToAvailableSeatIds: string[] = [];
  for (const seatId of soldSeatIds) {
    if (confirmedSeatSet.has(seatId)) continue;
    if (reservedSeatSet.has(seatId)) soldToReservedSeatIds.push(seatId);
    else soldToAvailableSeatIds.push(seatId);
  }

  if (soldToReservedSeatIds.length > 0) {
    for (const batch of chunkIds(soldToReservedSeatIds, IN_CHUNK_SIZE)) {
      const { error: toReservedError } = await supabase
        .from("event_seats")
        .update({ status: "reserved" })
        .in("id", batch)
        .eq("status", "sold")
        .is("assignment_id", null);
      if (toReservedError) {
        throw new Error(`Failed to downgrade stale sold seats to reserved: ${toReservedError.message}`);
      }
    }
  }

  if (soldToAvailableSeatIds.length > 0) {
    for (const batch of chunkIds(soldToAvailableSeatIds, IN_CHUNK_SIZE)) {
      const { error: toAvailableError } = await supabase
        .from("event_seats")
        .update({ status: "available" })
        .in("id", batch)
        .eq("status", "sold")
        .is("assignment_id", null);
      if (toAvailableError) {
        throw new Error(`Failed to release stale sold seats: ${toAvailableError.message}`);
      }
    }
  }

  return {
    releasedOrphanReservedCount,
    soldToReservedCount: soldToReservedSeatIds.length,
    soldToAvailableCount: soldToAvailableSeatIds.length,
  };
}

