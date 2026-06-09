"use client";

import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";

interface EventPageActionsProps {
  eventSlug: string;
}

export function EventPageActions({ eventSlug }: EventPageActionsProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <NavButtonWithProgress
        href="/"
        variant="secondary"
        loadingMessage="Loading events…"
      >
        Back to Events
      </NavButtonWithProgress>
      <NavButtonWithProgress
        href={`/${eventSlug}/book`}
        className="bg-[var(--wish-orange)] hover:bg-[var(--wish-orange-hover)]"
        loadingMessage="Loading seat selection…"
      >
        Choose seats
      </NavButtonWithProgress>
    </div>
  );
}
