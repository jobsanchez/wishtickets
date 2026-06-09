import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";
import { generateNextManualAssignmentTicketImagesBatch } from "@/lib/manual-assignment-confirm/generate-manual-assignment-ticket-images-batch";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await canManageAssignments())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: assignmentId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const bookingId =
    typeof (body as { booking_id?: string }).booking_id === "string"
      ? (body as { booking_id: string }).booking_id.trim()
      : "";
  if (!bookingId) {
    return NextResponse.json({ error: "booking_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  try {
    const result = await generateNextManualAssignmentTicketImagesBatch(supabase, {
      assignmentId,
      bookingId,
    });
    return NextResponse.json({
      success: true,
      processed: result.processed,
      failed: result.failed,
      generatedTotal: result.generatedTotal,
      total: result.total,
      complete: result.complete,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to generate ticket images";
    console.error("[manual-confirm/generate-images] failed", {
      assignmentId,
      bookingId,
      error: msg,
      raw: e,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
