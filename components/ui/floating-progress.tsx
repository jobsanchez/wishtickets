"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  WishLoadingSpinner,
} from "@/components/ui/route-loading";

const DEFAULT_DETAIL =
  "Hang tight — this usually finishes in a few seconds.";

/**
 * Several screens mount more than one `FloatingProgressBar` (e.g. tab navigation +
 * seat configurator). Per-instance save/restore of `overflow` breaks: the first bar
 * to finish restores scroll while another overlay is still active, or leaves the
 * document stuck with `overflow: hidden`. Ref-count so we only unlock when the
 * last active bar clears.
 */
let bodyScrollLockCount = 0;
let lockedHtmlOverflow = "";
let lockedBodyOverflow = "";

function acquireBodyScrollLock() {
  if (typeof document === "undefined") return;
  if (bodyScrollLockCount === 0) {
    const html = document.documentElement;
    const body = document.body;
    lockedHtmlOverflow = html.style.overflow;
    lockedBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
  }
  bodyScrollLockCount += 1;
}

function releaseBodyScrollLock() {
  if (typeof document === "undefined") return;
  bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
  if (bodyScrollLockCount === 0) {
    document.documentElement.style.overflow = lockedHtmlOverflow;
    document.body.style.overflow = lockedBodyOverflow;
  }
}

interface FloatingProgressBarProps {
  /** When true, shows a full-viewport overlay with a centered progress bar and blocks interaction */
  active: boolean;
  /** Primary heading (action-oriented) */
  message?: string;
  /** Muted one-line context (e.g. entity name, count, page scope) */
  subtitle?: string;
  /** Body copy: what is happening and what to expect (non-muted) */
  detail?: string;
  /**
   * Legacy: single secondary block (muted), shown only when `subtitle` and `detail` are unset.
   * Prefer `subtitle` + `detail` for new code.
   */
  subMessage?: string;
  /** When set (0-100), shows a determinate progress bar instead of indeterminate */
  percent?: number;
  /** Optional actions below the bar (e.g. Stop during long operations) */
  footer?: ReactNode;
}

/** Reusable title + context + body copy for common blocking operations */
export const FLOATING_PROGRESS_PRESETS = {
  genericSave: {
    message: "Saving changes",
    subtitle: "Please keep this tab open",
    detail: "We are writing your updates to the server.",
  },
  genericLoad: {
    message: "Loading",
    subtitle: "Almost ready",
    detail: "Fetching the latest data for this screen.",
  },
  navigation: {
    message: "Loading page",
    subtitle: "Switching screens",
    detail: "Preparing the next view. This should only take a moment.",
  },
  deleting: {
    message: "Deleting",
    subtitle: "Removing records",
    detail: "This action is being applied on the server. Please wait.",
  },
  uploading: {
    message: "Uploading",
    subtitle: "Sending your file",
    detail: "Your upload is in progress. Keep this tab open until it completes.",
  },
  postPaymentSuccess: {
    message: "Payment received",
    subtitle: "Generating your tickets",
    detail:
      "Your payment was successful. We are creating your ticket images—please keep this page open. This can take up to a minute. You can also use the email we send when ready.",
  },
  postPaymentPending: {
    message: "Processing your payment",
    subtitle: "Confirming with PayMongo",
    detail:
      "We are confirming your payment. Please keep this page open. Ticket generation will start as soon as confirmation completes.",
  },
} as const satisfies Record<
  string,
  Pick<FloatingProgressBarProps, "message" | "subtitle" | "detail">
>;

export function FloatingProgressBar({
  active,
  message = "Saving…",
  subtitle,
  detail,
  subMessage,
  percent,
  footer,
}: FloatingProgressBarProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !active) return;
    acquireBodyScrollLock();
    return () => releaseBodyScrollLock();
  }, [mounted, active]);

  if (!mounted || !active) return null;

  const isDeterminate = typeof percent === "number" && percent >= 0 && percent <= 100;
  const useModernTiers = Boolean(subtitle ?? detail);
  const legacySub =
    !useModernTiers && typeof subMessage === "string" && subMessage.length > 0;
  const showDefaultDetail =
    !useModernTiers && !legacySub && (subMessage === undefined || subMessage === "");

  /**
   * `fixed` ties the overlay to the **viewport** so the panel stays centered while scrolled
   * (not the document box, which `absolute` could follow under a flex `body`).
   * Next.js App Router devtools may log “Skipping auto-scroll behavior due to position: fixed”
   * in development; scroll is still locked on html/body while active.
   */
  const node = (
    <div className="pointer-events-auto fixed inset-0 z-[10100] flex min-h-[100dvh] w-full items-center justify-center">
      <div
        className="wish-modal-backdrop absolute inset-0 bg-background/75"
        aria-hidden
      />
      <div
        className="glass-elevated relative z-[1] mx-4 w-full max-w-md rounded-2xl px-8 py-7 shadow-none"
        role="alert"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="flex flex-col items-center gap-1.5 text-center">
            <p className="text-foreground text-lg font-semibold tracking-tight">{message}</p>
            {subtitle ? (
              <p className="text-foreground-muted text-sm font-normal leading-snug">{subtitle}</p>
            ) : null}
            {detail ? (
              <p className="mt-0.5 max-w-sm text-sm font-normal leading-relaxed text-foreground/90">
                {detail}
              </p>
            ) : null}
            {legacySub ? (
              <p className="text-foreground-muted text-sm font-normal leading-relaxed whitespace-pre-line">
                {subMessage}
              </p>
            ) : null}
            {showDefaultDetail ? (
              <p className="mt-0.5 max-w-sm text-sm font-normal leading-relaxed text-foreground/90">
                {DEFAULT_DETAIL}
              </p>
            ) : null}
          </div>
          {isDeterminate ? (
            <div className="relative w-full max-w-xs h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="absolute inset-y-0 bg-[var(--wish-orange)] rounded-full transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : (
            <>
              <WishLoadingSpinner size="sm" />
            </>
          )}
          {footer ? (
            <div className="relative z-[2] mt-1 flex justify-center pointer-events-auto">{footer}</div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
