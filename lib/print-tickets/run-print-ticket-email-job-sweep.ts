import type { SupabaseClient } from "@supabase/supabase-js";
import {
  processPrintTicketEmailJobChunk,
  type PrintTicketEmailJobRow,
} from "@/lib/print-tickets/print-email-job-worker";

function normalizeRpcJobRows(data: unknown): PrintTicketEmailJobRow[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data as PrintTicketEmailJobRow[];
  return [data as PrintTicketEmailJobRow];
}

export type PrintTicketEmailJobSweepResult = {
  chunksProcessed: number;
  elapsedMs: number;
  lockError?: string;
};

/**
 * Lock and process print-ticket email jobs until the time budget is exhausted or the queue is idle.
 * Used by `/api/cron/print-ticket-email-jobs` and an inline pass after enqueue.
 */
export async function runPrintTicketEmailJobSweep(
  admin: SupabaseClient,
  timeBudgetMs: number
): Promise<PrintTicketEmailJobSweepResult> {
  const t0 = Date.now();
  let chunks = 0;

  while (Date.now() - t0 < timeBudgetMs) {
    const { data, error } = await admin.rpc("lock_next_print_ticket_email_job");
    if (error) {
      return {
        chunksProcessed: chunks,
        elapsedMs: Date.now() - t0,
        lockError: error.message,
      };
    }
    const rows = normalizeRpcJobRows(data);
    if (rows.length === 0) break;

    const job = rows[0]!;
    if (job.status === "cancelled") break;

    await processPrintTicketEmailJobChunk(admin, job);
    chunks += 1;
  }

  return { chunksProcessed: chunks, elapsedMs: Date.now() - t0 };
}
