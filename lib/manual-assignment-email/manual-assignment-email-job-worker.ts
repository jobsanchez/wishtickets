import type { SupabaseClient } from "@supabase/supabase-js";
import { sendManualAssignmentTicketsOneEmail } from "@/lib/manual-assignment-email/send-manual-assignment-ticket-batch";

export type ManualAssignmentEmailJobRow = {
  id: string;
  assignment_id: string;
  event_id: string;
  created_by: string;
  ticket_ids: string[] | unknown;
  cursor: number;
  status: string;
  chunks_completed: number;
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Completes a locked manual-assignment email job in one SMTP message (multiple ZIP links allowed).
 */
export async function processManualAssignmentEmailJobChunk(
  admin: SupabaseClient,
  job: ManualAssignmentEmailJobRow
): Promise<void> {
  const ticketIds = asStringArray(job.ticket_ids);
  const total = ticketIds.length;
  const cursor = Math.max(0, Math.floor(job.cursor ?? 0));

  if (total === 0) {
    await admin
      .from("manual_assignment_email_jobs")
      .update({
        status: "completed",
        error_message: null,
        last_activity_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", job.id);
    return;
  }

  if (cursor >= total) {
    await admin
      .from("manual_assignment_email_jobs")
      .update({
        status: "completed",
        last_activity_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", job.id);
    return;
  }

  if (cursor > 0 && cursor < total) {
    await admin
      .from("manual_assignment_email_jobs")
      .update({
        status: "failed",
        error_message:
          "Job cursor is mid-send; cancel this job and enqueue a new send (delivery is now a single email).",
        last_activity_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", job.id);
    return;
  }

  try {
    await sendManualAssignmentTicketsOneEmail(admin, {
      assignmentId: job.assignment_id,
      orderedTicketIds: ticketIds,
    });

    const nextChunks = Math.max(0, job.chunks_completed) + 1;

    await admin
      .from("manual_assignment_email_jobs")
      .update({
        cursor: total,
        chunks_completed: nextChunks,
        status: "completed",
        last_activity_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", job.id);

    const { data: assign } = await admin
      .from("admin_seat_assignments")
      .select("recipient_email, email_sent_count")
      .eq("id", job.assignment_id)
      .maybeSingle();
    const cur = (assign?.email_sent_count as number) ?? 0;
    await admin
      .from("admin_seat_assignments")
      .update({ email_sent_count: cur + 1 })
      .eq("id", job.assignment_id);

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send email";
    await admin
      .from("manual_assignment_email_jobs")
      .update({
        status: "failed",
        error_message: msg,
        last_activity_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", job.id);
  }
}
