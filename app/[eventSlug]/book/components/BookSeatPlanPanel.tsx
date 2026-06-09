"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { SeatMapImageCarousel } from "@/components/seat-map-image-carousel";

type BookSeatPlanPanelProps = {
  imageUrls?: string[] | null;
  isExpanded: boolean;
  onToggle: () => void;
};

export function BookSeatPlanPanel({
  imageUrls,
  isExpanded,
  onToggle,
}: BookSeatPlanPanelProps) {
  if (!imageUrls?.length) return null;
  return (
    <div className="mt-3 mb-6">
      <div className="glass-light rounded-xl border border-[var(--glass-border)] overflow-hidden">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-[var(--glass-light-bg)] transition-colors"
          aria-expanded={isExpanded}
        >
          <h2 className="text-lg font-semibold text-foreground">Event Seat Plan</h2>
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-foreground-muted shrink-0" />
          ) : (
            <ChevronRight className="h-5 w-5 text-foreground-muted shrink-0" />
          )}
        </button>
        {isExpanded ? (
          <div className="border-t border-[var(--glass-border)] px-4 pt-4 pb-4">
            <SeatMapImageCarousel images={imageUrls} frameStyle="none" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
