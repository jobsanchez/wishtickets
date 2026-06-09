"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Filter } from "lucide-react";
import { WishLoadingSpinner } from "@/components/ui/route-loading";
import { Button } from "@/components/ui/button";
import { EventCard } from "@/components/event-card";
import { RouteLoading } from "@/components/ui/route-loading";
import type { EventFilters } from "@/components/event-filter-dialog";
import {
  EVENT_GRID_FEATURED_LIMIT,
  EVENT_GRID_UPCOMING_PAGE_SIZE,
} from "@/lib/events/event-grid-constants";
import type { HomeInitialSplitEvents } from "@/lib/events/event-grid-types";
import type { Event } from "@/lib/types";

export type { HomeInitialSplitEvents };

const EventFilterDialogLazy = dynamic(
  () =>
    import("@/components/event-filter-dialog").then((m) => ({
      default: m.EventFilterDialog,
    })),
  { ssr: false }
);

function subscribeReducedMotion(onStoreChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );
}

const PAGE_SIZE = EVENT_GRID_UPCOMING_PAGE_SIZE;
const UPCOMING_CAP = 100;
/** First N cards in featured / upcoming grids get `priority` on cover images for LCP. */
const COVER_IMAGE_LCP_PRIORITY_COUNT = 4;

const defaultFilters: EventFilters = {
  year: null,
  month: null,
  provinceId: null,
  cityId: null,
};

interface SplitEventsResponse {
  featured: Event[];
  upcoming: Event[];
  upcomingTotal: number;
}

/** Short stagger for INP; skipped entirely when prefers-reduced-motion is set. */
function cardEntranceDelay(index: number): number {
  return Math.min(index * 0.008, 0.1);
}

interface EventGridProps {
  category: string;
  search: string;
  /** Used when category is "all" and search is empty — avoids client waterfall on first paint. */
  initialSplit?: HomeInitialSplitEvents | null;
}

