import type { SupabaseClient } from "@supabase/supabase-js";
import type { PriorityGuestOrder, PriorityGuestsReport } from "@/hooks/use-dashboard-data";
import {
  loadOfflinePackSeatMaps,
  seatInfoFromOfflineMaps,
} from "@/lib/admissions/offline-pack-seat-maps";
import { resolveTicketEventSectionId } from "@/lib/reports/resolve-ticket-event-section";
import { specialRequestTypeLabel } from "@/lib/special-request";
import { fetchAllTicketsForBookingIds } from "@/lib/reports/fetch-tickets-for-booking-ids";

export const EMPTY_PRIORITY_GUESTS_REPORT: PriorityGuestsReport = {
  order_total: 0,
  ticket_total: 0,
  pwd_total: 0,
  senior_citizen_total: 0,
  pregnant_total: 0,
  others_total: 0,
  by_order: [],
};

function normalizeSpecialRequestType(raw: unknown): string {
  const t = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!t || t === "none") return "none";
  return t;
}

function orderRef(bookingId: string): string {
  return bookingId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

type SectionRow = {
  id: string;
  name: string | null;
  section_code: string | null;
  sort_order: number | null;
  color: string | null;
};

function uniqueSectionsForOrder(
  lines: PriorityGuestOrder["sections"]
): PriorityGuestOrder["sections"] {
  const seen = new Set<string>();
  const out: PriorityGuestOrder["sections"] = [];
  for (const line of lines) {
    const key = line.section_id ?? line.section_name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

/**
 * Priority guests for Sales & Reports: one row per order (booking) with special request,
 * expandable to section lines. Counts orders, not individual tickets.
 */
export async function buildPriorityGuestsReport(params: {
  admin: SupabaseClient;
  eventId: string;
  dateFrom: string | null;
  dateTo: string | null;
  sectionRows: SectionRow[];
}): Promise<PriorityGuestsReport> {
  const { admin, eventId, dateFrom, dateTo, sectionRows } = params;

  const sectionMeta = new Map(
    sectionRows.map((s) => [
      s.id,
      {
        name: s.name ?? s.section_code ?? "Other",
        color: s.color ?? null,
        sortOrder: Number(s.sort_order ?? 9999),
      },
    ])
  );

  let bookingsQuery = admin
    .from("bookings")
    .select("id, created_at, special_request_type, special_request_details")
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .neq("special_request_type", "none");
  if (dateFrom) bookingsQuery = bookingsQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
  if (dateTo) bookingsQuery = bookingsQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);

  const { data: bookingRows, error: bookingsError } = await bookingsQuery;
  if (bookingsError) throw bookingsError;
  if (!bookingRows?.length) return { ...EMPTY_PRIORITY_GUESTS_REPORT };

  const bookingIds = bookingRows.map((b) => b.id as string);
  const tickets = await fetchAllTicketsForBookingIds(
    admin,
    bookingIds,
    "booking_id, seat_id, section_id, quantity"
  );

  const ticketCountByBooking = new Map<string, number>();
  for (const t of tickets) {
    const bid = String(t.booking_id ?? "");
    if (!bid) continue;
    const qty = Math.max(1, Number(t.quantity ?? 1));
    ticketCountByBooking.set(bid, (ticketCountByBooking.get(bid) ?? 0) + qty);
  }

  const bookingsWithTickets = bookingRows.filter(
    (b) => (ticketCountByBooking.get(b.id as string) ?? 0) > 0
  );
  if (bookingsWithTickets.length === 0) return { ...EMPTY_PRIORITY_GUESTS_REPORT };

  const ticketList = tickets.map((t) => ({
    section_id: (t.section_id as string | null) ?? null,
    seat_id: (t.seat_id as string | null) ?? null,
    quantity: Math.max(1, Number(t.quantity ?? 1)),
    booking_id: String(t.booking_id ?? ""),
  }));

  const seatMaps = await loadOfflinePackSeatMaps(admin, ticketList);
  const sectionBySeat = new Map<string, string>();
  for (const [seatId, es] of seatMaps.eventSeatById.entries()) {
    if (es.event_section_id) sectionBySeat.set(seatId, es.event_section_id);
  }

  const orders: PriorityGuestOrder[] = [];
  let pwd_total = 0;
  let senior_citizen_total = 0;
  let pregnant_total = 0;
  let others_total = 0;
  let ticket_total = 0;

  for (const booking of bookingsWithTickets) {
    const bookingId = booking.id as string;
    const requestType = normalizeSpecialRequestType(booking.special_request_type);
    if (requestType === "none") continue;

    const ticketCount = ticketCountByBooking.get(bookingId) ?? 0;
    ticket_total += ticketCount;

    if (requestType === "pwd") pwd_total += 1;
    else if (requestType === "senior_citizen") senior_citizen_total += 1;
    else if (requestType === "pregnant") pregnant_total += 1;
    else others_total += 1;

    const sectionLines: PriorityGuestOrder["sections"] = [];
    for (const t of ticketList) {
      if (t.booking_id !== bookingId) continue;

      const info = seatInfoFromOfflineMaps(
        { section_id: t.section_id, seat_id: t.seat_id, quantity: t.quantity },
        seatMaps
      );
      const eventSectionId = resolveTicketEventSectionId({
        section_id: t.section_id,
        seat_id: t.seat_id,
        seatMaps,
        sectionByEventSeat: sectionBySeat,
        eventSections: sectionRows,
      });
      const meta = eventSectionId ? sectionMeta.get(eventSectionId) : undefined;
      const sectionName =
        info.section_display_name?.trim() ||
        meta?.name ||
        info.section?.trim() ||
        "Unassigned";

      sectionLines.push({
        section_id: eventSectionId,
        section_name: sectionName,
        section_color: meta?.color ?? null,
      });
    }

    sectionLines.sort((a, b) => {
      const sa = sectionMeta.get(a.section_id ?? "")?.sortOrder ?? 9999;
      const sb = sectionMeta.get(b.section_id ?? "")?.sortOrder ?? 9999;
      if (sa !== sb) return sa - sb;
      return a.section_name.localeCompare(b.section_name);
    });

    orders.push({
      booking_id: bookingId,
      order_label: orderRef(bookingId),
      request_type: requestType,
      request_label: specialRequestTypeLabel(requestType),
      request_details:
        typeof booking.special_request_details === "string"
          ? booking.special_request_details.trim() || null
          : null,
      ticket_count: ticketCount,
      sections: uniqueSectionsForOrder(sectionLines),
      created_at:
        typeof booking.created_at === "string" ? booking.created_at : undefined,
    });
  }

  orders.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  return {
    order_total: orders.length,
    ticket_total,
    pwd_total,
    senior_citizen_total,
    pregnant_total,
    others_total,
    by_order: orders,
  };
}
