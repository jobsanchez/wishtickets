"use client";

import { RouteError } from "@/components/ui/route-error";

export default function EventError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="Event error"
      message="We couldn't load this event or page."
      backHref="/"
      backLabel="Back to events"
    />
  );
}
