import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getEnabledPaymongoMethods, getPaymongoProcessingFees, getPaymongoSecretKey } from "@/lib/paymongo-config";
import {
  computeChargedCentsForBucket,
  resolvePaymongoMethodsForBucket,
  type PaymongoPaymentBucket,
} from "@/lib/paymongo-processing-fees";
import { createCheckoutSession, getPaymongoCheckoutUrl } from "@/lib/paymongo";
import { createAndUploadTicketQR } from "@/lib/ticket-qr";
import {
  buildSeatSaleTicket,
  buildSectionSaleTicket,
  finalizeInventoryAllocationsForSaleTickets,
  resolveTicketImageUrl,
  TicketInventoryError,
} from "@/lib/ticket-inventory";
import {
  generateAndUploadTicketImage,
  getResolvedTicketTemplate,
  generateTicketImageForTicketId,
  ticketAttachmentExtFromImageUrl,
} from "@/lib/ticket-image";
import { sendEventSaleNotificationToTeam, sendTicketEmail } from "@/lib/email";
import { generateQRBuffer } from "@/lib/qr";
import { getProfileRole } from "@/lib/auth";
import { getSiteOrigin } from "@/lib/site-url";
import { formatEventDateTimeLong } from "@/lib/event-datetime";
import {
  specialRequestDetailsForStorage,
  specialRequestFieldsSchema,
  specialRequestRefine,
} from "@/lib/special-request";
import { buildPricedCartUnits } from "@/lib/promo-cart-units";
import {
  assertAtMostOneRulePromo,
  discountCentsForPromo,
  getPromoByCode,
  type PromoRow,
} from "@/lib/promo-apply";
import { parsePromoRule } from "@/lib/promo-rule-schema";
import type { PaymongoMethodId } from "@/lib/paymongo-methods";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Match `lib/confirm-booking` — parallelize ticket attachment prep; cap concurrency for serverless memory. */
const CHECKOUT_TICKET_ATTACHMENT_CONCURRENCY = 10;

async function buildCheckoutEmailTicketAttachment(
  admin: ReturnType<typeof createAdminClient>,
  t: {
    id: string;
    qr_data: string;
    encrypted_qr?: string | null;
    ticket_image_url: string | null;
    print_ticket_id?: string | null;
  },
  index: number
): Promise<{ filename: string; content: Buffer }> {
  let buf: Buffer;
  const qrPayload = t.encrypted_qr ?? t.qr_data;
  let imageUrlForExt: string | null = null;

  let ticketImageUrl =
    (await resolveTicketImageUrl(admin, t, {
      generateIfMissing: Boolean(t.print_ticket_id),
    })) ?? t.ticket_image_url;

  if (ticketImageUrl) {
    const res = await fetch(ticketImageUrl);
    if (res.ok) {
      buf = Buffer.from(await res.arrayBuffer());
      imageUrlForExt = ticketImageUrl;
    } else {
      buf = await generateQRBuffer(qrPayload);
    }
  } else if (!t.print_ticket_id) {
    const generated = await generateTicketImageForTicketId(t.id);
    if (generated) {
      const res = await fetch(generated);
      if (res.ok) {
        buf = Buffer.from(await res.arrayBuffer());
        imageUrlForExt = generated;
      } else {
        buf = await generateQRBuffer(qrPayload);
      }
    } else {
      buf = await generateQRBuffer(qrPayload);
    }
  } else {
    buf = await generateQRBuffer(qrPayload);
  }
  const ext = imageUrlForExt ? ticketAttachmentExtFromImageUrl(imageUrlForExt) : "png";
  return { filename: `ticket-${index + 1}.${ext}`, content: buf };
}

async function buildCheckoutEmailAttachmentsParallel(
  adminClient: ReturnType<typeof createAdminClient>,
  ticketRows: {
    id: string;
    qr_data: string;
    encrypted_qr?: string | null;
    ticket_image_url: string | null;
    print_ticket_id?: string | null;
  }[]
): Promise<{ filename: string; content: Buffer }[]> {
  const out: { filename: string; content: Buffer }[] = [];
  for (let start = 0; start < ticketRows.length; start += CHECKOUT_TICKET_ATTACHMENT_CONCURRENCY) {
    const slice = ticketRows.slice(start, start + CHECKOUT_TICKET_ATTACHMENT_CONCURRENCY);
    const batch = await Promise.all(
      slice.map((t, j) => buildCheckoutEmailTicketAttachment(adminClient, t, start + j))
    );
    out.push(...batch);
  }
  return out;
}

async function notifyTeamOnSuccessfulSale(params: {
  admin: ReturnType<typeof createAdminClient>;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  venueName: string;
  buyerName: string;
  buyerEmail?: string;
  ticketCount: number;
  totalCents: number;
  bookingId: string;
  enabled: boolean;
  createdBy?: string | null;
}): Promise<void> {
  if (!params.enabled) return;
  try {
    const recipientUserIds = new Set<string>();
    const { data: eventAdmins } = await params.admin
      .from("event_administrators")
      .select("user_id")
      .eq("event_id", params.eventId);
    for (const row of eventAdmins ?? []) {
      if (row.user_id) recipientUserIds.add(row.user_id);
    }
    if (params.createdBy) recipientUserIds.add(params.createdBy);
    const ids = [...recipientUserIds];
    if (ids.length === 0) return;
    const { data: recipientProfiles } = await params.admin
      .from("profiles")
      .select("email")
      .in("id", ids);
    const bccEmails = (recipientProfiles ?? [])
      .map((p) => (p as { email?: string | null }).email?.trim())
      .filter((e): e is string => !!e);
    await sendEventSaleNotificationToTeam({
      bcc: bccEmails,
      eventTitle: params.eventTitle,
      eventDate: params.eventDate,
      venueName: params.venueName,
      buyerName: params.buyerName || "Customer",
      buyerEmail: params.buyerEmail,
      ticketCount: params.ticketCount,
      totalFormatted: (params.totalCents / 100).toLocaleString("en-PH", {
        style: "currency",
        currency: "PHP",
      }),
      bookingId: params.bookingId,
    });
  } catch (err) {
    console.error("[checkout] team sale notification failed:", err);
  }
}

