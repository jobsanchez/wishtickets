import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOfflinePackSeatMaps } from "@/lib/admissions/offline-pack-seat-maps";
import { fetchAllTicketsForBookingIds } from "@/lib/reports/fetch-tickets-for-booking-ids";

export interface VssBuyerSummary {
  buyer_name: string;
  buyer_email: string;
  ticket_count: number;
  payment_methods: Array<{ method: string; count: number }>;
}

export interface VssBuyerTicketRow {
  ticket_id: string;
  section_name: string;
  row_label: string;
  seat_number: string;
  payment_method: string;
  purchased_at: string;
}

const PROFILE_ID_CHUNK = 150;

type BookingRow = {
  id: string;
  total_cents: number | null;
  created_at: string;
  accepted_by_admin_id: string | null;
  user_id: string | null;
  buyer_email_override: string | null;
};

type ProfileSnapshot = {
  full_name: string | null;
  email: string | null;
};

type AssignmentRow = {
  id: string;
  booking_id: string;
  recipient_name: string | null;
  recipient_email: string | null;
  distribution_category: string | null;
};

type TicketRow = {
  id: string;
  booking_id: string;
  seat_id?: string | null;
  section_id?: string | null;
  quantity?: number | null;
  recipient_name?: string | null;
  is_complementary?: boolean | null;
};

type EventContext = {
  bookingById: Map<string, BookingRow>;
  assignmentByBooking: Map<string, AssignmentRow>;
  profileById: Map<string, ProfileSnapshot>;
  authEmailByUserId: Map<string, string>;
  seatSectionBySeatId: Map<string, string>;
  seatLabelBySeatId: Map<string, { row_label: string; seat_number: string }>;
  sectionNameById: Map<string, string>;
  fallbackSectionByAssignmentId: Map<string, string>;
  dominantSectionByBooking: Map<string, string>;
};

function normalizeBuyerField(value: unknown, fallback = ""): string {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : fallback;
}

function resolveBuyer(
  booking: BookingRow,
  assignment: AssignmentRow | undefined,
  profile: ProfileSnapshot | undefined,
  authEmail: string | undefined,
  ticketRecipientName?: string | null
): { name: string; email: string } {
  const name =
    (
      assignment?.recipient_name ??
      ticketRecipientName ??
      profile?.full_name ??
      "Guest"
    ).trim() || "Guest";
  const email = (
    assignment?.recipient_email ??
    booking.buyer_email_override ??
    profile?.email ??
    authEmail ??
    ""
  ).trim();
  return { name, email };
}

async function loadProfilesByUserId(
  admin: SupabaseClient,
  userIds: string[]
): Promise<Map<string, ProfileSnapshot>> {
  const profileById = new Map<string, ProfileSnapshot>();
  if (userIds.length === 0) return profileById;
  for (let i = 0; i < userIds.length; i += PROFILE_ID_CHUNK) {
    const slice = userIds.slice(i, i + PROFILE_ID_CHUNK);
    const { data, error } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", slice);
    if (error) throw error;
    for (const row of data ?? []) {
      profileById.set(row.id, {
        full_name: row.full_name?.trim() || null,
        email: (row.email ?? "").trim() || null,
      });
    }
  }
  return profileById;
}

async function loadAuthEmailsForUserIds(
  admin: SupabaseClient,
  userIds: string[],
  profileById: Map<string, ProfileSnapshot>
): Promise<Map<string, string>> {
  const authEmailByUserId = new Map<string, string>();
  const needingAuth = userIds.filter((id) => !(profileById.get(id)?.email));
  if (needingAuth.length === 0) return authEmailByUserId;
  await Promise.all(
    needingAuth.map(async (id) => {
      try {
        const { data, error } = await admin.auth.admin.getUserById(id);
        if (!error && data.user?.email?.trim()) {
          authEmailByUserId.set(id, data.user.email.trim());
        }
      } catch {
        /* Auth Admin API unavailable */
      }
    })
  );
  return authEmailByUserId;
}

function resolvePaymentMethod(
  booking: BookingRow,
  assignment: AssignmentRow | undefined
): string {
  if (assignment?.distribution_category === "sales") return "distributed";
  if (booking.accepted_by_admin_id == null) return "paymongo";
  return "onsite";
}

