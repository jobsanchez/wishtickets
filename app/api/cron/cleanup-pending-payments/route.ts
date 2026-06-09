import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

const LEGACY_STALE_MINUTES = 15;

function getCronSecret(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  return request.headers.get("x-cron-secret")?.trim() ?? null;
}

export async function GET(request: NextRequest) {
  const secret = getCronSecret(request);
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - LEGACY_STALE_MINUTES * 60 * 1000).toISOString();

  const { data: stalePayments, error: listError } = await supabase
    .from("payments")
    .select("id, booking_id, expires_at, created_at")
    .in("status", ["pending", "failed"])
    .or(`expires_at.lt.${new Date().toISOString()},and(expires_at.is.null,created_at.lt.${cutoff})`);

  if (listError) {
    return NextResponse.json(
      { error: listError.message ?? "Failed to list stale payments" },
      { status: 500 }
    );
  }

  const rows = stalePayments ?? [];
  let cleaned = 0;

  // Pass 1: Payment-driven - payments pending/failed past payment expiry
  for (const payment of rows) {
    const bookingId = payment.booking_id;
    if (!bookingId) continue;

    const { data: booking } = await supabase
      .from("bookings")
      .select("status")
      .eq("id", bookingId)
      .single();

    const { data: tickets } = await supabase
      .from("tickets")
      .select("seat_id")
      .eq("booking_id", bookingId);
    const seatIds = (tickets ?? []).filter(
      (t): t is { seat_id: string } => t.seat_id != null
    ).map((t) => t.seat_id);

    await supabase.from("tickets").delete().eq("booking_id", bookingId);

    if (seatIds.length > 0) {
      await supabase
        .from("event_seats")
        .update({ status: "available" })
        .in("id", seatIds);
    }

    if (booking?.status === "pending") {
      await supabase.from("bookings").update({ status: "failed" }).eq("id", bookingId);
    }
    await supabase.from("payments").update({ status: "failed" }).eq("id", payment.id);
    cleaned += 1;
  }

  // Pass 2: Booking-driven - pending bookings older than fallback window (orphans, edge cases)
  const { data: staleBookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("id")
    .eq("status", "pending")
    .lt("created_at", cutoff);

  if (!bookingsError && staleBookings?.length) {
    for (const b of staleBookings) {
      const bookingId = b.id;

      const { data: tickets } = await supabase
        .from("tickets")
        .select("seat_id")
        .eq("booking_id", bookingId);
      const seatIds = (tickets ?? []).filter(
        (t): t is { seat_id: string } => t.seat_id != null
      ).map((t) => t.seat_id);

      await supabase.from("tickets").delete().eq("booking_id", bookingId);

      if (seatIds.length > 0) {
        await supabase
          .from("event_seats")
          .update({ status: "available" })
          .in("id", seatIds);
      }

      await supabase.from("bookings").update({ status: "failed" }).eq("id", bookingId);
      await supabase.from("payments").update({ status: "failed" }).eq("booking_id", bookingId);
      cleaned += 1;
    }
  }

  return NextResponse.json({ cleaned });
}
