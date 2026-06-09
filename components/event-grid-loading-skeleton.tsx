import { EventCardSkeleton } from "@/components/event-card-skeleton";
import { EVENT_GRID_UPCOMING_PAGE_SIZE } from "@/lib/events/event-grid-constants";

/** Mirrors EventGrid `isLoading` layout for Suspense fallbacks and grid loading state. */
export function EventGridLoadingSkeleton() {
  const n = EVENT_GRID_UPCOMING_PAGE_SIZE;
  return (
    <section className="space-y-12 min-h-[600px]" aria-busy="true">
      <div>
        <div className="mb-6 flex flex-col gap-3">
          <div className="h-8 bg-white/10 rounded w-36 animate-pulse motion-reduce:animate-none" />
          <div className="h-4 bg-white/10 rounded w-64 animate-pulse motion-reduce:animate-none" />
          <div className="relative h-1 w-full max-w-xs overflow-hidden rounded-full bg-white/10 mt-1">
            <div className="absolute inset-y-0 w-1/3 bg-[var(--wish-orange)] rounded-full animate-floating-progress motion-reduce:animate-none" />
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,320px))] justify-center gap-5 items-stretch">
          {Array.from({ length: n }, (_, i) => (
            <EventCardSkeleton key={i} />
          ))}
        </div>
      </div>
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <div className="h-8 bg-white/10 rounded w-40 animate-pulse motion-reduce:animate-none" />
            <div className="h-4 bg-white/10 rounded w-48 mt-2 animate-pulse motion-reduce:animate-none" />
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,320px))] justify-center gap-5 items-stretch">
          {Array.from({ length: n }, (_, i) => (
            <EventCardSkeleton key={i + n} />
          ))}
        </div>
      </div>
    </section>
  );
}
