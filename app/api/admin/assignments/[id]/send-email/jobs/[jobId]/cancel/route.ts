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

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  if (!(await canManageAssignments())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: assignmentId, jobId } = await params;
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("manual_assignment_email_jobs")
    .select("id, assignment_id")
    .eq("id", jobId)
    .maybeSingle();

  if (!row || row.assignment_id !== assignmentId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("manual_assignment_email_jobs")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Job not found, not yours, or already started/completed." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, jobId: data.id, status: "cancelled" });
}
