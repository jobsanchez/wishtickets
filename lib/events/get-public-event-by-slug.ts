import { cache } from "react";
import { getServerClientIfAvailable } from "@/lib/supabase/server";
import type { Event, Venue } from "@/lib/types";

/** Event row plus venue join shape returned for public event detail pages. */
export type PublicEventDetail = Omit<Event, "venue"> & {
  venue?: Venue | null;
};

/**
 * Per-request dedupe for the same slug (e.g. `generateMetadata` + page) — does not cache across requests.
 * Always loads fresh from Supabase within that single request.
 */
export const getPublicEventBySlug = cache(
  async function getPublicEventBySlug(slug: string): Promise<PublicEventDetail | null> {
    const supabase = await getServerClientIfAvailable();
    if (!supabase) return null;
    const { data, error } = await supabase.rpc("get_event_by_slug", {
      p_slug: slug,
    });
    if (error || !data) return null;
    const event = data as unknown as PublicEventDetail;
    if (event.venue_id) {
      const { data: venue } = await supabase
        .from("venues")
        .select("id, name, google_maps_url, province_id, city_id, provinces(name), cities(name)")
        .eq("id", event.venue_id)
        .single();
      return { ...event, venue: (venue ?? null) as Venue | null };
    }
    return { ...event, venue: null };
  }
);
