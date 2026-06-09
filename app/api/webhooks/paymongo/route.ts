import { createAdminClient } from "@/lib/supabase/admin";
import { after, NextRequest, NextResponse } from "next/server";
import { getPaymongoWebhookSecrets } from "@/lib/paymongo-config";
import { verifyWebhookSignature, retrievePayment } from "@/lib/paymongo";
import { releaseFailedBooking } from "@/lib/release-failed-booking";
import { confirmBooking } from "@/lib/confirm-booking";

/** PayMongo expects a 2xx quickly; we always return 200 so the endpoint is not disabled on error. */
function ack200(): NextResponse {
  return NextResponse.json({ received: true }, { status: 200 });
}

/** Extract booking ID from webhook payload. Handles link.payment.paid, checkout_session.payment.paid, payment.paid. */
async function getBookingIdFromPayload(
  supabase: ReturnType<typeof createAdminClient>,
  type: string,
  payload: { data?: { attributes?: { type?: string; data?: { id?: string; attributes?: { reference_number?: string; remarks?: string; link_id?: string } } } } }
): Promise<string | null> {
  const attrs = payload?.data?.attributes?.data?.attributes;
  const resourceId = payload?.data?.attributes?.data?.id;

  if (type === "checkout_session.payment.paid" || type === "checkout_session.payment.failed") {
    const ref = attrs?.reference_number;
    if (ref && typeof ref === "string") return ref;
    if (resourceId && typeof resourceId === "string" && resourceId.startsWith("cs_")) {
      const { data: payment } = await supabase
        .from("payments")
        .select("booking_id")
        .eq("paymongo_id", resourceId)
        .single();
      return payment?.booking_id ?? null;
    }
  }

  if (type === "link.payment.paid" || type === "link.payment.failed") {
    // Payload data is the PAYMENT object (pay_xxx), not the link. We store link id in payments.paymongo_id.
    const remarks = attrs?.remarks;
    if (remarks && typeof remarks === "string") return remarks;
    const linkIdFromPayload = attrs?.link_id;
    if (linkIdFromPayload && typeof linkIdFromPayload === "string") {
      const { data: payment } = await supabase
        .from("payments")
        .select("booking_id")
        .eq("paymongo_id", linkIdFromPayload)
        .single();
      return payment?.booking_id ?? null;
    }
    // Fallback: lookup by payment id (we store link id, so this won't match) - fetch payment from PayMongo to get link_id
    if (resourceId && typeof resourceId === "string" && resourceId.startsWith("pay_")) {
      const paymentFromApi = await retrievePayment(resourceId);
      const linkId = paymentFromApi?.attributes?.link_id;
      if (linkId) {
        const { data: payment } = await supabase
          .from("payments")
          .select("booking_id")
          .eq("paymongo_id", linkId)
          .single();
        return payment?.booking_id ?? null;
      }
      // Last resort: fetch link by id if payment has it, or try fetching link to get remarks
      // (PayMongo payment might not expose link_id; try retrieving link with payment's metadata)
      const desc = (paymentFromApi?.attributes as { description?: string })?.description;
      if (desc && desc.includes("Wish Tickets")) {
        console.log("[PayMongo webhook] payment has description but no link_id, cannot resolve booking");
      }
    }
    // Legacy: if payload had link id (link_xxx) in data.id, lookup by that
    if (resourceId && typeof resourceId === "string" && resourceId.startsWith("link_")) {
      const { data: payment } = await supabase
        .from("payments")
        .select("booking_id")
        .eq("paymongo_id", resourceId)
        .single();
      return payment?.booking_id ?? null;
    }
  }

  if (type === "payment.paid" || type === "payment.failed") {
    const ref = attrs?.reference_number;
    if (ref && typeof ref === "string") return ref;
    // payment.paid for Links: payment may have link_id; fetch and resolve
    if (resourceId && typeof resourceId === "string" && resourceId.startsWith("pay_")) {
      const paymentFromApi = await retrievePayment(resourceId);
      const linkId = paymentFromApi?.attributes?.link_id;
      if (linkId) {
        const { data: payment } = await supabase
          .from("payments")
          .select("booking_id")
          .eq("paymongo_id", linkId)
          .single();
        return payment?.booking_id ?? null;
      }
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    const hasSupabaseAdminEnv =
      !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    const hasSiteUrl = !!(process.env.NEXT_PUBLIC_SITE_URL ?? process.env.URL);
    const secrets = await getPaymongoWebhookSecrets();
    if (secrets.length === 0) {
      console.error("[PayMongo webhook] missing webhook secret", {
        hasSupabaseAdminEnv,
        hasSiteUrl,
        duration_ms: Date.now() - t0,
        phase: "config",
        result: "error",
        error_code: "missing_webhook_secret",
      });
      // Always 200 so PayMongo does not disable the endpoint; fix config in DB/env.
      return ack200();
    }
    if (!hasSupabaseAdminEnv) {
      console.error("[PayMongo webhook] missing supabase admin env", {
        hasSiteUrl,
        duration_ms: Date.now() - t0,
        phase: "config",
        result: "error",
        error_code: "missing_supabase_admin_env",
      });
      return ack200();
    }

    const raw = await request.text();
    const sig = request.headers.get("paymongo-signature") ?? request.headers.get("Paymongo-Signature") ?? "";

    let verified = false;
    for (const secret of secrets) {
      if (verifyWebhookSignature(raw, sig, secret)) {
        verified = true;
        break;
      }
    }
    if (!verified) {
      console.error("[PayMongo webhook] signature verification failed");
      return ack200();
    }

    let payload: { data?: { attributes?: { type?: string; data?: { id?: string; attributes?: { reference_number?: string; remarks?: string } } } } };
    try {
      payload = JSON.parse(raw);
    } catch {
      console.error("[PayMongo webhook] invalid JSON", { duration_ms: Date.now() - t0 });
      return ack200();
    }

    const type = payload?.data?.attributes?.type;
    const dataId = payload?.data?.attributes?.data?.id;
    console.log("[PayMongo webhook] event type:", type, "data.id:", dataId);

    const supabase = createAdminClient();
    const ref = await getBookingIdFromPayload(supabase, type ?? "", payload);

    const isPaidEvent = type === "link.payment.paid" || type === "payment.paid" || type === "checkout_session.payment.paid";
    if (isPaidEvent && !ref) {
      const attrs = payload?.data?.attributes?.data?.attributes;
      console.log("[PayMongo webhook] paid event but no booking ref extracted", {
        type,
        dataId,
        hasRemarks: !!attrs?.remarks,
        hasLinkId: !!(attrs as { link_id?: string })?.link_id,
      });
    }
    if (isPaidEvent && ref) {
      const { data: booking } = await supabase
        .from("bookings")
        .select("id, user_id, event_id, status")
        .eq("id", ref)
        .single();

      if (!booking) {
        console.log("[PayMongo webhook] skipping: no booking", { ref });
        return ack200();
      }
      // Confirm even if status is "failed" — PayMongo may send link.payment.failed before
      // link.payment.paid (race). Payment succeeded, so we must confirm.
      if (booking.status === "confirmed") {
        console.log("[PayMongo webhook] skipping: already confirmed", { ref });
        return ack200();
      }

      await supabase
        .from("bookings")
        .update({ status: "confirmed" })
        .eq("id", booking.id);

      const { data: ticketsForSeats } = await supabase
        .from("tickets")
        .select("seat_id")
        .eq("booking_id", booking.id)
        .not("seat_id", "is", null);
      const seatIds = (ticketsForSeats ?? []).map((t) => t.seat_id);
      if (seatIds.length > 0) {
        await supabase.from("event_seats").update({ status: "sold" }).in("id", seatIds);
      }

      const { data: payment } = await supabase
        .from("payments")
        .select("id")
        .eq("booking_id", booking.id)
        .single();
      if (payment) {
        await supabase
          .from("payments")
          .update({ status: "paid" })
          .eq("id", payment.id);
      }

      after(async () => {
        try {
          const admin = createAdminClient();
          console.log("[PayMongo webhook] calling confirmBooking in background", {
            bookingId: ref,
          });
          await confirmBooking(admin, ref);
        } catch (err) {
          console.error("[PayMongo webhook] background confirmBooking:", err);
        }
      });
      console.log("[PayMongo webhook] done", {
        bookingId: ref,
        type,
        phase: "paid_event",
        result: "ok",
        duration_ms: Date.now() - t0,
      });
      return ack200();
    }

    const isFailedEvent = type === "payment.failed" || type === "link.payment.failed" || type === "checkout_session.payment.failed";
    if (isFailedEvent && ref) {
      // Only mark as failed if booking is still pending. If already confirmed (e.g. paid
      // event processed first), do not overwrite — PayMongo can send failed events after
      // paid (retries, ordering, or multiple attempts), and we must not undo a success.
      const { data: existing } = await supabase
        .from("bookings")
        .select("status")
        .eq("id", ref)
        .single();
      if (existing?.status === "pending") {
        await releaseFailedBooking(supabase, ref);
        const { data: payment } = await supabase
          .from("payments")
          .select("id")
          .eq("booking_id", ref)
          .single();
        await supabase
          .from("bookings")
          .update({ status: "failed" })
          .eq("id", ref);
        if (payment?.id) {
          await supabase.from("payments").update({ status: "failed" }).eq("id", payment.id);
        }
      } else {
        console.log("[PayMongo webhook] ignoring failed event: booking already", existing?.status);
      }
    }

    console.log("[PayMongo webhook] done", {
      bookingId: ref,
      type,
      phase: isFailedEvent ? "failed_event" : "ignored_event",
      result: "ok",
      duration_ms: Date.now() - t0,
    });
    return ack200();
  } catch (err) {
    console.error("[PayMongo webhook] unhandled", err);
    return ack200();
  }
}
