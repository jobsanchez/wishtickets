import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentStatusById } from "@/lib/paymongo";
import { confirmBooking, confirmBookingStatusOnly } from "@/lib/confirm-booking";
import { releaseFailedBooking } from "@/lib/release-failed-booking";

const PAYMENT_STATUS_CACHE_TTL_MS = 4000;
const paymentStatusCache = new Map<
  string,
  { status: "paid" | "failed" | "pending" | null; expiresAt: number }
>();

function getCachedPaymentStatus(paymongoId: string): "paid" | "failed" | "pending" | null | undefined {
  const cached = paymentStatusCache.get(paymongoId);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    paymentStatusCache.delete(paymongoId);
    return undefined;
  }
  return cached.status;
}

function setCachedPaymentStatus(paymongoId: string, status: "paid" | "failed" | "pending" | null): void {
  paymentStatusCache.set(paymongoId, {
    status,
    expiresAt: Date.now() + PAYMENT_STATUS_CACHE_TTL_MS,
  });
}

/** GET /api/bookings/[bookingId]/status - Returns booking status. When pending, checks PayMongo and confirms if paid or marks failed if expired/cancelled. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const t0 = Date.now();
  let paymongoMs = 0;
  const hasSiteUrl = !!(process.env.NEXT_PUBLIC_SITE_URL ?? process.env.URL);
  const hasSupabaseAdminEnv =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY;
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
    .select("id, status, user_id")
    .eq("id", bookingId)
    .single();
  if (!booking || booking.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (booking.status === "pending") {
    const { data: payment } = await supabase
      .from("payments")
      .select("paymongo_id, id, created_at, expires_at")
      .eq("booking_id", bookingId)
      .single();
    const paymentExpiry = (payment as { expires_at?: string | null } | null)?.expires_at;
    if (paymentExpiry && new Date(paymentExpiry).getTime() <= Date.now()) {
      const admin = createAdminClient();
      await releaseFailedBooking(admin, bookingId);
      await admin.from("bookings").update({ status: "failed" }).eq("id", bookingId);
      if (payment?.id) {
        await admin.from("payments").update({ status: "failed" }).eq("id", payment.id);
      }
      console.log("[api/bookings/status] phase=expired-payment", {
        bookingId,
        phase: "expiry_check",
        result: "failed",
        hasSiteUrl,
        hasSupabaseAdminEnv,
        duration_ms: Date.now() - t0,
      });
      return NextResponse.json({ status: "failed" });
    }
    if (payment?.paymongo_id) {
      const cached = getCachedPaymentStatus(payment.paymongo_id);
      let linkStatus = cached;
      if (linkStatus === undefined) {
        const tPaymongo = Date.now();
        linkStatus = await getPaymentStatusById(payment.paymongo_id);
        paymongoMs += Date.now() - tPaymongo;
        setCachedPaymentStatus(payment.paymongo_id, linkStatus);
      }
      if (linkStatus === "paid") {
        const admin = createAdminClient();
        await confirmBookingStatusOnly(admin, bookingId);
        confirmBooking(admin, bookingId).catch((err) =>
          console.error("[status] background confirmBooking:", err)
        );
        console.log("[api/bookings/status] phase=paymongo-paid", {
          bookingId,
          phase: "paymongo_lookup",
          result: "confirmed",
          paymongo_ms: paymongoMs,
          duration_ms: Date.now() - t0,
        });
        return NextResponse.json({ status: "confirmed" });
      }
      if (linkStatus === "failed") {
        const admin = createAdminClient();
        await releaseFailedBooking(admin, bookingId);
        await admin.from("bookings").update({ status: "failed" }).eq("id", bookingId);
        if (payment.id) {
          await admin.from("payments").update({ status: "failed" }).eq("id", payment.id);
        }
        console.log("[api/bookings/status] phase=paymongo-failed", {
          bookingId,
          phase: "paymongo_lookup",
          result: "failed",
          paymongo_ms: paymongoMs,
          duration_ms: Date.now() - t0,
        });
        return NextResponse.json({ status: "failed" });
      }
    }
  }
  console.log("[api/bookings/status] timing", {
    bookingId,
    status: booking.status,
    total_ms: Date.now() - t0,
    paymongo_ms: paymongoMs,
  });
  return NextResponse.json({ status: booking.status });
}
