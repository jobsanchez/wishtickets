"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import { FloatingProgressBar } from "@/components/ui/floating-progress";

/** Recheck payment button for failed state. PayMongo may have succeeded but webhook/status raced. */
export function FailedRecheck({ bookingId }: { bookingId: string }) {
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  async function handleRecheck() {
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/recheck-payment`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        window.location.reload();
        return;
      }
      setChecked(true);
    } catch {
      setChecked(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <FloatingProgressBar
        active={loading}
        message="Checking payment"
        subtitle="Your booking"
        detail="Asking PayMongo and our server whether your payment completed."
      />
      <div className="space-y-3">
      <p className="text-sm text-foreground-muted">
        If you completed payment in PayMongo, it may still be processing. Click below to recheck.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={handleRecheck}
          disabled={loading}
        >
          {loading ? "Checking…" : "Recheck payment"}
        </Button>
        <NavButtonWithProgress
          href="/dashboard"
          variant="secondary"
          loadingMessage="Loading dashboard…"
        >
          Go to dashboard
        </NavButtonWithProgress>
      </div>
      {checked && (
        <p className="text-sm text-foreground-muted">
          Payment not yet confirmed. Check your email or dashboard, or try again in a moment.
        </p>
      )}
    </div>
    </>
  );
}
