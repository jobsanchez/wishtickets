import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmBooking } from "@/lib/confirm-booking";

function mapConfirmBookingError(errorCode?: string): string {
  switch (errorCode) {
    case "smtp_auth_failed":
      return "SMTP login failed. Update Email settings (SMTP user/password or Gmail App Password), then try again.";
    case "missing_destination_email":
      return "No destination email is set for this booking account.";
    case "missing_event":
      return "Event details were not found for this booking.";
    case "missing_tickets":
      return "No tickets were found for this booking.";
    case "email_send_failed":
      return "Email delivery failed. Please try again in a moment.";
    case "booking_not_found":
      return "Booking not found.";
    default:
      return "Failed to send ticket email";
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, user_id, status, ticket_email_sent_at")
    .eq("id", bookingId)
    .single();

  if (!booking || booking.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (booking.status !== "confirmed") {
    return NextResponse.json(
      { error: "Tickets can only be emailed for confirmed bookings" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Clear the email claim so confirmBooking will send again for this booking.
  try {
    if (booking.ticket_email_sent_at != null) {
      console.log("[send-email] resetting ticket_email_sent_at before resend", {
        bookingId,
      });
      await admin
        .from("bookings")
        .update({ ticket_email_sent_at: null })
        .eq("id", bookingId);
    }
  } catch (err) {
    console.error("[send-email] failed to reset ticket_email_sent_at", {
      bookingId,
      err,
    });
    return NextResponse.json(
      { error: "Failed to prepare booking for email resend" },
      { status: 500 }
    );
  }

  try {
    const result = await confirmBooking(admin, bookingId);
    if (!result.ok) {
      const message = mapConfirmBookingError(result.errorCode);
      const isClientFixable =
        result.errorCode === "missing_destination_email" ||
        result.errorCode === "missing_tickets" ||
        result.errorCode === "missing_event";
      return NextResponse.json(
        {
          error: message,
          code: result.errorCode ?? "unknown_error",
        },
        { status: isClientFixable ? 400 : 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      alreadyConfirmed: result.alreadyConfirmed ?? true,
    });
  } catch (err) {
    console.error("[send-email] confirmBooking threw error", {
      bookingId,
      err,
    });
    return NextResponse.json(
      { error: "Failed to send ticket email", code: "unexpected_exception" },
      { status: 500 }
    );
  }
}

