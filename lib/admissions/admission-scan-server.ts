import type { SupabaseClient } from "@supabase/supabase-js";
import { specialRequestTypeLabel } from "@/lib/special-request";
import {
  buildTicketOrFilter,
  parseTicketScanSourceMode,
  ticketMatchesScanValue,
  TICKET_SCAN_SOURCE_KEY,
  type TicketScanSourceMode,
} from "./ticket-scan-source";

export type AdmissionSessionContext = { code: string; event_id: string };

export type AdmissionBookingAddOn = {
  id: string;
  title: string;
  quantity: number;
  released_quantity: number;
  remaining_quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  fully_released: boolean;
};

async function fetchAdmissionBookingAddOns(
  adminSupabase: SupabaseClient,
  bookingId: string
): Promise<AdmissionBookingAddOn[]> {
  const { data } = await adminSupabase
    .from("booking_add_ons")
    .select("id, title, quantity, released_quantity, unit_price_cents")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((row) => {
    const quantity = Math.max(0, Number(row.quantity ?? 0));
    const released = Math.max(
      0,
      Math.min(quantity, Number((row as { released_quantity?: number | null }).released_quantity ?? 0))
    );
    const unit = Math.max(0, Number(row.unit_price_cents ?? 0));
    return {
      id: String(row.id),
      title: String(row.title ?? "Add-on"),
      quantity,
      released_quantity: released,
      remaining_quantity: Math.max(0, quantity - released),
      unit_price_cents: unit,
      line_total_cents: quantity * unit,
      fully_released: released >= quantity,
    };
  });
}

function specialRequestForAdmissionResponse(booking: {
  special_request_type: string | null;
  special_request_details: string | null;
} | null) {
  if (!booking) return null;
  const tRaw = (booking.special_request_type ?? "").trim();
  const details = booking.special_request_details?.trim() || null;
  if (!tRaw || tRaw.toLowerCase() === "none") {
    if (details) {
      return { type: "notes", label: "Guest notes", details };
    }
    return null;
  }
  return {
    type: tRaw,
    label: specialRequestTypeLabel(tRaw),
    details,
  };
}

function specialRequestFieldsForPayload(bookingForScan: {
  special_request_type: string | null;
  special_request_details: string | null;
} | null): {
  special_request_type: string | null;
  special_request_details: string | null;
} {
  if (!bookingForScan) {
    return { special_request_type: null, special_request_details: null };
  }
  const rt = bookingForScan.special_request_type;
  const rawType = rt == null || rt === "" ? "" : String(rt).trim();
  const special_request_type =
    !rawType || rawType.toLowerCase() === "none" ? null : rawType;
  const dr = bookingForScan.special_request_details;
  const special_request_details =
    dr == null || dr === "" ? null : String(dr).trim() || null;
  return { special_request_type, special_request_details };
}

export async function resolveBuyerDisplay(
  admin: SupabaseClient,
  booking: {
    user_id: string | null;
    buyer_email_override: string | null;
  },
  ticket: { recipient_name: string | null },
  assignment: { recipient_name: string | null; recipient_email: string | null } | null
): Promise<{ buyer_name: string | null; buyer_email: string | null }> {
  const fromTicketName = ticket.recipient_name?.trim() || null;
  const fromAssignName = assignment?.recipient_name?.trim() || null;
  const fromAssignEmail = assignment?.recipient_email?.trim() || null;
  const overrideEmail = booking.buyer_email_override?.trim() || null;
  let profileName: string | null = null;
  let profileEmail: string | null = null;
  let authEmail: string | null = null;
  if (booking.user_id) {
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", booking.user_id)
      .maybeSingle();
    if (!profileErr) {
      profileName = profile?.full_name?.trim() || null;
    }
    const { data: emailRow, error: emailErr } = await admin
      .from("profiles")
      .select("email")
      .eq("id", booking.user_id)
      .maybeSingle();
    if (!emailErr) {
      profileEmail = (emailRow as { email?: string | null } | null)?.email?.trim() || null;
    }
    try {
      const { data: userData, error: authErr } = await admin.auth.admin.getUserById(
        booking.user_id
      );
      if (!authErr) {
        authEmail = userData?.user?.email?.trim() || null;
      }
    } catch {
      /* Auth Admin API unavailable */
    }
  }
  return {
    buyer_name: fromTicketName || fromAssignName || profileName || null,
    buyer_email: fromAssignEmail || overrideEmail || profileEmail || authEmail || null,
  };
}

