import type { SupabaseClient } from "@supabase/supabase-js";
import {
  processManualAssignmentEmailJobChunk,
  type ManualAssignmentEmailJobRow,
} from "@/lib/manual-assignment-email/manual-assignment-email-job-worker";

function normalizeRpcJobRows(data: unknown): ManualAssignmentEmailJobRow[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data as ManualAssignmentEmailJobRow[];
  return [data as ManualAssignmentEmailJobRow];
}

export type RunManualAssignmentEmailChunkForJobResult = {
  didProcess: boolean;
  lockError?: string;
};

export async function runManualAssignmentEmailChunkForJob(
  admin: SupabaseClient,
  jobId: string,
  creatorUserId: string
): Promise<RunManualAssignmentEmailChunkForJobResult> {
  const { data, error } = await admin.rpc("lock_manual_assignment_email_job_by_id_for_creator", {
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

  await processManualAssignmentEmailJobChunk(admin, job);
  return { didProcess: true };
}
