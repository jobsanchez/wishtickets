"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Clock, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { notifyReservationExpired } from "@/lib/reservation-expire-client";

const RESERVATION_CHANNEL = "wish-reservation";
/** Background refresh while a cart is active (cross-tab reconcile). */
const REFRESH_INTERVAL_MS = 60_000;
/** Suppress "tap to continue" copy when timer drops below this many seconds (visual urgency). */
const URGENT_THRESHOLD_SEC = 60;

interface ActiveCartResponse {
  reservation_cart_id: string;
  event_id: string;
  event_slug: string;
  event_title: string;
  expires_at: string;
  ticket_count: number;
  add_on_count: number;
  item_count: number;
}

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

/**
 * Routes that already render their own reservation timer / live cart UI. The floating timer
 * stays hidden on these so users do not see two competing countdowns for the same cart.
 *
 * NOTE: matches must be slug-scoped — when the active cart is for event A but the user is on
 * event B's book page, the floating timer still shows so they can jump back.
 */
function isHiddenOnPath(pathname: string | null, eventSlug: string): boolean {
  if (!pathname) return true;
  // Always hide on staff/admin/auth flows where booking UI does not belong.
  const globalHidePrefixes = [
    "/admin",
    "/admissions",
    "/login",
    "/signup",
    "/reset-password",
    "/forgot-password",
  ];
  for (const prefix of globalHidePrefixes) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return true;
  }
  if (!eventSlug) return false;
  const slugBase = `/${eventSlug}`;
  const hideExact = [
    `${slugBase}/book`,
    `${slugBase}/cart`,
    `${slugBase}/checkout`,
  ];
  for (const exact of hideExact) {
    if (pathname === exact || pathname.startsWith(exact + "/")) return true;
  }
  if (
    pathname.startsWith(`${slugBase}/confirmation/`) ||
    pathname.startsWith(`${slugBase}/payment-return/`)
  ) {
    return true;
  }
  return false;
}

