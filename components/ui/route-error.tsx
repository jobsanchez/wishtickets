"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Main heading (default: "Something went wrong") */
  title?: string;
  /** User-facing message (default: "We couldn't load this page.") */
  message?: string;
  /** Link href for "Back" (default: "/") */
  backHref?: string;
  /** Link label (default: "Back to events") */
  backLabel?: string;
}

export function RouteError({
  error,
  reset,
  title = "Something went wrong",
  message = "We couldn't load this page.",
  backHref = "/",
  backLabel = "Back to events",
}: RouteErrorProps) {
  const isDev = process.env.NODE_ENV === "development";
  const displayMessage = isDev && error.message ? error.message : message;

  return (
    <div
      className="container mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[40vh]"
      role="alert"
      aria-live="assertive"
    >
      <div className="glass rounded-xl border border-[var(--glass-border)] p-8 max-w-lg w-full text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-[var(--wish-orange)] mb-4" aria-hidden />
        <h2 className="text-xl font-bold text-foreground mb-2">{title}</h2>
        <p className="text-foreground-muted mb-6">{displayMessage}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={reset}
            className="bg-[var(--wish-orange)] hover:bg-[var(--wish-orange-hover)]"
          >
            Try again
          </Button>
          <Button variant="secondary" asChild>
            <Link href={backHref}>{backLabel}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
