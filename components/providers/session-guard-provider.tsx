"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useReservationStore } from "@/store/reservation-store";
import { hasPendingPaymongoBooking } from "@/lib/paymongo-pending-booking";
import { resyncAuthWithServer } from "@/lib/supabase/auth-resync";

const NAV_DEBOUNCE_MS = 300;
/** Keeps `last_heartbeat_at` fresh during long seat selection (server default inactivity is 5 min). */
const HEARTBEAT_INTERVAL_MS = 60_000;

function isCartActive(cartId: string | null, expiresAt: string | null): boolean {
  if (!cartId || !expiresAt) return false;
  const expiresMs = new Date(expiresAt).getTime();
  return Number.isFinite(expiresMs) && expiresMs > Date.now();
}

function isBookingRoute(pathname: string): boolean {
  return /\/book(?:\/|$)/.test(pathname) || pathname.includes("/checkout");
}

function hasActiveCartForSession(
  pathname: string,
  cartId: string | null,
  expiresAt: string | null
): boolean {
  if (isCartActive(cartId, expiresAt)) return true;
  return isBookingRoute(pathname);
}

function isPaymongoFlow(pathname: string): boolean {
  if (pathname.includes("/checkout") || pathname.includes("/payment-return/")) {
    return true;
  }
  return hasPendingPaymongoBooking();
}

function isInactivityExemptRoute(pathname: string): boolean {
  return pathname.startsWith("/admissions/scan");
}

export function SessionGuardProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const cartId = useReservationStore((s) => s.cartId);
  const expiresAt = useReservationStore((s) => s.expiresAt);
  const [mounted, setMounted] = useState(false);
  const sawAuthenticatedUserRef = useRef(false);
  const isLoggingOutRef = useRef(false);
  const syncBusyRef = useRef(false);
  const runSessionGuardRef = useRef<(() => void) | null>(null);

  const pathnameRef = useRef(pathname);
  const cartIdRef = useRef(cartId);
  const expiresAtRef = useRef(expiresAt);

  useEffect(() => {
    pathnameRef.current = pathname;
    cartIdRef.current = cartId;
    expiresAtRef.current = expiresAt;
  }, [pathname, cartId, expiresAt]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;

    const runSessionGuard = async () => {
      if (cancelled || isLoggingOutRef.current || syncBusyRef.current) return;
      syncBusyRef.current = true;

      try {
        const { createClient } = await import("@/lib/supabase/client");
        const { hardAuthReset } = await import("@/lib/supabase/auth-hard-reset");
        if (cancelled) return;

        const supabase = createClient();
        await resyncAuthWithServer(supabase);
        if (cancelled || isLoggingOutRef.current) return;

        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error?.message?.includes("Invalid Refresh Token")) {
          await supabase.auth.signOut({ scope: "local" });
          return;
        }

        if (user) {
          sawAuthenticatedUserRef.current = true;
        } else if (sawAuthenticatedUserRef.current) {
          window.location.reload();
          return;
        }

        if (!user) return;

        const stateRes = await fetch("/api/session/state", {
          credentials: "same-origin",
          cache: "no-store",
        });

        if (stateRes.status === 401 || stateRes.status === 403) return;
        if (!stateRes.ok) return;

        const body = (await stateRes.json()) as {
          user?: { id: string } | null;
          forceLogout?: boolean;
        };

        if (body.forceLogout) {
          isLoggingOutRef.current = true;
          try {
            await hardAuthReset(supabase);
          } finally {
            window.location.replace("/");
          }
          return;
        }

        if (!body.user) return;

        const currentPath = pathnameRef.current;
        await fetch("/api/session/activity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            event: "heartbeat",
            hasActiveCart: hasActiveCartForSession(
              currentPath,
              cartIdRef.current,
              expiresAtRef.current
            ),
            inPaymongoFlow:
              isPaymongoFlow(currentPath) || isInactivityExemptRoute(currentPath),
          }),
        }).catch(() => {
          /* best effort */
        });
      } catch {
        /* best effort */
      } finally {
        syncBusyRef.current = false;
      }
    };

    runSessionGuardRef.current = () => {
      void runSessionGuard();
    };

    return () => {
      cancelled = true;
      runSessionGuardRef.current = null;
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (debounceTimer != null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        runSessionGuardRef.current?.();
      }, NAV_DEBOUNCE_MS);
    };

    schedule();

    return () => {
      if (debounceTimer != null) clearTimeout(debounceTimer);
    };
  }, [mounted, pathname]);

  useEffect(() => {
    if (!mounted) return;

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runSessionGuardRef.current?.();
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        runSessionGuardRef.current?.();
      }
    }, HEARTBEAT_INTERVAL_MS);

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [mounted]);

  return <>{children}</>;
}
