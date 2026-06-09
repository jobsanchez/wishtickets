import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";
import { sendManualAssignmentTicketsOneEmail } from "@/lib/manual-assignment-email/send-manual-assignment-ticket-batch";

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

/**
 * One-shot send (all batches in this request). Prefer `POST …/send-email/jobs` + browser `…/process`
 * for large distributions to avoid timeouts.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: assignmentId } = await params;
  if (!(await canManageAssignments())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  const { data: assignment, error: assignError } = await supabase
    .from("admin_seat_assignments")
    .select("id, recipient_name, recipient_email, booking_id, event_id, status, email_sent_count")
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

  const email = assignment.recipient_email?.trim();
  if (!email) {
    return NextResponse.json({ error: "Add recipient email first" }, { status: 400 });
  }

  const { data: tickets, error: ticketsListErr } = await supabase
    .from("tickets")
    .select("id")
    .eq("booking_id", assignment.booking_id)
    .order("id", { ascending: true });

  if (ticketsListErr) {
    return NextResponse.json({ error: ticketsListErr.message }, { status: 500 });
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

  try {
    await sendManualAssignmentTicketsOneEmail(supabase, {
      assignmentId,
      orderedTicketIds: ticketIds,
    });

    const currentCount = (assignment as { email_sent_count?: number }).email_sent_count ?? 0;
    await supabase
      .from("admin_seat_assignments")
      .update({ email_sent_count: currentCount + 1 })
      .eq("id", assignmentId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[send-email] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send email" },
      { status: 500 }
    );
  }
}
