import { createAdminClient } from "@/lib/supabase/admin";
import {
  applyGroupingToDashboardReport,
  buildSectionGroupMaps,
} from "@/lib/reports-section-grouping";
import { fetchAllTicketsForBookingIds } from "@/lib/reports/fetch-tickets-for-booking-ids";
import { loadOfflinePackSeatMaps } from "@/lib/admissions/offline-pack-seat-maps";
import {
  buildPriorityGuestsReport,
  EMPTY_PRIORITY_GUESTS_REPORT,
} from "@/lib/reports/priority-guests-report";
import { resolveTicketEventSectionId } from "@/lib/reports/resolve-ticket-event-section";
import {
  buildSectionsSalesForReport,
  VSS_UNMAPPED_SECTION_ID,
} from "@/lib/reports/sections-online-sales-chart";
import {
  buildDailyOnlineSalesByGroup,
  type DailyOnlineSalesByGroup,
} from "@/lib/reports/daily-online-sales-by-group";

const VSS_UNMAPPED_SECTION_NAME = "Unmapped";

function asNonNegativeInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function clampPercent(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export async function buildDashboardMetricsReport(params: {
  eventId: string;
  dateFrom: string | null;
  dateTo: string | null;
  baseData: Record<string, unknown>;
}) {
  const { eventId, dateFrom, dateTo, baseData } = params;
  /**
   * Use service-role reads for event-scoped enrichment. Shared report requests have no user
   * session; anon RLS would return empty sections/prices and break VSS, revenue grouping,
   * promo math, and tech-hold — while KPI RPC data still looked correct.
   */
  const admin = createAdminClient();

  const [eventRes, pricesRes, eventSectionsRes, techHoldSeatsRes] = await Promise.all([
    admin.from("events").select("promo_calculator_config").eq("id", eventId).maybeSingle(),
    admin.from("event_prices").select("section_id, price_cents").eq("event_id", eventId),
    admin
      .from("event_sections")
      .select("id, name, section_code, section_group, sort_order, color, capacity")
      .eq("event_id", eventId),
    admin
      .from("event_seats")
      .select("id, event_section_id")
      .eq("event_id", eventId)
      .eq("status", "hold")
      .ilike("hold_description", "%tech%"),
  ]);

  const configRaw = (eventRes.data as { promo_calculator_config?: unknown } | null)?.promo_calculator_config;
  const config =
    configRaw && typeof configRaw === "object" && !Array.isArray(configRaw)
      ? (configRaw as Record<string, unknown>)
      : {};
  const sectionRows = (eventSectionsRes.data ?? []) as Array<{
    id: string;
    name: string | null;
    section_code: string | null;
    section_group: string | null;
    sort_order: number | null;
    color: string | null;
    capacity: number | null;
  }>;
  const sectionGroupMaps = buildSectionGroupMaps(sectionRows);

  const priceBySection = new Map<string, number>();
  for (const row of pricesRes.data ?? []) {
    const sectionId = (row as { section_id?: string }).section_id;
    if (!sectionId) continue;
    if (priceBySection.has(sectionId)) continue;
    priceBySection.set(sectionId, asNonNegativeInt((row as { price_cents?: number }).price_cents));
  }

  const giveaways = Array.isArray(config.giveaways) ? config.giveaways : [];
  const discounts = Array.isArray(config.discounts) ? config.discounts : [];
  const expenses = Array.isArray(config.expenses) ? config.expenses : [];

  const giveawayValueCents = giveaways.reduce((sum, row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return sum;
    const allocations = (row as { allocations?: unknown }).allocations;
    if (!allocations || typeof allocations !== "object" || Array.isArray(allocations)) return sum;
    let rowSum = 0;
    for (const [sectionId, qty] of Object.entries(allocations as Record<string, unknown>)) {
      const count = asNonNegativeInt(qty);
      const price = priceBySection.get(sectionId) ?? 0;
      rowSum += count * price;
    }
    return sum + rowSum;
  }, 0);

  const discountValueCents = discounts.reduce((sum, row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return sum;
    const allocations = (row as { allocations?: unknown }).allocations;
    if (!allocations || typeof allocations !== "object" || Array.isArray(allocations)) return sum;
    const discountPercent = clampPercent((row as { discountPercent?: unknown }).discountPercent, 0);
    let rowSum = 0;
    for (const [sectionId, qty] of Object.entries(allocations as Record<string, unknown>)) {
      const count = asNonNegativeInt(qty);
      const price = priceBySection.get(sectionId) ?? 0;
      rowSum += Math.round(count * price * (discountPercent / 100));
    }
    return sum + rowSum;
  }, 0);

  const expensesValueCents = expenses.reduce((sum, row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return sum;
    return sum + asNonNegativeInt((row as { amountCents?: unknown }).amountCents);
  }, 0);

  const projectedRevenueCents = asNonNegativeInt(
    (baseData as { kpis?: { total_projected_revenue_cents?: number; projected_total_gross_cents?: number } })?.kpis
      ?.total_projected_revenue_cents ??
      (baseData as { kpis?: { projected_total_gross_cents?: number } })?.kpis?.projected_total_gross_cents ??
      0
  );
  const promoBudgetPercent = clampPercent(config.promoBudgetPercent, 10);
  const allocatedPromoBudgetCents = Math.round(projectedRevenueCents * (promoBudgetPercent / 100));
  const usedPromoBudgetCents = giveawayValueCents + discountValueCents + expensesValueCents;

  const groupedReport = applyGroupingToDashboardReport(
    baseData,
    sectionGroupMaps
  );

  const techHoldSeats = techHoldSeatsRes.data ?? [];
  const techHoldSeatsCount = techHoldSeats.length;
  const techHoldValueCents = techHoldSeats.reduce((sum, seat) => {
    const sectionId = (seat as { event_section_id?: string | null }).event_section_id;
    if (!sectionId) return sum;
    return sum + (priceBySection.get(sectionId) ?? 0);
  }, 0);

  let bookingsQuery = admin
    .from("bookings")
    .select(
      "id, total_cents, accepted_by_admin_id, created_at, special_request_type, special_request_details"
    )
    .eq("event_id", eventId)
    .eq("status", "confirmed");
  if (dateFrom) bookingsQuery = bookingsQuery.gte("created_at", `${dateFrom}T00:00:00.000Z`);
  if (dateTo) bookingsQuery = bookingsQuery.lte("created_at", `${dateTo}T23:59:59.999Z`);
  const { data: bookingRows } = await bookingsQuery;
  const bookingIds = (bookingRows ?? []).map((b) => b.id);

  let soldCount = 0;
  let distributedCount = 0;
  let complimentaryCount = 0;
  let grossRevenueExcludingComplementary = 0;
  let paymongoRevenue = 0;
  let onsiteRevenue = 0;
  let distributedRecipientNames: string | null = null;
  let vssBreakdownRows: Array<{
    section_id: string;
    section_name: string;
    section_color: string | null;
    sold: number;
    distributed: number;
    complimentary: number;
    available: number;
  }> = [];
  let sectionRevenueRows: Array<{
    section_id: string;
    section_name: string;
    amount_paid_cents: number;
    distributed_value_cents: number;
    complimentary_value_cents: number;
    projected_revenue_cents: number;
  }> | null = null;
  let dailyOnlineSalesByGroup: DailyOnlineSalesByGroup = { days: [], series: [] };

  /** No matching bookings: ticket-based recompute would yield empty VSS and zero revenue — use RPC + grouping. */
  if (bookingIds.length === 0) {
    const gr = groupedReport as {
      kpis?: Record<string, unknown>;
      payment_methods?: Record<string, unknown>;
    };
    const k = gr.kpis ?? {};
    soldCount = asNonNegativeInt(k.total_sold);
    distributedCount = asNonNegativeInt(k.distributed);
    complimentaryCount = asNonNegativeInt(k.complimentary);
    grossRevenueExcludingComplementary = asNonNegativeInt(k.gross_revenue_cents);
    distributedRecipientNames =
      typeof k.distributed_recipient_names === "string" && k.distributed_recipient_names.trim()
        ? k.distributed_recipient_names.trim()
        : null;
    const pm = gr.payment_methods ?? {};
    paymongoRevenue = asNonNegativeInt(pm.paymongo_revenue_cents);
    onsiteRevenue = asNonNegativeInt(pm.onsite_revenue_cents);
  }

  if (bookingIds.length > 0) {
    const [tickets, { data: assignments }] = await Promise.all([
      fetchAllTicketsForBookingIds(
        admin,
        bookingIds,
        "booking_id, seat_id, section_id, quantity, is_complementary"
      ),
      admin
        .from("admin_seat_assignments")
        .select("id, booking_id, distribution_category, recipient_name")
        .in("booking_id", bookingIds),
    ]);

    const assignmentByBooking = new Map(
      (assignments ?? []).map((a) => [a.booking_id, a])
    );
    const assignmentIds = (assignments ?? []).map((a) => a.id).filter(Boolean) as string[];
    const { data: assignmentItems } = assignmentIds.length
      ? await admin
          .from("admin_assignment_items")
          .select("assignment_id, seat_id, section_id, quantity")
          .in("assignment_id", assignmentIds)
      : { data: [] };
    const sectionMeta = new Map(
      sectionRows.map((s) => [
        s.id,
        {
          name: s.name ?? s.section_code ?? "Other",
          color: s.color ?? null,
          capacity: Number(s.capacity ?? 0),
          sold: 0,
          distributed: 0,
          complimentary: 0,
        },
      ])
    );
    const sectionSeatCount = new Map<string, number>();
    const { data: allEventSeats } = await admin
      .from("event_seats")
      .select("id, event_section_id")
      .eq("event_id", eventId);
    const sectionBySeat = new Map<string, string>();
    for (const s of allEventSeats ?? []) {
      if (s.event_section_id) {
        sectionSeatCount.set(
          s.event_section_id,
          (sectionSeatCount.get(s.event_section_id) ?? 0) + 1
        );
        sectionBySeat.set(s.id, s.event_section_id);
      }
    }
    type TicketMetricRow = {
      booking_id: string;
      seat_id?: string | null;
      section_id?: string | null;
      quantity?: number | null;
      is_complementary?: boolean | null;
    };
    const ticketRows = tickets as TicketMetricRow[];
    const seatMaps = await loadOfflinePackSeatMaps(
      admin,
      ticketRows.map((t) => ({
        section_id: (t.section_id as string | null) ?? null,
        seat_id: (t.seat_id as string | null) ?? null,
        quantity: Math.max(1, Number(t.quantity ?? 1)),
      }))
    );
    const resolveSectionCore = (
      section_id: string | null,
      seat_id: string | null
    ) =>
      resolveTicketEventSectionId({
        section_id,
        seat_id,
        seatMaps,
        sectionByEventSeat: sectionBySeat,
        eventSections: sectionRows,
      }) ??
      (section_id && sectionMeta.has(section_id) ? section_id : null) ??
      (seat_id ? sectionBySeat.get(seat_id) ?? null : null);

    const fallbackSectionByAssignmentId = new Map<string, string>();
    const sectionCandidatesByAssignment = new Map<string, Set<string>>();
    const assignmentSectionQty = new Map<string, Map<string, number>>();
    const assignmentExpectedQty = new Map<string, number>();
    for (const item of assignmentItems ?? []) {
      if (!item.assignment_id) continue;
      const sectionId = resolveSectionCore(
        (item.section_id as string | null) ?? null,
        (item.seat_id as string | null) ?? null
      );
      const qty = (item.seat_id ? 1 : Math.max(1, Number(item.quantity ?? 1)));
      assignmentExpectedQty.set(
        item.assignment_id,
        (assignmentExpectedQty.get(item.assignment_id) ?? 0) + qty
      );
      if (!sectionId) continue;
      const set = sectionCandidatesByAssignment.get(item.assignment_id) ?? new Set<string>();
      set.add(sectionId);
      sectionCandidatesByAssignment.set(item.assignment_id, set);
      const bySection = assignmentSectionQty.get(item.assignment_id) ?? new Map<string, number>();
      bySection.set(sectionId, (bySection.get(sectionId) ?? 0) + qty);
      assignmentSectionQty.set(item.assignment_id, bySection);
    }
    for (const [assignmentId, sections] of sectionCandidatesByAssignment.entries()) {
      if (sections.size === 1) fallbackSectionByAssignmentId.set(assignmentId, [...sections][0]);
    }
    const ticketCountByBooking = new Map<string, number>();
    const knownSectionQtyByBooking = new Map<string, Map<string, number>>();
    const resolveSectionForTicket = (
      section_id: string | null,
      seat_id: string | null,
      assignId?: string
    ) =>
      resolveSectionCore(section_id, seat_id) ??
      (assignId ? fallbackSectionByAssignmentId.get(assignId) ?? null : null);

    const ticketFacts = ticketRows.map((t) => {
      const qty = Math.max(1, Number(t.quantity ?? 1));
      ticketCountByBooking.set(
        t.booking_id,
        (ticketCountByBooking.get(t.booking_id) ?? 0) + qty
      );
      const assign = assignmentByBooking.get(t.booking_id);
      const resolvedSectionId = resolveSectionForTicket(
        (t.section_id as string | null) ?? null,
        (t.seat_id as string | null) ?? null,
        assign?.id
      );
      if (resolvedSectionId) {
        const bySection = knownSectionQtyByBooking.get(t.booking_id) ?? new Map<string, number>();
        bySection.set(resolvedSectionId, (bySection.get(resolvedSectionId) ?? 0) + qty);
        knownSectionQtyByBooking.set(t.booking_id, bySection);
      }
      return { t, qty, assign, resolvedSectionId };
    });

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

    const processedAssignmentBookings = new Set<string>();
    for (const [bookingId, assign] of assignmentByBooking.entries()) {
      if (!assign?.id) continue;
      if (assign.distribution_category !== "sales" && assign.distribution_category !== "complementary") continue;
      // Confirmed bookings have ticket rows: use per-seat ticket facts for section split. Assignment
      // items can undercount (seat-only assigns omit items) or be stale vs tickets after confirm.
      const ticketTotalForBooking = ticketCountByBooking.get(bookingId) ?? 0;
      if (ticketTotalForBooking > 0) continue;

      const sectionQty = assignmentSectionQty.get(assign.id);
      const expectedQty = assignmentExpectedQty.get(assign.id) ?? 0;
      if (!sectionQty || expectedQty <= 0) continue;
      const isComplimentary = assign.distribution_category === "complementary";
      for (const [sectionId, qty] of sectionQty.entries()) {
        const sec = sectionMeta.get(sectionId);
        if (isComplimentary) {
          complimentaryCount += qty;
          if (sec) sec.complimentary += qty;
        } else {
          distributedCount += qty;
          if (sec) sec.distributed += qty;
        }
      }
      processedAssignmentBookings.add(bookingId);
    }

    for (const fact of ticketFacts) {
      const { t, qty, assign } = fact;
      if (processedAssignmentBookings.has(t.booking_id)) continue;
      const sectionId = fact.resolvedSectionId ?? dominantSectionByBooking.get(t.booking_id) ?? null;
      const sec = sectionId ? sectionMeta.get(sectionId) : undefined;
      if (assign?.distribution_category === "complementary") {
        complimentaryCount += qty;
        if (sec) sec.complimentary += qty;
      } else if (assign?.distribution_category === "sales") {
        distributedCount += qty;
        if (sec) sec.distributed += qty;
      } else if (t.is_complementary) {
        complimentaryCount += qty;
        if (sec) sec.complimentary += qty;
      } else {
        soldCount += qty;
        if (sec) sec.sold += qty;
      }
    }

    const distributedNames = new Set<string>();
    for (const a of assignments ?? []) {
      if (a.distribution_category !== "sales") continue;
      const name = (a.recipient_name ?? "").trim();
      if (name) distributedNames.add(name);
    }
    distributedRecipientNames = [...distributedNames].sort((a, b) => a.localeCompare(b)).join(", ") || null;

    for (const b of bookingRows ?? []) {
      if ((ticketCountByBooking.get(b.id) ?? 0) <= 0) continue;
      const assign = assignmentByBooking.get(b.id);
      if (assign?.distribution_category === "complementary") continue;
      const total = asNonNegativeInt(b.total_cents);
      grossRevenueExcludingComplementary += total;
      // Manual sales distribution is counted under distributed seat value, not online/onsite.
      if (assign?.distribution_category === "sales") continue;
      if (b.accepted_by_admin_id == null) paymongoRevenue += total;
      else onsiteRevenue += total;
    }

    const sectionEntries = [...sectionMeta.entries()];
    const getOrCreateUnmappedSection = () => {
      const existing = sectionMeta.get(VSS_UNMAPPED_SECTION_ID);
      if (existing) return existing;
      const created = {
        name: VSS_UNMAPPED_SECTION_NAME,
        color: null as string | null,
        capacity: 0,
        sold: 0,
        distributed: 0,
        complimentary: 0,
      };
      sectionMeta.set(VSS_UNMAPPED_SECTION_ID, created);
      return created;
    };
    const reconcileMetricDelta = (
      metric: "sold" | "distributed" | "complimentary",
      targetTotal: number
    ) => {
      const currentTotal = sectionEntries.reduce((sum, [, sec]) => sum + sec[metric], 0);
      const delta = targetTotal - currentTotal;
      if (delta <= 0) return;
      // Preserve section accuracy by isolating unmapped ticket deltas
      // instead of mutating a real section with the largest metric.
      const row = getOrCreateUnmappedSection();
      row[metric] += delta;
    };
    reconcileMetricDelta("sold", soldCount);
    reconcileMetricDelta("distributed", distributedCount);
    reconcileMetricDelta("complimentary", complimentaryCount);

    vssBreakdownRows = [...sectionMeta.entries()].map(([sectionId, sec]) => {
      const capacity = Math.max(sectionSeatCount.get(sectionId) ?? 0, sec.capacity);
      const occupied = sec.sold + sec.distributed + sec.complimentary;
      return {
        section_id: sectionId,
        section_name: sec.name,
        section_color: sec.color,
        sold: sec.sold,
        distributed: sec.distributed,
        complimentary: sec.complimentary,
        available: Math.max(0, capacity - occupied),
      };
    });

    const amountPaidBySection = new Map<string, number>();
    const rpcSectionRevenue = Array.isArray(baseData.section_revenue)
      ? (baseData.section_revenue as Array<Record<string, unknown>>)
      : [];
    for (const row of rpcSectionRevenue) {
      const sectionId = String(row.section_id ?? "");
      if (!sectionId) continue;
      amountPaidBySection.set(sectionId, asNonNegativeInt(row.amount_paid_cents));
    }

    sectionRevenueRows = [...sectionMeta.entries()].map(([sectionId, sec]) => {
      const capacity = Math.max(sectionSeatCount.get(sectionId) ?? 0, sec.capacity);
      const priceCents = priceBySection.get(sectionId) ?? 0;
      const complimentaryValue = sec.complimentary * priceCents;
      return {
        section_id: sectionId,
        section_name: sec.name,
        amount_paid_cents: amountPaidBySection.get(sectionId) ?? 0,
        distributed_value_cents: sec.distributed * priceCents,
        complimentary_value_cents: complimentaryValue,
        projected_revenue_cents: Math.max(0, capacity * priceCents - complimentaryValue),
      };
    });

    const bookingCreatedAt = new Map(
      (bookingRows ?? []).map((b) => [b.id, String(b.created_at ?? "")])
    );
    const sectionNameById = new Map(sectionRows.map((s) => [s.id, s.name ?? s.section_code ?? "Other"]));
    dailyOnlineSalesByGroup = buildDailyOnlineSalesByGroup({
      bookingCreatedAt,
      ticketFacts: ticketFacts.map(({ t, qty, assign, resolvedSectionId }) => ({
        booking_id: t.booking_id,
        qty,
        assign,
        resolvedSectionId,
        is_complementary: t.is_complementary === true,
      })),
      dominantSectionByBooking,
      sectionNameById,
      sectionGroupMaps,
    });
  }

    const groupedVssRows = (
    bookingIds.length > 0
      ? ((applyGroupingToDashboardReport(
          { vss_breakdown: vssBreakdownRows },
          sectionGroupMaps
        ) as { vss_breakdown?: Array<Record<string, unknown>> }).vss_breakdown ?? vssBreakdownRows)
      : Array.isArray((groupedReport as { vss_breakdown?: unknown }).vss_breakdown)
        ? ((groupedReport as { vss_breakdown: Array<Record<string, unknown>> }).vss_breakdown)
        : []
  ) as Array<Record<string, unknown>>;

  const groupedSectionRevenueRows =
    bookingIds.length > 0
      ? sectionRevenueRows
        ? (((applyGroupingToDashboardReport(
            { section_revenue: sectionRevenueRows },
            sectionGroupMaps
          ) as { section_revenue?: Array<Record<string, unknown>> }).section_revenue ??
            sectionRevenueRows) as Array<Record<string, unknown>>)
        : null
      : Array.isArray((groupedReport as { section_revenue?: unknown }).section_revenue)
        ? ((groupedReport as { section_revenue: Array<Record<string, unknown>> }).section_revenue)
        : null;

  const distributedRevenueForPayment =
    bookingIds.length > 0
      ? (groupedSectionRevenueRows ?? []).reduce(
          (s, r) => s + asNonNegativeInt((r as Record<string, unknown>).distributed_value_cents),
          0
        )
      : asNonNegativeInt(
          ((groupedReport as { payment_methods?: Record<string, unknown> }).payment_methods ?? {})
            .distributed_revenue_cents
        );

  const reconcileGroupedMetric = (
    metric: "sold" | "distributed" | "complimentary",
    targetTotal: number
  ) => {
    if (groupedVssRows.length === 0) return;
    const currentTotal = groupedVssRows.reduce(
      (sum, row) => sum + asNonNegativeInt(row[metric]),
      0
    );
    const delta = targetTotal - currentTotal;
    if (delta <= 0) return;
    const idx = groupedVssRows.findIndex(
      (row) => String(row.section_id ?? "") === VSS_UNMAPPED_SECTION_ID
    );
    if (idx >= 0) {
      groupedVssRows[idx][metric] = asNonNegativeInt(groupedVssRows[idx][metric]) + delta;
      return;
    }
    groupedVssRows.push({
      section_id: VSS_UNMAPPED_SECTION_ID,
      section_name: VSS_UNMAPPED_SECTION_NAME,
      section_color: null,
      sold: metric === "sold" ? delta : 0,
      distributed: metric === "distributed" ? delta : 0,
      complimentary: metric === "complimentary" ? delta : 0,
      available: 0,
    });
  };

  reconcileGroupedMetric("sold", soldCount);
  reconcileGroupedMetric("distributed", distributedCount);
  reconcileGroupedMetric("complimentary", complimentaryCount);

  for (const row of groupedVssRows) {
    const cap = asNonNegativeInt(row.sold) + asNonNegativeInt(row.distributed) + asNonNegativeInt(row.complimentary) + asNonNegativeInt(row.available);
    const occupied =
      asNonNegativeInt(row.sold) +
      asNonNegativeInt(row.distributed) +
      asNonNegativeInt(row.complimentary);
    row.available = Math.max(0, cap - occupied);
  }

  const vssBreakdownForReport = groupedVssRows.filter((row) => {
    if (String(row.section_id ?? "") !== VSS_UNMAPPED_SECTION_ID) return true;
    return (
      asNonNegativeInt(row.sold) +
        asNonNegativeInt(row.distributed) +
        asNonNegativeInt(row.complimentary) >
      0
    );
  });

  let priorityGuests = EMPTY_PRIORITY_GUESTS_REPORT;
  try {
    priorityGuests = await buildPriorityGuestsReport({
      admin,
      eventId,
      dateFrom,
      dateTo,
      sectionRows,
    });
  } catch (priorityGuestsError) {
    console.error("[dashboard-metrics] priority guests", priorityGuestsError);
  }

  const sectionsSalesForReport = buildSectionsSalesForReport({
    groupedReport,
    vssBreakdownRows: vssBreakdownForReport,
    useTicketVss: bookingIds.length > 0,
  });

  const reportWithTechHold = {
    ...groupedReport,
    sections_sales: sectionsSalesForReport,
    daily_online_sales_by_group: dailyOnlineSalesByGroup,
    priority_guests: priorityGuests,
    kpis: {
      ...((groupedReport as { kpis?: Record<string, unknown> }).kpis ?? {}),
      total_sold: soldCount,
      distributed: distributedCount,
      complimentary: complimentaryCount,
      gross_revenue_cents: grossRevenueExcludingComplementary,
      distributed_recipient_names: distributedRecipientNames,
      occupancy_pct:
        asNonNegativeInt(
          ((groupedReport as { kpis?: { total_capacity?: number } }).kpis?.total_capacity ?? 0)
        ) > 0
          ? Math.round(
              ((soldCount + distributedCount + complimentaryCount) /
                asNonNegativeInt(
                  ((groupedReport as { kpis?: { total_capacity?: number } }).kpis?.total_capacity ?? 0)
                )) *
                1000
            ) / 10
          : 0,
      tech_hold_seats: techHoldSeatsCount,
      tech_hold_value_cents: techHoldValueCents,
    },
    payment_methods: {
      ...((groupedReport as { payment_methods?: Record<string, unknown> }).payment_methods ?? {}),
      paymongo_revenue_cents: paymongoRevenue,
      onsite_revenue_cents: onsiteRevenue,
      distributed_revenue_cents: distributedRevenueForPayment,
      total_revenue_cents: paymongoRevenue + onsiteRevenue + distributedRevenueForPayment,
    },
    vss_breakdown: vssBreakdownForReport,
    ...(groupedSectionRevenueRows ? { section_revenue: groupedSectionRevenueRows } : {}),
  };

  return {
    ...reportWithTechHold,
    promo_budget: {
      promo_budget_percent: promoBudgetPercent,
      allocated_cents: allocatedPromoBudgetCents,
      used_cents: usedPromoBudgetCents,
      remaining_cents: allocatedPromoBudgetCents - usedPromoBudgetCents,
    },
  };
}
