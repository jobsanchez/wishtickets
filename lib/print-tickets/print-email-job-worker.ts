import type { SupabaseClient } from "@supabase/supabase-js";
import {
  processPrintTicketEmailJobChunkWork,
  type PrintTicketEmailJobRow,
} from "@/lib/print-tickets/run-print-ticket-email-job-one-email";

export type { PrintTicketEmailJobRow };

/**
 * One tick: upload the next ZIP part (or send the single summary email when all parts are ready).
 */
export async function processPrintTicketEmailJobChunk(
  admin: SupabaseClient,
  job: PrintTicketEmailJobRow
): Promise<void> {
  await processPrintTicketEmailJobChunkWork(admin, job);
}