export function FloatingCartTimer() {
  const router = useRouter();
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [activeCart, setActiveCart] = useState<ActiveCartResponse | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const fetchInFlightRef = useRef<AbortController | null>(null);

  const fetchActiveCart = useCallback(async () => {
    fetchInFlightRef.current?.abort();
    const controller = new AbortController();
    fetchInFlightRef.current = controller;
    try {
      const res = await fetch("/api/reservations/me/active", {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!res.ok) {
        if (res.status === 401) {
          setIsAuthenticated(false);
          setActiveCart(null);
        }
        return;
      }
      const data = (await res.json()) as ActiveCartResponse | null;
      if (!data || !data.reservation_cart_id || !data.event_slug) {
        setActiveCart(null);
        return;
      }
      setActiveCart(data);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      // Swallow transient errors; a later refresh will reconcile.
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Subscribe to Supabase auth: only the signed-in branch hits `/api/reservations/me/active`,
  // so guests don't generate a stream of 401s on every visibility/focus/poll tick.
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    const supabase = createClient();

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setIsAuthenticated(!!session?.user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user);
      if (!session?.user) {
        setActiveCart(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (isAuthenticated !== true) return;
    void fetchActiveCart();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchActiveCart();
    };
    const onFocus = () => void fetchActiveCart();
    const onOnline = () => void fetchActiveCart();
    const onPageShow = () => void fetchActiveCart();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel(RESERVATION_CHANNEL);
      bc.onmessage = (e: MessageEvent) => {
        const t = (e.data as { type?: string } | null)?.type;
        if (t === "create" || t === "update" || t === "release" || t === "expire") {
          void fetchActiveCart();
        }
      };
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
      bc?.close();
      fetchInFlightRef.current?.abort();
    };
  }, [mounted, isAuthenticated, fetchActiveCart]);

  /** Poll only while an active cart exists and the tab is visible (no idle /api/reservations/me/active). */
  useEffect(() => {
    if (!mounted) return;
    if (isAuthenticated !== true || !activeCart) return;

    const tick = () => {
      if (document.visibilityState === "visible") void fetchActiveCart();
    };
    const interval = window.setInterval(tick, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [mounted, isAuthenticated, activeCart, fetchActiveCart]);

  useEffect(() => {
    if (!mounted) return;
    if (isAuthenticated !== true) return;
    void fetchActiveCart();
  }, [pathname, mounted, isAuthenticated, fetchActiveCart]);

  useEffect(() => {
    if (!activeCart) {
      setTimeRemaining(null);
      setRemainingMs(null);
      return;
    }
    const expiryMs = new Date(activeCart.expires_at).getTime();
    if (Number.isNaN(expiryMs)) {
      setTimeRemaining(null);
      setRemainingMs(null);
      return;
    }
    const cartIdAtStart = activeCart.reservation_cart_id;
    const tick = () => {
      const ms = expiryMs - Date.now();
      setRemainingMs(ms);
      setTimeRemaining(formatTimeRemaining(ms));
      if (ms <= 0) {
        setActiveCart(null);
        void notifyReservationExpired(cartIdAtStart);
        return true;
      }
      return false;
    };
    tick();
    const id = window.setInterval(() => {
      if (tick()) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [activeCart]);

  const isHidden = useMemo(
    () => isHiddenOnPath(pathname, activeCart?.event_slug ?? ""),
    [pathname, activeCart?.event_slug]
  );

  const isUrgent =
    remainingMs != null && remainingMs > 0 && remainingMs <= URGENT_THRESHOLD_SEC * 1000;

  if (!mounted) return null;
  if (!activeCart || timeRemaining == null) return null;
  if (isHidden) return null;

  const handleClick = () => {
    router.push(`/${activeCart.event_slug}/book`);
  };

  const eventTitle = activeCart.event_title?.trim() || "your event";
  const ticketCount = activeCart.ticket_count;
  const ticketLabel =
    ticketCount > 0
      ? `${ticketCount} ticket${ticketCount === 1 ? "" : "s"} reserved`
      : "Reservation pending";

  const node = (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[9000] flex justify-center px-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:justify-end sm:px-0"
      role="region"
      aria-label="Active reservation timer"
    >
      <div
        className={`pointer-events-auto glass-elevated rounded-2xl border shadow-xl backdrop-blur-md
          w-full max-w-sm sm:max-w-md
          transition-all
          ${
            isUrgent
              ? "border-red-500/70 ring-1 ring-red-500/40 animate-pulse"
              : "border-amber-400/60 ring-1 ring-amber-400/30"
          }`}
      >
        <button
          type="button"
          onClick={handleClick}
          aria-label={`Resume your reservation for ${eventTitle}`}
          className="group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left
            hover:bg-[var(--glass-light-bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wish-orange)]"
        >
          <span
            className={`flex h-10 w-10 flex-none items-center justify-center rounded-full
              ${
                isUrgent
                  ? "bg-red-500/20 text-red-500 dark:text-red-300"
                  : "bg-amber-400/20 text-amber-700 dark:text-yellow-300"
              }`}
            aria-hidden
          >
            <Clock className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span
                className={`text-xl font-bold tabular-nums leading-none
                  ${
                    isUrgent
                      ? "text-red-600 dark:text-red-300"
                      : "text-amber-800 dark:text-yellow-300"
                  }`}
                aria-live="polite"
              >
                {timeRemaining}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">
                left
              </span>
            </span>
            <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">
              {eventTitle}
            </span>
            <span className="block truncate text-xs text-foreground-muted">
              {ticketLabel}{" "}
              <span className="font-medium text-[var(--wish-orange)]">
                · Tap to resume
              </span>
            </span>
          </span>
          <ArrowRight
            className="h-5 w-5 flex-none text-foreground-muted transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </button>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
