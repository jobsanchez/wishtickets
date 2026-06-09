"use client";

import { useState, useEffect, useRef } from "react";
import { Clock } from "lucide-react";
import { DEFAULT_RESERVATION_TTL_MINUTES } from "@/lib/reservations";

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export interface ReservationTimerProps {
  /** When true, timer is shown (e.g. cart has items). */
  hasItems: boolean;
  /** Server-provided expiry; when null we use optimistic expiry so timer appears instantly. */
  expiresAt: string | null;
  onExpired?: () => void;
  /** Show warnings when remaining time falls to or below these thresholds (seconds). */
  warnSecondsList?: number[];
  /** Called once per threshold when remaining time reaches or drops below it. */
  onWarn?: (warnSeconds: number) => void;
  /** TTL in minutes for optimistic expiry when expiresAt is not yet set. Default 15. */
  ttlMinutes?: number;
}

/**
 * Countdown timer for reservation. Shows immediately when hasItems is true by using
 * an optimistic expiry (now + TTL) when expiresAt is not yet set from the server.
 */
export function ReservationTimer({
  hasItems,
  expiresAt,
  onExpired,
  warnSecondsList = [120],
  onWarn,
  ttlMinutes = DEFAULT_RESERVATION_TTL_MINUTES,
}: ReservationTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);
  const optimisticExpiryMsRef = useRef<number | null>(null);
  const warnedThresholdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!hasItems) {
      setTimeRemaining(null);
      optimisticExpiryMsRef.current = null;
      warnedThresholdsRef.current.clear();
      return;
    }

    warnedThresholdsRef.current.clear();

    const getEffectiveExpiryMs = (): number | null => {
      if (expiresAt) return new Date(expiresAt).getTime();
      if (optimisticExpiryMsRef.current == null) {
        optimisticExpiryMsRef.current = Date.now() + ttlMinutes * 60 * 1000;
      }
      return optimisticExpiryMsRef.current;
    };

    const tick = (): boolean => {
      const expiryMs = getEffectiveExpiryMs();
      if (expiryMs == null) return false;
      const ms = expiryMs - Date.now();
      setTimeRemaining(formatTimeRemaining(ms));

      const thresholds = [...warnSecondsList]
        .map((v) => Math.max(0, Math.floor(v)))
        .filter((v) => v > 0)
        .sort((a, b) => b - a);
      for (const threshold of thresholds) {
        const warnThresholdMs = threshold * 1000;
        if (
          ms > 0 &&
          onWarn &&
          !warnedThresholdsRef.current.has(threshold) &&
          ms <= warnThresholdMs
        ) {
          warnedThresholdsRef.current.add(threshold);
          onWarn(threshold);
        }
      }

      if (ms <= 0 && onExpired) {
        onExpired();
        return true;
      }
      return false;
    };

    tick();
    const id = setInterval(() => {
      if (tick()) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [hasItems, expiresAt, onExpired, ttlMinutes, warnSecondsList, onWarn]);

  if (!hasItems || timeRemaining == null) return null;

  return (
    <div className="glass rounded-xl border border-[var(--glass-border)] p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className="flex items-center gap-1.5 text-2xl font-semibold tabular-nums text-amber-800 dark:text-[rgba(255,220,0,1)]"
          aria-live="polite"
        >
          <Clock className="h-6 w-6" />
          {timeRemaining}
        </span>
        <p className="text-sm text-foreground dark:text-yellow-400">
          Please complete your purchase by the time shown or your tickets and items in your cart will be released for others to purchase.
        </p>
      </div>
    </div>
  );
}
