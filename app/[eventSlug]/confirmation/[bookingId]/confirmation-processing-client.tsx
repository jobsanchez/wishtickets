"use client";

import { FloatingProgressBar, FLOATING_PROGRESS_PRESETS } from "@/components/ui/floating-progress";
import { ConfirmationRefresh } from "./confirmation-refresh";

type Props = {
  bookingId: string;
  /**
   * When we already know the charge succeeded (PayMongo, or re-check), show
   * success + "generating tickets" and use this as the main detail line.
   * When undefined, we are still waiting for the gateway / webhook to confirm.
   */
  paymentConfirmedHint?: string;
};

/**
 * Fullscreen status while the booking is still `pending` (or `failed` with paid re-check)
 * and confirm/ticket work is in flight. Mounts [ConfirmationRefresh] invisibly for polling.
 */
export function ConfirmationProcessingClient({ bookingId, paymentConfirmedHint }: Props) {
  const showSuccess = Boolean(paymentConfirmedHint?.trim());
  return (
    <>
      {showSuccess ? (
        <FloatingProgressBar
          active
          {...FLOATING_PROGRESS_PRESETS.postPaymentSuccess}
          detail={paymentConfirmedHint!.trim()}
        />
      ) : (
        <FloatingProgressBar active {...FLOATING_PROGRESS_PRESETS.postPaymentPending} />
      )}
      <div className="sr-only" aria-hidden>
        <ConfirmationRefresh bookingId={bookingId} />
      </div>
    </>
  );
}