export type SeatInfo = {
  section: string;
  section_group: string;
  section_display_name: string;
  row: string;
  seatNumber: string;
  seating_type: "assigned" | "free" | "standing";
};

type ResolvedTicket = {
  id: string;
  booking_id: string;
  section_id: string | null;
  seat_id: string | null;
  quantity: number;
  admitted_at: string | null;
  re_entry_allowed: boolean | null;
  recipient_name: string | null;
};

type BookingFieldsForScan = {
  special_request_type: string | null;
  special_request_details: string | null;
  user_id: string | null;
  buyer_email_override: string | null;
};

const TICKET_EVENT_SCOPED_SELECT =
  "id, booking_id, section_id, seat_id, quantity, admitted_at, re_entry_allowed, recipient_name, bookings!inner(event_id)";

function unwrapEmbeddedBookings(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }
  if (typeof raw === "object") return raw as Record<string, unknown>;
  return null;
}

function parseResolvedTicketFromJoinRow(
  r: Record<string, unknown> | undefined
): ResolvedTicket | null {
  if (!r || typeof r.id !== "string") return null;
  const nested = unwrapEmbeddedBookings(r.bookings);
  const booking_id =
    typeof r.booking_id === "string" && r.booking_id.length > 0 ? r.booking_id : null;
  if (!booking_id) return null;
  if (!nested || typeof nested.event_id !== "string") return null;
  return {
    id: r.id,
    booking_id,
    section_id: (r.section_id as string | null) ?? null,
    seat_id: (r.seat_id as string | null) ?? null,
    quantity: typeof r.quantity === "number" ? r.quantity : Number(r.quantity ?? 0),
    admitted_at: (r.admitted_at as string | null) ?? null,
    re_entry_allowed: (r.re_entry_allowed as boolean | null) ?? null,
    recipient_name: (r.recipient_name as string | null) ?? null,
  };
}

type EventSectionRow = {
  name: string | null;
  section_code: string | null;
  section_group: string | null;
  seating_type: string | null;
};

/** Load section row; retry without `section_group` if the column is missing in an older DB. */
async function fetchEventSectionRow(
  adminSupabase: SupabaseClient,
  eventSectionId: string
): Promise<EventSectionRow | null> {
  const full = await adminSupabase
    .from("event_sections")
    .select("name, section_code, section_group, seating_type")
    .eq("id", eventSectionId)
    .maybeSingle();

  if (full.data) {
    return full.data as EventSectionRow;
  }

  const code = full.error?.code;
  const msg = (full.error?.message ?? "").toLowerCase();
  const missingGroupCol =
    code === "PGRST204" ||
    code === "42703" ||
    msg.includes("section_group") ||
    msg.includes("does not exist");

  if (!missingGroupCol) {
    return null;
  }

  const basic = await adminSupabase
    .from("event_sections")
    .select("name, section_code, seating_type")
    .eq("id", eventSectionId)
    .maybeSingle();
  if (!basic.data) return null;
  const b = basic.data as Omit<EventSectionRow, "section_group">;
  return { ...b, section_group: null };
}

