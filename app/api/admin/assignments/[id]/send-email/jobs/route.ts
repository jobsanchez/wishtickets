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

/** Enqueue chunked manual-distribution email; browser POSTs `.../jobs/{jobId}/process` on an interval. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await canManageAssignments())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: assignmentId } = await params;
  const supabase = await createClient();
  const actorUserId = await getCurrentUserId();
  if (!actorUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: assignment, error: assignError } = await supabase
    .from("admin_seat_assignments")
    .select("id, event_id, booking_id, status, recipient_email")
    .eq("id", assignmentId)
    .single();

  if (assignError || !assignment) {
    return NextResponse.json({ error: "Manual distribution not found" }, { status: 404 });
  }

  if (assignment.status !== "confirmed" || !assignment.booking_id) {
    return NextResponse.json(
      { error: "Manual distribution must be confirmed before sending email" },
      { status: 400 }
    );
  }

  if (!assignment.recipient_email?.trim()) {
    return NextResponse.json({ error: "Add recipient email first" }, { status: 400 });
  }

  const { data: tickets, error: ticketsError } = await supabase
    .from("tickets")
    .select("id")
    .eq("booking_id", assignment.booking_id)
    .order("id", { ascending: true });

  if (ticketsError) {
    return NextResponse.json({ error: ticketsError.message }, { status: 500 });
  }

  const ticketIds = (tickets ?? [])
    .map((t) => (t as { id: string }).id)
    .filter((id): id is string => typeof id === "string");

  if (ticketIds.length === 0) {
    return NextResponse.json(
      { error: "No tickets found for this manual distribution" },
      { status: 400 }
    );
  }

  const { data: inserted, error: insErr } = await supabase
    .from("manual_assignment_email_jobs")
    .insert({
      assignment_id: assignmentId,
      event_id: assignment.event_id,
      created_by: actorUserId,
      ticket_ids: ticketIds,
      cursor: 0,
      status: "pending",
      chunks_completed: 0,
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    console.error("[assignments/send-email/jobs] insert:", insErr);
    return NextResponse.json(
      { error: insErr?.message ?? "Failed to create job" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      jobId: inserted.id,
      totalTickets: ticketIds.length,
      message:
        "Job queued. This tab will send each batch while it stays open. Large sends may use ZIP download links and several emails.",
    },
    { status: 202 }
  );
}
