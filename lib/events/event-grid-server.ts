import { EVENT_GRID_FEATURED_LIMIT } from "@/lib/events/event-grid-constants";
import { getTodayManilaDateKey } from "@/lib/event-public-visibility";
import { getAdminClientIfAvailable } from "@/lib/supabase/admin";
import { createPublicAnonClient } from "@/lib/supabase/public-anon";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type VenueRow = {
  id: string;
  name: string | null;
  google_maps_url: string | null;
  province_id: string | null;
  city_id: string | null;
  provinces?: { name: string | null } | null;
  cities?: { name: string | null } | null;
};

export type EventLike = {
  id: string;
  venue_id: string | null;
  early_bird_starts_at?: string | null;
  early_bird_ends_at?: string | null;
  [key: string]: unknown;
};

type PriceRow = { event_id: string; section_id: string; price_cents: number };
type EarlyBirdRow = { event_id: string; section_id: string; discount_percent: number };

/** Public list/card fields only — avoids large JSON columns on home grid. */
export const EVENT_GRID_LIST_COLUMNS =
  "id, slug, title, description, short_description, category, status, featured, image_url, thumbnail_url, teaser_video_url, venue_id, venue_to_be_announced, schedule_to_be_announced, event_start, event_end, early_bird_starts_at, early_bird_ends_at, sale_label, created_at, updated_at";

const UPCOMING_CAP = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isEventLike(value: unknown): value is EventLike {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    (value.venue_id === null || typeof value.venue_id === "string")
  );
}

export async function attachVenueAndPrice(
  supabase: SupabaseClient,
  list: unknown[]
) {
  if (!list || list.length === 0) return [];

  const events = list.filter(isEventLike);
  if (events.length === 0) return [];

  const venueIds = [...new Set(events.map((e) => e.venue_id).filter((x): x is string => !!x))];
  const { data: venues } = venueIds.length
    ? await supabase
        .from("venues")
        .select("id, name, google_maps_url, province_id, city_id, provinces(name), cities(name)")
        .in("id", venueIds)
    : { data: [] as VenueRow[] };
  const venueMap = new Map<string, VenueRow>(
    (venues ?? [])
      .filter((v): v is VenueRow => !!v && typeof (v as VenueRow).id === "string")
      .map((v) => [v.id, v])
  );

  const listWithVenue = events.map((e) => ({
    ...e,
    venue: e.venue_id ? venueMap.get(e.venue_id) ?? null : null,
  }));

  const eventIds = listWithVenue.map((e) => e.id);
  const nowIso = new Date().toISOString();
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
  for (const p of (allPrices ?? []) as PriceRow[]) {
    const eventId = p.event_id;
    if (!priceMapByEvent.has(eventId)) priceMapByEvent.set(eventId, new Map());
    priceMapByEvent.get(eventId)!.set(p.section_id, p.price_cents);
  }
  const earlyBirdByEvent = new Map<string, Map<string, number>>();
  for (const eb of (allEarlyBird ?? []) as EarlyBirdRow[]) {
    const eventId = eb.event_id;
    if (!earlyBirdByEvent.has(eventId)) earlyBirdByEvent.set(eventId, new Map());
    earlyBirdByEvent.get(eventId)!.set(eb.section_id, eb.discount_percent);
  }

  return listWithVenue.map((e) => {
    const useEarlyBird =
      e.early_bird_starts_at != null &&
      e.early_bird_ends_at != null &&
      nowIso >= e.early_bird_starts_at &&
      nowIso <= e.early_bird_ends_at;

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
    if (minCents === null) minCents = 0;
    return { ...e, min_price_cents: minCents };
  });
}

export type GetEventsSplitParams = {
  category: string | null;
  search: string;
  featuredLimit: number;
  upcomingLimit: number;
  upcomingOffset: number;
};

export type EventsSplitResult = {
  featured: Awaited<ReturnType<typeof attachVenueAndPrice>>;
  upcoming: Awaited<ReturnType<typeof attachVenueAndPrice>>;
  upcomingTotal: number;
};

