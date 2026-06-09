import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserId, getProfileRole, hasCapability } from "@/lib/auth";
import { getPaymongoSecretKey } from "@/lib/paymongo-config";
import {
  createPaymongoRefund,
  isPaymongoSourceTypeBlockedForApiRefund,
  resolvePaymongoPaymentSourceType,
  resolvePaymongoRefundPaymentIds,
  type PaymongoRefundReason,
} from "@/lib/paymongo";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

async function assertRefundLookupAccess(): Promise<NextResponse | null> {
  const role = await getProfileRole();
  if (role === "super_admin") return null;
  const userId = await getCurrentUserId();
  if (!userId || !(await hasCapability(userId, "refund_lookup"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

const postRefundSchema = z.object({
  booking_id: z.string().trim().pipe(z.uuid()),
  payment_id: z
    .string()
    .trim()
    .min(1)
    .refine((id) => id.startsWith("pay_"), { message: "payment_id must start with pay_" }),
  amount_cents: z.coerce.number().int().positive().optional(),
  reason: z.enum(["requested_by_customer", "duplicate", "fraudulent"]),
  notes: z
    .union([z.string().max(255), z.null()])
    .optional()
    .transform((v) => (v == null ? undefined : v)),
});

/** Accept camelCase aliases and drop JSON `null` so Zod optional fields parse reliably. */
function normalizeRefundLookupPostBody(body: unknown): unknown {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }
  const o = { ...(body as Record<string, unknown>) };
  if (o.booking_id == null && typeof o.bookingId === "string") {
    o.booking_id = o.bookingId;
  }
  if (o.payment_id == null && typeof o.paymentId === "string") {
    o.payment_id = o.paymentId;
  }
  if (o.amount_cents == null && typeof o.amountCents === "number") {
    o.amount_cents = o.amountCents;
  }
  for (const key of ["booking_id", "payment_id", "amount_cents", "reason", "notes"]) {
    if (key in o && o[key] === null) {
      delete o[key];
    }
  }
  return o;
}

/**
 * GET /api/admin/refund-lookup?bookingId=uuid
 * `super_admin` or `refund_lookup` capability.
 */
export async function GET(request: NextRequest) {
  const forbidden = await assertRefundLookupAccess();
  if (forbidden) return forbidden;

  const bookingId = request.nextUrl.searchParams.get("bookingId");
  if (!bookingId) {
    return NextResponse.json({ error: "bookingId required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: payment } = await admin
    .from("payments")
    .select("id, booking_id, paymongo_id, amount_cents, status")
    .eq("booking_id", bookingId)
    .single();

  if (!payment?.paymongo_id) {
    return NextResponse.json(
      { error: "No PayMongo payment found for this booking" },
      { status: 404 }
    );
  }

  const { data: booking } = await admin
    .from("bookings")
    .select("event_id, user_id")
    .eq("id", bookingId)
    .single();

  const secret = await getPaymongoSecretKey();
  if (!secret) {
    return NextResponse.json(
      { error: "PayMongo secret not configured (set in Global Settings or PAYMONGO_SECRET_KEY)" },
      { status: 500 }
    );
  }

  const paymongoId = payment.paymongo_id;
  const paymentIds = await resolvePaymongoRefundPaymentIds(paymongoId);

  let payment_source_type: string | null = null;
  let refund_via_api_blocked = false;
  let refund_via_api_block_reason: string | null = null;
  if (paymentIds.length > 0) {
    payment_source_type = await resolvePaymongoPaymentSourceType(paymentIds[0]);
    if (isPaymongoSourceTypeBlockedForApiRefund(payment_source_type)) {
      refund_via_api_blocked = true;
      refund_via_api_block_reason =
        "PayMongo does not allow API refunds for this payment method (e.g. QR Ph / qrph). Process the refund in the PayMongo Dashboard or contact PayMongo support.";
    }
  }

  let eventTitle: string | null = null;
  let buyerEmail: string | null = null;

  if (booking?.event_id) {
    const { data: event } = await admin
      .from("events")
      .select("title")
      .eq("id", booking.event_id)
      .single();
    eventTitle = (event as { title?: string } | null)?.title ?? null;
  }
  if (booking?.user_id) {
    const { data: user } = await admin.auth.admin.getUserById(booking.user_id);
    buyerEmail = user?.user?.email ?? null;
  }

  return NextResponse.json({
    bookingId,
    paymongoId,
    paymentIds,
    amount_cents: (payment as { amount_cents?: number }).amount_cents ?? null,
    status: (payment as { status?: string }).status ?? null,
    event_title: eventTitle,
    buyer_email: buyerEmail,
    payment_source_type,
    refund_via_api_blocked,
    refund_via_api_block_reason,
  });
}

/**
 * POST /api/admin/refund-lookup
 * Body: booking_id, payment_id (pay_…), optional amount_cents, reason, optional notes.
 * Same auth as GET; payment_id must be in resolvePaymongoRefundPaymentIds whitelist.
 */
export async function POST(request: NextRequest) {
  const forbidden = await assertRefundLookupAccess();
  if (forbidden) return forbidden;

  let jsonBody: unknown;
  try {
    jsonBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = postRefundSchema.safeParse(normalizeRefundLookupPostBody(jsonBody));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { booking_id: bookingId, payment_id: paymentIdRequested, notes } =
    parsed.data;
  let amountCents = parsed.data.amount_cents;
  const reason = parsed.data.reason as PaymongoRefundReason;

  const admin = createAdminClient();

  const { data: payment } = await admin
    .from("payments")
    .select("id, booking_id, paymongo_id, amount_cents, status")
    .eq("booking_id", bookingId)
    .single();

  if (!payment?.paymongo_id) {
    return NextResponse.json(
      { error: "No PayMongo payment found for this booking" },
      { status: 404 }
    );
  }

  const storedAmount =
    typeof (payment as { amount_cents?: number }).amount_cents === "number"
      ? (payment as { amount_cents: number }).amount_cents
      : null;
  if (storedAmount === null || storedAmount <= 0) {
    return NextResponse.json(
      { error: "Booking payment amount is invalid" },
      { status: 422 }
    );
  }

  if (amountCents === undefined) {
    amountCents = storedAmount;
  }
  if (amountCents > storedAmount || amountCents <= 0) {
    return NextResponse.json(
      {
        error: "Invalid refund amount",
        detail: `amount_cents must be between 1 and ${storedAmount} (stored payment)`,
      },
      { status: 400 }
    );
  }

  const secret = await getPaymongoSecretKey();
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "PayMongo secret not configured (set in Global Settings or PAYMONGO_SECRET_KEY)",
      },
      { status: 500 }
    );
  }

  const paymongoId = payment.paymongo_id;
  const allowedIds = await resolvePaymongoRefundPaymentIds(paymongoId);
  if (allowedIds.length === 0) {
    return NextResponse.json(
      {
        error:
          "Could not resolve PayMongo payment IDs for this booking. Check the secret key and try again.",
      },
      { status: 503 }
    );
  }
  if (!allowedIds.includes(paymentIdRequested)) {
    return NextResponse.json(
      {
        error: "Payment ID not allowed for this booking",
        detail: {
          message:
            "The chosen pay_ ID is not linked to this booking's PayMongo session.",
          requested_payment_id: paymentIdRequested,
          allowed_payment_ids: allowedIds,
        },
      },
      { status: 400 }
    );
  }

  const selectedSourceType = await resolvePaymongoPaymentSourceType(paymentIdRequested);
  if (isPaymongoSourceTypeBlockedForApiRefund(selectedSourceType)) {
    return NextResponse.json(
      {
        error:
          "Refunds are not allowed for payments with this source type via the PayMongo API (e.g. QR Ph / qrph). Use the PayMongo Dashboard or contact PayMongo support.",
        detail: { source_type: selectedSourceType },
      },
      { status: 422 }
    );
  }

  const refund = await createPaymongoRefund({
    paymentId: paymentIdRequested,
    amountCents,
    reason,
    notes: notes?.trim() || undefined,
  });

  if (!refund.ok) {
    return NextResponse.json(
      {
        error: refund.message,
        paymongo_status: refund.status,
      },
      { status: refund.status >= 400 && refund.status < 600 ? refund.status : 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    refund_id: refund.refund_id,
    status: refund.status,
    amount_cents: amountCents,
    payment_id: paymentIdRequested,
    booking_id: bookingId,
  });
}
