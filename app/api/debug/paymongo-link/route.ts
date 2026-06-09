import { createClient } from "@/lib/supabase/server";
import { getPaymongoSecretKey } from "@/lib/paymongo-config";
import { NextRequest, NextResponse } from "next/server";

const PAYMONGO_BASE = "https://api.paymongo.com/v1";

/**
 * GET /api/debug/paymongo-link?bookingId=xxx
 * Returns raw PayMongo link response for debugging expired-source detection.
 * Requires auth; booking must belong to user.
 */
export async function GET(request: NextRequest) {
  const bookingId = request.nextUrl.searchParams.get("bookingId");
  if (!bookingId) {
    return NextResponse.json({ error: "bookingId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id, booking_id, paymongo_id, created_at")
    .eq("booking_id", bookingId)
    .single();
  if (!payment?.paymongo_id) {
    return NextResponse.json({ error: "No payment found for this booking" }, { status: 404 });
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("user_id")
    .eq("id", bookingId)
    .single();
  if (!booking || booking.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const paymongoId = payment.paymongo_id;
  const isCheckoutSession = paymongoId.startsWith("cs_");
  const endpoint = isCheckoutSession
    ? `checkout_sessions/${paymongoId}?include=payments`
    : `links/${paymongoId}?include=payments`;

  const secret = await getPaymongoSecretKey();
  if (!secret) {
    return NextResponse.json({ error: "PayMongo secret not set (use Global Settings or PAYMONGO_SECRET_KEY)" }, { status: 500 });
  }

  const res = await fetch(`${PAYMONGO_BASE}/${endpoint}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(secret + ":").toString("base64")}`,
    },
  });
  const json = await res.json();
  return NextResponse.json({
    ok: res.ok,
    status: res.status,
    paymongoId,
    type: isCheckoutSession ? "checkout_session" : "link",
    paymentCreatedAt: (payment as { created_at?: string }).created_at,
    paymongoResponse: json,
  });
}
