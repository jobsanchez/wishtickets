import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  canAccessTicketResendAdminTools,
  canAccessTicketResendAdminToolsWithClient,
} from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSeatInfo } from "@/lib/admissions/admission-scan-server";

type TicketRow = {
  id: string;
  booking_id: string;
  section_id: string | null;
  seat_id: string | null;
  quantity: number;
  admitted_at: string | null;
  re_entry_allowed: boolean | null;
  recipient_name: string | null;
};

export type AdminTicketsVerifyTicketPayload = {
  ticketId: string;
  bookingId: string;
  eventTitle: string | null;
  eventStart: string | null;
  /** `event_sections.section_group` */
  seatGroup: string | null;
  /** Section display name, else section code */
  sectionDisplay: string | null;
  admitted: boolean;
  reEntryGranted: boolean;
  seatingType: "assigned" | "free" | "standing";
  sectionLabel: string | null;
  rowLabel: string | null;
  seatLabel: string | null;
};

/** Plain serializable result for Server Actions (do not round-trip via `NextResponse.json`). */
export type AdminTicketsVerifyPlainResult = {
  httpStatus: number;
  ok: boolean;
  ticket: AdminTicketsVerifyTicketPayload | null;
  error?: string;
};

async function resolveEventIdForTicket(
  admin: ReturnType<typeof createAdminClient>,
  ticket: TicketRow,
  bookingEventId: string | null
): Promise<string | null> {
  if (bookingEventId) return bookingEventId;

  if (ticket.seat_id) {
    const { data: seatRow } = await admin
      .from("event_seats")
      .select("event_section_id")
      .eq("id", ticket.seat_id)
      .maybeSingle();
    const eventSectionId = seatRow?.event_section_id ?? null;
    if (eventSectionId) {
      const { data: sectionRow } = await admin
        .from("event_sections")
        .select("event_id")
        .eq("id", eventSectionId)
        .maybeSingle();
      if (sectionRow?.event_id) return sectionRow.event_id;
    }
  }

  if (ticket.section_id) {
    const { data: sectionRow } = await admin
      .from("event_sections")
      .select("event_id")
      .eq("id", ticket.section_id)
      .maybeSingle();
    if (sectionRow?.event_id) return sectionRow.event_id;
  }

  return null;
}

