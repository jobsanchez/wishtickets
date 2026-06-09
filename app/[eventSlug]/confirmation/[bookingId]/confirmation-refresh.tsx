"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";

const MAX_POLLS = 24; // ~60 seconds
const STORAGE_KEY = "confirmation_refresh_count";
const EARLY_POLL_INTERVAL_MS = 2500;
const MID_POLL_INTERVAL_MS = 5000;
const LATE_POLL_INTERVAL_MS = 10000;

/** Polls booking status when pending. When confirmed, refreshes the page. Stops after ~60s. */
export function ConfirmationRefresh({ bookingId }: { bookingId: string }) {
  const [stopped, setStopped] = useState(false);
  const router = useRouter();
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    const key = `${STORAGE_KEY}_${bookingId}`;
    const count = parseInt(sessionStorage.getItem(key) ?? "0", 10);

    if (count >= MAX_POLLS) {
      setStopped(true);
      sessionStorage.removeItem(key);
      return;
    }

    const poll = async () => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        const res = await fetch(`/api/bookings/${bookingId}/status?t=${Date.now()}`);
        if (!res.ok) return;
        const { status } = await res.json();
        if (status === "confirmed") {
          router.refresh();
          return;
        }
        if (status === "failed") {
          router.refresh();
          return;
        }
      } finally {
        pollInFlightRef.current = false;
      }
    };

    const timeoutIdRef = { current: 0 as unknown as ReturnType<typeof setTimeout> };
    const cancelledRef = { current: false };

    const runPoll = async () => {
      await poll();
      sessionStorage.setItem(key, String(parseInt(sessionStorage.getItem(key) ?? "0", 10) + 1));
      const newCount = parseInt(sessionStorage.getItem(key) ?? "0", 10);
      if (newCount >= MAX_POLLS) {
        setStopped(true);
        sessionStorage.removeItem(key);
        return;
      }
      if (!cancelledRef.current) {
        const nextDelay =
          newCount < 8
            ? EARLY_POLL_INTERVAL_MS
            : newCount < 16
              ? MID_POLL_INTERVAL_MS
              : LATE_POLL_INTERVAL_MS;
        timeoutIdRef.current = setTimeout(runPoll, nextDelay);
      }
    };

    timeoutIdRef.current = setTimeout(runPoll, EARLY_POLL_INTERVAL_MS);

    return () => {
      cancelledRef.current = true;
      clearTimeout(timeoutIdRef.current);
    };
  }, [bookingId, router]);

  if (stopped) {
    return (
      <p className="text-sm text-foreground-muted pt-2">
        Taking longer than expected.{" "}
        <NavButtonWithProgress
          href="/dashboard"
          variant="link"
          className="text-[var(--wish-orange)] hover:underline p-0 h-auto font-normal inline"
          loadingMessage="Loading dashboard…"
        >
          Go to dashboard
        </NavButtonWithProgress>{" "}
        or check your email for tickets.
      </p>
    );
  }

  return (
    <p className="text-sm text-foreground-muted animate-pulse">
      Checking payment status…
    </p>
  );
}