async function loadEventContext(
  admin: SupabaseClient,
  eventId: string,
  dateFrom: string | null,
  dateTo: string | null
): Promise<EventContext & { bookingIds: string[] }> {
  let bookingsQuery = admin
    .from("bookings")
    .select("id, total_cents, created_at, accepted_by_admin_id, user_id, buyer_email_override")
    .eq("event_id", eventId)
    .eq("status", "confirmed");
  if (dateFrom) bookingsQuery = bookingsQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
  if (dateTo) bookingsQuery = bookingsQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);
  const { data: bookingRows } = await bookingsQuery;
  const bookingIds = (bookingRows ?? []).map((b) => b.id);

  if (bookingIds.length === 0) {
    return {
      bookingIds: [],
      bookingById: new Map(),
      assignmentByBooking: new Map(),
      profileById: new Map(),
      authEmailByUserId: new Map(),
      seatSectionBySeatId: new Map(),
      seatLabelBySeatId: new Map(),
      sectionNameById: new Map(),
      fallbackSectionByAssignmentId: new Map(),
      dominantSectionByBooking: new Map(),
    };
  }

  const userIds = [...new Set((bookingRows ?? []).map((b) => b.user_id).filter(Boolean))] as string[];

  const [{ data: assignments }, { data: eventSections }, profileById] = await Promise.all([
    admin
      .from("admin_seat_assignments")
      .select("id, booking_id, recipient_name, recipient_email, distribution_category")
      .in("booking_id", bookingIds),
    admin.from("event_sections").select("id, name, section_code").eq("event_id", eventId),
    loadProfilesByUserId(admin, userIds),
  ]);

  const authEmailByUserId = await loadAuthEmailsForUserIds(admin, userIds, profileById);
  const bookingById = new Map((bookingRows ?? []).map((b) => [b.id, b as BookingRow]));
  const assignmentByBooking = new Map(
    (assignments ?? []).map((a) => [a.booking_id, a as AssignmentRow])
  );

  const assignmentIds = (assignments ?? []).map((a) => a.id).filter(Boolean) as string[];
  const { data: assignmentItems } = assignmentIds.length
    ? await admin
        .from("admin_assignment_items")
        .select("assignment_id, seat_id, section_id, quantity")
        .in("assignment_id", assignmentIds)
    : { data: [] };

  const sectionCandidatesByAssignment = new Map<string, Set<string>>();
  for (const item of assignmentItems ?? []) {
    if (!item.assignment_id || !item.section_id) continue;
    const set = sectionCandidatesByAssignment.get(item.assignment_id) ?? new Set<string>();
    set.add(item.section_id);
    sectionCandidatesByAssignment.set(item.assignment_id, set);
  }
  const fallbackSectionByAssignmentId = new Map<string, string>();
  for (const [assignmentId, sections] of sectionCandidatesByAssignment.entries()) {
    if (sections.size === 1) fallbackSectionByAssignmentId.set(assignmentId, [...sections][0]);
  }

  const sectionNameById = new Map(
    (eventSections ?? []).map((s) => [s.id, (s.name ?? s.section_code ?? "Other")])
  );

  return {
    bookingIds,
    bookingById,
    assignmentByBooking,
    profileById,
    authEmailByUserId,
    seatSectionBySeatId: new Map(),
    seatLabelBySeatId: new Map(),
    sectionNameById,
    fallbackSectionByAssignmentId,
    dominantSectionByBooking: new Map(),
  };
}

function buyerContextForBooking(
  booking: BookingRow,
  ctx: EventContext
): {
  assignment: AssignmentRow | undefined;
  profile: ProfileSnapshot | undefined;
  authEmail: string | undefined;
} {
  const assignment = ctx.assignmentByBooking.get(booking.id);
  const profile = booking.user_id ? ctx.profileById.get(booking.user_id) : undefined;
  const authEmail = booking.user_id ? ctx.authEmailByUserId.get(booking.user_id) : undefined;
  return { assignment, profile, authEmail };
}