function parseBodyEncryptedQr(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const raw = (input as { encryptedQr?: unknown }).encryptedQr;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

function fail(
  httpStatus: number,
  error: string
): AdminTicketsVerifyPlainResult {
  return { httpStatus, ok: false, ticket: null, error };
}

/**
 * Core verify logic as a plain object (Server Actions, tests). HTTP routes should use
 * {@link runAdminTicketsVerifyFromBody}.
 */
export async function runAdminTicketsVerifyPlain(
  body: unknown,
  options?: { authSupabase?: SupabaseClient }
): Promise<AdminTicketsVerifyPlainResult> {
  const allowed = options?.authSupabase
    ? await canAccessTicketResendAdminToolsWithClient(options.authSupabase)
    : await canAccessTicketResendAdminTools();
  if (!allowed) {
    return fail(403, "Forbidden");
  }

  const encryptedQr = parseBodyEncryptedQr(body);
  if (!encryptedQr) {
    return fail(400, "Encrypted QR is required");
  }

  const admin = createAdminClient();
  const ticketSelect =
    "id, booking_id, section_id, seat_id, quantity, admitted_at, re_entry_allowed, recipient_name";

  let ticket: Record<string, unknown> | null = null;

  const { data: seatMatches, error: seatLookupError } = await admin
    .from("event_seats")
    .select("id")
    .ilike("encrypted_qr", encryptedQr)
    .limit(10);

  if (seatLookupError) {
    return fail(
      500,
      seatLookupError.message ?? "Failed to look up seat by encrypted QR"
    );
  }

  const seatIds = [...new Set((seatMatches ?? []).map((r) => r.id).filter(Boolean))] as string[];
  if (seatIds.length > 1) {
    return fail(
      409,
      "Multiple seats matched this encrypted QR; cannot verify unambiguously."
    );
  }

  if (seatIds.length === 1) {
    const seatId = seatIds[0]!;
    const { data: seatTickets, error: seatTicketsError } = await admin
      .from("tickets")
      .select(ticketSelect)
      .eq("seat_id", seatId);

    if (seatTicketsError) {
      return fail(
        500,
        seatTicketsError.message ?? "Failed to load tickets for seat"
      );
    }

    const candidates = seatTickets ?? [];
    if (candidates.length === 0) {
      return fail(
        404,
        "This encrypted QR matches a seat, but there is no ticket record for that seat. Nothing to invalidate."
      );
    }

    const bookingIds = [...new Set(candidates.map((t) => t.booking_id).filter(Boolean))] as string[];
    const { data: bookingRows, error: bookingLookupError } = await admin
      .from("bookings")
      .select("id, status")
      .in("id", bookingIds);

    if (bookingLookupError) {
      return fail(
        500,
        bookingLookupError.message ?? "Failed to resolve booking status"
      );
    }

    const confirmedIds = new Set(
      (bookingRows ?? []).filter((b) => b.status === "confirmed").map((b) => b.id)
    );
    const confirmedTickets = candidates.filter((t) => confirmedIds.has(t.booking_id as string));
    if (confirmedTickets.length === 0) {
      return fail(
        400,
        "No confirmed ticket found for this seat. Only active sales can be invalidated."
      );
    }

    confirmedTickets.sort((a, b) => String(b.id).localeCompare(String(a.id)));
    ticket = confirmedTickets[0] as Record<string, unknown>;
  }

  if (!ticket) {
    const { data: encryptedRows, error: encryptedLookupError } = await admin
      .from("tickets")
      .select(ticketSelect)
      .ilike("encrypted_qr", encryptedQr)
      .limit(5);

    if (encryptedLookupError) {
      return fail(
        500,
        encryptedLookupError.message ?? "Failed to look up ticket by encrypted QR"
      );
    }

    ticket = (encryptedRows ?? [])[0] ?? null;
    if (!ticket) {
      const { data: qrRows, error: qrLookupError } = await admin
        .from("tickets")
        .select(ticketSelect)
        .ilike("qr_data", encryptedQr)
        .limit(5);
      if (qrLookupError) {
        return fail(
          500,
          qrLookupError.message ?? "Failed to look up ticket by QR value"
        );
      }
      ticket = (qrRows ?? [])[0] ?? null;
    }
  }

  if (!ticket) {
    return fail(
      404,
      `No seat or ticket found for encrypted QR: ${encryptedQr}. Check event_seats.encrypted_qr and tickets.`
    );
  }

  const typedTicket = ticket as unknown as TicketRow;
  const { data: booking } = await admin
    .from("bookings")
    .select("id, event_id, user_id, buyer_email_override, status, created_at")
    .eq("id", typedTicket.booking_id)
    .maybeSingle();

  if (booking && booking.status !== "confirmed") {
    return fail(400, "Only confirmed booking tickets can be invalidated");
  }

  const resolvedEventId = await resolveEventIdForTicket(
    admin,
    typedTicket,
    booking?.event_id ?? null
  );

  const { data: event } = resolvedEventId
    ? await admin
        .from("events")
        .select("id, title, event_start")
        .eq("id", resolvedEventId)
        .maybeSingle()
    : { data: null };

  const seatInfo = await getSeatInfo(admin, typedTicket);
  const seatGroupRaw = seatInfo.section_group?.trim() ?? "";
  const sectionDisplayRaw =
    (seatInfo.section_display_name?.trim() || seatInfo.section?.trim() || "") || "";

  const payload: AdminTicketsVerifyTicketPayload = {
    ticketId: String(typedTicket.id),
    bookingId: String(typedTicket.booking_id),
    eventTitle: event?.title ?? null,
    eventStart: event?.event_start != null ? String(event.event_start) : null,
    seatGroup: seatGroupRaw.length > 0 ? seatGroupRaw : null,
    sectionDisplay: sectionDisplayRaw.length > 0 ? sectionDisplayRaw : null,
    admitted: Boolean(typedTicket.admitted_at),
    reEntryGranted: typedTicket.re_entry_allowed === true,
    seatingType: seatInfo.seating_type,
    sectionLabel: seatInfo.section || null,
    rowLabel: seatInfo.row || null,
    seatLabel: seatInfo.seatNumber || null,
  };

  return { httpStatus: 200, ok: true, ticket: payload };
}

export async function runAdminTicketsVerifyFromBody(
  body: unknown,
  options?: { authSupabase?: SupabaseClient }
): Promise<NextResponse> {
  const r = await runAdminTicketsVerifyPlain(body, options);
  if (r.httpStatus === 403) {
    return NextResponse.json({ error: r.error ?? "Forbidden" }, { status: 403 });
  }
  if (!r.ok || !r.ticket) {
    return NextResponse.json(
      { ok: false, error: r.error ?? "Ticket verification failed" },
      { status: r.httpStatus }
    );
  }
  return NextResponse.json({ ok: true, ticket: r.ticket }, { status: 200 });
}

export async function adminTicketsVerifyPost(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => ({}));
  return runAdminTicketsVerifyFromBody(body);
}
