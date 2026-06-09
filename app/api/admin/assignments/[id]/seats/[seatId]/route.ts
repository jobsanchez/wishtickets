import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";

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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; seatId: string }> }
) {
  const { id: assignmentId, seatId } = await params;
  if (!(await canManageAssignments())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("admin_seat_assignments")
    .select("id, status")
    .eq("id", assignmentId)
    .single();

  if (!assignment || assignment.status !== "reserved") {
    return NextResponse.json(
      { error: "Manual distribution not found or already confirmed" },
      { status: 400 }
    );
  }

  const { data: seat } = await supabase
    .from("event_seats")
    .select("id, assignment_id")
    .eq("id", seatId)
    .single();

  if (!seat || seat.assignment_id !== assignmentId) {
    return NextResponse.json(
      { error: "Seat not found or not part of this assignment" },
      { status: 400 }
    );
  }

  const { error: seatsError } = await supabase
    .from("event_seats")
    .update({ status: "available", assignment_id: null })
    .eq("id", seatId);

  if (seatsError) {
    return NextResponse.json({ error: seatsError.message }, { status: 500 });
  }

  await supabase
    .from("admin_assignment_items")
    .delete()
    .eq("assignment_id", assignmentId)
    .eq("seat_id", seatId);

  const [{ count: seatCount }, { count: itemCount }] = await Promise.all([
    supabase.from("event_seats").select("id", { count: "exact", head: true }).eq("assignment_id", assignmentId),
    supabase.from("admin_assignment_items").select("id", { count: "exact", head: true }).eq("assignment_id", assignmentId),
  ]);

  if ((seatCount ?? 0) === 0 && (itemCount ?? 0) === 0) {
    await supabase.from("admin_seat_assignments").delete().eq("id", assignmentId);
  }

  return NextResponse.json({ success: true });
}
