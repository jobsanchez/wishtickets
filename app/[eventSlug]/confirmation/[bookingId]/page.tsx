import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import { ConfirmationProcessingClient } from "./confirmation-processing-client";
import { TicketImageGenerationOverlay } from "./ticket-image-generation-overlay";
import { ConfirmationTickets } from "./confirmation-tickets";
import { SendTicketsButton } from "./send-tickets-button";
import { RetryTicketProcessingButton } from "./retry-ticket-processing-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPaymongoPaid } from "@/lib/paymongo";
import { confirmBooking } from "@/lib/confirm-booking";
import { specialRequestTypeLabel } from "@/lib/special-request";

/** Row shape from `tickets` select below (explicit so RSC stays strict when Supabase infers `any`). */
type BookingConfirmationTicketRow = {
  id: string;
  qr_data: string | null;
  encrypted_qr: string | null;
  qr_image_url: string | null;
  ticket_image_url: string | null;
  seat_id: string | null;
  section_id: string | null;
  quantity: number | null;
};

type BookingConfirmationSectionRow = {
  id: string;
  seating_type: string | null;
};

/** Netlify serverless can kill long RSC responses; keep confirms off the critical path where possible. */
export const maxDuration = 60;

export default async function ConfirmationPage(props: {
  params: Promise<{ eventSlug: string; bookingId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { bookingId, eventSlug } = await props.params;
  const searchParams = await (props.searchParams ?? Promise.resolve({} as { [key: string]: string | string[] | undefined }));
  const fromPayment = searchParams.fromPayment === "1" || searchParams.fromPayment?.[0] === "1";
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, status, created_at, event_id, user_id, ticket_email_sent_at, special_request_type, special_request_details"
    )
    .eq("id", bookingId)
    .single();

  if (!booking) {
    notFound();
  }

  // Pending = PayMongo payment in progress; webhook may not have run yet
  if (booking.status === "pending") {
    // Fallback: check PayMongo directly when webhook hasn't fired
    const { data: payment } = await supabase
      .from("payments")
      .select("paymongo_id")
      .eq("booking_id", bookingId)
      .single();
    let paidHint: string | undefined;
    if (
      payment?.paymongo_id &&
      (await isPaymongoPaid(payment.paymongo_id)) &&
      booking.ticket_email_sent_at == null
    ) {
      const admin = createAdminClient();
      console.log("[confirmation-page] payment verified via PayMongo, kicking confirmBooking (non-blocking)", {
        bookingId,
        eventSlug,
      });
      // Do not await: confirmBooking can exceed Netlify RSC limits and abort the stream ("Connection closed").
      void confirmBooking(admin, bookingId).catch((e) => {
        console.error("[confirmation-page] confirmBooking failed after PayMongo verify", e);
      });
      paidHint =
        "Payment received. Finalizing your booking and tickets in the background—this page will refresh when ready.";
    } else {
      console.log("[confirmation-page] pending booking not yet paid via PayMongo", {
        bookingId,
        eventSlug,
      });
    }
    return <ConfirmationProcessingClient bookingId={bookingId} paymentConfirmedHint={paidHint} />;
  }

  if (booking.status === "failed") {
    // Re-check PayMongo: webhook/status API may have marked failed before paid event
    // arrived (e.g. link.payment.failed before link.payment.paid, or timing).
    const { data: payment } = await supabase
      .from("payments")
      .select("paymongo_id")
      .eq("booking_id", bookingId)
      .single();
    if (
      payment?.paymongo_id &&
      (await isPaymongoPaid(payment.paymongo_id)) &&
      booking.ticket_email_sent_at == null
    ) {
      const admin = createAdminClient();
      console.log("[confirmation-page] failed booking but PayMongo reports paid, kicking confirmBooking (non-blocking)", {
        bookingId,
        eventSlug,
      });
      void confirmBooking(admin, bookingId).catch((e) => {
        console.error("[confirmation-page] confirmBooking failed (failed status recheck)", e);
      });
      return (
        <ConfirmationProcessingClient
          bookingId={bookingId}
          paymentConfirmedHint="Your payment went through—we are correcting your booking status. This page will refresh when ready."
        />
      );
    } else {
      console.log("[confirmation-page] booking failed and PayMongo not paid", {
        bookingId,
        eventSlug,
      });
    }
    return (
      <div className="w-full px-4 py-12">
        <h1 className="text-2xl font-bold text-red-500 mb-2">Payment failed</h1>
        <p className="text-foreground-muted mb-6">
          Your payment could not be completed. Please try again or contact support.
        </p>
        <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
          <NavButtonWithProgress
            href="/account?tab=orders"
            variant="outline"
            loadingMessage="Loading My Orders…"
          >
            Go to My Orders
          </NavButtonWithProgress>
        </div>
      </div>
    );
  }

  const [{ data: event }, { data: ticketsData }] = await Promise.all([
    supabase.from("events").select("title, slug").eq("id", booking.event_id).single(),
    supabase
      .from("tickets")
      .select("id, qr_data, encrypted_qr, qr_image_url, ticket_image_url, seat_id, section_id, quantity")
      .eq("booking_id", bookingId),
  ]);

  const tickets = (ticketsData ?? []) as BookingConfirmationTicketRow[];
  const needsRecovery =
    booking.status === "confirmed" &&
    tickets.some((t) => !t.ticket_image_url);
  const shouldKickConfirmBooking =
    (fromPayment && booking.ticket_email_sent_at == null) || needsRecovery;
  if (shouldKickConfirmBooking) {
    const admin = createAdminClient();
    console.log("[confirmation-page] kicking confirmBooking (non-blocking)", {
      bookingId,
      eventSlug,
      fromPayment,
      hasEmailSentAt: booking.ticket_email_sent_at != null,
      needsRecovery,
      missingTicketImages: needsRecovery
        ? tickets.filter((t) => !t.ticket_image_url).length
        : 0,
    });
    void confirmBooking(admin, bookingId).catch((e) => {
      console.error("[confirmation-page] confirmBooking failed", e);
    });
  }

  // Resolve seat labels from event_seats + event_sections
  const seatIds = [
    ...new Set((tickets ?? []).map((t) => t.seat_id).filter((id): id is string => !!id)),
  ];
  const sectionIdsFromTickets = [
    ...new Set((tickets ?? []).map((t) => t.section_id).filter((id): id is string => !!id)),
  ];
  const seatLabelByKey = new Map<string, string>();

  let seatRows: { id: string; row_label?: string | null; seat_number?: string | null; event_section_id?: string | null }[] = [];
  if (seatIds.length > 0) {
    const { data } = await supabase
      .from("event_seats")
      .select("id, row_label, seat_number, event_section_id")
      .in("id", seatIds);
    seatRows = data ?? [];
  }

  const sectionIds = new Set([
    ...seatRows.map((s) => s.event_section_id).filter((id): id is string => !!id),
    ...sectionIdsFromTickets,
  ]);

  if (sectionIds.size > 0) {
    const { data: sectionRows } = await supabase
      .from("event_sections")
      .select("id, seating_type")
      .in("id", Array.from(sectionIds));

    const sectionRowsTyped = (sectionRows ?? []) as BookingConfirmationSectionRow[];
    const sectionTypeMap = new Map(sectionRowsTyped.map((s) => [s.id, s.seating_type ?? "assigned"]));

    for (const s of seatRows) {
      const sec = sectionTypeMap.get(s.event_section_id ?? "");
      let label: string;
      if (sec === "standing") {
        label = "Standing";
      } else if (sec === "free") {
        label = "Free Seating";
      } else {
        label = `Row ${s.row_label ?? "-"} Seat ${s.seat_number ?? "-"}`;
      }
      seatLabelByKey.set(s.id, label);
    }

    for (const sid of sectionIdsFromTickets) {
      const sec = sectionTypeMap.get(sid);
      const label = sec === "standing" ? "Standing" : "Free Seating";
      seatLabelByKey.set(sid, label);
    }
  }

  function getSeatLabel(t: { seat_id?: string | null; section_id?: string | null }): string {
    if (t.seat_id) return seatLabelByKey.get(t.seat_id) ?? "General";
    if (t.section_id) return seatLabelByKey.get(t.section_id) ?? "General";
    return "General";
  }

  const title = event?.title ?? "Event";

  const specialType =
    (booking as { special_request_type?: string | null }).special_request_type ??
    "none";
  const specialDetails = (
    booking as { special_request_details?: string | null }
  ).special_request_details;
  const showSpecialRequest = specialType !== "none" && specialType !== undefined;

  const ticketsForClient = tickets.map((t) => ({
    id: t.id,
    qr_data: t.qr_data,
    encrypted_qr: t.encrypted_qr,
    qr_image_url: t.qr_image_url,
    ticket_image_url: t.ticket_image_url,
    quantity: t.quantity ?? undefined,
    seatLabel: getSeatLabel(t),
  }));

  return (
    <div className="w-full px-4 py-12 space-y-4">
      {fromPayment && needsRecovery ? <TicketImageGenerationOverlay bookingId={bookingId} /> : null}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-green-500 mb-1">Booking confirmed</h1>
          <p className="text-foreground-muted">
            Thank you! Your tickets for {title} are confirmed. Tap each ticket to view or save the
            image. We&apos;ve also sent a copy to your registered email—you can resend it anytime
            using the button on the right.
          </p>
        </div>
        <SendTicketsButton bookingId={bookingId} />
      </div>
      <div className="glass w-full rounded-xl border border-[var(--glass-border)] p-6 space-y-4">
        {showSpecialRequest ? (
          <div className="rounded-md border border-[var(--glass-border)] bg-white/5 p-3 text-sm">
            <p className="font-semibold text-foreground mb-1">Special request</p>
            <p className="text-foreground">{specialRequestTypeLabel(specialType)}</p>
            {specialDetails?.trim() ? (
              <p className="text-foreground-muted mt-1 whitespace-pre-wrap">{specialDetails.trim()}</p>
            ) : null}
          </div>
        ) : null}
        {needsRecovery ? (
          <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-200 flex items-center justify-between gap-3">
            <span>Ticket processing is still completing. If ticket images are missing, retry now.</span>
            <RetryTicketProcessingButton bookingId={bookingId} />
          </div>
        ) : null}
        {ticketsForClient.length ? (
          <ConfirmationTickets bookingId={bookingId} tickets={ticketsForClient} />
        ) : null}
        <div className="flex gap-2 pt-4 justify-center flex-wrap">
          <NavButtonWithProgress
            href="/account?tab=orders"
            className="bg-[var(--wish-orange)] hover:bg-[var(--wish-orange-hover)]"
            loadingMessage="Loading My Orders…"
          >
            Go to My Orders
          </NavButtonWithProgress>
          <NavButtonWithProgress
            href="/"
            variant="secondary"
            loadingMessage="Loading events…"
          >
            Browse more events
          </NavButtonWithProgress>
        </div>
      </div>
    </div>
  );
}
