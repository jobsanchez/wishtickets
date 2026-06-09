import type { SupabaseClient } from "@supabase/supabase-js";

/** Keep `.in("booking_id", …)` clauses within PostgREST URL limits. */
const BOOKING_ID_IN_CHUNK = 120;
/** PostgREST/Supabase default max rows per request is often 1000. */
const TICKETS_PAGE_SIZE = 1000;

/**
 * Loads every ticket row for the given bookings (chunked `in` + range pagination).
 * Required for accurate VSS / drilldown when an event has &gt;1000 tickets.
 */
export async function fetchAllTicketsForBookingIds(
  admin: SupabaseClient,
  bookingIds: string[],
  select: string
): Promise<Record<string, unknown>[]> {
  if (bookingIds.length === 0) return [];
  const all: Record<string, unknown>[] = [];
  for (let c = 0; c < bookingIds.length; c += BOOKING_ID_IN_CHUNK) {
    const slice = bookingIds.slice(c, c + BOOKING_ID_IN_CHUNK);
    let from = 0;
    for (;;) {
      const { data, error } = await admin
        .from("tickets")
        .select(select)
        .in("booking_id", slice)
        .range(from, from + TICKETS_PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      all.push(...rows);
      if (rows.length < TICKETS_PAGE_SIZE) break;
      from += TICKETS_PAGE_SIZE;
    }
  }
  return all;
}
