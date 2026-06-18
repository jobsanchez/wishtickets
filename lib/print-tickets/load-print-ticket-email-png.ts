import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPngBufferFromUrl } from "@/lib/print-tickets/load-png-from-url";
import type { PrintTicketEmailRow } from "@/lib/print-tickets/run-print-tickets-email-from-rows";

/**
 * Load PNG bytes for a print ticket that already has an image from Seat Configurator inventory.
 */
export async function loadPrintTicketEmailPngBuffer(
  _supabase: SupabaseClient,
  row: PrintTicketEmailRow
): Promise<Buffer> {
  const ticketImageUrl = row.ticket_image_url?.trim();
  if (!ticketImageUrl) {
    throw new Error(
      `Print ticket ${row.id} has no image — generate ticket inventory in Seat Configurator first.`
    );
  }

  const fromStorage = await loadPngBufferFromUrl(ticketImageUrl);
  if (fromStorage) return fromStorage;

  throw new Error(
    `Could not load PNG for print ticket ${row.id} from Seat Configurator inventory.`
  );
}
