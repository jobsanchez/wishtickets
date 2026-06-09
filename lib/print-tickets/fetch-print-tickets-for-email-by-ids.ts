import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrintTicketEmailRow } from "@/lib/print-tickets/run-print-tickets-email-from-rows";

const CHUNK = 200;

const PRINT_TICKET_EMAIL_SELECT =
  "id, event_id, event_section_id, event_seat_id, ticket_image_url, qr_data, encrypted_qr, section_slot_index";

/**
 * Load print ticket rows by id in chunks to avoid PostgREST / URL limits on huge `.in("id", [...])` lists.
 */
export async function fetchPrintTicketsForEmailByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<{ rows: PrintTicketEmailRow[]; error: string | null }> {
  if (ids.length === 0) return { rows: [], error: null };
  const rows: PrintTicketEmailRow[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("print_tickets")
      .select(PRINT_TICKET_EMAIL_SELECT)
      .in("id", slice);
    if (error) return { rows: [], error: error.message };
    rows.push(...((data ?? []) as PrintTicketEmailRow[]));
  }
  return { rows, error: null };
}
