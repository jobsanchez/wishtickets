"use client";

import { CardContent } from "@/components/ui/card";

interface EventCardSkeletonProps {
  statusLabel?: string;
}

export function EventCardSkeleton({ statusLabel }: EventCardSkeletonProps) {
  return (
    <div className="event-card-frame flex h-full flex-col overflow-visible" aria-hidden>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[19px] bg-[var(--surface)] text-foreground">
      {/* Image placeholder with shimmer */}
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-t-[19px] bg-[var(--event-card-media-fade)]">
        <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
        {statusLabel && (
          <div className="absolute top-3 left-3 z-20 rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-1 text-[11px] font-semibold text-foreground">
            {statusLabel}
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden bg-foreground/10">
          <div
            className="h-full w-1/3 bg-[var(--wish-orange)] rounded-full animate-floating-progress"
            style={{ minWidth: 80 }}
          />
        </div>
      </div>
      <CardContent className="flex flex-1 flex-col gap-2 border-0 bg-transparent p-6 pt-4 shadow-none">
        <div className="h-5 w-3/4 animate-pulse rounded bg-foreground/15" />
        <div className="space-y-1">
          <div className="h-4 w-28 animate-pulse rounded bg-foreground/15" />
          <div className="h-4 w-20 animate-pulse rounded bg-foreground/15" />
          <div className="h-4 w-36 animate-pulse rounded bg-foreground/15" />
        </div>
        <div className="mt-auto space-y-0.5 pt-1">
          <div className="h-3 w-20 animate-pulse rounded bg-foreground/15" />
          <div className="h-5 w-16 animate-pulse rounded bg-foreground/15" />
        </div>
      </CardContent>
      </div>
    </div>
  );
}
