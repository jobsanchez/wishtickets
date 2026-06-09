"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { SearchHero } from "@/components/search-hero";
import { RouteLoading } from "@/components/ui/route-loading";
import { HomeEventBannerCarousel } from "@/components/home-event-banner-carousel";
import type {
  HomeBannerSlide,
  HomeInitialSplitEvents,
} from "@/lib/events/event-grid-types";
import type { EventCategoryOption } from "@/lib/events/categories-server";

const CategoryPills = dynamic(
  () =>
    import("@/components/category-pills").then((m) => ({
      default: m.CategoryPills,
    })),
  {
    loading: () => (
      <div
        className="h-10 min-w-[8.5rem] max-w-[42vw] rounded-lg bg-muted/50 shrink-0"
        aria-hidden
      />
    ),
  }
);

const EventGrid = dynamic(
  () =>
    import("@/components/event-grid").then((mod) => ({
      default: mod.EventGrid,
    })),
  {
    loading: () => (
      <RouteLoading
        variant="compact"
        message="Loading events"
        subtitle="Fetching the latest events and availability."
        className="py-10"
      />
    ),
  }
);

export function HomeClient({
  initialSplit,
  initialCategories,
  homeBannerSlides = [],
}: {
  initialSplit?: HomeInitialSplitEvents | null;
  initialCategories?: EventCategoryOption[] | null;
  homeBannerSlides?: HomeBannerSlide[];
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const hasActiveFilters = category !== "all" || search.trim() !== "";

  useEffect(() => {
    if (searchInput === "") setSearch("");
  }, [searchInput]);

  return (
    <>
      {homeBannerSlides.length > 0 && !hasActiveFilters ? (
        <HomeEventBannerCarousel slides={homeBannerSlides} />
      ) : null}
      <section className="mb-12 w-full max-w-4xl mx-auto px-2 sm:px-4">
        <div className="flex flex-row flex-nowrap items-center gap-2 sm:gap-3 w-full min-w-0">
          <CategoryPills
            active={category}
            onChange={setCategory}
            initialCategories={initialCategories ?? undefined}
          />
          <SearchHero
            value={searchInput}
            onChange={setSearchInput}
            onSearch={() => setSearch(searchInput)}
            className="max-w-none mx-0 min-w-0 flex-1"
          />
        </div>
      </section>

      <EventGrid
        key={`${category}\u0000${search}`}
        category={category}
        search={search}
        initialSplit={
          category === "all" && search.trim() === ""
            ? initialSplit ?? undefined
            : undefined
        }
      />
    </>
  );
}
