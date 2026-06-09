import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getEnabledPaymongoMethods,
  getPaymongoProcessingFees,
  getPaymongoSecretKey,
} from "@/lib/paymongo-config";
import {
  computeChargedCentsForBucket,
  resolvePaymongoMethodsForBucket,
  type PaymongoPaymentBucket,
} from "@/lib/paymongo-processing-fees";
import { createCheckoutSession } from "@/lib/paymongo";
import { getSiteOrigin } from "@/lib/site-url";
import { getExpiresAt, getGlobalReservationTtlMinutes } from "@/lib/reservations";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  payment_bucket: z.enum(["qrph", "ewallet", "card", "banks"]),
});

/**
 * Create a new PayMongo Checkout Session for an existing pending booking (same ticket net).
 * Used when the buyer closed PayMongo and picks another payment bucket — the reservation cart
 * was already consumed on first checkout, so a full /api/checkout rerun cannot load the cart.
 */
export async function POST(
  request: NextRequest,
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

  const rawBody = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const { payment_bucket } = parsed.data;

  const paymongoSecret = await getPaymongoSecretKey();
  if (!paymongoSecret) {
    return NextResponse.json({ error: "Payments unavailable" }, { status: 503 });
  }

  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .select("id, user_id, event_id, status, total_cents")
    .eq("id", bookingId)
    .single();

  if (bookingErr || !booking || booking.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (booking.status !== "pending") {
    return NextResponse.json({ error: "Booking is not awaiting payment." }, { status: 400 });
  }

  const ticketNet = Math.max(0, Number(booking.total_cents) || 0);
  if (ticketNet <= 0) {
    return NextResponse.json({ error: "Nothing to pay for this booking." }, { status: 400 });
  }

  const [processingFeesConfig, enabledMethods] = await Promise.all([
    getPaymongoProcessingFees(),
    getEnabledPaymongoMethods(),
  ]);
  const methods = resolvePaymongoMethodsForBucket(payment_bucket as PaymongoPaymentBucket, enabledMethods);
  if (methods.length === 0) {
    return NextResponse.json({ error: "That payment option is not available." }, { status: 400 });
  }

  const chargedCents = computeChargedCentsForBucket(ticketNet, payment_bucket as PaymongoPaymentBucket, processingFeesConfig);

  const admin = createAdminClient();
  const [{ data: eventRow }, { data: profile }] = await Promise.all([
    admin
      .from("events")
      .select("slug, title")
      .eq("id", booking.event_id)
      .in("status", ["draft", "published"])
      .single(),
    supabase.from("profiles").select("full_name, phone").eq("id", user.id).single(),
  ]);

  const billing: { name?: string; email?: string; phone?: string } = {};
  if (user.email) billing.email = user.email;
  const fullName = (profile as { full_name?: string } | null)?.full_name?.trim();
  billing.name =
    fullName ||
    (user.email ? user.email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : undefined);
  const phone = (profile as { phone?: string } | null)?.phone?.trim();
  if (phone) billing.phone = phone;

  const origin = getSiteOrigin(request);
  const eventSlug = eventRow?.slug ?? "event";

  const session = await createCheckoutSession({
    amountCents: chargedCents,
    description: eventRow?.title ?? "Event",
    referenceNumber: booking.id,
    successUrl: `${origin}/${eventSlug}/payment-return/${booking.id}`,
    cancelUrl: `${origin}/${eventSlug}/checkout?eventId=${encodeURIComponent(booking.event_id)}&resumeBooking=${encodeURIComponent(booking.id)}`,
    paymentMethodTypes: methods,
    ...(Object.keys(billing).length > 0 && { billing }),
  });

  if (!session) {
    return NextResponse.json(
      { error: "Payment could not be initialized. Please try again or contact support." },
      { status: 502 }
    );
  }

  const ttlMinutes = await getGlobalReservationTtlMinutes();
  const expiresAt = getExpiresAt(ttlMinutes);

  const { data: existingPayment } = await admin
    .from("payments")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingPayment?.id) {
    const { error: updErr } = await admin
      .from("payments")
      .update({
        paymongo_id: session.id,
        amount_cents: chargedCents,
        paymongo_bucket: payment_bucket,
        expires_at: expiresAt,
        status: "pending",
      })
      .eq("id", existingPayment.id);
    if (updErr) {
      console.error("[paymongo-resession] payments update failed:", updErr);
      return NextResponse.json({ error: "Could not update payment record." }, { status: 500 });
    }
  } else {
    const { error: insErr } = await admin.from("payments").insert({
      booking_id: bookingId,
      paymongo_id: session.id,
      status: "pending",
      amount_cents: chargedCents,
      paymongo_bucket: payment_bucket,
      expires_at: expiresAt,
    });
    if (insErr) {
      console.error("[paymongo-resession] payments insert failed:", insErr);
      return NextResponse.json({ error: "Could not create payment record." }, { status: 500 });
    }
  }

  return NextResponse.json({
    booking_id: booking.id,
    redirect_url: session.checkout_url,
    event_slug: eventRow?.slug ?? null,
    paymongo_resession: true,
    ticket_net_cents: ticketNet,
    charged_cents: chargedCents,
  });
}
