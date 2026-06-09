"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { FloatingProgressBar, FLOATING_PROGRESS_PRESETS } from "@/components/ui/floating-progress";
import { clearPendingPaymongoBookingIfMatches } from "@/lib/paymongo-pending-booking";

export default function PaymentReturnPage() {
  const router = useRouter();
  const params = useParams();
  const eventSlug = (params?.eventSlug as string | undefined) ?? "";
  const bookingId = (params?.bookingId as string | undefined) ?? "";

  useEffect(() => {
    if (!eventSlug || !bookingId) return;
    clearPendingPaymongoBookingIfMatches(bookingId);

    const confirmationUrl = `/${eventSlug}/confirmation/${bookingId}?fromPayment=1`;
    let handled = false;
    const safeRedirect = () => {
      if (handled) return;
      handled = true;
      router.replace(confirmationUrl);
    };

    // Defensive fallback: if postMessage/popup-close integration fails, proceed directly.
    const fallbackTimer = window.setTimeout(safeRedirect, 2500);

    const payload = {
      type: "PAYMONGO_RETURN" as const,
      bookingId,
      eventSlug,
    };

    const inIframe =
      typeof window !== "undefined" && window.self !== window.top;

    if (inIframe) {
      window.parent.postMessage(payload, window.location.origin);
      // Some embedded flows ignore postMessage; keep fallback redirect alive.
      return () => window.clearTimeout(fallbackTimer);
    }

    try {
      const opener = window.opener as Window | null;
      if (
        opener &&
        opener !== window &&
        typeof opener.postMessage === "function"
      ) {
        let closed = false;
        try {
          closed = opener.closed;
        } catch {
          closed = false;
        }
        if (!closed) {
          opener.postMessage(payload, window.location.origin);
          handled = true;
          window.clearTimeout(fallbackTimer);
          try {
            window.close();
            return;
          } catch {
            // If browser blocks close, continue to in-tab redirect below.
          }
        }
      }
    } catch {
      /* opener access can fail cross-origin in edge cases */
    }

    safeRedirect();
    return () => window.clearTimeout(fallbackTimer);
  }, [eventSlug, bookingId, router]);

  return (
    <FloatingProgressBar
      active
      {...FLOATING_PROGRESS_PRESETS.postPaymentSuccess}
      message="Payment received"
      subtitle="Taking you to your tickets"
      detail="Hang tight while we open your booking. The next screen will show ticket generation if your tickets are still being prepared."
    />
  );
}
