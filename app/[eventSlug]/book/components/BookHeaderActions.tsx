"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

type BookHeaderActionsProps = {
  isBackPending: boolean;
  isRefreshing: boolean;
  availabilityFetching: boolean;
  eventSlug: string;
  isInitialBookDataLoading: boolean;
  onBack: () => void;
  onRefresh: () => void;
};

export function BookHeaderActions({
  isBackPending,
  isRefreshing,
  availabilityFetching,
  eventSlug,
  isInitialBookDataLoading,
  onBack,
  onRefresh,
}: BookHeaderActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <Button
        variant="secondary"
        size="sm"
        className="bg-amber-400 text-black hover:bg-amber-300 border-transparent"
        type="button"
        onClick={onBack}
        disabled={isBackPending}
      >
        {isBackPending ? "Loading..." : "← Back to events"}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        className="bg-emerald-400 text-black hover:bg-emerald-300 border-transparent"
        type="button"
        onClick={onRefresh}
        disabled={!eventSlug.trim() || isRefreshing || isInitialBookDataLoading}
      >
        <RefreshCw
          className={`h-4 w-4 mr-1.5 ${
            isRefreshing || availabilityFetching ? "animate-spin" : ""
          }`}
        />
        {isRefreshing || availabilityFetching ? "Refreshing..." : "Refresh Seats"}
      </Button>
    </div>
  );
}
