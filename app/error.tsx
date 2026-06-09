"use client";

import { RouteError } from "@/components/ui/route-error";

export default function RootError({
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
      title="Something went wrong"
      message="We couldn't load this page."
      backHref="/"
      backLabel="Back to events"
    />
  );
}
