import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await canManageAssignments())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const recipient_email =
    typeof body.recipient_email === "string" ? body.recipient_email.trim() || null : null;

  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("admin_seat_assignments")
    .select("id, status")
    .eq("id", id)
    .single();

  if (!assignment) {
    return NextResponse.json(
      { error: "Manual distribution not found" },
      { status: 404 }
    );
  }

  const { error } = await supabase
    .from("admin_seat_assignments")
    .update({ recipient_email })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await canManageAssignments())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("admin_seat_assignments")
    .select("id, status")
    .eq("id", id)
    .single();

  if (!assignment || assignment.status !== "reserved") {
    return NextResponse.json(
      { error: "Manual distribution not found or already confirmed" },
      { status: 400 }
    );
  }

  const { error: seatsError } = await supabase
    .from("event_seats")
    .update({ status: "available", assignment_id: null })
    .eq("assignment_id", id);

  if (seatsError) {
    return NextResponse.json({ error: seatsError.message }, { status: 500 });
  }

  const { error: itemsError } = await supabase
    .from("admin_assignment_items")
    .delete()
    .eq("assignment_id", id);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const { error } = await supabase.from("admin_seat_assignments").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
