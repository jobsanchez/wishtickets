import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_PRICE_CENTS = 50000;

export interface CartSummaryResult {
  subtotal_cents: number;
  item_count: number;
  early_bird_active: boolean;
}

export type CartSummaryErrorCode = "not_found" | "expired";

export type GetCartSummaryResult =
  | { ok: true; data: CartSummaryResult }
  | { ok: false; code: CartSummaryErrorCode };

/**
 * Computes cart subtotal for an active reservation.
 *
 * Flow:
 * 1. Require an authenticated user and a reservation cart row owned by them (RLS scoped).
 * 2. Load line items with the service role so results never depend on reservation_items RLS
 *    quirks or replica/read ordering vs. the cart row.
 * 3. Resolve event seats with service role scoped by `event_id` so pricing cannot reference
 *    the wrong event.
 */
export async function getCartSummary(
  eventId: string,
  cartId: string
): Promise<GetCartSummaryResult> {
  const supabase = await createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, code: "not_found" };
  }

  const { data: cartRow, error: cartErr } = await supabase
    .from("reservation_carts")
    .select("id, expires_at, event_id")
    .eq("id", cartId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (cartErr || !cartRow) {
    return { ok: false, code: "not_found" };
  }
  if (cartRow.event_id !== eventId) {
    return { ok: false, code: "not_found" };
  }
  if (cartRow.expires_at <= new Date().toISOString()) {
    return { ok: false, code: "expired" };
  }

  const { data: items, error: itemsErr } = await admin
    .from("reservation_items")
    .select("seat_id, section_id, quantity, add_on_id")
    .eq("cart_id", cartId);

  if (itemsErr) {
    console.error("[getCartSummary] reservation_items", itemsErr);
    return { ok: false, code: "not_found" };
  }

  type CartLine = {
    seat_id: string | null;
    section_id: string | null;
    quantity: number | null;
    add_on_id: string | null;
  };
  const lines = (items ?? []) as CartLine[];

  const addOnItemsRaw = lines.filter(
    (i) => !!i.add_on_id && (i.quantity ?? 0) >= 1
  ) as { add_on_id: string; quantity: number }[];
  const seatItemsRaw = lines.filter(
    (i): i is CartLine & { seat_id: string } => !!i.seat_id
  );
  const sectionItemsRaw = lines.filter(
    (i): i is CartLine & { seat_id: null; section_id: string; quantity: number } =>
      !i.seat_id && !i.add_on_id && !!i.section_id && (i.quantity ?? 1) > 0
  );
  const seen = new Set<string>();
  const deduped = seatItemsRaw.filter((i) => {
    if (seen.has(i.seat_id)) return false;
    seen.add(i.seat_id);
    return true;
  });

  const now = new Date().toISOString();
  const seatIds = deduped.map((i) => i.seat_id);

  const eventSeatsQuery =
    seatIds.length > 0
      ? admin
          .from("event_seats")
          .select("id, event_section_id")
          .eq("event_id", eventId)
          .in("id", seatIds)
      : Promise.resolve({
          data: [] as { id: string; event_section_id: string }[],
        });

  const [
    { data: eventData },
    { data: eventPrices },
    { data: earlyBirdPrices },
    { data: evSeatRows },
  ] = await Promise.all([
    admin
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
    eventSeatsQuery,
  ]);

  const useEarlyBird =
    eventData?.early_bird_starts_at != null &&
    eventData?.early_bird_ends_at != null &&
    now >= eventData.early_bird_starts_at &&
    now <= eventData.early_bird_ends_at;

  const baseMap = new Map<string, number>();
  for (const p of eventPrices ?? []) baseMap.set(p.section_id, p.price_cents);
  const ebPercentMap = new Map<string, number>();
  for (const eb of earlyBirdPrices ?? [])
    ebPercentMap.set(eb.section_id, eb.discount_percent);

  const getPrice = (sectionId: string) => {
    const base = baseMap.get(sectionId) ?? DEFAULT_PRICE_CENTS;
    const discountPercent = ebPercentMap.get(sectionId);
    if (useEarlyBird && discountPercent !== undefined) {
      return Math.floor((base * (100 - discountPercent)) / 100);
    }
    return base;
  };

  let subtotalCents = 0;
  if (seatIds.length > 0) {
    const sectionByEventSeat = new Map<string, string>();
    for (const row of evSeatRows ?? []) {
      if (row.id && row.event_section_id) {
        sectionByEventSeat.set(row.id, row.event_section_id);
      }
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

    for (const item of deduped) {
      const fromEvent = sectionByEventSeat.get(item.seat_id);
      if (fromEvent) {
        subtotalCents += getPrice(fromEvent);
        continue;
      }
      const fromVenue = sectionByVenueSeat.get(item.seat_id);
      subtotalCents += fromVenue ? getPrice(fromVenue) : DEFAULT_PRICE_CENTS;
    }
  }
  for (const item of sectionItemsRaw) {
    subtotalCents += getPrice(item.section_id) * (item.quantity ?? 1);
  }

  let addOnSubtotalCents = 0;
  let addOnUnitCount = 0;
  if (addOnItemsRaw.length > 0) {
    const addOnIds = [...new Set(addOnItemsRaw.map((i) => i.add_on_id))];
    const { data: addOnRows } = await admin
      .from("event_add_ons")
      .select("id, price_cents")
      .eq("event_id", eventId)
      .in("id", addOnIds);
    const priceByAddOn = new Map((addOnRows ?? []).map((r) => [r.id, r.price_cents ?? 0]));
    for (const line of addOnItemsRaw) {
      const unit = priceByAddOn.get(line.add_on_id) ?? 0;
      const q = line.quantity ?? 1;
      addOnSubtotalCents += unit * q;
      addOnUnitCount += q;
    }
  }

  subtotalCents += addOnSubtotalCents;

  const itemCount =
    deduped.length +
    sectionItemsRaw.reduce((sum, i) => sum + (i.quantity ?? 1), 0) +
    addOnUnitCount;

  return {
    ok: true,
    data: {
      subtotal_cents: subtotalCents,
      item_count: itemCount,
      early_bird_active: useEarlyBird,
    },
  };
}
