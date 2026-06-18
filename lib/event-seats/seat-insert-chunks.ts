import type { SupabaseClient } from "@supabase/supabase-js";

/** Rows per PostgREST insert — matches section duplicate route. */
export const EVENT_SEAT_INSERT_CHUNK = 500;

const SCAN_CODE_PAGE_SIZE = 1000;

/**
 * Loads every scan_code for an event except one section (paginated past PostgREST 1000-row default).
 */
export async function fetchAllEventScanCodesExceptSection(
  supabase: SupabaseClient,
  eventId: string,
  excludeSectionId: string
): Promise<Set<string>> {
  const usedCodes = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("event_seats")
      .select("scan_code")
      .eq("event_id", eventId)
      .neq("event_section_id", excludeSectionId)
      .range(from, from + SCAN_CODE_PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
      if (row.scan_code) usedCodes.add(row.scan_code);
    }
    if (rows.length < SCAN_CODE_PAGE_SIZE) break;
    from += SCAN_CODE_PAGE_SIZE;
  }
  return usedCodes;
}

/**
 * Inserts event seat rows in chunks to avoid PostgREST payload / timeout limits.
 */
export async function insertEventSeatsInChunks<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  rows: T[]
): Promise<{ error: { message: string } | null }> {
  for (let i = 0; i < rows.length; i += EVENT_SEAT_INSERT_CHUNK) {
    const slice = rows.slice(i, i + EVENT_SEAT_INSERT_CHUNK);
    const { error } = await supabase.from("event_seats").insert(slice);
    if (error) {
      return { error: { message: error.message } };
    }
  }
  return { error: null };
}
