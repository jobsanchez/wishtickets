import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveBuyerDisplay } from "@/lib/admissions/admission-scan-server";
import {
  loadOfflinePackSeatMaps,
  seatInfoFromOfflineMaps,
} from "@/lib/admissions/offline-pack-seat-maps";
import type { AdmissionsOfflinePackV1, OfflinePackTicketV1, OfflinePrintAliasV1 } from "./offline-pack-types";
import { OFFLINE_PACK_VERSION } from "./offline-pack-types";
import {
  DEFAULT_TICKET_SCAN_SOURCE_MODE,
  parseTicketScanSourceMode,
  TICKET_SCAN_SOURCE_KEY,
} from "./ticket-scan-source";

type TicketRow = {
  id: string;
  booking_id: string;
  section_id: string | null;
  seat_id: string | null;
  quantity: number;
  admitted_at: string | null;
  re_entry_allowed: boolean | null;
  recipient_name: string | null;
  encrypted_qr: string | null;
  qr_data: string;
};

type BookingRow = {
  id: string;
  special_request_type: string | null;
  special_request_details: string | null;
  user_id: string | null;
  buyer_email_override: string | null;
};

type AssignmentRow = { booking_id: string; recipient_name: string | null; recipient_email: string | null };
type BookingAddOnRow = {
  id: string;
  booking_id: string;
  title: string | null;
  quantity: number | null;
  released_quantity: number | null;
  unit_price_cents: number | null;
};

const POSTGREST_PAGE = 1000;
const BOOKING_ID_IN_CHUNK = 150;
const SEAT_ID_IN_CHUNK = 150;

function normalizeTicketJoinRow(
  r: TicketRow & { bookings: { event_id: string } | { event_id: string }[] },
  eventId: string
): TicketRow | null {
  const b = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings;
  if (!b || (b as { event_id: string }).event_id !== eventId) {
    return null;
  }
  return {
    id: r.id,
    booking_id: r.booking_id,
    section_id: r.section_id,
    seat_id: r.seat_id,
    quantity: r.quantity ?? 0,
    admitted_at: r.admitted_at,
    re_entry_allowed: r.re_entry_allowed,
    recipient_name: r.recipient_name,
    encrypted_qr: r.encrypted_qr,
    qr_data: r.qr_data,
  };
}

async function fetchAllTicketsForEventOfflinePack(
  admin: SupabaseClient,
  eventId: string
): Promise<TicketRow[]> {
  const select =
    "id, booking_id, section_id, seat_id, quantity, admitted_at, re_entry_allowed, recipient_name, encrypted_qr, qr_data, bookings!inner(event_id)";
  const out: TicketRow[] = [];
  let from = 0;
  for (;;) {
    const { data: page, error } = await admin
      .from("tickets")
      .select(select)
      .eq("bookings.event_id", eventId)
      .range(from, from + POSTGREST_PAGE - 1);
    if (error) {
      throw new Error(error.message);
    }
    const rows = (page ?? []) as Array<
      TicketRow & { bookings: { event_id: string } | { event_id: string }[] }
    >;
    if (rows.length === 0) break;
    for (const r of rows) {
      const n = normalizeTicketJoinRow(r, eventId);
      if (n) out.push(n);
    }
    if (rows.length < POSTGREST_PAGE) break;
    from += POSTGREST_PAGE;
  }
  return out;
}

/**
 * Build a v1 offline pack for an event (all tickets the server can resolve for admissions).
 *
 * REGRESSION GUARD (2026-04): Do not call `getSeatInfo()` once per ticket or run one tickets query
 * per `print_tickets` row. That O(n) server pattern timed out on Netlify and returned HTTP 502 on
 * mobile for large events (verified fix: batch maps via `loadOfflinePackSeatMaps` / print-alias
 * chunking). Production check: ~2.3k+ ticket rows saved offline on device.
 */