export async function getSeatInfo(
  adminSupabase: SupabaseClient,
  t: { section_id: string | null; seat_id: string | null; quantity: number }
): Promise<SeatInfo> {
  let section = "";
  let section_group = "";
  let section_display_name = "";
  let row = "";
  let seatNumber = "";
  let seating_type: "assigned" | "free" | "standing" = "assigned";

  if (t.seat_id) {
    const { data: es } = await adminSupabase
      .from("event_seats")
      .select("row_label, seat_number, event_section_id")
      .eq("id", t.seat_id)
      .maybeSingle();
    if (es) {
      const rowRaw = es.row_label ?? "";
      const seatRaw = es.seat_number ?? "";
      const sectionId = es.event_section_id as string | null | undefined;
      const sec = sectionId ? await fetchEventSectionRow(adminSupabase, sectionId) : null;
      section = sec ? (sec.section_code ?? sec.name ?? "") : "";
      section_display_name = sec?.name?.trim() ?? "";
      section_group = (sec?.section_group as string | null)?.trim() ?? "";
      const st = String(sec?.seating_type ?? "assigned").toLowerCase();
      if (st === "free") {
        seating_type = "free";
        row = "";
        seatNumber = "";
      } else if (st === "standing") {
        seating_type = "standing";
        row = "";
        seatNumber = "";
      } else {
        seating_type = "assigned";
        row = rowRaw;
        seatNumber = seatRaw;
      }
    } else {
      const { data: s } = await adminSupabase
        .from("seats")
        .select("row_label, seat_number, section_id")
        .eq("id", t.seat_id)
        .maybeSingle();
      if (s) {
        row = s.row_label ?? "";
        seatNumber = s.seat_number ?? "";
        const { data: sec } = await adminSupabase
          .from("sections")
          .select("name, section_code")
          .eq("id", s.section_id)
          .maybeSingle();
        section = sec ? (sec.section_code ?? sec.name ?? "") : "";
        section_display_name = sec?.name?.trim() ?? "";
        section_group = "";
        seating_type = "assigned";
      }
    }
  } else if (t.section_id) {
    const es = await fetchEventSectionRow(adminSupabase, t.section_id);
    if (es) {
      section = es.section_code ?? es.name ?? "";
      section_display_name = es.name?.trim() ?? "";
      section_group = (es.section_group as string | null)?.trim() ?? "";
      const st = String(es.seating_type ?? "assigned").toLowerCase();
      if (st === "free") {
        seating_type = "free";
        row = "";
        seatNumber = "";
      } else if (st === "standing") {
        seating_type = "standing";
        row = "";
        seatNumber = "";
      } else {
        seating_type = "assigned";
        row = "-";
        seatNumber = t.quantity > 0 ? `x${t.quantity}` : "-";
      }
    } else {
      const { data: sec } = await adminSupabase
        .from("sections")
        .select("name, section_code")
        .eq("id", t.section_id)
        .maybeSingle();
      if (sec) {
        section = sec.section_code ?? sec.name ?? "";
        section_display_name = sec.name?.trim() ?? "";
        section_group = "";
        seating_type = "assigned";
        row = "-";
        seatNumber = t.quantity > 0 ? `x${t.quantity}` : "-";
      }
    }
  }
  return { section, section_group, section_display_name, row, seatNumber, seating_type };
}

export function admissionRecordSeatFields(seatInfo: SeatInfo): {
  section_label: string | null;
  row_label: string | null;
  seat_number: string | null;
} {
  if (seatInfo.seating_type === "free") {
    return {
      section_label: seatInfo.section || null,
      row_label: "Free Seating",
      seat_number: null,
    };
  }
  if (seatInfo.seating_type === "standing") {
    return {
      section_label: seatInfo.section || null,
      row_label: "Standing",
      seat_number: null,
    };
  }
  return {
    section_label: seatInfo.section || null,
    row_label: seatInfo.row || null,
    seat_number: seatInfo.seatNumber || null,
  };
}

export type AdmissionScanResult = { status: number; body: Record<string, unknown> };

async function fetchResolvedTicketById(
  adminSupabase: SupabaseClient,
  ticketId: string
): Promise<ResolvedTicket | null> {
  const { data: row } = await adminSupabase
    .from("tickets")
    .select(
      "id, booking_id, section_id, seat_id, quantity, admitted_at, re_entry_allowed, recipient_name"
    )
    .eq("id", ticketId)
    .maybeSingle();
  if (!row) return null;
  return {
    id: row.id,
    booking_id: row.booking_id,
    section_id: row.section_id ?? null,
    seat_id: row.seat_id ?? null,
    quantity: row.quantity ?? 0,
    admitted_at: row.admitted_at ?? null,
    re_entry_allowed: row.re_entry_allowed ?? null,
    recipient_name: row.recipient_name ?? null,
  };
}

/**
 * Resolves a ticket and applies admit / re-entry / validate for live API routes.
 */
