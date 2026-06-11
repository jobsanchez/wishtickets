"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useReservationStore } from "@/store/reservation-store";
import { hasPendingPaymongoBooking } from "@/lib/paymongo-pending-booking";
import { resyncAuthWithServer } from "@/lib/supabase/auth-resync";
import type { SupabaseClient } from "@supabase/supabase-js";

const NAV_DEBOUNCE_MS = 300;
/** Keeps `last_heartbeat_at` fresh during long seat selection (server default inactivity is 15 min). */
const HEARTBEAT_INTERVAL_MS = 90_000;

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

type SessionActivityPayload = {
  event: "heartbeat";
  hasActiveCart: boolean;
  inPaymongoFlow: boolean;
};

function buildActivityPayload(
  pathname: string,
  cartId: string | null,
  expiresAt: string | null
): SessionActivityPayload {
  return {
    event: "heartbeat",
    hasActiveCart: hasActiveCartForSession(pathname, cartId, expiresAt),
    inPaymongoFlow: isPaymongoFlow(pathname) || isInactivityExemptRoute(pathname),
  };
}

export function SessionGuardProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const cartId = useReservationStore((s) => s.cartId);
  const expiresAt = useReservationStore((s) => s.expiresAt);
  const [mounted, setMounted] = useState(false);
  const sawAuthenticatedUserRef = useRef(false);
  const isLoggingOutRef = useRef(false);
  const syncBusyRef = useRef(false);
  const runFullSessionGuardRef = useRef<(() => void) | null>(null);
  const runResumeGuardRef = useRef<(() => void) | null>(null);
  const runActivityHeartbeatRef = useRef<(() => void) | null>(null);

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

    async function forceLogoutAndRedirect(supabase: SupabaseClient): Promise<void> {
      if (isLoggingOutRef.current) return;
      isLoggingOutRef.current = true;
      const { hardAuthReset } = await import("@/lib/supabase/auth-hard-reset");
      try {
        await hardAuthReset(supabase);
      } finally {
        window.location.replace("/");
      }
    }

    async function postSessionActivity(supabase: SupabaseClient): Promise<boolean> {
      const currentPath = pathnameRef.current;
      try {
        const res = await fetch("/api/session/activity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(
            buildActivityPayload(currentPath, cartIdRef.current, expiresAtRef.current)
          ),
        });

        if (res.status === 409) {
          const body = (await res.json().catch(() => ({}))) as { reason?: string };
          if (body.reason === "force_logout") {
            await forceLogoutAndRedirect(supabase);
            return false;
          }
        }
      } catch {
        /* best effort */
      }

      return true;
    }

    async function checkSessionStateAndMaybeLogout(supabase: SupabaseClient): Promise<boolean> {
      const stateRes = await fetch("/api/session/state", {
        credentials: "same-origin",
        cache: "no-store",
      });

      if (stateRes.status === 401 || stateRes.status === 403) return false;
      if (!stateRes.ok) return false;

      const body = (await stateRes.json()) as {
        user?: { id: string } | null;
        forceLogout?: boolean;
      };

      if (body.forceLogout) {
        await forceLogoutAndRedirect(supabase);
        return false;
      }

      return Boolean(body.user);
    }

    const runFullSessionGuard = async () => {
      if (cancelled || isLoggingOutRef.current || syncBusyRef.current) return;
      syncBusyRef.current = true;

      try {
        const { createClient } = await import("@/lib/supabase/client");
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

        const stillAuthed = await checkSessionStateAndMaybeLogout(supabase);
        if (!stillAuthed || cancelled || isLoggingOutRef.current) return;

        const activityOk = await postSessionActivity(supabase);
        if (!activityOk || cancelled || isLoggingOutRef.current) return;
      } catch {
        /* best effort */
      } finally {
        syncBusyRef.current = false;
      }
    };

    const runResumeGuard = async () => {
      if (cancelled || isLoggingOutRef.current || syncBusyRef.current) return;
      syncBusyRef.current = true;

      try {
        const { createClient } = await import("@/lib/supabase/client");
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

        const stillAuthed = await checkSessionStateAndMaybeLogout(supabase);
        if (!stillAuthed || cancelled || isLoggingOutRef.current) return;

        const activityOk = await postSessionActivity(supabase);
        if (!activityOk || cancelled || isLoggingOutRef.current) return;
      } catch {
        /* best effort */
      } finally {
        syncBusyRef.current = false;
      }
    };

    const runActivityHeartbeat = async () => {
      if (cancelled || isLoggingOutRef.current || !sawAuthenticatedUserRef.current) return;
      if (syncBusyRef.current) return;

      try {
        const { createClient } = await import("@/lib/supabase/client");
        if (cancelled) return;

        const supabase = createClient();
        const stillAuthed = await checkSessionStateAndMaybeLogout(supabase);
        if (!stillAuthed || cancelled || isLoggingOutRef.current) return;

        await postSessionActivity(supabase);
      } catch {
        /* best effort */
      }
    };

    runFullSessionGuardRef.current = () => {
      void runFullSessionGuard();
    };
    runResumeGuardRef.current = () => {
      void runResumeGuard();
    };
    runActivityHeartbeatRef.current = () => {
      void runActivityHeartbeat();
    };

    return () => {
      cancelled = true;
      runFullSessionGuardRef.current = null;
      runResumeGuardRef.current = null;
      runActivityHeartbeatRef.current = null;
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (debounceTimer != null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        runFullSessionGuardRef.current?.();
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
        runResumeGuardRef.current?.();
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        runActivityHeartbeatRef.current?.();
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
