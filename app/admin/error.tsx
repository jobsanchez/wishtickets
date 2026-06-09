"use client";

import { RouteError } from "@/components/ui/route-error";

export default function AdminError({
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
      title="Admin error"
      message="Something went wrong in the admin area."
      backHref="/admin"
      backLabel="Back to admin"
    />
  );
}
