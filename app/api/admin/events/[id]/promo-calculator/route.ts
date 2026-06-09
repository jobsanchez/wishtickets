import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";
import {
  computePromoCalculator,
  normalizePromoCalculatorConfig,
  type PromoCalculatorSection,
} from "@/lib/promo-calculator";
import { z } from "zod";

async function loadBaselineSections(eventId: string) {
  const supabase = await createClient();
  const { data: eventRow, error: eventError } = await supabase
    .rpc("get_admin_event_by_id", { p_id: eventId });
  if (eventError) throw new Error(eventError.message);
  const event =
    Array.isArray(eventRow) ? eventRow[0] : eventRow;
  if (!event) return { event: null, sections: [] as PromoCalculatorSection[] };

  const PAGE_SIZE = 1000;
  const allEventSeatRows: Array<{
    id: string;
    event_section_id: string;
    status: string | null;
    assignment_id: string | null;
  }> = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data: page } = await supabase
      .from("event_seats")
      .select("id, event_section_id, status, assignment_id")
      .eq("event_id", eventId)
      .order("event_section_id")
      .order("row_label")
      .order("seat_number")
      .range(offset, offset + PAGE_SIZE - 1);
    const rows = page ?? [];
    allEventSeatRows.push(...rows);
    hasMore = rows.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  const [{ data: eventSections }, { data: prices }, { data: confirmedBookings }, { data: activeCarts }] =
    await Promise.all([
      supabase
        .from("event_sections")
        .select("id, name, capacity, seating_type, sort_order")
        .eq("event_id", eventId)
        .order("sort_order")
        .order("name"),
      supabase
        .from("event_prices")
        .select("section_id, price_cents")
        .eq("event_id", eventId),
      supabase
        .from("bookings")
        .select("id")
        .eq("event_id", eventId)
        .eq("status", "confirmed"),
      supabase
        .from("reservation_carts")
        .select("id")
        .eq("event_id", eventId)
        .gt("expires_at", new Date().toISOString()),
    ]);

  const seatCountBySection = new Map<string, number>();
  for (const row of allEventSeatRows) {
    const sectionId = row.event_section_id;
    seatCountBySection.set(sectionId, (seatCountBySection.get(sectionId) ?? 0) + 1);
  }

  const priceBySection = new Map<string, number>();
  for (const price of prices ?? []) {
    if (!priceBySection.has(price.section_id)) {
      priceBySection.set(price.section_id, price.price_cents ?? 0);
    }
  }

  const bookingIds = (confirmedBookings ?? []).map((b) => b.id);
  const cartIds = (activeCarts ?? []).map((c) => c.id);

  const [ticketsWithSeatId, reservationItemsWithSeatId] = await Promise.all([
    bookingIds.length > 0
      ? supabase
          .from("tickets")
          .select("seat_id")
          .in("booking_id", bookingIds)
          .not("seat_id", "is", null)
      : Promise.resolve({ data: [] as { seat_id: string | null }[] }),
    cartIds.length > 0
      ? supabase
          .from("reservation_items")
          .select("seat_id")
          .in("cart_id", cartIds)
          .not("seat_id", "is", null)
      : Promise.resolve({ data: [] as { seat_id: string | null }[] }),
  ]);

  const soldSet = new Set<string>();
  for (const row of ticketsWithSeatId.data ?? []) {
    if (row.seat_id) soldSet.add(row.seat_id);
  }

  for (const row of allEventSeatRows) {
    if ((row.status ?? "available") === "sold") {
      soldSet.add(row.id);
    }
  }

  const reservedSet = new Set<string>();
  for (const row of reservationItemsWithSeatId.data ?? []) {
    if (row.seat_id) reservedSet.add(row.seat_id);
  }
  for (const row of allEventSeatRows) {
    if (row.assignment_id != null || (row.status ?? "available") === "reserved") {
      reservedSet.add(row.id);
    }
  }
  const taken = new Set([...soldSet, ...reservedSet]);

  const sections: PromoCalculatorSection[] = (eventSections ?? []).map((section) => {
    const derivedCapacity = seatCountBySection.get(section.id);
    const seatingType = (section as { seating_type?: string | null }).seating_type ?? "assigned";
    const isAssigned = seatingType === "assigned";
    const baseCapacity =
      isAssigned && derivedCapacity && derivedCapacity > 0
        ? derivedCapacity
        : section.capacity ?? 0;
    const sectionSeats = allEventSeatRows.filter((s) => s.event_section_id === section.id);
    const total = sectionSeats.length || baseCapacity;
    const takenCount =
      sectionSeats.length > 0
        ? sectionSeats.filter((s) => taken.has(s.id)).length
        : 0;
    const remaining = Math.max(0, total - takenCount);
    return {
      sectionId: section.id,
      sectionName: section.name,
      // For assigned seating, prefer actual seat rows when present.
      // For free/standing seating, the capacity is authoritative.
      capacity: baseCapacity,
      forSale: remaining,
      priceCents: priceBySection.get(section.id) ?? 0,
    };
  });

  return { event, sections };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const denied = await forbiddenUnlessEventSection(id, "promoCalculator");
    if (denied) return denied;

    const { event, sections } = await loadBaselineSections(id);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const config = normalizePromoCalculatorConfig(
      event.promo_calculator_config,
      sections
    );
    const computed = computePromoCalculator(sections, config);

    return NextResponse.json({
      event: { id: event.id, title: event.title },
      sections,
      config,
      computed,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load promo calculator" },
      { status: 500 }
    );
  }
}

const configSchema = z.object({
  promoBudgetPercent: z.number().min(0).max(100),
  giveaways: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      allocations: z.record(z.string(), z.number().min(0)),
    })
  ),
  discounts: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      discountPercent: z.number().min(0).max(100),
      allocations: z.record(z.string(), z.number().min(0)),
    })
  ),
  expenses: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      amountCents: z.number().min(0),
    })
  ),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const denied = await forbiddenUnlessEventSection(id, "promoCalculator");
    if (denied) return denied;

    const body = await request.json();
    const parsed = configSchema.safeParse(body?.config);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid promo calculator payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { event, sections } = await loadBaselineSections(id);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const normalized = normalizePromoCalculatorConfig(parsed.data, sections);
    const admin = createAdminClient();
    const { error } = await admin
      .from("events")
      .update({ promo_calculator_config: normalized })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      config: normalized,
      computed: computePromoCalculator(sections, normalized),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save promo calculator" },
      { status: 500 }
    );
  }
}
