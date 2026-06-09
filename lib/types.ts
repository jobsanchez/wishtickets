export type EventCategory = "all" | string;

export const EVENT_CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: "all", label: "ALL" },
  { value: "Shows & Concerts", label: "SHOWS & CONCERTS" },
  { value: "Sports", label: "SPORTS" },
  { value: "Tours & Attraction", label: "TOURS & ATTRACTION" },
  { value: "Corporate Events", label: "CORPORATE EVENTS" },
  { value: "Family", label: "FAMILY" },
];

export interface Venue {
  id: string;
  name: string;
  google_maps_url?: string | null;
  province_id?: string | null;
  city_id?: string | null;
  provinces?: { name: string } | null;
  cities?: { name: string } | null;
  seat_layout_json?: unknown;
  created_at?: string;
  updated_at?: string;
}

export interface Event {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  short_description: string | null;
  category: string;
  status: string;
  featured?: boolean;
  image_url: string | null;
  thumbnail_url: string | null;
  teaser_video_url: string | null;
  venue_id: string;
  seat_map_override: unknown;
  seat_layout_image_url?: string | null;
  seat_layout_scale?: number;
  seat_layout_opacity?: number;
  seat_map_image_urls?: string[] | null;
  event_start: string;
  /** When true, public UI shows venue as "To be announced" and venue_id is null. */
  venue_to_be_announced?: boolean;
  /** When true, public UI shows date/time as "To be announced"; event_start remains the saved instant for sorting and listings. */
  schedule_to_be_announced?: boolean;
  event_end: string | null;
  early_bird_starts_at?: string | null;
  early_bird_ends_at?: string | null;
  /** Ribbon title on event cards during active sale window; optional fallback in UI when empty */
  sale_label?: string | null;
  created_at: string;
  updated_at: string;
  venue?: Venue | null;
  /** Lowest ticket price in centavos; set by list API when prices exist */
  min_price_cents?: number | null;
}