function resolveSectionId(
  ticket: TicketRow,
  ctx: EventContext,
  assignment: AssignmentRow | undefined
): string | null {
  return (
    (ticket.section_id ??
      (ticket.seat_id ? ctx.seatSectionBySeatId.get(ticket.seat_id) : undefined) ??
      (assignment?.id ? ctx.fallbackSectionByAssignmentId.get(assignment.id) : undefined) ??
      ctx.dominantSectionByBooking.get(ticket.booking_id)) ??
    null
  );
}

function ticketQty(ticket: TicketRow): number {
  const quantity = Number(ticket.quantity ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function bookingMatchesBuyer(
  bookingId: string,
  ctx: EventContext,
  buyerName: string,
  buyerEmail: string
): boolean {
  const booking = ctx.bookingById.get(bookingId);
  if (!booking) return false;
  const { assignment, profile, authEmail } = buyerContextForBooking(booking, ctx);
  const buyer = resolveBuyer(booking, assignment, profile, authEmail);
  return buyer.name === buyerName && buyer.email === buyerEmail;
}

async function loadTickets(
  admin: SupabaseClient,
  bookingIds: string[]
): Promise<TicketRow[]> {
  if (bookingIds.length === 0) return [];
  const raw = await fetchAllTicketsForBookingIds(
    admin,
    bookingIds,
    "id, booking_id, seat_id, section_id, quantity, recipient_name, is_complementary"
  );
  return raw as TicketRow[];
}

/**
 * Resolve seat row/section for sold tickets by ID (not a full `event_seats` scan).
 * A single `.eq(event_id)` query is capped at ~1000 rows and caused missing section/row in VSS.
 */
async function hydrateSeatMapsFromTickets(
  admin: SupabaseClient,
  ctx: EventContext,
  tickets: TicketRow[]
): Promise<void> {
  if (tickets.length === 0) return;

  const maps = await loadOfflinePackSeatMaps(
    admin,
    tickets.map((t) => ({
      seat_id: t.seat_id ?? null,
      section_id: t.section_id ?? null,
      quantity: ticketQty(t),
    }))
  );

  for (const [seatId, es] of maps.eventSeatById) {
    if (es.event_section_id) ctx.seatSectionBySeatId.set(seatId, es.event_section_id);
    ctx.seatLabelBySeatId.set(seatId, {
      row_label: (es.row_label ?? "").trim() || "—",
      seat_number: (es.seat_number ?? "").trim() || "—",
    });
  }

  for (const [seatId, ls] of maps.legacySeatById) {
    if (ls.section_id) ctx.seatSectionBySeatId.set(seatId, ls.section_id);
    ctx.seatLabelBySeatId.set(seatId, {
      row_label: (ls.row_label ?? "").trim() || "—",
      seat_number: (ls.seat_number ?? "").trim() || "—",
    });
  }

  for (const [sectionId, sec] of maps.eventSectionById) {
    if (!ctx.sectionNameById.has(sectionId)) {
      ctx.sectionNameById.set(sectionId, sec.name ?? sec.section_code ?? "Other");
    }
  }
}

function buildDominantSectionByBooking(tickets: TicketRow[], ctx: EventContext): void {
  const knownSectionQtyByBooking = new Map<string, Map<string, number>>();
  for (const t of tickets) {
    if (!ctx.bookingById.has(t.booking_id)) continue;
    const assignment = ctx.assignmentByBooking.get(t.booking_id);
    const sectionId = resolveSectionId(t, ctx, assignment);
    if (!sectionId) continue;
    const bySection = knownSectionQtyByBooking.get(t.booking_id) ?? new Map<string, number>();
    bySection.set(sectionId, (bySection.get(sectionId) ?? 0) + ticketQty(t));
    knownSectionQtyByBooking.set(t.booking_id, bySection);
  }
  for (const [bookingId, bySection] of knownSectionQtyByBooking.entries()) {
    let bestSectionId: string | null = null;
    let bestQty = -1;
    for (const [sectionId, qty] of bySection.entries()) {
      if (qty > bestQty) {
        bestSectionId = sectionId;
        bestQty = qty;
      }
    }
    if (bestSectionId) ctx.dominantSectionByBooking.set(bookingId, bestSectionId);
  }
}

export async function buildVssBuyerSummaries(
  admin: SupabaseClient,
  eventId: string,
  dateFrom: string | null,
  dateTo: string | null
): Promise<VssBuyerSummary[]> {
  const ctx = await loadEventContext(admin, eventId, dateFrom, dateTo);
  if (ctx.bookingIds.length === 0) return [];

  const tickets = await loadTickets(admin, ctx.bookingIds);
  await hydrateSeatMapsFromTickets(admin, ctx, tickets);
  buildDominantSectionByBooking(tickets, ctx);

  const buyers = new Map<
    string,
    { name: string; email: string; ticketCount: number; methods: Map<string, number> }
  >();

  for (const ticket of tickets) {
    const booking = ctx.bookingById.get(ticket.booking_id);
    if (!booking) continue;
    const assignment = ctx.assignmentByBooking.get(ticket.booking_id);
    if (assignment?.distribution_category === "complementary") continue;

    const { profile, authEmail } = buyerContextForBooking(booking, ctx);
    const buyer = resolveBuyer(booking, assignment, profile, authEmail, ticket.recipient_name);
    const buyerKey = `${buyer.name}|${buyer.email}`;
    const qty = ticketQty(ticket);
    const paymentMethod = resolvePaymentMethod(booking, assignment);

    if (!buyers.has(buyerKey)) {
      buyers.set(buyerKey, {
        name: buyer.name,
        email: buyer.email,
        ticketCount: 0,
        methods: new Map(),
      });
    }
    const row = buyers.get(buyerKey)!;
    row.ticketCount += qty;
    row.methods.set(paymentMethod, (row.methods.get(paymentMethod) ?? 0) + qty);
  }

  return Array.from(buyers.values())
    .map((b) => ({
      buyer_name: b.name,
      buyer_email: b.email,
      ticket_count: b.ticketCount,
      payment_methods: Array.from(b.methods.entries()).map(([method, count]) => ({
        method,
        count,
      })),
    }))
    .sort((a, b) => b.ticket_count - a.ticket_count);
}

export async function buildVssBuyerTickets(
  admin: SupabaseClient,
  eventId: string,
  dateFrom: string | null,
  dateTo: string | null,
  buyerName: string,
  buyerEmail: string
): Promise<VssBuyerTicketRow[]> {
  const ctx = await loadEventContext(admin, eventId, dateFrom, dateTo);
  const matchedBookingIds = ctx.bookingIds.filter((id) =>
    bookingMatchesBuyer(id, ctx, buyerName, buyerEmail)
  );
  if (matchedBookingIds.length === 0) return [];

  const tickets = await loadTickets(admin, matchedBookingIds);
  await hydrateSeatMapsFromTickets(admin, ctx, tickets);
  buildDominantSectionByBooking(tickets, ctx);

  const rows: VssBuyerTicketRow[] = [];

  for (const ticket of tickets) {
    const booking = ctx.bookingById.get(ticket.booking_id);
    if (!booking) continue;
    const assignment = ctx.assignmentByBooking.get(ticket.booking_id);
    if (assignment?.distribution_category === "complementary") continue;

    const { profile, authEmail } = buyerContextForBooking(booking, ctx);
    const buyer = resolveBuyer(booking, assignment, profile, authEmail, ticket.recipient_name);
    if (buyer.name !== buyerName || buyer.email !== buyerEmail) continue;

    const sectionId = resolveSectionId(ticket, ctx, assignment);
    const sectionName = sectionId ? (ctx.sectionNameById.get(sectionId) ?? "Other") : "—";
    const seatLabel = ticket.seat_id ? ctx.seatLabelBySeatId.get(ticket.seat_id) : undefined;
    const rowLabel = seatLabel?.row_label ?? (sectionId ? "FS" : "—");
    const seatNumber = seatLabel?.seat_number ?? (ticket.seat_id ? "Assigned" : "General");
    const paymentMethod = resolvePaymentMethod(booking, assignment);
    const qty = ticketQty(ticket);

    for (let i = 0; i < qty; i++) {
      rows.push({
        ticket_id: qty > 1 ? `${ticket.id}:${i}` : ticket.id,
        section_name: sectionName,
        row_label: rowLabel,
        seat_number: seatNumber,
        payment_method: paymentMethod,
        purchased_at: booking.created_at,
      });
    }
  }

  rows.sort((a, b) => b.purchased_at.localeCompare(a.purchased_at));
  return rows;
}
