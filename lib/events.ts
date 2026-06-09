import type { SupabaseClient } from "@supabase/supabase-js";
import type { Event } from "@/lib/types";

export interface GetEventsOptions {
  category: string | null;
  search: string | null;
  limit: number;
  offset: number;
}

export interface GetEventsResult {
  events: Event[];
  total: number;
}

/** Server-side fetch of events list. Reuses same logic as /api/events. */
export async function getEventsList(
  supabase: SupabaseClient,
  opts: GetEventsOptions
): Promise<GetEventsResult> {
  const { category, search, limit, offset } = opts;
  const pCategory = category && category !== "all" ? category : null;
  const pSearch = (search ?? "").trim() || null;

  const [eventsResult, countResult] = await Promise.all([
    supabase.rpc("get_upcoming_events", {
      p_category: pCategory,
      p_search: pSearch,
      p_limit: limit,
      p_offset: offset,
    }),
    offset === 0
      ? supabase.rpc("get_upcoming_events_count", {
          p_category: pCategory,
          p_search: pSearch,
        })
      : null,
  ]);

  const { data, error } = eventsResult;
  if (error) {
    console.error("[getEventsList] get_upcoming_events error:", error.message, error.code);
    return { events: [], total: 0 };
  }

  const list = Array.isArray(data) ? data : [];
  const total = countResult?.data != null ? (countResult.data as number) : list.length;

  if (list.length === 0) return { events: [], total };

  const venueIds = [...new Set(list.map((e: { venue_id?: string }) => e.venue_id).filter(Boolean))];
  const { data: venues } = await supabase
    .from("venues")
    .select("id, name, google_maps_url, province_id, city_id, provinces(name), cities(name)")
    .in("id", venueIds);
  const venueMap = new Map((venues ?? []).map((v) => [v.id, v]));

  const listWithVenue = list.map((e: { id: string; venue_id?: string }) => ({
    ...e,
    venue: e.venue_id ? venueMap.get(e.venue_id) ?? null : null,
  }));

  // Attach min_price_cents per event (same logic as /api/events)
  const eventIds = listWithVenue.map((e: { id: string }) => e.id);
  const now = new Date().toISOString();
  const [{ data: allPrices }, { data: allEarlyBird }] = await Promise.all([
    supabase
      .from("event_prices")
      .select("event_id, section_id, price_cents")
      .in("event_id", eventIds),
    supabase
      .from("early_bird_prices")
      .select("event_id, section_id, discount_percent")
      .in("event_id", eventIds),
  ]);

  const DEFAULT_PRICE_CENTS = 50000;
  const priceMapByEvent = new Map<string, Map<string, number>>();
  for (const p of allPrices ?? []) {
    const eventId = p.event_id as string;
    if (!priceMapByEvent.has(eventId)) priceMapByEvent.set(eventId, new Map());
    priceMapByEvent.get(eventId)!.set(p.section_id, p.price_cents);
  }
  const earlyBirdByEvent = new Map<string, Map<string, number>>();
  for (const eb of allEarlyBird ?? []) {
    const eventId = eb.event_id as string;
    if (!earlyBirdByEvent.has(eventId)) earlyBirdByEvent.set(eventId, new Map());
    earlyBirdByEvent.get(eventId)!.set(eb.section_id, eb.discount_percent);
  }

  const events = listWithVenue.map((e: {
    id: string;
    early_bird_starts_at?: string | null;
    early_bird_ends_at?: string | null;
    [k: string]: unknown;
  }) => {
    const useEarlyBird =
      e.early_bird_starts_at != null &&
      e.early_bird_ends_at != null &&
      now >= e.early_bird_starts_at &&
      now <= e.early_bird_ends_at;

    const priceMap = priceMapByEvent.get(e.id);
    const ebMap = earlyBirdByEvent.get(e.id);
    const allSectionIds = new Set<string>([
      ...(priceMap ? Array.from(priceMap.keys()) : []),
      ...(ebMap ? Array.from(ebMap.keys()) : []),
    ]);

    let minCents: number | null = null;
    for (const sectionId of allSectionIds) {
      const basePrice = priceMap?.get(sectionId) ?? DEFAULT_PRICE_CENTS;
      const discountPercent = ebMap?.get(sectionId);
      const effective =
        useEarlyBird && discountPercent !== undefined
          ? Math.floor((basePrice * (100 - discountPercent)) / 100)
          : basePrice;
      if (minCents === null || effective < minCents) minCents = effective;
    }

    // If there are no pricing rows at all, treat as 0 so cards show ₱0.00
    if (minCents === null) minCents = 0;

    return { ...(e as unknown as Event), min_price_cents: minCents };
  }) as Event[];

  return { events, total };
}
