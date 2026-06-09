import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";

async function canViewAssignments() {
  const role = await getProfileRole();
  if (role === "super_admin" || role === "admin" || role === "admissions_staff")
    return true;
  const userId = await getCurrentUserId();
  if (!userId) return false;
  return (
    hasCapability(userId, "manage_seats") ||
    hasCapability(userId, "manage_assignments") ||
    hasCapability(userId, "view_sales_analytics")
  );
}

async function canRelease() {
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

export async function GET(request: NextRequest) {
  if (!(await canViewAssignments())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id") ?? undefined;

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_admin_ticket_assignments", {
    p_event_id: eventId || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    assignments: data ?? [],
    canRelease: await canRelease(),
  });
}
