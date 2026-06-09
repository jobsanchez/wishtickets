import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";

export const dynamic = "force-dynamic";

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  if (!(await canManageAssignments())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: assignmentId, jobId } = await params;
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("manual_assignment_email_jobs")
    .select(
      "id, assignment_id, status, cursor, chunks_completed, error_message, ticket_ids, created_at, updated_at"
    )
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.assignment_id !== assignmentId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ids = Array.isArray(row.ticket_ids) ? (row.ticket_ids as string[]) : [];
  const total = ids.length;

  return NextResponse.json({
    jobId: row.id,
    status: row.status,
    cursor: row.cursor,
    total,
    chunksCompleted: row.chunks_completed,
    errorMessage: row.error_message ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
