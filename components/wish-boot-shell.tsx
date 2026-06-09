/**
 * First-paint shell: SSR’d in the root layout so users see background + progress before
 * the app hydrates. Must be dismissed via React state (not manual DOM removal), otherwise
 * React/Next can throw NotFoundError during reconciliation.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { WishLoadingSpinner } from "@/components/ui/route-loading";

const FADE_MS = 320;
const MIN_VISIBLE_MS = 480;
const MAX_VISIBLE_MS = 5500;

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

export function WishBootShell() {
  const pathname = usePathname() ?? "";
  const bypass = useMemo(() => {
    return pathname.startsWith("/admissions/") || pathname.startsWith("/reports/shared/");
  }, [pathname]);

  const [phase, setPhase] = useState<"visible" | "fading" | "gone">("visible");

  useEffect(() => {
    if (bypass) {
      setPhase("gone");
      return;
    }

    let cancelled = false;
    const maxTimer = window.setTimeout(() => {
      if (!cancelled) setPhase("fading");
    }, MAX_VISIBLE_MS);

    void (async () => {
      try {
        await Promise.all([
          delay(MIN_VISIBLE_MS),
          (async () => {
            try {
              const { createClient } = await import("@/lib/supabase/client");
              await createClient().auth.getUser();
            } catch {
              /* non-fatal: still show app */
            }
          })(),
        ]);
      } finally {
        window.clearTimeout(maxTimer);
        if (!cancelled) setPhase("fading");
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(maxTimer);
    };
  }, [bypass, pathname]);

  useEffect(() => {
    if (phase !== "fading") return;
    const t = window.setTimeout(() => setPhase("gone"), FADE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === "gone") return null;

  return (
    <div
      id="wish-boot-shell"
      data-phase={phase}
      className={[
        "wish-boot-shell fixed inset-0 z-[2147483646] flex flex-col items-center justify-center px-4 py-10 text-foreground",
        "transition-opacity duration-300",
        phase === "fading" ? "opacity-0 pointer-events-none" : "opacity-100",
      ].join(" ")}
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading Wish Tickets Portal"
    >
      <div className="text-center space-y-4 mb-8 max-w-lg">
        <p className="text-sm tracking-[0.35em] text-foreground-muted uppercase mb-2">
          Loading
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold font-[var(--font-display)] uppercase tracking-wide">
          <span className="text-[var(--wish-orange)]">Wish</span>{" "}
          <span className="text-foreground">Tickets Portal</span>
        </h1>
        <p className="text-sm text-foreground-muted max-w-md mx-auto">
          Warming up your session and preparing the experience…
        </p>
      </div>

      <div className="route-loading-card-glow glass rounded-2xl border border-[var(--glass-border)] px-8 py-10 max-w-md w-full text-center relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.07] z-[1]"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% -20%, var(--wish-orange), transparent), radial-gradient(ellipse 60% 50% at 100% 100%, var(--wish-purple), transparent)",
          }}
        />
        <div className="relative z-[2] flex flex-col items-center gap-6">
          <WishLoadingSpinner />
          <div className="space-y-2">
            <p className="text-lg sm:text-xl font-bold font-[var(--font-display)] uppercase tracking-[0.14em] leading-snug">
              <span className="text-[var(--wish-orange)]">Loading </span>
              <span className="text-foreground">portal</span>
            </p>
            <p className="text-sm text-foreground-muted leading-relaxed max-w-[30ch] mx-auto">
              Connecting to secure ticketing services. This usually takes a moment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
