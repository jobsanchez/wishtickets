import type { Metadata } from "next";
import { Suspense } from "react";
import { HomeStreamFallback } from "./home-stream-fallback";
import { HomeSplitLoader } from "./home-split-loader";

/** Home can be cached briefly to avoid expensive cold SSR on every request. */
export const revalidate = 60;

export const metadata: Metadata = {
  title:
    "Wish Tickets Portal – Smart QR Ticketing System for Events in the Philippines",
  description:
    "Secure ticketing platform with QR validation, real-time tracking, and admission control. Perfect for concerts and events.",
};

/**
 * Hero is synchronous; event split loads in a Suspense boundary so the document can stream
 * without waiting on Supabase (improves TTFB / Speed Index in lab runs).
 */
export default function Home() {
  return (
    <div className="container mx-auto w-full max-w-[99%] xl:max-w-[1800px] px-1 sm:px-2 py-12">
      <section className="text-center max-w-3xl mx-auto mb-0" aria-label="Hero">
        <h1 className="text-5xl md:text-6xl font-bold mb-4 font-[var(--font-display)] uppercase tracking-wide">
          <span className="text-[var(--wish-orange)]">Wish</span>{" "}
          <span className="text-foreground">Tickets Portal</span>
        </h1>
        <p className="text-lg text-foreground-muted mb-8">
          Secure ticketing with QR validation, real-time tracking, and admission control—book
          amazing events across the Philippines.
        </p>
      </section>
      <Suspense fallback={<HomeStreamFallback />}>
        <HomeSplitLoader />
      </Suspense>
    </div>
  );
}
