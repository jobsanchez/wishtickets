"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FloatingProgressBar, FLOATING_PROGRESS_PRESETS } from "@/components/ui/floating-progress";

const POLL_MS = 2500;
const MAX_POLLS = 40;

/**
 * After payment, booking is `confirmed` but ticket PNGs are still being rendered.
 * Fullscreen “generating” until the API reports all `ticket_image_url` rows are ready, then `router.refresh()`.
 */
export function TicketImageGenerationOverlay({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [active, setActive] = useState(true);
  const polls = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!active) return;

    const pollOnce = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await fetch(
          `/api/bookings/${bookingId}/ticket-generation-status?t=${Date.now()}`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const data = (await res.json()) as { complete?: boolean };
          if (data.complete) {
            setActive(false);
            router.refresh();
            return;
          }
        }
      } catch {
        // keep polling
      } finally {
        inFlight.current = false;
      }
      polls.current += 1;
      if (polls.current >= MAX_POLLS) {
        setActive(false);
      }
    };

    void pollOnce();
    const id = setInterval(() => {
      void pollOnce();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [active, bookingId, router]);

  if (!active) return null;

  return (
    <FloatingProgressBar
      active
      {...FLOATING_PROGRESS_PRESETS.postPaymentSuccess}
      detail="Your payment is confirmed. We’re finishing your ticket images—keep this page open. This step can take a little while. You can also look for the confirmation email with your links."
    />
  );
}
