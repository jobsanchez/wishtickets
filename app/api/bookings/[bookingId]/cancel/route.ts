import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { releaseFailedBooking } from "@/lib/release-failed-booking";
import { cleanupOrphanReservedSeatsForEvent } from "@/lib/cleanup-orphan-reserved-seats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** POST /api/bookings/[bookingId]/cancel
 * Cancel an unpaid booking for the current user.
 * - Only allowed when booking.status is not "confirmed".
 * - Deletes tickets and frees seats via releaseFailedBooking.
 * - Marks any related payments as "failed" (DB-compatible; same family as PayMongo expiry cleanup).
 * - Marks the booking itself as "cancelled" (or "failed" if the DB disallows cancelled).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { bookingId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, status, user_id, event_id")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking || booking.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (booking.status === "confirmed") {
      return NextResponse.json(
        { error: "Cannot cancel a confirmed booking." },
        { status: 400 }
      );
    }

    // Idempotent cancel: if already terminal, report success and current status.
    if (booking.status === "cancelled" || booking.status === "failed") {
      return NextResponse.json({ ok: true, status: booking.status });
    }

    const admin = createAdminClient();

    // Delete tickets and free seats back to available.
    await releaseFailedBooking(admin, bookingId);

    const { error: payErr } = await admin
      .from("payments")
      .update({ status: "failed" })
      .eq("booking_id", bookingId);
    if (payErr) {
      console.error("[booking cancel] payments update", bookingId, payErr);
    }

    let finalStatus: string = "cancelled";
    const { error: bookErr } = await admin
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", bookingId);
    if (bookErr) {
      const { error: bookErr2 } = await admin
        .from("bookings")
        .update({ status: "failed" })
        .eq("id", bookingId);
      if (bookErr2) throw new Error(bookErr2.message ?? bookErr.message);
      finalStatus = "failed";
    }

    if (booking.event_id) {
      try {
        await cleanupOrphanReservedSeatsForEvent(admin, booking.event_id);
      } catch (e) {
        console.error("[booking cancel] cleanupOrphanReservedSeatsForEvent", e);
      }
    }

    return NextResponse.json({ ok: true, status: finalStatus });
  } catch (e) {
    console.error("[booking cancel]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}

