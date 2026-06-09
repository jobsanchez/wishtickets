import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId, getProfileRole, hasCapability } from "@/lib/auth";
import {
  listSoldTicketGroupsForBooking,
  releaseSoldTicketsForAssignmentBooking,
} from "@/lib/admin/void-sale";

const postSchema = z.object({
  ticket_ids: z.array(z.string().uuid()).min(1),
});

/**
 * Same event scope as get_admin_seat_assignments via is_authorized_for_event (e.g. event admin +
 * manage_assignments). Requires the Manual Distribution capability for non–super-admins.
 */
async function canAdjustAllocation(eventId: string): Promise<boolean> {
  const role = await getProfileRole();
  if (role === "super_admin") return true;

  const userId = await getCurrentUserId();
  if (!userId) return false;

  if (!(await hasCapability(userId, "manage_assignments"))) return false;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_authorized_for_event", {
    p_event_id: eventId,
  });
  return !error && !!data;
}

async function getConfirmedAssignment(
  assignmentId: string
): Promise<
  | {
      id: string;
      event_id: string;
      booking_id: string;
      recipient_name: string | null;
      status: string;
    }
  | null
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_seat_assignments")
    .select("id, event_id, booking_id, recipient_name, status")
    .eq("id", assignmentId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.status !== "confirmed" || !data.booking_id) return null;
  return {
    ...data,
    booking_id: data.booking_id,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: assignmentId } = await params;
  const assignment = await getConfirmedAssignment(assignmentId);
  if (!assignment) {
    return NextResponse.json(
      { error: "Manual distribution not found or not confirmed" },
      { status: 404 }
    );
  }

  if (!(await canAdjustAllocation(assignment.event_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  try {
    const groups = await listSoldTicketGroupsForBooking(
      supabase,
      assignment.event_id,
      assignment.booking_id
    );
    return NextResponse.json({
      assignment_id: assignment.id,
      event_id: assignment.event_id,
      booking_id: assignment.booking_id,
      recipient_name: assignment.recipient_name,
      groups,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load allocation adjustments",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: assignmentId } = await params;
  const assignment = await getConfirmedAssignment(assignmentId);
  if (!assignment) {
    return NextResponse.json(
      { error: "Manual distribution not found or not confirmed" },
      { status: 404 }
    );
  }

  if (!(await canAdjustAllocation(assignment.event_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payloadRaw = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(payloadRaw);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? "Invalid payload";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    const summary = await releaseSoldTicketsForAssignmentBooking(
      supabase,
      assignment.event_id,
      assignment.booking_id,
      parsed.data.ticket_ids
    );

    return NextResponse.json({
      success: true,
      assignment_id: assignment.id,
      booking_id: assignment.booking_id,
      ...summary,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to adjust manual allocation",
      },
      { status: 500 }
    );
  }
}
