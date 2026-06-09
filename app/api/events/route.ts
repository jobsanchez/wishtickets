import { EVENT_GRID_FEATURED_LIMIT } from "@/lib/events/event-grid-constants";
import {
  attachVenueAndPrice,
  getEventsSplit,
  isEventLike,
  resolveSupabaseForEventsApi,
} from "@/lib/events/event-grid-server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;

const KNOWN_EVENT_STATUSES = new Set([
  "draft",
  "published",
  "postponed",
  "cancelled",
  "archived",
]);

/** Remove zero-width/invisible separators commonly pasted from rich text. */
function sanitizeStatusText(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

/** Canonical lowercase status for API consumers; null/blank/unknown → draft. */
function normalizeSlugEventStatus(status: unknown): string {
  const trimmed = sanitizeStatusText(status);
  if (!trimmed) return "draft";
  const lower = trimmed.toLowerCase();
  if (KNOWN_EVENT_STATUSES.has(lower)) return lower;
  return "draft";
}
const PUBLIC_EDGE_CACHE = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
} as const;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const slug = searchParams.get("slug");
    const category = searchParams.get("category");
    const search = searchParams.get("search") ?? "";
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "18", 10) || 18));
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);
    const splitMode =
      searchParams.get("split") === "1" ||
      searchParams.has("featured_limit") ||
      searchParams.has("upcoming_limit") ||
      searchParams.has("upcoming_offset");
    const featuredLimit = Math.min(
      100,
      Math.max(
        0,
        parseInt(searchParams.get("featured_limit") ?? String(EVENT_GRID_FEATURED_LIMIT), 10) ||
          EVENT_GRID_FEATURED_LIMIT
      )
    );
    const upcomingLimit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("upcoming_limit") ?? "8", 10) || 8)
    );
    const upcomingOffset = Math.max(0, parseInt(searchParams.get("upcoming_offset") ?? "0", 10) || 0);

    const supabase = await resolveSupabaseForEventsApi();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 503, headers: NO_STORE }
      );
    }

    if (slug) {
      const { data, error } = await supabase.rpc("get_event_by_slug", {
        p_slug: slug,
      });
      if (error) {
        console.error("[api/events] get_event_by_slug error:", error.message, error.code);
        return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
      }
      if (!data) {
        return NextResponse.json({ error: "Event not found" }, { status: 404, headers: NO_STORE });
      }
      if (!isEventLike(data)) {
        return NextResponse.json(
          { error: "Invalid event data" },
          { status: 500, headers: NO_STORE }
        );
      }
      const event = { ...data, status: normalizeSlugEventStatus(data.status) };
      if (event.venue_id) {
        const { data: venue } = await supabase
          .from("venues")
          .select("id, name, google_maps_url, province_id, city_id, provinces(name), cities(name)")
          .eq("id", event.venue_id)
          .single();
        return NextResponse.json({ ...event, venue: venue ?? null }, { headers: NO_STORE });
      }
      return NextResponse.json({ ...event, venue: null }, { headers: NO_STORE });
    }

    if (splitMode) {
      const result = await getEventsSplit(supabase, {
        category,
        search,
        featuredLimit,
        upcomingLimit,
        upcomingOffset,
      });
      return NextResponse.json(result, { headers: PUBLIC_EDGE_CACHE });
    }

    // Use RPC to bypass RLS (same fix as get_my_role for profiles)
    const [eventsResult, countResult] = await Promise.all([
      supabase.rpc("get_upcoming_events", {
        p_category: category && category !== "all" ? category : null,
        p_search: search.trim() || null,
        p_limit: limit,
        p_offset: offset,
      }),
      offset === 0
        ? supabase.rpc("get_upcoming_events_count", {
            p_category: category && category !== "all" ? category : null,
            p_search: search.trim() || null,
          })
        : null,
    ]);

    const { data, error } = eventsResult;
    if (error) {
      console.error("[api/events] get_upcoming_events error:", error.message, error.code);
      return NextResponse.json({ events: [], total: 0 });
    }

    const list = Array.isArray(data) ? data : [];
    const total = countResult?.data != null ? (countResult.data as number) : list.length;

    if (list.length === 0) {
      return NextResponse.json({ events: [], total: 0 }, { headers: PUBLIC_EDGE_CACHE });
    }

    const listWithPrice = await attachVenueAndPrice(supabase, list);
    return NextResponse.json(
      { events: listWithPrice, total },
      { headers: PUBLIC_EDGE_CACHE }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/events] unexpected error:", e);
    return NextResponse.json(
      { error: msg, details: process.env.NODE_ENV === "development" ? String(e) : undefined },
      { status: 500, headers: NO_STORE }
    );
  }
}
