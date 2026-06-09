import { getAdminClientIfAvailable } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { forbiddenUnlessPrintTicketsBulkScope } from "@/lib/print-tickets/print-tickets-bulk-access";
import { runPrintTicketEmailChunkForJob } from "@/lib/print-tickets/run-print-ticket-email-chunk-for-job";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One browser tick: lock (if needed) and process at most one email chunk for this job. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAdminClientIfAvailable();
  if (!admin) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY (needed to send from this route)." },
      { status: 503 }
    );
  }

  const { jobId } = await params;

  const { data: row, error: loadErr } = await admin
    .from("print_ticket_email_jobs")
    .select(
      "id, event_id, created_by, status, cursor, chunks_completed, error_message, print_ticket_ids, created_at, updated_at"
    )
    .eq("id", jobId)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.created_by !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const eventId = (row as { event_id?: string }).event_id;
  if (typeof eventId === "string" && eventId.length > 0) {
    const scopeDenied = await forbiddenUnlessPrintTicketsBulkScope(eventId);
    if (scopeDenied) return scopeDenied;
  }

  const terminal = row.status === "completed" || row.status === "failed" || row.status === "cancelled";
  if (!terminal) {
    const work = await runPrintTicketEmailChunkForJob(admin, jobId, userId);
    if (work.lockError) {
      console.error("[jobs/process] chunk:", work.lockError);
      return NextResponse.json({ error: work.lockError }, { status: 500 });
    }
  }

  const { data: after, error: afterErr } = await admin
    .from("print_ticket_email_jobs")
    .select(
      "id, status, cursor, chunks_completed, error_message, print_ticket_ids, created_at, updated_at"
    )
    .eq("id", jobId)
    .maybeSingle();

  if (afterErr || !after) {
    return NextResponse.json(
      { error: afterErr?.message ?? "Could not reload job" },
      { status: 500 }
    );
  }

  const ids = Array.isArray(after.print_ticket_ids)
    ? (after.print_ticket_ids as string[])
    : [];
  const total = ids.length;

  return NextResponse.json({
    jobId: after.id,
    status: after.status,
    cursor: after.cursor,
    total,
    chunksCompleted: after.chunks_completed,
    errorMessage: after.error_message ?? null,
    createdAt: after.created_at,
    updatedAt: after.updated_at,
  });
}
