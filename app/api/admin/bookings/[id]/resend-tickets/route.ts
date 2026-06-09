import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessTicketResendAdminTools } from "@/lib/auth";
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await canAccessTicketResendAdminTools())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const bookingId = id;
  const admin = createAdminClient();

  const body = await request.json().catch(() => ({}));
  const emailOverrideRaw = typeof body.email === "string" ? body.email.trim() : "";

  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, ticket_email_sent_at")
    .eq("id", bookingId)
    .single();

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (booking.status !== "confirmed") {
    return NextResponse.json(
      { error: "Tickets can only be emailed for confirmed bookings" },
      { status: 400 }
    );
  }

  try {
    if (booking.ticket_email_sent_at != null) {
      await admin
        .from("bookings")
        .update({ ticket_email_sent_at: null })
        .eq("id", bookingId);
    }
  } catch (err) {
    console.error("[admin/resend-tickets] failed to reset ticket_email_sent_at", {
      bookingId,
      err,
    });
    return NextResponse.json(
      { error: "Failed to prepare booking for email resend" },
      { status: 500 }
    );
  }

  if (emailOverrideRaw) {
    try {
      await admin
        .from("bookings")
        .update({ buyer_email_override: emailOverrideRaw })
        .eq("id", bookingId);
    } catch (err) {
      console.error("[admin/resend-tickets] failed to set buyer_email_override", {
        bookingId,
        err,
      });
      return NextResponse.json(
        { error: "Failed to set override email for resend" },
        { status: 500 }
      );
    }
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
        { error: message, code: result.errorCode ?? "unknown_error" },
        { status: isClientFixable ? 400 : 500 }
      );
    }
    return NextResponse.json({ ok: true, alreadyConfirmed: result.alreadyConfirmed ?? true });
  } catch (err) {
    console.error("[admin/resend-tickets] confirmBooking error", { bookingId, err });
    return NextResponse.json(
      { error: "Failed to send ticket email" },
      { status: 500 }
    );
  } finally {
    if (emailOverrideRaw) {
      try {
        await admin
          .from("bookings")
          .update({ buyer_email_override: null })
          .eq("id", bookingId);
      } catch (err) {
        console.error("[admin/resend-tickets] failed to clear buyer_email_override", {
          bookingId,
          err,
        });
      }
    }
  }
}