function applySearchLikeFilter(
  list: Awaited<ReturnType<typeof attachVenueAndPrice>>,
  search: string
): Awaited<ReturnType<typeof attachVenueAndPrice>> {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return list;
  const terms = normalized.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return list;

  return list.filter((event) => {
    const eventRecord = event as Record<string, unknown>;
    const title = typeof eventRecord.title === "string" ? eventRecord.title : "";
    const venue = isRecord(eventRecord.venue) ? (eventRecord.venue as VenueRow) : null;
    const venueName =
      venue && typeof venue.name === "string"
        ? venue.name
        : "";
    const cityName =
      venue && venue.cities && typeof venue.cities.name === "string"
        ? venue.cities.name
        : "";
    const provinceName =
      venue && venue.provinces && typeof venue.provinces.name === "string"
        ? venue.provinces.name
        : "";

    const haystack = `${title} ${venueName} ${cityName} ${provinceName}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/**
 * Featured + upcoming split for home /api/events?split=1 (same logic as route handler).
 */
export async function getEventsSplit(
  supabase: SupabaseClient,
  params: GetEventsSplitParams
): Promise<EventsSplitResult> {
  const { category, search, featuredLimit, upcomingLimit, upcomingOffset } = params;
  const todayManila = getTodayManilaDateKey();

  const baseFeatured = supabase
    .from("events")
    .select(EVENT_GRID_LIST_COLUMNS)
    .eq("status", "published")
    .gte("public_list_visible_until", todayManila)
    .eq("featured", true)
    .order("event_start", { ascending: true })
    .limit(UPCOMING_CAP);
  if (category && category !== "all") baseFeatured.eq("category", category);

  const effectiveUpcomingOffset = Math.min(upcomingOffset, UPCOMING_CAP);
  const remaining = Math.max(0, UPCOMING_CAP - effectiveUpcomingOffset);
  const effectiveUpcomingLimit = Math.max(0, Math.min(upcomingLimit, remaining));

  const baseUpcoming = supabase
    .from("events")
    .select(EVENT_GRID_LIST_COLUMNS)
    .eq("status", "published")
    .gte("public_list_visible_until", todayManila)
    .or("featured.is.null,featured.eq.false")
    .order("event_start", { ascending: true })
    .limit(UPCOMING_CAP);
  if (category && category !== "all") baseUpcoming.eq("category", category);

  const [{ data: featuredRows, error: featuredError }, { data: upcomingRows, error: upcomingError }] =
    await Promise.all([baseFeatured, baseUpcoming]);

  if (featuredError) {
    console.error("[getEventsSplit] featured query error:", featuredError.message);
  }
  if (upcomingError) {
    console.error("[getEventsSplit] upcoming query error:", upcomingError.message);
  }

  const [featuredRaw, upcomingRaw] = await Promise.all([
    attachVenueAndPrice(supabase, Array.isArray(featuredRows) ? featuredRows : []),
    attachVenueAndPrice(supabase, Array.isArray(upcomingRows) ? upcomingRows : []),
  ]);
  const featuredFiltered = applySearchLikeFilter(featuredRaw, search);
  const upcomingFiltered = applySearchLikeFilter(upcomingRaw, search);

  const featured = featuredFiltered.slice(0, featuredLimit);
  const upcomingTotal = Math.min(UPCOMING_CAP, upcomingFiltered.length);
  const upcoming =
    effectiveUpcomingLimit > 0
      ? upcomingFiltered.slice(effectiveUpcomingOffset, effectiveUpcomingOffset + effectiveUpcomingLimit)
      : [];

  return { featured, upcoming, upcomingTotal };
}

/** Same Supabase resolution as GET /api/events (admin when available). */
export async function resolveSupabaseForEventsApi(): Promise<SupabaseClient | null> {
  const adminClient = getAdminClientIfAvailable();
  if (adminClient) return adminClient;
  try {
    return await createClient();
  } catch (e) {
    console.error("[resolveSupabaseForEventsApi] createClient failed:", e);
    return null;
  }
}

/** Home page default split for initial render. */
export async function getEventsSplitForHome(): Promise<EventsSplitResult | null> {
  const supabase = getAdminClientIfAvailable() ?? createPublicAnonClient();
  if (!supabase) return null;
  try {
    return await getEventsSplit(supabase, {
      category: null,
      search: "",
      featuredLimit: EVENT_GRID_FEATURED_LIMIT,
      upcomingLimit: 8,
      upcomingOffset: 0,
    });
  } catch (e) {
    console.error("[getEventsSplitForHome]", e);
    return null;
  }
}
