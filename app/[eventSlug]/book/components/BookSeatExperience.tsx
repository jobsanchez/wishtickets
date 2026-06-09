"use client";

import type { ReactNode } from "react";

type BookSeatExperienceProps = {
  showHeading: boolean;
  children: ReactNode;
};

export function BookSeatExperience({ showHeading, children }: BookSeatExperienceProps) {
  if (!showHeading) return null;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-foreground">
        How would you like to experience the event?
      </h2>
      {children}
    </div>
  );
}
