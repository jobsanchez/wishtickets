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

export type RunPrintTicketEmailChunkForJobResult = {
  /** True if an email chunk was sent (or job was advanced). */
  didProcess: boolean;
  lockError?: string;
};

/**
 * Lock one job row (by id + creator) and process a single chunk. Used by the browser-driven worker.
 */
export async function runPrintTicketEmailChunkForJob(
  admin: SupabaseClient,
  jobId: string,
  creatorUserId: string
): Promise<RunPrintTicketEmailChunkForJobResult> {
  const { data, error } = await admin.rpc("lock_print_ticket_email_job_by_id_for_creator", {
    p_job_id: jobId,
    p_user_id: creatorUserId,
  });

  if (error) {
    return { didProcess: false, lockError: error.message };
  }

  const rows = normalizeRpcJobRows(data);
  if (rows.length === 0) {
    return { didProcess: false };
  }

  const job = rows[0]!;
  if (job.status === "cancelled") {
    return { didProcess: false };
  }

  await processPrintTicketEmailJobChunk(admin, job);
  return { didProcess: true };
}