const onSitePaymentSchema = z.object({
  customer_name: z.string().min(1, "Customer name is required"),
  customer_email: z.string().email("Valid email is required"),
  customer_phone: z.string().trim().optional(),
});

const checkoutSchema = z
  .object({
    cart_id: z.string().uuid(),
    event_id: z.string().uuid(),
    promo_code: z.string().trim().optional(),
    promo_codes: z.array(z.string().trim()).optional(),
    on_site_payment: onSitePaymentSchema.optional(),
    payment_bucket: z.enum(["qrph", "ewallet", "card", "banks"]).optional(),
  })
  .merge(specialRequestFieldsSchema)
  .superRefine(specialRequestRefine);

const DEFAULT_PRICE_CENTS = 50000; // 500 PHP fallback

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const marks: Record<string, number> = {};
  try {
    const anonClient = await createClient();
    const {
      data: { user },
    } = await anonClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;

    const body = await request.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const {
      cart_id,
      event_id,
      promo_code,
      promo_codes,
      on_site_payment,
      payment_bucket,
      special_request_type,
      special_request_details,
    } = parsed.data;
    const specialRequestDetailsStored = specialRequestDetailsForStorage(
      special_request_details
    );
    const isOnSitePayment = !!on_site_payment;
    const promoCodeList =
      promo_codes && promo_codes.length > 0
        ? [...new Set(promo_codes.map((c) => c.trim()).filter(Boolean))]
        : promo_code?.trim()
          ? [promo_code.trim()]
          : [];

    if (on_site_payment) {
      const role = await getProfileRole();
      if (role !== "admin" && role !== "super_admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const supabase = anonClient;
    const admin = createAdminClient();

    async function tryReusePendingPaymongoCheckout(
      opts: {
        bucket: PaymongoPaymentBucket;
        ticketNetCents: number;
        chargedCents: number;
      } | null
    ): Promise<NextResponse | null> {
      if (opts === null || isOnSitePayment) return null;
      const { data: pendingBookings } = await supabase
        .from("bookings")
        .select("id, created_at, total_cents")
        .eq("event_id", event_id)
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);
      const pendingBookingIds = (pendingBookings ?? []).map((b) => b.id);
      if (pendingBookingIds.length === 0) return null;
      const bookingNetById = new Map(
        (pendingBookings ?? []).map((b) => [b.id, Number(b.total_cents) || 0])
      );

      const { data: payments } = await supabase
        .from("payments")
        .select(
          "booking_id, paymongo_id, status, expires_at, created_at, paymongo_bucket, amount_cents"
        )
        .in("booking_id", pendingBookingIds)
        .order("created_at", { ascending: false });
      const nowIso = new Date().toISOString();
      const pendingPayment = (payments ?? []).find(
        (p) =>
          !!p.paymongo_id &&
          p.status === "pending" &&
          (!p.expires_at || p.expires_at > nowIso) &&
          typeof (p as { paymongo_bucket?: string | null }).paymongo_bucket === "string" &&
          (p as { paymongo_bucket: string }).paymongo_bucket === opts.bucket &&
          bookingNetById.get(p.booking_id) === opts.ticketNetCents &&
          Number((p as { amount_cents?: number }).amount_cents ?? 0) === opts.chargedCents
      );
      if (!pendingPayment?.paymongo_id) return null;

      const checkoutUrl = await getPaymongoCheckoutUrl(pendingPayment.paymongo_id);
      if (!checkoutUrl) return null;
      const { data: eventForRedirect } = await admin
        .from("events")
        .select("slug")
        .eq("id", event_id)
        .in("status", ["draft", "published"])
        .single();
      return NextResponse.json({
        booking_id: pendingPayment.booking_id,
        redirect_url: checkoutUrl,
        event_slug: eventForRedirect?.slug ?? null,
        reused_pending_payment: true,
        ticket_net_cents: opts.ticketNetCents,
        charged_cents: opts.chargedCents,
      });
    }

    const { data: cart } = await supabase
      .from("reservation_carts")
      .select("id, expires_at")
      .eq("id", cart_id)
      .eq("event_id", event_id)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!cart) {
      const reused = await tryReusePendingPaymongoCheckout(null);
      if (reused) return reused;
      return NextResponse.json(
        { error: "Reservation expired or invalid" },
        { status: 400 }
      );
    }

    const { data: items } = await supabase
      .from("reservation_items")
      .select("seat_id, section_id, quantity, add_on_id")
      .eq("cart_id", cart_id);

    type CartLine = {
      seat_id: string | null;
      section_id: string | null;
      quantity: number | null;
      add_on_id: string | null;
    };
    const lines = (items ?? []) as CartLine[];

    const addOnItemsRaw = lines.filter(
      (i) => !!i.add_on_id && (i.quantity ?? 0) >= 1
    ) as { add_on_id: string; quantity: number }[];

    const seatItemsRaw = lines.filter(
      (i): i is CartLine & { seat_id: string } => !!i.seat_id
    );
    const sectionItemsRaw = lines.filter(
      (i): i is CartLine & { seat_id: null; section_id: string; quantity: number } =>
        !i.seat_id &&
        !i.add_on_id &&
        !!i.section_id &&
        (i.quantity ?? 1) > 0
    );
    const seenSeats = new Set<string>();
    const seatItems = seatItemsRaw.filter((i) => {
      if (seenSeats.has(i.seat_id)) return false;
      seenSeats.add(i.seat_id);
      return true;
    });

    if (!seatItems.length && !sectionItemsRaw.length) {
      const reused = await tryReusePendingPaymongoCheckout(null);
      if (reused) return reused;
      return NextResponse.json(
        { error: "No items in reservation" },
        { status: 400 }
      );
    }
    marks.validate_and_load_cart_ms = Date.now() - t0;

    const now = new Date().toISOString();

    const { data: eventData } = await admin
      .from("events")
      .select("early_bird_starts_at, early_bird_ends_at, ticket_purchase_per_user")
      .eq("id", event_id)
      .in("status", ["draft", "published"])
      .single();

    if (!eventData) {
      return NextResponse.json(
        { error: "Event not found or not available for checkout" },
        { status: 404 }
      );
    }

    const newPurchaseCount =
      seatItems.length +
      sectionItemsRaw.reduce((sum, item) => sum + Math.max(0, item.quantity ?? 1), 0);
    const perUserLimit = Math.max(
      0,
      Number(eventData?.ticket_purchase_per_user ?? 0) || 0
    );
    if (!isOnSitePayment && perUserLimit > 0 && newPurchaseCount > 0) {
      const { data: confirmedBookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("event_id", event_id)
        .eq("user_id", user.id)
        .eq("status", "confirmed");
      const confirmedBookingIds = (confirmedBookings ?? []).map((b) => b.id);

      let alreadyBoughtCount = 0;
      if (confirmedBookingIds.length > 0) {
        const { count } = await supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .in("booking_id", confirmedBookingIds);
        alreadyBoughtCount = count ?? 0;
      }

      const attemptedTotal = alreadyBoughtCount + newPurchaseCount;
      if (attemptedTotal > perUserLimit) {
        const remainingAllowed = Math.max(0, perUserLimit - alreadyBoughtCount);
        return NextResponse.json(
          {
            error:
              remainingAllowed > 0
                ? `Ticket limit reached for this event. You can only buy ${remainingAllowed} more ticket(s).`
                : "Ticket limit reached for this event. You cannot buy more tickets.",
            ticket_limit: perUserLimit,
            already_bought: alreadyBoughtCount,
            attempted_purchase: newPurchaseCount,
          },
          { status: 409 }
        );
      }
    }

    const priced = await buildPricedCartUnits(supabase, event_id, cart_id, {
      admin,
      userId: user.id,
    });
    if ("error" in priced) {
      return NextResponse.json(
        { error: "Reservation expired or invalid" },
        { status: 400 }
      );
    }
    let totalCents = priced.subtotal_cents;
    const pricedUnits = priced.units;
    const useEarlyBird = priced.use_early_bird;
    marks.pricing_ms = Date.now() - t0 - (marks.validate_and_load_cart_ms ?? 0);

    const [{ data: eventPricesForTickets }, { data: earlyBirdForTickets }] = await Promise.all([
      supabase
        .from("event_prices")
        .select("section_id, price_cents")
        .eq("event_id", event_id),
      supabase
        .from("early_bird_prices")
        .select("section_id, discount_percent")
        .eq("event_id", event_id),
    ]);
    const basePriceMapForTickets = new Map<string, number>();
    for (const p of eventPricesForTickets ?? []) {
      if (p.section_id) basePriceMapForTickets.set(p.section_id, p.price_cents);
    }
    const earlyBirdPercentMapForTickets = new Map<string, number>();
    for (const eb of earlyBirdForTickets ?? []) {
      if (eb.section_id) earlyBirdPercentMapForTickets.set(eb.section_id, eb.discount_percent);
    }
    function getPriceForSection(sectionId: string): number {
      const base = basePriceMapForTickets.get(sectionId) ?? DEFAULT_PRICE_CENTS;
      const discountPercent = earlyBirdPercentMapForTickets.get(sectionId);
      if (useEarlyBird && discountPercent !== undefined) {
        return Math.floor((base * (100 - discountPercent)) / 100);
      }
      return base;
    }

    let discountCents = 0;
    let promoCodeId: string | null = null;
    const appliedPromoRows: {
      promo_code_id: string;
      discount_cents: number;
      code: string;
      stackable: boolean;
    }[] = [];
    const appliedCodes = new Set<string>();

    if (promoCodeList.length > 0) {
      const ruleChk = await assertAtMostOneRulePromo(supabase, promoCodeList);
      if (!ruleChk.ok) {
        return NextResponse.json({ error: ruleChk.message }, { status: 400 });
      }
    }

    for (const code of promoCodeList) {
      const codeNorm = code.trim().toUpperCase();
      if (appliedCodes.has(codeNorm)) continue;
      const promo = await getPromoByCode(supabase, code);

      if (!promo || !promo.active) continue;
      if (promo.rule != null && !parsePromoRule(promo.rule)) {
        return NextResponse.json(
          {
            error:
              "A promo in your order is misconfigured. Remove it and try again or contact the organizer.",
          },
          { status: 400 }
        );
      }

      const eventMatch = !promo.event_id || promo.event_id === event_id;
      const inDateRange =
        (!promo.starts_at || promo.starts_at <= now) &&
        (!promo.expires_at || promo.expires_at >= now);
      const underLimit =
        promo.max_uses == null || promo.used_count < promo.max_uses;

      const stackable = promo.stackable === true;
      if (!stackable && (useEarlyBird || appliedPromoRows.length > 0)) {
        return NextResponse.json(
          {
            error:
              "This promo code cannot be combined with early bird pricing or other promotions.",
          },
          { status: 400 }
        );
      }
      if (appliedPromoRows.some((r) => !r.stackable)) {
        return NextResponse.json(
          {
            error:
              "A non-stackable promo code cannot be combined with other promotions.",
          },
          { status: 400 }
        );
      }

      if (eventMatch && inDateRange && underLimit) {
        const thisDiscount = discountCentsForPromo(
          promo as PromoRow,
          totalCents,
          pricedUnits
        );
        totalCents = Math.max(0, totalCents - thisDiscount);
        discountCents += thisDiscount;
        appliedPromoRows.push({
          promo_code_id: promo.id,
          discount_cents: thisDiscount,
          code: codeNorm,
          stackable,
        });
        appliedCodes.add(codeNorm);
        if (!promoCodeId) promoCodeId = promo.id;
      }
    }
    marks.promo_ms = Date.now() - t0 - (marks.validate_and_load_cart_ms ?? 0) - (marks.pricing_ms ?? 0);

    type AddOnBookingLine = {
      event_add_on_id: string;
      title: string;
      image_url: string;
      quantity: number;
      unit_price_cents: number;
    };
    const addOnBookingLinesForDb: AddOnBookingLine[] = [];
    const mergedAddOnCart = new Map<string, number>();
    for (const r of addOnItemsRaw) {
      mergedAddOnCart.set(
        r.add_on_id,
        (mergedAddOnCart.get(r.add_on_id) ?? 0) + (r.quantity ?? 1)
      );
    }
    if (mergedAddOnCart.size > 0) {
      const addOnIdsCheckout = [...mergedAddOnCart.keys()];
      const { data: addOnCatalogCheckout } = await admin
        .from("event_add_ons")
        .select("id, title, image_url, price_cents, stock_quantity, max_qty_per_cart, is_hidden")
        .eq("event_id", event_id)
        .in("id", addOnIdsCheckout);
      if (!addOnCatalogCheckout || addOnCatalogCheckout.length !== addOnIdsCheckout.length) {
        return NextResponse.json({ error: "Invalid add-on in cart." }, { status: 400 });
      }
      let addOnSum = 0;
      for (const row of addOnCatalogCheckout) {
        if (row.is_hidden) {
          return NextResponse.json(
            { error: "An add-on in your cart is no longer available. Update your cart and try again." },
            { status: 400 }
          );
        }
        const want = mergedAddOnCart.get(row.id) ?? 0;
        const stock = row.stock_quantity ?? 0;
        const cap = Math.max(1, Math.min(9999, Number(row.max_qty_per_cart) || 10));
        if (want > stock) {
          return NextResponse.json(
            { error: "Not enough stock for an add-on. Update your cart and try again." },
            { status: 409 }
          );
        }
        if (want > cap) {
          return NextResponse.json(
            {
              error: `Add-on quantity exceeds the maximum per cart (${cap}). Update your cart and try again.`,
            },
            { status: 409 }
          );
        }
        addOnSum += (row.price_cents ?? 0) * want;
        addOnBookingLinesForDb.push({
          event_add_on_id: row.id,
          title: row.title ?? "",
          image_url: row.image_url ?? "",
          quantity: want,
          unit_price_cents: row.price_cents ?? 0,
        });
      }
      totalCents += addOnSum;
    }

    const paymongoSecret = await getPaymongoSecretKey();
    const usePayMongo =
      totalCents > 0 &&
      !isOnSitePayment &&
      !!paymongoSecret;
    const status = usePayMongo ? "pending" : "confirmed";

    let paymongoMethodsForSession: PaymongoMethodId[] | null = null;
    let chargedCentsForPaymongo = totalCents;

    if (usePayMongo) {
      const bucket = payment_bucket;
      if (!bucket) {
        return NextResponse.json(
          { error: "Choose a payment option before continuing." },
          { status: 400 }
        );
      }
      const [processingFeesConfig, enabledMethods] = await Promise.all([
        getPaymongoProcessingFees(),
        getEnabledPaymongoMethods(),
      ]);
      const resolvedMethods = resolvePaymongoMethodsForBucket(bucket, enabledMethods);
      if (resolvedMethods.length === 0) {
        return NextResponse.json(
          { error: "That payment option is not available. Pick another or contact support." },
          { status: 400 }
        );
      }
      paymongoMethodsForSession = resolvedMethods;
      chargedCentsForPaymongo = computeChargedCentsForBucket(totalCents, bucket, processingFeesConfig);

      const reusedCheckout = await tryReusePendingPaymongoCheckout({
        bucket,
        ticketNetCents: totalCents,
        chargedCents: chargedCentsForPaymongo,
      });
      if (reusedCheckout) return reusedCheckout;
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        user_id: isOnSitePayment ? null : user.id,
        event_id,
        status,
        total_cents: totalCents,
        promo_code_id: promoCodeId,
        discount_cents: discountCents,
        special_request_type,
        special_request_details: specialRequestDetailsStored,
        ...(isOnSitePayment ? { accepted_by_admin_id: user.id } : {}),
        ...(isOnSitePayment && on_site_payment?.customer_phone
          ? { buyer_phone: on_site_payment.customer_phone }
          : {}),
        ...(isOnSitePayment && on_site_payment
          ? { buyer_email_override: on_site_payment.customer_email.trim() }
          : {}),
      })
      .select("id")
      .single();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: bookingError?.message ?? "Failed to create booking" },
        { status: 500 }
      );
    }

    // Create PayMongo Checkout Session (supports billing prefill; Links API does not)
    let payMongoLink: { checkout_url: string; id: string } | null = null;
    if (usePayMongo) {
      const [{ data: eventForLink }, { data: profile }] = await Promise.all([
        admin
          .from("events")
          .select("slug, title")
          .eq("id", event_id)
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
      const eventSlug = eventForLink?.slug ?? "event";
      const session = await createCheckoutSession({
        amountCents: chargedCentsForPaymongo,
        description: eventForLink?.title ?? "Event",
        referenceNumber: booking.id,
        successUrl: `${origin}/${eventSlug}/payment-return/${booking.id}`,
        cancelUrl: `${origin}/${eventSlug}/checkout?eventId=${encodeURIComponent(event_id)}&resumeBooking=${encodeURIComponent(booking.id)}`,
        paymentMethodTypes: paymongoMethodsForSession ?? [],
        ...(Object.keys(billing).length > 0 && { billing }),
      });
      if (!session) {
        await supabase.from("bookings").delete().eq("id", booking.id);
        console.error("[checkout] PayMongo checkout session failed; check Global Settings or PAYMONGO_SECRET_KEY and PayMongo API");
        return NextResponse.json(
          { error: "Payment could not be initialized. Please try again or contact support." },
          { status: 502 }
        );
      }
      payMongoLink = session;
    }
    marks.payment_init_ms = Date.now() - t0 - (marks.validate_and_load_cart_ms ?? 0) - (marks.pricing_ms ?? 0) - (marks.promo_ms ?? 0);

    const { data: eventRow } = await admin
      .from("events")
      .select(
        "event_code, title, event_start, venue_id, ticket_template_image_url, image_url, thumbnail_url, sale_success_email_enabled, created_by"
      )
      .eq("id", event_id)
      .in("status", ["draft", "published"])
      .single();

    const seatIdsForQuery = seatItems.map((i) => i.seat_id);
    const [{ data: venueRow }, { data: seatRows }] = await Promise.all([
      eventRow?.venue_id
        ? supabase
            .from("venues")
            .select("name")
            .eq("id", eventRow.venue_id)
            .single()
        : Promise.resolve({ data: null }),
      seatIdsForQuery.length > 0
        ? supabase
            .from("event_seats")
            .select("id, row_label, seat_number, event_section_id")
            .in("id", seatIdsForQuery)
        : { data: [] },
    ]);

    const eventCode = eventRow?.event_code ?? "";
    const venueName = (venueRow as { name?: string } | null)?.name ?? "TBA";
    const eventImageUrl = eventRow?.image_url ?? eventRow?.thumbnail_url ?? null;

    const sectionIdsFromSeats = (seatRows ?? []).map((s) => s.event_section_id).filter((id): id is string => !!id);
    const sectionIdsFromItems = sectionItemsRaw.map((i) => i.section_id);
    const sectionIds = [...new Set([...sectionIdsFromSeats, ...sectionIdsFromItems])];
    const { data: sectionRows } =
      sectionIds.length > 0
        ? await supabase
            .from("event_sections")
            .select("id, section_code, name, seating_type, section_group")
            .in("id", sectionIds)
        : { data: [] };
    const sectionCodeMap = new Map(
      (sectionRows ?? []).map((s) => [s.id, s.section_code ?? ""])
    );
    const sectionNameMap = new Map(
      (sectionRows ?? []).map((s) => [s.id, s.name ?? s.section_code ?? ""])
    );
    const sectionGroupMap = new Map<string, string | null>(
      (sectionRows ?? []).map((s) => {
        const g = (s as { section_group?: string | null }).section_group?.trim();
        return [s.id, g ? g : null];
      })
    );
    const sectionSeatingTypeMap = new Map(
      (sectionRows ?? []).map((s) => [s.id, s.seating_type ?? "assigned"])
    );

    const seatDataMap = new Map(
      (seatRows ?? []).map((s) => [
        s.id,
        {
          sectionId: s.event_section_id ?? null,
          sectionCode: sectionCodeMap.get(s.event_section_id ?? "") ?? "SEC",
          sectionName: sectionNameMap.get(s.event_section_id ?? "") ?? "—",
          sectionGroup: sectionGroupMap.get(s.event_section_id ?? "") ?? null,
          seatingType: sectionSeatingTypeMap.get(s.event_section_id ?? "") ?? "assigned",
          rowLabel: s.row_label ?? "-",
          seatNumber: s.seat_number ?? "-",
        },
      ])
    );

    const usedQrData = new Set<string>();
    function registerUniqueQr(base: string): string {
      let q = base;
      if (usedQrData.has(q)) {
        let suffix = 1;
        while (usedQrData.has(`${q}-${suffix}`)) suffix++;
        q = `${q}-${suffix}`;
      }
      usedQrData.add(q);
      return q;
    }

    type TicketRowInsert = {
      id: string;
      booking_id: string;
      seat_id: string | null;
      section_id: string | null;
      quantity: number;
      qr_data: string;
      encrypted_qr: string;
      qr_image_url: string | null;
      ticket_image_url: string | null;
      print_ticket_id?: string | null;
      recipient_name?: string;
    };

    let seatTicketRows: TicketRowInsert[] = [];
    let sectionTicketRows: TicketRowInsert[] = [];

    const recipientName =
      isOnSitePayment && on_site_payment ? on_site_payment.customer_name : undefined;

    try {
      for (const item of seatItems) {
        const seatData = seatDataMap.get(item.seat_id);
        const row = await buildSeatSaleTicket(admin, {
          bookingId: booking.id,
          seatId: item.seat_id,
          eventId: event_id,
          recipientName,
          mintContext:
            eventCode && seatData
              ? {
                  eventCode,
                  sectionCode: seatData.sectionCode,
                  rowLabel: seatData.rowLabel,
                  seatNumber: seatData.seatNumber,
                }
              : null,
          registerUniqueQr,
        });
        seatTicketRows.push(row);
      }

      for (const item of sectionItemsRaw) {
        const sectionCode = sectionCodeMap.get(item.section_id) ?? "SEC";
        const seatingType = sectionSeatingTypeMap.get(item.section_id) ?? "assigned";
        const qty = item.quantity ?? 1;
        for (let n = 1; n <= qty; n++) {
          const row = await buildSectionSaleTicket(admin, {
            bookingId: booking.id,
            eventId: event_id,
            sectionId: item.section_id,
            slotIndex: n,
            seatingType,
            sectionCode,
            eventCode,
            registerUniqueQr,
            recipientName,
          });
          sectionTicketRows.push(row);
        }
      }
    } catch (e) {
      if (e instanceof TicketInventoryError) {
        await supabase.from("bookings").delete().eq("id", booking.id);
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    if (!usePayMongo) {
      const resolvedTemplate = await getResolvedTicketTemplate(eventRow);
      seatTicketRows = await Promise.all(
        seatTicketRows.map(async (row) => {
          if (row.ticket_image_url || row.print_ticket_id) return row;
          const seatInfo = row.seat_id ? seatDataMap.get(row.seat_id) : null;
          const seatLabel = seatInfo
            ? seatInfo.seatingType === "standing"
              ? "Standing"
              : seatInfo.seatingType === "free"
                ? "Free Seating"
                : `Row ${seatInfo.rowLabel} Seat ${seatInfo.seatNumber}`
            : "General";
          const sectionId = seatInfo?.sectionId ?? null;
          const priceCents = sectionId ? getPriceForSection(sectionId) : DEFAULT_PRICE_CENTS;
          const qrImageUrl = await createAndUploadTicketQR(row.id, row.encrypted_qr);
          const ticketImageUrl = await generateAndUploadTicketImage(row.id, {
            eventTitle: eventRow?.title ?? "Event",
            venueName,
            eventStart: eventRow?.event_start ?? new Date().toISOString(),
            sectionCode: seatInfo?.sectionCode ?? "—",
            sectionName: seatInfo?.sectionName ?? "—",
            sectionGroup: seatInfo?.sectionGroup ?? undefined,
            seatLabel,
            priceCents,
            qrData: row.encrypted_qr,
            ticketNumber: row.qr_data,
            encryptedQr: row.encrypted_qr,
            templateImageUrl: resolvedTemplate.templateImageUrl,
            layoutConfig: resolvedTemplate.layoutConfig ?? undefined,
          });
          return {
            ...row,
            qr_image_url: qrImageUrl,
            ticket_image_url: ticketImageUrl,
          };
        })
      );

      sectionTicketRows = await Promise.all(
        sectionTicketRows.map(async (row) => {
          if (row.ticket_image_url || row.print_ticket_id) return row;
          const sectionCode = sectionCodeMap.get(row.section_id ?? "") ?? "SEC";
          const sectionName = sectionNameMap.get(row.section_id ?? "") ?? "—";
          const sectionGroup = sectionGroupMap.get(row.section_id ?? "") ?? null;
          const seatingType = sectionSeatingTypeMap.get(row.section_id ?? "") ?? "assigned";
          const seatLabel =
            seatingType === "standing"
              ? "Standing"
              : seatingType === "free"
                ? "Free Seating"
                : "General";
          const priceCents = row.section_id
            ? getPriceForSection(row.section_id)
            : DEFAULT_PRICE_CENTS;
          const qrImageUrl = await createAndUploadTicketQR(row.id, row.encrypted_qr);
          const ticketImageUrl = await generateAndUploadTicketImage(row.id, {
            eventTitle: eventRow?.title ?? "Event",
            venueName,
            eventStart: eventRow?.event_start ?? new Date().toISOString(),
            sectionCode,
            sectionName,
            sectionGroup: sectionGroup ?? undefined,
            seatLabel,
            priceCents,
            qrData: row.encrypted_qr,
            ticketNumber: row.qr_data,
            encryptedQr: row.encrypted_qr,
            templateImageUrl: resolvedTemplate.templateImageUrl,
            layoutConfig: resolvedTemplate.layoutConfig ?? undefined,
          });
          return {
            ...row,
            qr_image_url: qrImageUrl,
            ticket_image_url: ticketImageUrl,
          };
        })
      );
    }

    const ticketRows = [...seatTicketRows, ...sectionTicketRows];
    const { error: ticketsInsertError } = await supabase.from("tickets").insert(ticketRows);
    if (ticketsInsertError) {
      throw new Error(ticketsInsertError.message);
    }
    try {
      await finalizeInventoryAllocationsForSaleTickets(admin, ticketRows);
    } catch (e) {
      await supabase.from("tickets").delete().eq("booking_id", booking.id);
      if (e instanceof TicketInventoryError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    if (addOnBookingLinesForDb.length > 0) {
      for (const l of addOnBookingLinesForDb) {
        const { data: curRow } = await admin
          .from("event_add_ons")
          .select("stock_quantity")
          .eq("id", l.event_add_on_id)
          .single();
        const cur = curRow?.stock_quantity ?? 0;
        if (cur < l.quantity) {
          console.error("[checkout] add-on stock race", l.event_add_on_id);
          return NextResponse.json(
            { error: "An add-on sold out during checkout. Try again with a lower quantity." },
            { status: 409 }
          );
        }
        const { data: updated } = await admin
          .from("event_add_ons")
          .update({ stock_quantity: cur - l.quantity })
          .eq("id", l.event_add_on_id)
          .eq("stock_quantity", cur)
          .select("id");
        if (!updated?.length) {
          return NextResponse.json(
            { error: "An add-on sold out during checkout. Try again with a lower quantity." },
            { status: 409 }
          );
        }
      }
      const { error: baoErr } = await admin.from("booking_add_ons").insert(
        addOnBookingLinesForDb.map((l) => ({
          booking_id: booking.id,
          event_add_on_id: l.event_add_on_id,
          title: l.title,
          image_url: l.image_url,
          quantity: l.quantity,
          unit_price_cents: l.unit_price_cents,
        }))
      );
      if (baoErr) {
        console.error("[checkout] booking_add_ons insert failed:", baoErr);
      }
    }
    const addOnSubtotalCents = addOnBookingLinesForDb.reduce(
      (sum, l) => sum + l.quantity * l.unit_price_cents,
      0
    );
    const addOnsDetails = addOnBookingLinesForDb
      .map((l) => {
        const lineTotal = l.quantity * l.unit_price_cents;
        const lineTotalStr = (lineTotal / 100).toLocaleString("en-PH", {
          style: "currency",
          currency: "PHP",
        });
        return `<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;">${escapeHtml(l.title || "Add-on")}</td><td style="text-align:right;padding:8px 0;">${l.quantity}</td><td style="text-align:right;padding:8px 0;">${lineTotalStr}</td></tr>`;
      })
      .join("");

    const seatIds = seatItems.map((i) => i.seat_id);
    if (seatIds.length > 0) {
      const admin = createAdminClient();
      // Pending online payments should hold seats as reserved, not sold.
      // Seats become sold only when payment is confirmed (webhook/status confirm flow).
      await admin
        .from("event_seats")
        .update({ status: usePayMongo ? "reserved" : "sold" })
        .in("id", seatIds);
    }

    await supabase.from("reservation_items").delete().eq("cart_id", cart_id);
    await supabase.from("reservation_carts").delete().eq("id", cart_id);

    await Promise.all(
      appliedPromoRows.map((row) =>
        supabase.rpc("increment_promo_used_count", { p_id: row.promo_code_id })
      )
    );
    if (appliedPromoRows.length > 0) {
      const admin = createAdminClient();
      const { error: bpcError } = await admin.from("booking_promo_codes").insert(
        appliedPromoRows.map((r) => ({
          booking_id: booking.id,
          promo_code_id: r.promo_code_id,
          discount_cents: r.discount_cents,
        }))
      );
      if (bpcError) {
        console.error("[checkout] booking_promo_codes insert failed:", bpcError);
      }
    }

    const { data: event } = await admin
      .from("events")
      .select("slug, title")
      .eq("id", event_id)
      .in("status", ["draft", "published"])
      .single();

    if (payMongoLink) {
      await supabase.from("payments").insert({
        booking_id: booking.id,
        paymongo_id: payMongoLink.id,
        status: "pending",
        amount_cents: chargedCentsForPaymongo,
        paymongo_bucket: payment_bucket ?? null,
        expires_at: cart.expires_at,
      });
      return NextResponse.json({
        booking_id: booking.id,
        redirect_url: payMongoLink.checkout_url,
        event_slug: event?.slug,
        ticket_net_cents: totalCents,
        charged_cents: chargedCentsForPaymongo,
      });
    }

    if (isOnSitePayment && on_site_payment) {
      const customerEmail = on_site_payment.customer_email;
      const customerName = on_site_payment.customer_name;
      console.log("[checkout] On-site payment, sending ticket email to", customerEmail);
      const eventDate = eventRow?.event_start
        ? formatEventDateTimeLong(eventRow.event_start)
        : "TBA";
      const ticketDetailsRows: string[] = [];
      let ticketDetailsSubtotalCents = 0;
      for (const item of seatItems) {
        const seatData = seatDataMap.get(item.seat_id);
        const sectionName = seatData?.sectionName ?? "—";
        const seatLabel =
          seatData?.seatingType === "standing"
            ? "Standing"
            : seatData?.seatingType === "free"
              ? "Free Seating"
              : `Row ${seatData?.rowLabel ?? "-"} Seat ${seatData?.seatNumber ?? "-"}`;
        const sectionId = seatData?.sectionId ?? null;
        const priceCents = sectionId ? getPriceForSection(sectionId) : DEFAULT_PRICE_CENTS;
        ticketDetailsSubtotalCents += priceCents;
        const priceStr = (priceCents / 100).toLocaleString("en-PH", {
          style: "currency",
          currency: "PHP",
        });
        ticketDetailsRows.push(
          `<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;">${escapeHtml(sectionName)}</td><td style="padding:8px 0;">${escapeHtml(seatLabel)}</td><td style="text-align:right;padding:8px 0;">${priceStr}</td></tr>`
        );
      }
      const ticketDetails = ticketDetailsRows.join("");
      const ticketSubtotalCents =
        ticketDetailsSubtotalCents > 0
          ? ticketDetailsSubtotalCents
          : totalCents + discountCents - addOnSubtotalCents;
      const subtotalCents = ticketSubtotalCents + addOnSubtotalCents;
      const attachments = await buildCheckoutEmailAttachmentsParallel(admin, ticketRows);
      try {
        await sendTicketEmail({
          to: customerEmail,
          eventTitle: eventRow?.title ?? "Event",
          eventDate,
          venueName,
          attachments,
          buyerName: customerName,
          ticketDetails,
          addOnsDetails,
          subtotalCents,
          discountCents,
          totalCents,
          discountDescription: appliedPromoRows.map((r) => r.code).join(", "),
          eventImageUrl: eventImageUrl ?? undefined,
        });
        await createAdminClient()
          .from("bookings")
          .update({ ticket_email_sent_at: new Date().toISOString() })
          .eq("id", booking.id);
        console.log("[checkout] on-site ticket email sent successfully");
      } catch (err) {
        console.error("[checkout] failed to send on-site ticket email:", err);
      }
      await notifyTeamOnSuccessfulSale({
        admin,
        eventId: event_id,
        eventTitle: eventRow?.title ?? "Event",
        eventDate,
        venueName,
        buyerName: customerName,
        buyerEmail: customerEmail,
        ticketCount: ticketRows.length,
        totalCents,
        bookingId: booking.id,
        enabled:
          (eventRow as { sale_success_email_enabled?: boolean | null } | null)
            ?.sale_success_email_enabled === true,
        createdBy: (eventRow as { created_by?: string | null } | null)?.created_by ?? null,
      });
    } else if (!usePayMongo && user.email) {
      console.log("[checkout] PayMongo disabled, sending ticket email to", user.email);
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      const eventDate = eventRow?.event_start
        ? formatEventDateTimeLong(eventRow.event_start)
        : "TBA";
      const ticketDetailsRows: string[] = [];
      let ticketDetailsSubtotalCents = 0;
      for (const item of seatItems) {
        const seatData = seatDataMap.get(item.seat_id);
        const sectionName = seatData?.sectionName ?? "—";
        const seatLabel =
          seatData?.seatingType === "standing"
            ? "Standing"
            : seatData?.seatingType === "free"
              ? "Free Seating"
              : `Row ${seatData?.rowLabel ?? "-"} Seat ${seatData?.seatNumber ?? "-"}`;
        const sectionId = seatData?.sectionId ?? null;
        const priceCents = sectionId ? getPriceForSection(sectionId) : DEFAULT_PRICE_CENTS;
        ticketDetailsSubtotalCents += priceCents;
        const priceStr = (priceCents / 100).toLocaleString("en-PH", {
          style: "currency",
          currency: "PHP",
        });
        ticketDetailsRows.push(
          `<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;">${escapeHtml(sectionName)}</td><td style="padding:8px 0;">${escapeHtml(seatLabel)}</td><td style="text-align:right;padding:8px 0;">${priceStr}</td></tr>`
        );
      }
      const ticketDetails = ticketDetailsRows.join("");
      const ticketSubtotalCents =
        ticketDetailsSubtotalCents > 0
          ? ticketDetailsSubtotalCents
          : totalCents + discountCents - addOnSubtotalCents;
      const subtotalCents = ticketSubtotalCents + addOnSubtotalCents;
      const attachments = await buildCheckoutEmailAttachmentsParallel(admin, ticketRows);
      try {
        await sendTicketEmail({
          to: user.email,
          eventTitle: eventRow?.title ?? "Event",
          eventDate,
          venueName,
          attachments,
          buyerName: (profile as { full_name?: string } | null)?.full_name ?? "",
          ticketDetails,
          addOnsDetails,
          subtotalCents,
          discountCents,
          totalCents,
          discountDescription: appliedPromoRows.map((r) => r.code).join(", "),
          eventImageUrl: eventImageUrl ?? undefined,
        });
        await createAdminClient()
          .from("bookings")
          .update({ ticket_email_sent_at: new Date().toISOString() })
          .eq("id", booking.id);
        console.log("[checkout] ticket email sent successfully");
      } catch (err) {
        console.error("[checkout] failed to send ticket email:", err);
      }
      await notifyTeamOnSuccessfulSale({
        admin,
        eventId: event_id,
        eventTitle: eventRow?.title ?? "Event",
        eventDate,
        venueName,
        buyerName: (profile as { full_name?: string } | null)?.full_name ?? "",
        buyerEmail: user.email,
        ticketCount: ticketRows.length,
        totalCents,
        bookingId: booking.id,
        enabled:
          (eventRow as { sale_success_email_enabled?: boolean | null } | null)
            ?.sale_success_email_enabled === true,
        createdBy: (eventRow as { created_by?: string | null } | null)?.created_by ?? null,
      });
    } else if (!usePayMongo && !user.email) {
      console.warn("[checkout] PayMongo disabled but user has no email, skipping ticket email");
      const eventDate = eventRow?.event_start
        ? formatEventDateTimeLong(eventRow.event_start)
        : "TBA";
      await notifyTeamOnSuccessfulSale({
        admin,
        eventId: event_id,
        eventTitle: eventRow?.title ?? "Event",
        eventDate,
        venueName,
        buyerName: "Customer",
        buyerEmail: undefined,
        ticketCount: ticketRows.length,
        totalCents,
        bookingId: booking.id,
        enabled:
          (eventRow as { sale_success_email_enabled?: boolean | null } | null)
            ?.sale_success_email_enabled === true,
        createdBy: (eventRow as { created_by?: string | null } | null)?.created_by ?? null,
      });
    }

    return NextResponse.json({
      booking_id: booking.id,
      redirect_url: null,
      event_slug: event?.slug,
    });
  } catch (e) {
    console.error("[api/checkout] failed", {
      total_ms: Date.now() - t0,
      marks,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  } finally {
    console.log("[api/checkout] timing", {
      total_ms: Date.now() - t0,
      marks,
    });
  }
}