export async function runAdmissionScan(
  adminSupabase: SupabaseClient,
  session: AdmissionSessionContext,
  input: {
    qr_data: string;
    re_entry?: boolean;
    validate_only?: boolean;
  }
): Promise<AdmissionScanResult> {
  const event_id = session.event_id;
  const qrNorm = input.qr_data.trim();
  const re_entry = input.re_entry === true;
  const validate_only = input.validate_only === true;
  const { data: scanSourceRow } = await adminSupabase
    .from("app_config")
    .select("value")
    .eq("key", TICKET_SCAN_SOURCE_KEY)
    .maybeSingle();
  const scanSourceMode = parseTicketScanSourceMode(scanSourceRow?.value);

  let ticket: ResolvedTicket | null = null;
  let usedPrintTicketBridge = false;
  async function fetchEventScopedTicketByMode(mode: TicketScanSourceMode) {
    const fetchWithFilter = async (filter: string) =>
      adminSupabase
        .from("tickets")
        .select(TICKET_EVENT_SCOPED_SELECT)
        .or(filter)
        .eq("bookings.event_id", event_id)
        .limit(1);

    if (mode === "encrypted_then_qr_fallback") {
      const first = await fetchWithFilter(`encrypted_qr.eq.${qrNorm}`);
      if (!first.error && first.data?.length) return first.data;
      const fallback = await fetchWithFilter(`qr_data.eq.${qrNorm}`);
      if (!fallback.error && fallback.data?.length) return fallback.data;
      return null;
    }

    const row = await fetchWithFilter(buildTicketOrFilter(mode, qrNorm));
    if (!row.error && row.data?.length) return row.data;
    return null;
  }

  {
    const forEvent = await fetchEventScopedTicketByMode(scanSourceMode);
    if (forEvent?.length) {
      ticket = parseResolvedTicketFromJoinRow(forEvent[0] as Record<string, unknown>);
    }
  }

  if (!ticket) {
    async function fetchQrTicketRowsByMode(mode: TicketScanSourceMode) {
      if (mode === "encrypted_then_qr_fallback") {
        const first = await adminSupabase
          .from("tickets")
          .select("id, booking_id")
          .or(`encrypted_qr.eq.${qrNorm}`);
        if (first.data?.length) return first.data;
        const fallback = await adminSupabase
          .from("tickets")
          .select("id, booking_id")
          .or(`qr_data.eq.${qrNorm}`);
        return fallback.data ?? null;
      }
      const rows = await adminSupabase
        .from("tickets")
        .select("id, booking_id")
        .or(buildTicketOrFilter(mode, qrNorm));
      return rows.data ?? null;
    }
    const qrTicketRows = await fetchQrTicketRowsByMode(scanSourceMode);

    if (qrTicketRows?.length) {
      const bookingIds = [...new Set(qrTicketRows.map((r) => r.booking_id))];
      const { data: bookingsForQr } = await adminSupabase
        .from("bookings")
        .select("id, event_id")
        .in("id", bookingIds);
      const bookingThisEvent = bookingsForQr?.find((b) => b.event_id === event_id);
      if (bookingThisEvent) {
        const row = qrTicketRows.find((t) => t.booking_id === bookingThisEvent.id);
        if (row) ticket = await fetchResolvedTicketById(adminSupabase, row.id);
      } else {
        return { status: 400, body: { error: "Ticket is for a different event" } };
      }
    }

    if (!ticket) {
      async function fetchPrintRowByMode(mode: TicketScanSourceMode) {
        if (mode === "encrypted_then_qr_fallback") {
          const first = await adminSupabase
            .from("print_tickets")
            .select("event_seat_id")
            .eq("event_id", event_id)
            .or(`encrypted_qr.eq.${qrNorm}`)
            .maybeSingle();
          if (first.data?.event_seat_id) return first.data;
          const fallback = await adminSupabase
            .from("print_tickets")
            .select("event_seat_id")
            .eq("event_id", event_id)
            .or(`qr_data.eq.${qrNorm}`)
            .maybeSingle();
          return fallback.data ?? null;
        }
        const row = await adminSupabase
          .from("print_tickets")
          .select("event_seat_id")
          .eq("event_id", event_id)
          .or(buildTicketOrFilter(mode, qrNorm))
          .maybeSingle();
        return row.data ?? null;
      }
      const printRow = await fetchPrintRowByMode(scanSourceMode);

      if (printRow?.event_seat_id) {
        const { data: seatTickets, error: seatErr } = await adminSupabase
          .from("tickets")
          .select(TICKET_EVENT_SCOPED_SELECT)
          .eq("seat_id", printRow.event_seat_id)
          .eq("bookings.event_id", event_id)
          .limit(1);
        if (!seatErr && seatTickets?.length) {
          ticket = parseResolvedTicketFromJoinRow(seatTickets[0] as Record<string, unknown>);
          usedPrintTicketBridge = true;
        }
        if (!ticket) {
          const { data: seatIdRows } = await adminSupabase
            .from("tickets")
            .select("id, booking_id")
            .eq("seat_id", printRow.event_seat_id)
            .limit(50);
          if (seatIdRows?.length) {
            const bids = [...new Set(seatIdRows.map((r) => r.booking_id))];
            const { data: be } = await adminSupabase
              .from("bookings")
              .select("id, event_id")
              .in("id", bids);
            const bookingThisEvent = be?.find((b) => b.event_id === event_id);
            if (bookingThisEvent) {
              const tr = seatIdRows.find((t) => t.booking_id === bookingThisEvent.id);
              if (tr) {
                ticket = await fetchResolvedTicketById(adminSupabase, tr.id);
                usedPrintTicketBridge = true;
              }
            }
          }
        }
      }
    }
  }

  if (!ticket) {
    return { status: 200, body: { ok: false, error: "Ticket not found" } };
  }

  if (usedPrintTicketBridge) {
    const { data: scanCodes } = await adminSupabase
      .from("tickets")
      .select("encrypted_qr, qr_data")
      .eq("id", ticket.id)
      .maybeSingle();
    const qU = qrNorm.toUpperCase();
    const enc = (scanCodes?.encrypted_qr ?? "").trim().toUpperCase();
    const raw = (scanCodes?.qr_data ?? "").trim().toUpperCase();
    if (!ticketMatchesScanValue(scanSourceMode, qU, enc, raw)) {
      return { status: 200, body: { ok: false, error: "Ticket not found" } };
    }
  }

  const bookingId = ticket.booking_id;
  const { data: assignment } = await adminSupabase
    .from("admin_seat_assignments")
    .select("recipient_name, recipient_email")
    .eq("booking_id", bookingId)
    .limit(1)
    .maybeSingle();

  const { data: bookingCore, error: bookingCoreErr } = await adminSupabase
    .from("bookings")
    .select("special_request_type, special_request_details, user_id")
    .eq("id", bookingId)
    .maybeSingle();

  let buyerEmailOverride: string | null = null;
  if (bookingCore && !bookingCoreErr) {
    const { data: overrideOnly, error: overrideErr } = await adminSupabase
      .from("bookings")
      .select("buyer_email_override")
      .eq("id", bookingId)
      .maybeSingle();
    if (!overrideErr && overrideOnly && typeof overrideOnly === "object") {
      const v = (overrideOnly as { buyer_email_override?: string | null }).buyer_email_override;
      buyerEmailOverride = v == null ? null : String(v).trim() || null;
    }
  }

  const bookingForScan: BookingFieldsForScan | null = bookingCore
    ? {
        special_request_type:
          bookingCore.special_request_type == null
            ? null
            : String(bookingCore.special_request_type),
        special_request_details:
          bookingCore.special_request_details == null
            ? null
            : String(bookingCore.special_request_details),
        user_id: bookingCore.user_id ?? null,
        buyer_email_override: buyerEmailOverride,
      }
    : null;

  const specialRequest = specialRequestForAdmissionResponse(
    bookingForScan
      ? {
          special_request_type: bookingForScan.special_request_type ?? null,
          special_request_details: bookingForScan.special_request_details ?? null,
        }
      : null
  );
  const specialRequestFields = specialRequestFieldsForPayload(bookingForScan);

  const buyerDisplay = await resolveBuyerDisplay(
    adminSupabase,
    {
      user_id: bookingForScan?.user_id ?? null,
      buyer_email_override: bookingForScan?.buyer_email_override ?? null,
    },
    { recipient_name: ticket.recipient_name ?? null },
    assignment
      ? {
          recipient_name: assignment.recipient_name ?? null,
          recipient_email: assignment.recipient_email ?? null,
        }
      : null
  );

  const reEntryAllowed = ticket.re_entry_allowed === true;
  const buyerPayload = {
    buyer_name: buyerDisplay.buyer_name,
    buyer_email: buyerDisplay.buyer_email,
  };
  const addOnsPayload = {
    add_ons: await fetchAdmissionBookingAddOns(adminSupabase, bookingId),
  };

  if (validate_only === true) {
    const seatInfo = await getSeatInfo(adminSupabase, ticket);
    return {
      status: 200,
      body: {
        ok: true,
        validate_only: true,
        ticket_id: ticket.id,
        admitted: !!ticket.admitted_at,
        re_entry_granted: reEntryAllowed,
        ...seatInfo,
        ...buyerPayload,
        ...addOnsPayload,
        ...specialRequestFields,
        ...(specialRequest ? { special_request: specialRequest } : {}),
      },
    };
  }

  if (re_entry) {
    if (!ticket.admitted_at) {
      const seatInfo = await getSeatInfo(adminSupabase, ticket);
      return {
        status: 200,
        body: {
          ok: false,
          code: "ticket_not_admitted_yet",
          error: "Ticket not admitted yet",
          ...seatInfo,
          ...buyerPayload,
          ...addOnsPayload,
          ...specialRequestFields,
          ...(specialRequest ? { special_request: specialRequest } : {}),
        },
      };
    }
    if (reEntryAllowed) {
      const seatInfo = await getSeatInfo(adminSupabase, ticket);
      return {
        status: 200,
        body: {
          ok: false,
          code: "re_entry_already_granted",
          error: "Re-entry already granted",
          ...seatInfo,
          ...buyerPayload,
          ...addOnsPayload,
          ...specialRequestFields,
          ...(specialRequest ? { special_request: specialRequest } : {}),
        },
      };
    }
    await adminSupabase
      .from("tickets")
      .update({ re_entry_allowed: true })
      .eq("id", ticket.id);
    const seatInfo = await getSeatInfo(adminSupabase, ticket);
    const recRe = admissionRecordSeatFields(seatInfo);
    await adminSupabase.from("admission_records").insert({
      event_id,
      ticket_id: ticket.id,
      qr_data: input.qr_data,
      admission_code: session.code,
      action: "re_entry_granted",
      section_label: recRe.section_label,
      row_label: recRe.row_label,
      seat_number: recRe.seat_number,
    });
    return {
      status: 200,
      body: {
        ok: true,
        re_entry: true,
        ticket_id: ticket.id,
        ...seatInfo,
        ...buyerPayload,
        ...addOnsPayload,
        ...specialRequestFields,
        ...(specialRequest ? { special_request: specialRequest } : {}),
      },
    };
  }

  if (ticket.admitted_at) {
    if (reEntryAllowed) {
      await adminSupabase
        .from("tickets")
        .update({ re_entry_allowed: false })
        .eq("id", ticket.id);
      const seatInfo = await getSeatInfo(adminSupabase, ticket);
      const recUsed = admissionRecordSeatFields(seatInfo);
      await adminSupabase.from("admission_records").insert({
        event_id,
        ticket_id: ticket.id,
        qr_data: input.qr_data,
        admission_code: session.code,
        action: "admit",
        section_label: recUsed.section_label,
        row_label: recUsed.row_label,
        seat_number: recUsed.seat_number,
      });
      return {
        status: 200,
        body: {
          ok: true,
          ticket_id: ticket.id,
          re_entry_used: true,
          ...seatInfo,
          ...buyerPayload,
          ...addOnsPayload,
          ...specialRequestFields,
          ...(specialRequest ? { special_request: specialRequest } : {}),
        },
      };
    }
    const seatInfo = await getSeatInfo(adminSupabase, ticket);
    return {
      status: 200,
      body: {
        ok: true,
        already_admitted: true,
        ticket_id: ticket.id,
        ...seatInfo,
        ...buyerPayload,
        ...addOnsPayload,
        ...specialRequestFields,
        ...(specialRequest ? { special_request: specialRequest } : {}),
      },
    };
  }

  await adminSupabase
    .from("tickets")
    .update({ admitted_at: new Date().toISOString() })
    .eq("id", ticket.id);

  const seatInfo = await getSeatInfo(adminSupabase, ticket);
  const recAdmit = admissionRecordSeatFields(seatInfo);
  await adminSupabase.from("admission_records").insert({
    event_id,
    ticket_id: ticket.id,
    qr_data: input.qr_data,
    admission_code: session.code,
    action: "admit",
    section_label: recAdmit.section_label,
    row_label: recAdmit.row_label,
    seat_number: recAdmit.seat_number,
  });
  return {
    status: 200,
    body: {
      ok: true,
      ticket_id: ticket.id,
      ...seatInfo,
      ...buyerPayload,
      ...addOnsPayload,
      ...specialRequestFields,
      ...(specialRequest ? { special_request: specialRequest } : {}),
    },
  };
}
