import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfileRole } from "@/lib/auth";
import { confirmBooking } from "@/lib/confirm-booking";

async function requireAdminLikeRole() {
  const role = await getProfileRole();
  if (role === "super_admin" || role === "admin") {
    return true;
  }
  return false;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params;

  if (!(await requireAdminLikeRole())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("bookings")
    .select("ticket_email_sent_at, status")
    .eq("id", bookingId)
    .single();

  if (!before) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  console.log("[debug-resend-ticket] invoking confirmBooking", {
    bookingId,
    beforeTicketEmailSentAt: before.ticket_email_sent_at,
    status: before.status,
  });

  const result = await confirmBooking(admin, bookingId);

  const { data: after } = await admin
    .from("bookings")
    .select("ticket_email_sent_at")
    .eq("id", bookingId)
    .single();

  return NextResponse.json({
    ok: result.ok,
    alreadyConfirmed: result.alreadyConfirmed,
    bookingId,
    beforeTicketEmailSentAt: before.ticket_email_sent_at,
    afterTicketEmailSentAt: after?.ticket_email_sent_at ?? null,
  });
}

