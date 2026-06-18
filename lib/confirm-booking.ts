import type { SupabaseClient } from "@supabase/supabase-js";
import { generateQRBuffer } from "@/lib/qr";
import { sendEventSaleNotificationToTeam, sendTicketEmail } from "@/lib/email";
import {
  generateTicketImageForTicketId,
  ticketAttachmentExtFromImageUrl,
} from "@/lib/ticket-image";
import { resolveTicketImageUrl } from "@/lib/ticket-inventory";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymongoReferenceNumber } from "@/lib/paymongo";
import { formatEventDateTimeLong } from "@/lib/event-datetime";

const DEFAULT_PRICE_CENTS = 50000;

/** Parallel Sharp/opentype ticket image builds; cap concurrency to limit memory on serverless. */
const TICKET_ATTACHMENT_CONCURRENCY = 10;

/** Quick status updates only. Returns fast for poll; email runs in background via confirmBooking. */
export async function confirmBookingStatusOnly(
  supabase: SupabaseClient,
  bookingId: string
): Promise<boolean> {
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("id", bookingId)
    .single();
  if (!booking || booking.status !== "pending") return !!booking;

  await supabase.from("bookings").update({ status: "confirmed" }).eq("id", booking.id);
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
    await supabase.from("payments").update({ status: "paid" }).eq("id", payment.id);
  }
  return true;
}

