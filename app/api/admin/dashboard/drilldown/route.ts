import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminOrCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllTicketsForBookingIds } from "@/lib/reports/fetch-tickets-for-booking-ids";
import {
  applyGroupingToDrilldownRows,
  buildSectionGroupMaps,
} from "@/lib/reports-section-grouping";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Supabase may return a nested many-to-one row as an object or a single-element array. */
function admittedDrilldownTicket(
  tickets: unknown
): {
  recipient_name: string | null;
  is_complementary: boolean | null;
  booking_id: string;
  seat_id: string | null;
  section_id: string | null;
} | null {
  if (!tickets) return null;
  const row = Array.isArray(tickets) ? tickets[0] : tickets;
  if (!row || typeof row !== "object" || !("booking_id" in row)) return null;
  return row as {
    recipient_name: string | null;
    is_complementary: boolean | null;
    booking_id: string;
    seat_id: string | null;
    section_id: string | null;
  };
}
const VALID_METRICS = new Set([
  "capacity",
  "revenue",
  "sold",
  "distributed",
  "complimentary",
  "admitted",
  "occupancy",
]);

export async function GET(request: NextRequest) {
  const canView = await requireSuperAdminOrCapability("view_sales_analytics");
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");
  const metric = searchParams.get("metric");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");

  if (!eventId || !UUID_REGEX.test(eventId)) {
    return NextResponse.json(
      { error: "event_id is required and must be a valid UUID" },
      { status: 400 }
    );
  }

  if (!metric || !VALID_METRICS.has(metric)) {
    return NextResponse.json(
      { error: "metric must be one of: capacity, revenue, sold, distributed, complimentary, admitted, occupancy" },
      { status: 400 }
    );
  }

  let pDateFrom: string | null = null;
  let pDateTo: string | null = null;
  if (dateFrom && DATE_REGEX.test(dateFrom)) pDateFrom = dateFrom;
  if (dateTo && DATE_REGEX.test(dateTo)) pDateTo = dateTo;

  const sectionClient = await createClient();
  const { data: eventSections } = await sectionClient
    .from("event_sections")
    .select("id, name, section_code, section_group, sort_order, color, capacity")
    .eq("event_id", eventId);
  const sectionMaps = buildSectionGroupMaps(
    (eventSections ?? []) as Array<{
      id: string;
      name: string | null;
      section_code: string | null;
      section_group: string | null;
      sort_order: number | null;
      color: string | null;
    }>
  );

  // Revenue/distributed/complimentary: use direct queries for consistent behavior
  // even when SQL RPC migrations are not yet applied remotely.
  if (
    metric === "revenue" ||
    metric === "distributed" ||
    metric === "complimentary" ||
    metric === "occupancy"
  ) {
    const admin = createAdminClient();
    let bookingsQuery = admin
      .from("bookings")
      .select("id, total_cents, created_at, accepted_by_admin_id, user_id")
      .eq("event_id", eventId)
      .eq("status", "confirmed");
    if (pDateFrom) bookingsQuery = bookingsQuery.gte("created_at", `${pDateFrom}T00:00:00.000Z`);
    if (pDateTo) bookingsQuery = bookingsQuery.lte("created_at", `${pDateTo}T23:59:59.999Z`);
    const { data: bookingRows } = await bookingsQuery;
    const bookingIds = (bookingRows ?? []).map((b) => b.id);
    if (bookingIds.length === 0) return NextResponse.json({ rows: [] });

    const [ticketsRaw, { data: assignments }, { data: profiles }, { data: eventSeats }, { data: eventSections }] =
      await Promise.all([
        fetchAllTicketsForBookingIds(
          admin,
          bookingIds,
          "id, booking_id, seat_id, section_id, quantity, recipient_name, is_complementary"
        ),
        admin
          .from("admin_seat_assignments")
          .select("id, booking_id, recipient_name, recipient_email, distribution_category")
          .in("booking_id", bookingIds),
        admin.from("profiles").select("id, full_name"),
        admin.from("event_seats").select("id, event_section_id").eq("event_id", eventId),
        admin.from("event_sections").select("id, name, section_code").eq("event_id", eventId),
      ]);
    const tickets = ticketsRaw as Array<{
      id: string;
      booking_id: string;
      seat_id?: string | null;
      section_id?: string | null;
      quantity?: number | null;
      recipient_name?: string | null;
      is_complementary?: boolean | null;
    }>;

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    const bookingById = new Map((bookingRows ?? []).map((b) => [b.id, b]));
    const assignmentByBooking = new Map((assignments ?? []).map((a) => [a.booking_id, a]));
    const assignmentIds = (assignments ?? []).map((a) => a.id).filter(Boolean) as string[];
    const { data: assignmentItems } = assignmentIds.length
      ? await admin
          .from("admin_assignment_items")
          .select("assignment_id, seat_id, section_id, quantity")
          .in("assignment_id", assignmentIds)
      : { data: [] };
    const sectionCandidatesByAssignment = new Map<string, Set<string>>();
    const assignmentExpectedQty = new Map<string, number>();
    for (const item of assignmentItems ?? []) {
      if (item.assignment_id) {
        const qty = item.seat_id ? 1 : Math.max(1, Number(item.quantity ?? 1));
        assignmentExpectedQty.set(
          item.assignment_id,
          (assignmentExpectedQty.get(item.assignment_id) ?? 0) + qty
        );
      }
      if (!item.assignment_id || !item.section_id) continue;
      const set = sectionCandidatesByAssignment.get(item.assignment_id) ?? new Set<string>();
      set.add(item.section_id);
      sectionCandidatesByAssignment.set(item.assignment_id, set);
    }
    const fallbackSectionByAssignmentId = new Map<string, string>();
    for (const [assignmentId, sections] of sectionCandidatesByAssignment.entries()) {
      if (sections.size === 1) fallbackSectionByAssignmentId.set(assignmentId, [...sections][0]);
    }
    const seatSectionBySeatId = new Map((eventSeats ?? []).map((s) => [s.id, s.event_section_id]));
    const sectionNameById = new Map(
      (eventSections ?? []).map((s) => [s.id, (s.name ?? s.section_code ?? "Other")])
    );

    const validTickets = tickets.filter((t) => bookingById.has(t.booking_id));
    const knownSectionQtyByBooking = new Map<string, Map<string, number>>();
    for (const t of validTickets) {
      const assignment = assignmentByBooking.get(t.booking_id);
      const sectionId =
        (t.section_id ??
          seatSectionBySeatId.get(t.seat_id ?? "") ??
          (assignment?.id ? fallbackSectionByAssignmentId.get(assignment.id) : undefined)) ??
        null;
      if (!sectionId) continue;
      const qty = Math.max(1, Number(t.quantity ?? 1));
      const bySection = knownSectionQtyByBooking.get(t.booking_id) ?? new Map<string, number>();
      bySection.set(sectionId, (bySection.get(sectionId) ?? 0) + qty);
      knownSectionQtyByBooking.set(t.booking_id, bySection);
    }
    const dominantSectionByBooking = new Map<string, string>();
    for (const [bookingId, bySection] of knownSectionQtyByBooking.entries()) {
      let bestSectionId: string | null = null;
      let bestQty = -1;
      for (const [sectionId, qty] of bySection.entries()) {
        if (qty > bestQty) {
          bestSectionId = sectionId;
          bestQty = qty;
        }
      }
      if (bestSectionId) dominantSectionByBooking.set(bookingId, bestSectionId);
    }

    if (metric === "revenue") {
      const rows: Array<Record<string, unknown>> = [];
      const byBooking = new Map<string, (typeof validTickets)>();
      for (const t of validTickets) {
        const list = byBooking.get(t.booking_id) ?? [];
        list.push(t);
        byBooking.set(t.booking_id, list);
      }
      for (const [bookingId, ticketRows] of byBooking.entries()) {
        if (ticketRows.length === 0) continue;
        const booking = bookingById.get(bookingId);
        if (!booking) continue;
        const assignment = assignmentByBooking.get(bookingId);
        if (assignment?.distribution_category === "complementary") continue; // exclude complementary from amount paid + buyer list
        const first = ticketRows[0];
        const recipientName = (
          assignment?.recipient_name ??
          first.recipient_name ??
          profileById.get(booking.user_id ?? "") ??
          "Guest"
        ).trim() || "Guest";
        const recipientEmail = (assignment?.recipient_email ?? "").trim();
        const sectionIds = new Set<string>();
        for (const t of ticketRows) {
          const sid = (t.section_id ?? seatSectionBySeatId.get(t.seat_id ?? "")) ?? null;
          if (sid) sectionIds.add(sid);
        }
        const sectionName =
          sectionIds.size === 0
            ? "—"
            : sectionIds.size === 1
              ? (sectionNameById.get([...sectionIds][0]) ?? "Other")
              : "Multiple sections";
        const qtyFromTickets = ticketRows.reduce(
          (sum, t) => sum + Math.max(1, Number(t.quantity ?? 1)),
          0
        );
        const qtyFromItems =
          assignment?.id != null ? (assignmentExpectedQty.get(assignment.id) ?? 0) : 0;
        rows.push({
          booking_id: bookingId,
          total_cents: booking.total_cents,
          created_at: booking.created_at,
          payment_method:
            assignment?.distribution_category === "sales"
              ? "distributed"
              : booking.accepted_by_admin_id == null
                ? "paymongo"
                : "onsite",
          buyer_name: recipientName,
          buyer_email: recipientEmail,
          section_name: sectionName,
          row_label: "—",
          seat_number: "General",
          quantity: Math.max(qtyFromTickets, qtyFromItems),
        });
      }
      rows.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
      return NextResponse.json({
        rows: applyGroupingToDrilldownRows(rows, metric, sectionMaps),
      });
    }

    if (metric === "occupancy") {
      const sectionById = new Map(
        (eventSections ?? []).map((s) => [
          s.id,
          {
            section_name: s.name ?? s.section_code ?? "Other",
            sold: 0,
            distributed: 0,
            complimentary: 0,
          },
        ])
      );
      const seatCountBySection = new Map<string, number>();
      for (const s of eventSeats ?? []) {
        const sid = s.event_section_id;
        if (!sid) continue;
        seatCountBySection.set(sid, (seatCountBySection.get(sid) ?? 0) + 1);
      }

      for (const t of validTickets) {
        const assignment = assignmentByBooking.get(t.booking_id);
        const isComplimentary =
          assignment?.distribution_category === "complementary" || t.is_complementary === true;
        const isDistributed = assignment?.distribution_category === "sales";
        const sectionId = (t.section_id ?? seatSectionBySeatId.get(t.seat_id ?? "")) ?? null;
        if (!sectionId) continue;
        const row = sectionById.get(sectionId);
        if (!row) continue;
        const qty = Math.max(1, Number(t.quantity ?? 1));
        if (isComplimentary) row.complimentary += qty;
        else if (isDistributed) row.distributed += qty;
        else row.sold += qty;
      }

      const rows: Array<Record<string, unknown>> = [];
      for (const s of eventSections ?? []) {
        const sid = s.id;
        const agg = sectionById.get(sid) ?? {
          section_name: s.name ?? s.section_code ?? "Other",
          sold: 0,
          distributed: 0,
          complimentary: 0,
        };
        const capBySeats = seatCountBySection.get(sid) ?? 0;
        const capByConfig = Number((s as { capacity?: number | null }).capacity ?? 0);
        const capacity = capBySeats > 0 ? capBySeats : capByConfig;
        const occupied = agg.sold + agg.distributed + agg.complimentary;
        rows.push({
          section_id: sid,
          section_name: agg.section_name,
          capacity,
          sold: agg.sold,
          distributed: agg.distributed,
          complimentary: agg.complimentary,
          available: Math.max(0, capacity - occupied),
          occupancy_pct: capacity > 0 ? Math.round((occupied / capacity) * 1000) / 10 : 0,
        });
      }

      return NextResponse.json({
        rows: applyGroupingToDrilldownRows(rows, metric, sectionMaps),
      });
    }

    const wantedCategory = metric === "distributed" ? "sales" : "complementary";
    const rows: Array<Record<string, unknown>> = [];
    for (const t of validTickets) {
      const assignment = assignmentByBooking.get(t.booking_id);
      const isComplimentary =
        assignment?.distribution_category === "complementary" || t.is_complementary === true;
      const isDistributed = assignment?.distribution_category === "sales";
      if (wantedCategory === "sales" && !isDistributed) continue;
      if (wantedCategory === "complementary" && !isComplimentary) continue;
      const booking = bookingById.get(t.booking_id);
      if (!booking) continue;
      const sectionId =
        (t.section_id ??
          seatSectionBySeatId.get(t.seat_id ?? "") ??
          (assignment?.id ? fallbackSectionByAssignmentId.get(assignment.id) : undefined) ??
          dominantSectionByBooking.get(t.booking_id)) ??
        null;
      const sectionName = sectionId ? (sectionNameById.get(sectionId) ?? "Other") : "Other";
      const recipientName = (
        assignment?.recipient_name ??
        t.recipient_name ??
        profileById.get(booking.user_id ?? "") ??
        "—"
      ).trim() || "—";
      rows.push({
        ticket_id: t.id,
        assignment_id: assignment?.id ?? null,
        section_id: sectionId,
        section_name: sectionName,
        row_label: sectionId ? "FS" : "—",
        seat_number: t.seat_id ? "Assigned" : "General",
        recipient_name: recipientName,
        recipient_email: (assignment?.recipient_email ?? "").trim() || "—",
        quantity: Math.max(1, Number(t.quantity ?? 1)),
      });
    }
    rows.sort((a, b) =>
      `${String(a.recipient_name)}|${String(a.section_name)}`.localeCompare(
        `${String(b.recipient_name)}|${String(b.section_name)}`
      )
    );
    return NextResponse.json({
      rows: applyGroupingToDrilldownRows(rows, metric, sectionMaps),
    });
  }

  // Admitted: use direct query to always include ticket_id for individual delete (works without migration 00147)
  if (metric === "admitted") {
    const admin = createAdminClient();
    const { data: records } = await admin
      .from("admission_records")
      .select(`
        ticket_id,
        created_at,
        admission_code,
        section_label,
        row_label,
        seat_number,
        tickets!inner (
          recipient_name,
          is_complementary,
          booking_id,
          seat_id,
          section_id
        )
      `)
      .eq("event_id", eventId)
      .eq("action", "admit")
      .order("created_at", { ascending: true });

    if (!records || records.length === 0) {
      return NextResponse.json({ rows: [] });
    }

    const typedRecords = records as Array<{
      ticket_id: string;
      created_at: string;
      admission_code: string | null;
      section_label: string | null;
      row_label: string | null;
      seat_number: string | null;
      tickets: unknown;
    }>;
    const bookingIds = [
      ...new Set(
        typedRecords
          .map((r) => admittedDrilldownTicket(r.tickets))
          .filter((t): t is NonNullable<typeof t> => !!t?.booking_id)
          .map((t) => t.booking_id)
      ),
    ] as string[];
    const seatIds = [
      ...new Set(
        typedRecords
          .map((r) => admittedDrilldownTicket(r.tickets))
          .filter((t): t is NonNullable<typeof t> => !!t)
          .map((t) => t.seat_id)
          .filter(Boolean)
      ),
    ] as string[];
    const [{ data: assigns }, { data: eventSeats }, { data: bookings }] = await Promise.all([
      bookingIds.length > 0
        ? admin
            .from("admin_seat_assignments")
            .select("booking_id, distribution_category, recipient_name, recipient_email")
            .in("booking_id", bookingIds)
        : Promise.resolve({ data: [] }),
      seatIds.length > 0
        ? admin.from("event_seats").select("id, event_section_id").in("id", seatIds)
        : Promise.resolve({ data: [] }),
      bookingIds.length > 0
        ? admin.from("bookings").select("id, user_id").in("id", bookingIds)
        : Promise.resolve({ data: [] }),
    ]);
    const assignByBooking = new Map<
      string,
      {
        distribution_category: string | null;
        recipient_name: string | null;
        recipient_email: string | null;
      }
    >();
    for (const a of assigns ?? []) {
      const prev = assignByBooking.get(a.booking_id);
      const name = (a.recipient_name ?? "").trim() || null;
      const email = (a.recipient_email ?? "").trim() || null;
      if (!prev) {
        assignByBooking.set(a.booking_id, {
          distribution_category: a.distribution_category,
          recipient_name: name,
          recipient_email: email,
        });
      } else {
        assignByBooking.set(a.booking_id, {
          distribution_category: prev.distribution_category ?? a.distribution_category,
          recipient_name: (prev.recipient_name ?? "").trim() ? prev.recipient_name : name,
          recipient_email: (prev.recipient_email ?? "").trim() ? prev.recipient_email : email,
        });
      }
    }
    const sectionBySeat = new Map((eventSeats ?? []).map((e) => [e.id, e.event_section_id]));
    const userIds = [...new Set((bookings ?? []).map((b) => b.user_id).filter(Boolean))] as string[];
    const { data: profiles } = userIds.length > 0
      ? await admin.from("profiles").select("id, full_name, email").in("id", userIds)
      : { data: [] };
    const profileById = new Map(
      (profiles ?? []).map((p) => [
        p.id,
        { full_name: p.full_name, email: (p.email ?? "").trim() },
      ])
    );
    const bookingToUser = new Map((bookings ?? []).map((b) => [b.id, b.user_id]));

    const authEmailByUserId = new Map<string, string>();
    const userIdsNeedingAuthEmail = userIds.filter((id) => !(profileById.get(id)?.email));
    if (userIdsNeedingAuthEmail.length > 0) {
      await Promise.all(
        userIdsNeedingAuthEmail.map(async (id) => {
          const { data, error } = await admin.auth.admin.getUserById(id);
          if (!error && data.user?.email?.trim()) {
            authEmailByUserId.set(id, data.user.email.trim());
          }
        })
      );
    }

    const seen = new Set<string>();
    const rows: Array<Record<string, unknown>> = [];
    for (const ar of typedRecords) {
      const t = admittedDrilldownTicket(ar.tickets);
      if (!t?.booking_id) continue;
      if (seen.has(ar.ticket_id)) continue;
      seen.add(ar.ticket_id);
      const sectionName = (ar.section_label ?? "").trim() || "Other";
      const assign = assignByBooking.get(t.booking_id);
      const uid = bookingToUser.get(t.booking_id) ?? undefined;
      const prof = uid ? profileById.get(uid) : undefined;
      const userFullName = prof?.full_name;
      const ticketRecipient = (t.recipient_name ?? "").trim();
      const assignName = (assign?.recipient_name ?? "").trim();
      const profileName = (userFullName ?? "").trim();
      const recipientName = ticketRecipient || assignName || profileName || "—";
      const assignEmail = (assign?.recipient_email ?? "").trim();
      const profileEmail = prof?.email ?? "";
      const authEmail = uid ? authEmailByUserId.get(uid) ?? "" : "";
      const recipientEmail = assignEmail || profileEmail || authEmail || "—";
      const rowLabel = (ar.row_label ?? "").trim() || "—";
      const seatNumber = (ar.seat_number ?? "").trim() || "—";
      let ticketCategory = "sold";
      if (t?.is_complementary) ticketCategory = "complimentary";
      const distCat = assign?.distribution_category;
      if (distCat === "complementary") ticketCategory = "complimentary";
      else if (distCat === "sales") ticketCategory = "distributed";
      const eventSectionId = t?.seat_id ? sectionBySeat.get(t.seat_id) ?? t.section_id : t?.section_id ?? null;
      rows.push({
        admission_code: (ar.admission_code ?? "").trim() || null,
        section_name: sectionName,
        recipient_name: recipientName,
        recipient_email: recipientEmail,
        checkin_time: ar.created_at,
        ticket_category: ticketCategory,
        row_label: rowLabel,
        seat_number: seatNumber,
        ticket_id: ar.ticket_id,
        event_section_id: eventSectionId,
      });
    }
    rows.sort((a, b) => (String(b.checkin_time).localeCompare(String(a.checkin_time))));
    return NextResponse.json({
      rows: applyGroupingToDrilldownRows(rows, metric, sectionMaps),
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_dashboard_drilldown", {
    p_event_id: eventId,
    p_metric: metric,
    p_date_from: pDateFrom,
    p_date_to: pDateTo,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data?.error === "Event not found") {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (data?.error === "Forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (data?.error === "Invalid metric") {
    return NextResponse.json({ error: "Invalid metric" }, { status: 400 });
  }

  return NextResponse.json({
    ...data,
    rows: applyGroupingToDrilldownRows(
      (data?.rows ?? []) as Array<Record<string, unknown>>,
      metric,
      sectionMaps
    ),
  });
}
