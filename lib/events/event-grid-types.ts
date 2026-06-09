import type { Event } from "@/lib/types";

/** First-page split payload (server-prefetched for home default view). */
export interface HomeInitialSplitEvents {
  featured: Event[];
  upcoming: Event[];
  upcomingTotal: number;
}

/** Home page Embla carousel (from `get_home_banner_carousel_rows` RPC). */
export interface HomeBannerSlide {
  bannerId: string;
  eventSlug: string;
  eventTitle: string;
  imageUrl: string;
}