/** Confirm a pending booking: update status, send ticket email. Idempotent for already-confirmed and already-sent. */
export async function confirmBooking(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{
  ok: boolean;
  alreadyConfirmed?: boolean;
  emailSent?: boolean;
  ticketsGeneratedCount?: number;
  remainingMissingImages?: number;
  errorCode?: string;
}> {
  const t0 = Date.now();
  console.log("[confirm-booking] phase=start", {
    bookingId,
    envUrl: process.env.NEXT_PUBLIC_SITE_URL ?? process.env.URL ?? null,
  });
  // Atomic claim: only one process can send the ticket email. Prevents duplicate emails when
  // multiple callers run concurrently (webhook, status poll, confirmation page).
  const { data: claimed, error: claimError } = await supabase
    .from("bookings")
    .update({ ticket_email_sent_at: new Date().toISOString() })
    .eq("id", bookingId)
    .is("ticket_email_sent_at", null)
    .select("id")
    .maybeSingle();

  if (!claimed || claimError) {
    console.log("[confirm-booking] phase=claim-skipped", {
      bookingId,
      hasClaimError: !!claimError,
      duration_ms: Date.now() - t0,
      result: "already-claimed",
    });
    return { ok: true, emailSent: true }; // Already sent by another process
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, user_id, event_id, status")
    .eq("id", bookingId)
    .single();

  if (!booking) {
    return {
      ok: false,
      errorCode: "booking_not_found",
    };
  }

  const alreadyConfirmed = booking.status !== "pending";
  if (!alreadyConfirmed) {
    await confirmBookingStatusOnly(supabase, bookingId);
  }

  const { data: bookingFull } = await supabase
    .from("bookings")
    .select("total_cents, discount_cents, promo_code_id, buyer_email_override")
    .eq("id", booking.id)
    .single();
  const { data: user } = await supabase.auth.admin.getUserById(booking.user_id);
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", booking.user_id)
    .single();
  const { data: event } = await supabase
    .from("events")
    .select(
      "title, event_start, venue:venues(name), early_bird_starts_at, early_bird_ends_at, image_url, thumbnail_url, created_by, sale_success_email_enabled"
    )
    .eq("id", booking.event_id)
    .single();
  const { data: tickets } = await supabase
    .from("tickets")
    .select("id, qr_data, encrypted_qr, qr_image_url, ticket_image_url, quantity, seat_id, section_id")
    .eq("booking_id", booking.id);

  const overrideEmail = (bookingFull as { buyer_email_override?: string | null } | null)
    ?.buyer_email_override
    ?.trim();
  const destinationEmail = overrideEmail && overrideEmail.length > 0
    ? overrideEmail
    : user?.user?.email ?? "";

  if (!destinationEmail || !event || !tickets?.length) {
    console.warn("[confirm-booking] phase=precheck-failed", {
      bookingId,
      hasUserEmail: !!destinationEmail,
      hasEvent: !!event,
      ticketsCount: tickets?.length ?? 0,
      duration_ms: Date.now() - t0,
      result: "rollback_claim",
      error_code: !destinationEmail
        ? "missing_destination_email"
        : !event
          ? "missing_event"
          : "missing_tickets",
    });
    // Rollback claim so a retry could send if data is fixed later
    await supabase
      .from("bookings")
      .update({ ticket_email_sent_at: null })
      .eq("id", booking.id);
    return {
      ok: false,
      errorCode: !destinationEmail
        ? "missing_destination_email"
        : !event
          ? "missing_event"
          : "missing_tickets",
    };
  }

  const venueName = (event.venue as { name?: string } | null)?.name ?? "TBA";
  const eventDate = formatEventDateTimeLong(event.event_start);
  const eventImageUrl = (event as { image_url?: string | null; thumbnail_url?: string | null }).image_url
    ?? (event as { image_url?: string | null; thumbnail_url?: string | null }).thumbnail_url
    ?? null;
  const now = new Date().toISOString();
  const useEarlyBird =
    event.early_bird_starts_at != null &&
    event.early_bird_ends_at != null &&
    now >= event.early_bird_starts_at &&
    now <= event.early_bird_ends_at;
  const seatIdsForTickets = (tickets as { seat_id?: string }[])
    .map((t) => t.seat_id)
    .filter((id): id is string => !!id);
  const [
    { data: eventPrices },
    { data: earlyBirdPrices },
    { data: seatRows },
    { data: bookingAddOns },
    { data: bookingPromoCodes },
    { data: promoRow },
    { data: payment },
  ] = await Promise.all([
    supabase.from("event_prices").select("section_id, price_cents").eq("event_id", booking.event_id),
    supabase.from("early_bird_prices").select("section_id, discount_percent").eq("event_id", booking.event_id),
    seatIdsForTickets.length > 0
      ? supabase
          .from("event_seats")
          .select("id, event_section_id, row_label, seat_number")
          .in("id", seatIdsForTickets)
      : Promise.resolve({ data: [] }),
    supabase
      .from("booking_add_ons")
      .select("title, quantity, unit_price_cents")
      .eq("booking_id", booking.id),
    supabase
      .from("booking_promo_codes")
      .select("promo_code_id")
      .eq("booking_id", booking.id),
    bookingFull?.promo_code_id
      ? supabase.from("promo_codes").select("code").eq("id", bookingFull.promo_code_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("payments")
      .select("paymongo_id, amount_cents")
      .eq("booking_id", booking.id)
      .single(),
  ]);
  const basePriceMap = new Map((eventPrices ?? []).map((p) => [p.section_id, p.price_cents]));
  const earlyBirdPercentMap = new Map((earlyBirdPrices ?? []).map((p) => [p.section_id, p.discount_percent]));
  const sectionIds = [
    ...new Set([
      ...(seatRows ?? []).map((s) => s.event_section_id).filter(Boolean),
      ...(tickets as { section_id?: string }[]).map((t) => t.section_id).filter(Boolean),
    ]),
  ];
  const { data: sectionRows } =
    sectionIds.length > 0
      ? await supabase.from("event_sections").select("id, name, seating_type").in("id", sectionIds)
      : { data: [] };
  const sectionNameMap = new Map((sectionRows ?? []).map((s) => [s.id, s.name ?? s.id]));
  const seatMap = new Map((seatRows ?? []).map((s) => [s.id, s]));
  function getPrice(sectionId: string): number {
    const base = basePriceMap.get(sectionId) ?? DEFAULT_PRICE_CENTS;
    const discountPercent = earlyBirdPercentMap.get(sectionId);
    if (useEarlyBird && discountPercent !== undefined) {
      return Math.floor((base * (100 - discountPercent)) / 100);
    }
    return base;
  }
  function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  const ticketDetailsRows: string[] = [];
  let computedTotalCents = 0;
  for (const t of tickets as { seat_id?: string; section_id?: string }[]) {
    const seat = t.seat_id ? seatMap.get(t.seat_id) : null;
    const sectionId = seat?.event_section_id ?? t.section_id ?? null;
    const sectionName = sectionId ? sectionNameMap.get(sectionId) ?? "—" : "—";
    const section = sectionId ? (sectionRows ?? []).find((s) => s.id === sectionId) : null;
    const seatLabel = seat
      ? section?.seating_type === "standing"
        ? "Standing"
        : section?.seating_type === "free"
          ? "Free Seating"
          : `Row ${seat.row_label ?? "-"} Seat ${seat.seat_number ?? "-"}`
      : section
        ? section.seating_type === "standing"
          ? "Standing"
          : section.seating_type === "free"
            ? "Free Seating"
            : "General"
        : "General";
    const priceCents = sectionId ? getPrice(sectionId) : DEFAULT_PRICE_CENTS;
    computedTotalCents += priceCents;
    const priceStr = (priceCents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
    ticketDetailsRows.push(
      `<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;">${escapeHtml(sectionName)}</td><td style="padding:8px 0;">${escapeHtml(seatLabel)}</td><td style="text-align:right;padding:8px 0;">${priceStr}</td></tr>`
    );
  }
  const ticketDetails = ticketDetailsRows.join("");
  const addOnDetailsRows: string[] = [];
  let addOnSubtotalCents = 0;
  for (const line of bookingAddOns ?? []) {
    const title = (line as { title?: string | null }).title?.trim() || "Add-on";
    const qty = Math.max(1, Number((line as { quantity?: number | null }).quantity ?? 1));
    const unit = Math.max(
      0,
      Number((line as { unit_price_cents?: number | null }).unit_price_cents ?? 0)
    );
    const lineTotal = qty * unit;
    addOnSubtotalCents += lineTotal;
    addOnDetailsRows.push(
      `<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px 0;">${escapeHtml(title)}</td><td style="text-align:right;padding:8px 0;">${qty}</td><td style="text-align:right;padding:8px 0;">${(lineTotal / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" })}</td></tr>`
    );
  }
  const addOnsDetails = addOnDetailsRows.join("");
  const paidAmountCents = (payment as { amount_cents?: number | null } | null)?.amount_cents ?? null;
  let totalCents = paidAmountCents ?? bookingFull?.total_cents ?? 0;
  const discountCents = bookingFull?.discount_cents ?? 0;
  const ticketNetCents = bookingFull?.total_cents ?? 0;
  const processingFeeCents =
    paidAmountCents != null && paidAmountCents > ticketNetCents ? paidAmountCents - ticketNetCents : 0;
  if (!totalCents && computedTotalCents > 0) {
    totalCents = computedTotalCents;
  }
  // Subtotal should reflect pre-discount line-item value (tickets + add-ons).
  const ticketSubtotalCents = computedTotalCents > 0 ? computedTotalCents : totalCents + discountCents;
  const subtotalCents = ticketSubtotalCents + addOnSubtotalCents;
  console.log(
    "[confirm-booking] computed amounts",
    JSON.stringify(
      {
        bookingId: booking.id,
        totalCents,
        discountCents,
        subtotalCents,
        fromBookingRow: {
          total_cents: bookingFull?.total_cents ?? null,
          discount_cents: bookingFull?.discount_cents ?? null,
        },
      },
      null,
      2
    )
  );
  let discountDescription = "";
  if (bookingPromoCodes && bookingPromoCodes.length > 0) {
    const promoIds = [...new Set(bookingPromoCodes.map((r) => r.promo_code_id))];
    const { data: promoRows } = await supabase
      .from("promo_codes")
      .select("code")
      .in("id", promoIds);
    discountDescription = (promoRows ?? []).map((p) => (p as { code?: string }).code ?? "").filter(Boolean).join(", ");
  } else {
    discountDescription = (promoRow as { code?: string } | null)?.code ?? "";
  }
  let invoiceNumber: string | undefined;
  if ((payment as { paymongo_id?: string } | null)?.paymongo_id) {
    invoiceNumber = (await getPaymongoReferenceNumber((payment as { paymongo_id: string }).paymongo_id)) ?? undefined;
  }

  // Fresh rows so attachment PNGs reuse URLs if confirmation page (or another worker) uploaded first.
  const { data: ticketsForAttachments } = await supabase
    .from("tickets")
    .select(
      "id, qr_data, encrypted_qr, qr_image_url, ticket_image_url, quantity, seat_id, section_id, print_ticket_id"
    )
    .eq("booking_id", booking.id);

  type TicketRow = {
    id: string;
    qr_data: string;
    encrypted_qr?: string | null;
    ticket_image_url?: string | null;
    print_ticket_id?: string | null;
  };
  const ticketRows = (ticketsForAttachments ?? tickets) as TicketRow[];
  let ticketsGeneratedCount = 0;

  let inventoryAdmin: ReturnType<typeof createAdminClient> | null = null;
  try {
    inventoryAdmin = createAdminClient();
  } catch {
    inventoryAdmin = null;
  }

  /** Up-front parallel generation (same as checkout Promise.all) so we don’t serialize per-ticket. */
  const preGeneratedUrlByTicketId = new Map<string, string>();
  const needImage = ticketRows.filter((t) => !t.ticket_image_url || String(t.ticket_image_url).trim() === "");
  for (let start = 0; start < needImage.length; start += TICKET_ATTACHMENT_CONCURRENCY) {
    const slice = needImage.slice(start, start + TICKET_ATTACHMENT_CONCURRENCY);
    const batch = await Promise.all(
      slice.map(async (t) => {
        try {
          if (inventoryAdmin) {
            const fromInventory = await resolveTicketImageUrl(inventoryAdmin, t, {
              generateIfMissing: true,
            });
            if (fromInventory) return { id: t.id, url: fromInventory };
          }
          if (t.print_ticket_id) {
            return { id: t.id, url: undefined };
          }
          const url = await generateTicketImageForTicketId(t.id);
          return { id: t.id, url: url ?? undefined };
        } catch (e) {
          console.error("[confirm-booking] phase=ticket-image-generation-failed", {
            ticketId: t.id,
            bookingId,
            error: e,
            error_code: "ticket_image_generation_failed",
          });
          return { id: t.id, url: undefined };
        }
      })
    );
    for (const { id, url } of batch) {
      if (url) {
        preGeneratedUrlByTicketId.set(id, url);
        ticketsGeneratedCount += 1;
      }
    }
  }

  async function buildAttachment(
    t: TicketRow,
    ticketIndex: number
  ): Promise<{
    attachment: { filename: string; content: Buffer };
    fromImage: boolean;
    fromQR: boolean;
  }> {
    let ticketImageUrl =
      t.ticket_image_url && String(t.ticket_image_url).trim() !== ""
        ? t.ticket_image_url
        : preGeneratedUrlByTicketId.get(t.id);
    if (!ticketImageUrl) {
      try {
        if (inventoryAdmin) {
          const fromInventory = await resolveTicketImageUrl(inventoryAdmin, t, {
            generateIfMissing: true,
          });
          if (fromInventory) {
            ticketsGeneratedCount += 1;
            ticketImageUrl = fromInventory;
          }
        }
        if (!ticketImageUrl && !t.print_ticket_id) {
          const generated = await generateTicketImageForTicketId(t.id);
          if (generated) {
            ticketsGeneratedCount += 1;
            ticketImageUrl = generated;
          }
        }
      } catch (e) {
        console.error("[confirm-booking] phase=ticket-image-generation-failed", {
          ticketId: t.id,
          bookingId,
          error: e,
          error_code: "ticket_image_generation_failed",
        });
        ticketImageUrl = undefined;
      }
    }
    let buf: Buffer;
    const qrPayload = t.encrypted_qr ?? t.qr_data;
    let fromImage = false;
    let fromQR = false;
    if (ticketImageUrl) {
      const res = await fetch(ticketImageUrl);
      if (res.ok) {
        buf = Buffer.from(await res.arrayBuffer());
        fromImage = true;
      } else {
        buf = await generateQRBuffer(qrPayload);
        fromQR = true;
      }
    } else {
      buf = await generateQRBuffer(qrPayload);
      fromQR = true;
    }
    const ext = fromImage
      ? ticketAttachmentExtFromImageUrl(ticketImageUrl)
      : "png";
    return {
      attachment: { filename: `ticket-${ticketIndex + 1}.${ext}`, content: buf },
      fromImage,
      fromQR,
    };
  }

  const attachments: { filename: string; content: Buffer }[] = [];
  let attachmentsFromImage = 0;
  let attachmentsFromQR = 0;
  for (let start = 0; start < ticketRows.length; start += TICKET_ATTACHMENT_CONCURRENCY) {
    const slice = ticketRows.slice(start, start + TICKET_ATTACHMENT_CONCURRENCY);
    const batch = await Promise.all(
      slice.map((t, j) => buildAttachment(t, start + j))
    );
    for (const b of batch) {
      attachments.push(b.attachment);
      if (b.fromImage) attachmentsFromImage += 1;
      if (b.fromQR) attachmentsFromQR += 1;
    }
  }
  const remainingMissingImages = ticketRows.filter((t) => !t.ticket_image_url).length;
  console.log("[confirm-booking] phase=attachments-built", {
    bookingId,
    totalTickets: tickets.length,
    attachmentsFromImage,
    attachmentsFromQR,
    ticketsGeneratedCount,
    remainingMissingImages,
    duration_ms: Date.now() - t0,
  });
  try {
    await sendTicketEmail({
      to: destinationEmail,
      eventTitle: event.title,
      eventDate,
      venueName,
      attachments,
      buyerName: (profile as { full_name?: string } | null)?.full_name ?? "",
      ticketDetails,
      addOnsDetails,
      subtotalCents,
      discountCents,
      totalCents,
      processingFeeCents: processingFeeCents > 0 ? processingFeeCents : undefined,
      discountDescription,
      invoiceNumber,
      eventImageUrl: eventImageUrl ?? undefined,
    });
    console.log("[confirm-booking] phase=email-sent", {
      bookingId,
      to: destinationEmail,
      duration_ms: Date.now() - t0,
      result: "ok",
    });

    const shouldNotifyTeamOnSale = (event as { sale_success_email_enabled?: boolean | null }).sale_success_email_enabled === true;
    if (shouldNotifyTeamOnSale) {
      const recipientUserIds = new Set<string>();
      const { data: eventAdmins } = await supabase
        .from("event_administrators")
        .select("user_id")
        .eq("event_id", booking.event_id);
      for (const row of eventAdmins ?? []) {
        if (row.user_id) recipientUserIds.add(row.user_id);
      }
      const createdBy = (event as { created_by?: string | null }).created_by;
      if (createdBy) recipientUserIds.add(createdBy);
      const ids = [...recipientUserIds];
      if (ids.length > 0) {
        const { data: recipientProfiles } = await supabase
          .from("profiles")
          .select("email")
          .in("id", ids);
        const bccEmails = (recipientProfiles ?? [])
          .map((p) => (p as { email?: string | null }).email?.trim())
          .filter((e): e is string => !!e);
        const buyerDisplayName = (profile as { full_name?: string } | null)?.full_name ?? "";
        const buyerAuthEmail = user?.user?.email?.trim() ?? "";
        try {
          await sendEventSaleNotificationToTeam({
            bcc: bccEmails,
            eventTitle: event.title,
            eventDate,
            venueName,
            buyerName: buyerDisplayName || "Customer",
            buyerEmail: buyerAuthEmail || undefined,
            ticketCount: tickets.length,
            totalFormatted: (totalCents / 100).toLocaleString("en-PH", {
              style: "currency",
              currency: "PHP",
            }),
            bookingId: booking.id,
          });
        } catch (notifyErr) {
          console.error("[confirm-booking] phase=team-sale-notify-failed", {
            bookingId,
            error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
          });
        }
      }
    }
  } catch (err) {
    const smtpAuthFailed =
      typeof err === "object" &&
      err != null &&
      (
        (("code" in err ? (err as { code?: unknown }).code : undefined) === "EAUTH") ||
        (("responseCode" in err
          ? (err as { responseCode?: unknown }).responseCode
          : undefined) === 535) ||
        (typeof ("message" in err ? (err as { message?: unknown }).message : "") === "string" &&
          String(("message" in err ? (err as { message?: unknown }).message : "")).includes(
            "BadCredentials"
          ))
      );
    console.error("[confirm-booking] phase=email-failed", {
      bookingId,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - t0,
      result: "claim_kept",
      error_code: smtpAuthFailed ? "smtp_auth_failed" : "email_send_failed",
    });
    // Keep the claim after a send attempt — SMTP may accept the message then error on
    // response, and rolling back would let a concurrent retry send a duplicate email.
    return {
      ok: false,
      alreadyConfirmed,
      emailSent: false,
      ticketsGeneratedCount,
      remainingMissingImages,
      errorCode: smtpAuthFailed ? "smtp_auth_failed" : "email_send_failed",
    };
  }
  return {
    ok: true,
    alreadyConfirmed,
    emailSent: true,
    ticketsGeneratedCount,
    remainingMissingImages,
  };
}
