import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_PRICE_CENTS = 50000;

export type PricedCartUnit = {
  price_cents: number;
  section_id: string;
  section_group: string | null;
};

type BuildResult = {
  units: PricedCartUnit[];
  subtotal_cents: number;
  use_early_bird: boolean;
};

export type BuildPricedCartUnitsOptions = {
  /** When set, cart + line items are read with the service role and scoped to this user (avoids RLS/cookie edge cases in API routes). */
  admin: SupabaseClient;
  userId: string;
};

/**
 * Resolves the cart to per-ticket line units (same pricing as checkout / cart-summary).
 * Used for promo rule evaluation (scope + mechanics).
 */
export async function buildPricedCartUnits(
  supabase: SupabaseClient,
  eventId: string,
  cartId: string,
  opts?: BuildPricedCartUnitsOptions
): Promise<BuildResult | { error: "not_found" | "expired" }> {
  const cartDb = opts?.admin ?? supabase;
  let cartQuery = cartDb
    .from("reservation_carts")
    .select("id, expires_at, event_id")
    .eq("id", cartId);
  if (opts) {
    cartQuery = cartQuery.eq("profile_id", opts.userId);
  }
  const { data: cartRow, error: cartErr } = await cartQuery.maybeSingle();

  if (cartErr || !cartRow) {
    return { error: "not_found" };
  }
  if (cartRow.event_id !== eventId) {
    return { error: "not_found" };
  }
  if (cartRow.expires_at <= new Date().toISOString()) {
    return { error: "expired" };
  }

  const { data: items } = await cartDb
    .from("reservation_items")
    .select("seat_id, section_id, quantity")
    .eq("cart_id", cartId);

  const seatItemsRaw = (items ?? []).filter(
    (i): i is { seat_id: string; section_id: string | null; quantity: number } => !!i.seat_id
  );
  const sectionItemsRaw = (items ?? []).filter(
    (i): i is { seat_id: null; section_id: string; quantity: number } =>
      !i.seat_id && !!i.section_id && (i.quantity ?? 1) > 0
  );
  const seen = new Set<string>();
  const deduped = seatItemsRaw.filter((i) => {
    if (seen.has(i.seat_id)) return false;
    seen.add(i.seat_id);
    return true;
  });

  const now = new Date().toISOString();
  const seatIds = deduped.map((i) => i.seat_id);

  const [eventRes, eventPrices, earlyBirdPrices, eventSections, eventSeatsRes] = await Promise.all([
    supabase
      .from("events")
      .select("early_bird_starts_at, early_bird_ends_at")
      .eq("id", eventId)
      .in("status", ["draft", "published"])
      .maybeSingle(),
    supabase
      .from("event_prices")
      .select("section_id, price_cents")
      .eq("event_id", eventId),
    supabase
      .from("early_bird_prices")
      .select("section_id, discount_percent")
      .eq("event_id", eventId),
    supabase
      .from("event_sections")
      .select("id, section_group")
      .eq("event_id", eventId),
    seatIds.length > 0
      ? supabase
          .from("event_seats")
          .select("id, event_section_id")
          .in("id", seatIds)
      : Promise.resolve({ data: [] as { id: string; event_section_id: string }[] }),
  ]);

  const sectionGroupById = new Map<string, string | null>();
  for (const r of eventSections.data ?? []) {
    sectionGroupById.set(
      r.id,
      r.section_group != null && String(r.section_group).trim() !== ""
        ? String(r.section_group).trim()
        : null
    );
  }

  const useEarlyBird =
    eventRes.data?.early_bird_starts_at != null &&
    eventRes.data?.early_bird_ends_at != null &&
    now >= eventRes.data.early_bird_starts_at &&
    now <= eventRes.data.early_bird_ends_at;

  const baseMap = new Map<string, number>();
  for (const p of eventPrices.data ?? []) {
    if (p.section_id) baseMap.set(p.section_id, p.price_cents);
  }
  const ebPercentMap = new Map<string, number>();
  for (const eb of earlyBirdPrices.data ?? []) {
    if (eb.section_id) ebPercentMap.set(eb.section_id, eb.discount_percent);
  }

  const getPriceForSection = (sectionId: string): number => {
    const base = baseMap.get(sectionId) ?? DEFAULT_PRICE_CENTS;
    const discountPercent = ebPercentMap.get(sectionId);
    if (useEarlyBird && discountPercent !== undefined) {
      return Math.floor((base * (100 - discountPercent)) / 100);
    }
    return base;
  };

  const sectionByEventSeat = new Map<string, string>();
  for (const row of eventSeatsRes.data ?? []) {
    if (row.event_section_id) sectionByEventSeat.set(row.id, row.event_section_id);
  }
  const needVenue = seatIds.filter((id) => !sectionByEventSeat.has(id));
  const sectionByVenueSeat = new Map<string, string>();
  if (needVenue.length > 0) {
    const { data: venueRows } = await supabase
      .from("seats")
      .select("id, section_id")
      .in("id", needVenue);
    for (const row of venueRows ?? []) {
      if (row.id && row.section_id) {
        sectionByVenueSeat.set(row.id, row.section_id);
      }
    }
  }

  const units: PricedCartUnit[] = [];

  for (const item of deduped) {
    const fromEvent = sectionByEventSeat.get(item.seat_id);
    const sectionId = fromEvent ?? sectionByVenueSeat.get(item.seat_id);
    if (sectionId) {
      const price = getPriceForSection(sectionId);
      units.push({
        price_cents: price,
        section_id: sectionId,
        section_group: sectionGroupById.get(sectionId) ?? null,
      });
    } else {
      units.push({
        price_cents: DEFAULT_PRICE_CENTS,
        section_id: item.section_id ?? "unknown",
        section_group: item.section_id ? sectionGroupById.get(item.section_id) ?? null : null,
      });
    }
  }

  for (const item of sectionItemsRaw) {
    const q = item.quantity ?? 1;
    const price = getPriceForSection(item.section_id);
    const g = sectionGroupById.get(item.section_id) ?? null;
    for (let i = 0; i < q; i++) {
      units.push({
        price_cents: price,
        section_id: item.section_id,
        section_group: g,
      });
    }
  }

  const subtotal_cents = units.reduce((s, u) => s + u.price_cents, 0);
  return {
    units,
    subtotal_cents,
    use_early_bird: useEarlyBird,
  };
}
