import { HomeClient } from "./home-client";
import type { HomeInitialSplitEvents } from "@/lib/events/event-grid-types";
import { getEventCategoriesForHome } from "@/lib/events/categories-server";
import { getEventsSplitForHome } from "@/lib/events/event-grid-server";
import { getHomeBannerSlidesForCarousel } from "@/lib/events/home-banner-server";

/** Async segment streamed after the hero shell — avoids blocking first byte on Supabase. */
export async function HomeSplitLoader() {
  const [split, categoryRows, homeBannerSlides] = await Promise.all([
    getEventsSplitForHome(),
    getEventCategoriesForHome(),
    getHomeBannerSlidesForCarousel(),
  ]);

  let initialSplit: HomeInitialSplitEvents | null = null;
  if (split) {
    initialSplit = {
      featured: split.featured as HomeInitialSplitEvents["featured"],
      upcoming: split.upcoming as HomeInitialSplitEvents["upcoming"],
      upcomingTotal: split.upcomingTotal,
    };
  }

  const initialCategories =
    categoryRows.length > 0
      ? [{ value: "all", label: "ALL" }, ...categoryRows]
      : null;

  return (
    <HomeClient
      initialSplit={initialSplit}
      initialCategories={initialCategories}
      homeBannerSlides={homeBannerSlides}
    />
  );
}