export function EventGrid({ category, search, initialSplit }: EventGridProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterUiReady, setFilterUiReady] = useState(false);
  const [filters, setFilters] = useState<EventFilters>(defaultFilters);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (filterOpen) setFilterUiReady(true);
  }, [filterOpen]);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery<SplitEventsResponse>({
    queryKey: ["events-split", category, search],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("split", "1");
      if (category !== "all") params.set("category", category);
      if (search.trim()) params.set("search", search.trim());
      params.set("featured_limit", String(EVENT_GRID_FEATURED_LIMIT));
      params.set("upcoming_limit", String(PAGE_SIZE));
      params.set("upcoming_offset", String(pageParam));
      const res = await fetch(`/api/events?${params}`);
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
    initialPageParam: 0,
    initialData:
      initialSplit != null
        ? {
            pages: [
              {
                featured: initialSplit.featured,
                upcoming: initialSplit.upcoming,
                upcomingTotal: initialSplit.upcomingTotal,
              },
            ],
            pageParams: [0],
          }
        : undefined,
    /**
     * Keep the initial response warm briefly to avoid immediate duplicate API calls
     * right after SSR hydration on the home page.
     */
    staleTime: 60_000,
    refetchOnMount: false,
    getNextPageParam: (lastPage, allPages) => {
      const loadedUpcoming = allPages.reduce((sum, p) => sum + p.upcoming.length, 0);
      const totalUpcoming = Math.min(UPCOMING_CAP, allPages[0]?.upcomingTotal ?? 0);
      if (lastPage.upcoming.length < PAGE_SIZE || loadedUpcoming >= totalUpcoming) {
        return undefined;
      }
      return loadedUpcoming;
    },
  });

  const featuredFromApi = useMemo(
    () => data?.pages?.[0]?.featured ?? [],
    [data?.pages]
  );
  const upcomingFromApi = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.upcoming),
    [data?.pages]
  );
  const upcomingTotal = Math.min(UPCOMING_CAP, data?.pages?.[0]?.upcomingTotal ?? 0);

  const filteredFeatured = useMemo(() => {
    return featuredFromApi.filter((e) => {
      const eventDate = new Date(e.event_start);
      const eventYear = eventDate.getFullYear();
      const eventMonth = eventDate.getMonth() + 1;
      if (filters.year != null && eventYear !== filters.year) return false;
      if (filters.month != null && eventMonth !== filters.month) return false;
      if (filters.provinceId && e.venue?.province_id !== filters.provinceId)
        return false;
      if (filters.cityId && e.venue?.city_id !== filters.cityId) return false;
      return true;
    });
  }, [featuredFromApi, filters]);

  const filteredUpcoming = useMemo(() => {
    return upcomingFromApi.filter((e) => {
      const eventDate = new Date(e.event_start);
      const eventYear = eventDate.getFullYear();
      const eventMonth = eventDate.getMonth() + 1;
      if (filters.year != null && eventYear !== filters.year) return false;
      if (filters.month != null && eventMonth !== filters.month) return false;
      if (filters.provinceId && e.venue?.province_id !== filters.provinceId)
        return false;
      if (filters.cityId && e.venue?.city_id !== filters.cityId) return false;
      return true;
    });
  }, [upcomingFromApi, filters]);

  const sortByDate = useCallback((events: Event[]) => {
    return [...events].sort(
      (a, b) =>
        new Date(a.event_start).getTime() - new Date(b.event_start).getTime()
    );
  }, []);

  const sortedFeaturedEvents = useMemo(
    () => sortByDate(filteredFeatured),
    [filteredFeatured, sortByDate]
  );
  const sortedUpcomingEvents = useMemo(
    () => sortByDate(filteredUpcoming),
    [filteredUpcoming, sortByDate]
  );

  const featuredCount = sortedFeaturedEvents.length;

  if (isLoading) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading events"
        subtitle="Applying selected filters."
        className="py-10"
      />
    );
  }

  if (featuredFromApi.length === 0 && upcomingFromApi.length === 0) {
    return (
      <section>
        <div className="glass rounded-xl border border-[var(--glass-border)] p-12 text-center text-foreground-muted">
          No events match your filters. Try a different category or search.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-12 min-h-[600px]">
      {sortedFeaturedEvents.length > 0 && (
        <div>
          <div className="mb-6 px-5 sm:px-8">
            <h2 className="text-2xl font-bold font-[var(--font-display)] uppercase tracking-wide">
              <span className="text-[var(--wish-orange)]">Featured</span>{" "}
              <span className="text-foreground">
                {sortedFeaturedEvents.length === 1 ? "Event" : "Events"}
              </span>
            </h2>
            <p className="text-foreground-muted text-sm mt-1">
              Discover and book tickets for amazing events.
            </p>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,320px))] justify-center gap-5 items-start">
            {sortedFeaturedEvents.map((event, i) => {
              const card = (
                <EventCard
                  event={event}
                  coverImagePriority={i < COVER_IMAGE_LCP_PRIORITY_COUNT}
                />
              );
              if (prefersReducedMotion) {
                return <div key={event.id}>{card}</div>;
              }
              return (
                <div
                  key={event.id}
                  className="animate-event-grid-card-in"
                  style={{ animationDelay: `${cardEntranceDelay(i)}s` }}
                >
                  {card}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 px-5 sm:px-8">
          <div>
            <h2 className="text-2xl font-bold font-[var(--font-display)] uppercase tracking-wide">
              <span className="text-[var(--wish-orange)]">Upcoming</span>{" "}
              <span className="text-foreground">Events</span>
            </h2>
            <p className="text-foreground-muted text-sm mt-1">
              {upcomingTotal > 0
                ? `Showing ${upcomingFromApi.length} of ${upcomingTotal} events.`
                : "Discover and book tickets for amazing events."}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="w-fit"
            onClick={() => setFilterOpen(true)}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
        </div>
        {sortedUpcomingEvents.length > 0 ? (
          <>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,320px))] justify-center gap-5 items-start">
              {sortedUpcomingEvents.map((event, i) => {
                const card = (
                  <EventCard
                    event={event}
                    coverImagePriority={i < COVER_IMAGE_LCP_PRIORITY_COUNT}
                  />
                );
                if (prefersReducedMotion) {
                  return <div key={event.id}>{card}</div>;
                }
                return (
                  <div
                    key={event.id}
                    className="animate-event-grid-card-in"
                    style={{
                      animationDelay: `${cardEntranceDelay(featuredCount + i)}s`,
                    }}
                  >
                    {card}
                  </div>
                );
              })}
            </div>
            {hasNextPage && (
              <div className="mt-8 flex justify-center">
                <Button
                  variant="secondary"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? (
                    <>
                      <span className="mr-2 inline-flex" aria-hidden>
                        <WishLoadingSpinner size="sm" />
                      </span>
                      Loading…
                    </>
                  ) : (
                    "Load more"
                  )}
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="glass rounded-xl border border-[var(--glass-border)] p-12 text-center text-foreground-muted">
            No other events match your filters.
          </div>
        )}
      </div>
      {filterUiReady && (
        <EventFilterDialogLazy
          open={filterOpen}
          onOpenChange={setFilterOpen}
          filters={filters}
          onApply={setFilters}
          events={[...featuredFromApi, ...upcomingFromApi]}
        />
      )}
    </section>
  );
}