export async function buildAdmissionsOfflinePack(
  admin: SupabaseClient,
  params: {
    eventId: string;
    eventTitle: string;
    admissionsCode: string;
  }
): Promise<AdmissionsOfflinePackV1> {
  const { eventId, eventTitle, admissionsCode } = params;
  const generatedAt = new Date().toISOString();
  let scanSourceMode = DEFAULT_TICKET_SCAN_SOURCE_MODE;
  const { data: sourceModeRow } = await admin
    .from("app_config")
    .select("value")
    .eq("key", TICKET_SCAN_SOURCE_KEY)
    .maybeSingle();
  scanSourceMode = parseTicketScanSourceMode(sourceModeRow?.value);

  const ticketList = await fetchAllTicketsForEventOfflinePack(admin, eventId);

  const bookingIds = [...new Set(ticketList.map((t) => t.booking_id))];
  const bookById = new Map<string, BookingRow>();
  for (let i = 0; i < bookingIds.length; i += BOOKING_ID_IN_CHUNK) {
    const slice = bookingIds.slice(i, i + BOOKING_ID_IN_CHUNK);
    const { data: bookRows, error: bErr } = await admin
      .from("bookings")
      .select("id, special_request_type, special_request_details, user_id, buyer_email_override")
      .in("id", slice);
    if (bErr) {
      throw new Error(bErr.message);
    }
    for (const b of bookRows ?? []) {
      bookById.set((b as BookingRow).id, b as BookingRow);
    }
  }

  const firstAssign = new Map<string, AssignmentRow>();
  for (let i = 0; i < bookingIds.length; i += BOOKING_ID_IN_CHUNK) {
    const slice = bookingIds.slice(i, i + BOOKING_ID_IN_CHUNK);
    const { data: assignRows, error: aErr } = await admin
      .from("admin_seat_assignments")
      .select("booking_id, recipient_name, recipient_email")
      .in("booking_id", slice);
    if (aErr) {
      throw new Error(aErr.message);
    }
    for (const a of assignRows ?? []) {
      if (!firstAssign.has(a.booking_id)) {
        firstAssign.set(a.booking_id, a as AssignmentRow);
      }
    }
  }

  const buyerCache = new Map<string, { buyer_name: string | null; buyer_email: string | null }>();
  for (const bid of bookingIds) {
    const booking = bookById.get(bid) ?? null;
    const t0 = ticketList.find((t) => t.booking_id === bid);
    if (!t0) continue;
    const assignment = firstAssign.get(bid) ?? null;
    if (!buyerCache.has(bid)) {
      const buyer = await resolveBuyerDisplay(
        admin,
        {
          user_id: booking?.user_id ?? null,
          buyer_email_override: (booking as BookingRow | undefined)?.buyer_email_override ?? null,
        },
        { recipient_name: t0.recipient_name },
        assignment
          ? { recipient_name: assignment.recipient_name, recipient_email: assignment.recipient_email }
          : null
      );
      buyerCache.set(bid, buyer);
    }
  }

  const seatMaps = await loadOfflinePackSeatMaps(admin, ticketList);
  const addOnsByBookingId = new Map<string, BookingAddOnRow[]>();
  for (let i = 0; i < bookingIds.length; i += BOOKING_ID_IN_CHUNK) {
    const slice = bookingIds.slice(i, i + BOOKING_ID_IN_CHUNK);
    const { data: addOnRows, error: addOnErr } = await admin
      .from("booking_add_ons")
      .select("id, booking_id, title, quantity, released_quantity, unit_price_cents")
      .in("booking_id", slice)
      .order("created_at", { ascending: true });
    if (addOnErr) {
      throw new Error(addOnErr.message);
    }
    for (const row of (addOnRows ?? []) as BookingAddOnRow[]) {
      const cur = addOnsByBookingId.get(row.booking_id) ?? [];
      cur.push(row);
      addOnsByBookingId.set(row.booking_id, cur);
    }
  }

  const outTickets: OfflinePackTicketV1[] = [];
  for (const t of ticketList) {
    const seatInfo = seatInfoFromOfflineMaps(t, seatMaps);
    const book = bookById.get(t.booking_id) ?? null;
    const rt = book?.special_request_type;
    const rawType = rt == null || rt === "" ? "" : String(rt).trim();
    const special_request_type =
      !rawType || rawType.toLowerCase() === "none" ? null : rawType;
    const dr = book?.special_request_details;
    const special_request_details =
      dr == null || dr === "" ? null : String(dr).trim() || null;
    const buyer = buyerCache.get(t.booking_id) ?? { buyer_name: null, buyer_email: null };

    outTickets.push({
      ticket_id: t.id,
      booking_id: t.booking_id,
      encrypted_qr: t.encrypted_qr?.trim() || null,
      qr_data: t.qr_data?.trim() ?? "",
      admitted_at: t.admitted_at,
      re_entry_allowed: t.re_entry_allowed === true,
      ...seatInfo,
      buyer_name: buyer.buyer_name,
      buyer_email: buyer.buyer_email,
      special_request_type,
      special_request_details,
      add_ons: (addOnsByBookingId.get(t.booking_id) ?? []).map((a) => ({
        id: a.id,
        title: a.title ?? "Add-on",
        quantity: Math.max(0, Number(a.quantity ?? 0)),
        released_quantity: Math.max(
          0,
          Math.min(Number(a.quantity ?? 0), Number(a.released_quantity ?? 0))
        ),
        unit_price_cents: Math.max(0, Number(a.unit_price_cents ?? 0)),
      })),
    });
  }

  const printRows: Array<{
    encrypted_qr: string | null;
    qr_data: string | null;
    event_seat_id: string | null;
  }> = [];
  let printFrom = 0;
  for (;;) {
    const { data: printPage, error: pErr } = await admin
      .from("print_tickets")
      .select("encrypted_qr, qr_data, event_seat_id")
      .eq("event_id", eventId)
      .range(printFrom, printFrom + POSTGREST_PAGE - 1);
    if (pErr) {
      throw new Error(pErr.message);
    }
    const chunk = printPage ?? [];
    if (chunk.length === 0) break;
    printRows.push(
      ...(chunk as Array<{
        encrypted_qr: string | null;
        qr_data: string | null;
        event_seat_id: string | null;
      }>)
    );
    if (chunk.length < POSTGREST_PAGE) break;
    printFrom += POSTGREST_PAGE;
  }

  const printableSeatIds = [
    ...new Set(
      printRows
        .filter((p) => p.event_seat_id && (p.encrypted_qr || p.qr_data))
        .map((p) => p.event_seat_id as string)
    ),
  ];
  const ticketIdBySeatId = new Map<string, string>();
  for (let i = 0; i < printableSeatIds.length; i += SEAT_ID_IN_CHUNK) {
    const slice = printableSeatIds.slice(i, i + SEAT_ID_IN_CHUNK);
    const { data: seatTixRows, error: tidErr } = await admin
      .from("tickets")
      .select("id, seat_id, bookings!inner(event_id)")
      .in("seat_id", slice)
      .eq("bookings.event_id", eventId);
    if (tidErr) {
      throw new Error(tidErr.message);
    }
    const rows = (seatTixRows ?? []) as Array<{ id: string; seat_id: string | null }>;
    for (const row of rows) {
      const sid = row.seat_id;
      if (sid && !ticketIdBySeatId.has(sid)) {
        ticketIdBySeatId.set(sid, row.id);
      }
    }
  }

  const printAliases: OfflinePrintAliasV1[] = [];
  for (const p of printRows) {
    if (!p.event_seat_id || (!p.encrypted_qr && !p.qr_data)) continue;
    const tid = ticketIdBySeatId.get(p.event_seat_id);
    if (tid) {
      printAliases.push({
        encrypted_qr: p.encrypted_qr?.trim() || null,
        qr_data: p.qr_data?.trim() ?? "",
        ticket_id: tid,
      });
    }
  }

  const ticket_quantity_total = ticketList.reduce(
    (s, t) => s + Math.max(1, Number(t.quantity ?? 1)),
    0
  );

  return {
    pack_version: OFFLINE_PACK_VERSION,
    generated_at: generatedAt,
    event_id: eventId,
    event_title: eventTitle,
    admissions_code: admissionsCode,
    scan_source_mode: scanSourceMode,
    tickets: outTickets,
    print_qr_aliases: printAliases,
    ticket_count: outTickets.length,
    ticket_quantity_total,
  };
}
