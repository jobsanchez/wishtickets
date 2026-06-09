import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { releaseFailedBooking } from "@/lib/release-failed-booking";
import { cleanupOrphanReservedSeatsForEvent } from "@/lib/cleanup-orphan-reserved-seats";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  event_id: z.string().uuid(),
});

/** POST /api/bookings/cancel-pending
 * Cancel the caller's pending booking(s) for an event and release seats immediately.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { event_id } = parsed.data;
    const admin = createAdminClient();
    const { data: bookings, error: bookingError } = await supabase
      .from("bookings")
      .select("id, status")
      .eq("event_id", event_id)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);

    if (bookingError) {
      return NextResponse.json(
        { error: "Failed to load bookings", details: bookingError.message },
        { status: 500 }
      );
    }

    const emptyCleanupStats = {
      releasedOrphanReservedCount: 0,
      soldToReservedCount: 0,
      soldToAvailableCount: 0,
    };

    async function safeCleanup() {
      try {
        return await cleanupOrphanReservedSeatsForEvent(admin, event_id);
      } catch (e) {
        console.error("[cancel-pending] cleanupOrphanReservedSeatsForEvent", e);
        return emptyCleanupStats;
      }
    }

    if (!bookings || bookings.length === 0) {
      // No PayMongo pending rows (e.g. cart-only, or already paid/cancelled). Still clean stale reserved seats.
      const cleanup = await safeCleanup();
      return NextResponse.json({
        ok: true,
        cancelled_count: 0,
        no_pending: true,
        released_orphan_reserved_count: cleanup.releasedOrphanReservedCount,
        sold_to_reserved_count: cleanup.soldToReservedCount,
        sold_to_available_count: cleanup.soldToAvailableCount,
      });
    }

    const cancelledBookingIds: string[] = [];
    for (const booking of bookings) {
      await releaseFailedBooking(admin, booking.id);
      // Align with cleanup cron / PayMongo expiry (uses `failed`). Some DBs have no `cancelled` in payments_status_check.
      const { error: payErr } = await admin
        .from("payments")
        .update({ status: "failed" })
        .eq("booking_id", booking.id);
      if (payErr) {
        console.error("[cancel-pending] payments update", booking.id, payErr);
      }
      const { error: bookErr } = await admin
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", booking.id);
      if (bookErr) {
        const { error: bookErr2 } = await admin
          .from("bookings")
          .update({ status: "failed" })
          .eq("id", booking.id);
        if (bookErr2) throw new Error(bookErr2.message ?? bookErr.message);
      }
      cancelledBookingIds.push(booking.id);
    }

    const cleanup = await safeCleanup();

    return NextResponse.json({
      ok: true,
      booking_id: cancelledBookingIds[0],
      booking_ids: cancelledBookingIds,
      cancelled_count: cancelledBookingIds.length,
      released_orphan_reserved_count: cleanup.releasedOrphanReservedCount,
      sold_to_reserved_count: cleanup.soldToReservedCount,
      sold_to_available_count: cleanup.soldToAvailableCount,
      status: "cancelled",
    });
  } catch (e) {
    console.error("[cancel-pending]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
