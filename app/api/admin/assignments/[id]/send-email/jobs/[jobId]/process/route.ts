import { getAdminClientIfAvailable } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";
import { runManualAssignmentEmailChunkForJob } from "@/lib/manual-assignment-email/run-manual-assignment-email-chunk-for-job";

export const dynamic = "force-dynamic";
/** One job can build many signed ZIP links + SMTP; large manual sends need more than default. */
export const maxDuration = 300;

async function canManageAssignments() {
  const role = await getProfileRole();
  if (role === "super_admin" || role === "admin" || role === "admissions_staff")
    return true;
  const userId = await getCurrentUserId();
  if (!userId) return false;
  return (
    hasCapability(userId, "manage_seats") ||
    hasCapability(userId, "manage_assignments")
  );
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  if (!(await canManageAssignments())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAdminClientIfAvailable();
  if (!admin) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY (needed to upload ZIPs and lock jobs)." },
      { status: 503 }
    );
  }

  const { id: assignmentId, jobId } = await params;

  const { data: row, error: loadErr } = await admin
    .from("manual_assignment_email_jobs")
    .select(
      "id, assignment_id, created_by, status, cursor, chunks_completed, error_message, ticket_ids, created_at, updated_at"
    )
    .eq("id", jobId)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.assignment_id !== assignmentId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.created_by !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const terminal =
    row.status === "completed" || row.status === "failed" || row.status === "cancelled";

  if (!terminal) {
    const work = await runManualAssignmentEmailChunkForJob(admin, jobId, userId);
    if (work.lockError) {
      console.error("[assignments/send-email/process]", work.lockError);
      return NextResponse.json({ error: work.lockError }, { status: 500 });
    }
  }

  const { data: after, error: afterErr } = await admin
    .from("manual_assignment_email_jobs")
    .select(
      "id, status, cursor, chunks_completed, error_message, ticket_ids, created_at, updated_at"
    )
    .eq("id", jobId)
    .maybeSingle();

  if (afterErr || !after) {
    return NextResponse.json(
      { error: afterErr?.message ?? "Could not reload job" },
      { status: 500 }
    );
  }

  const ids = Array.isArray(after.ticket_ids) ? (after.ticket_ids as string[]) : [];
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
