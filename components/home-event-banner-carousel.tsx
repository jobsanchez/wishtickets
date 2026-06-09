"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";
import AutoScroll from "embla-carousel-auto-scroll";
import type { HomeBannerSlide } from "@/lib/events/event-grid-types";
import { remoteImageCanOptimize, supabaseStorageDisplaySrc } from "@/lib/image-remote";
import { cn } from "@/lib/utils";

/** Circular distance between slide indices — for loop carousels and lazy “neighbor” window. */
function circularSlideDistance(a: number, b: number, length: number): number {
  if (length <= 1) return 0;
  const d = Math.abs(a - b);
  return Math.min(d, length - d);
}

/** Parallax: max horizontal shift (% of slide width) from scroll delta. */
const PARALLAX_SHIFT_PCT = 20;
/** Slight scale so parallax translate does not reveal gaps. */
const PARALLAX_IMAGE_SCALE = 1.1;

/**
 * Smooth continuous scroll (pixels per tick), not snap-by-snap Autoplay.
 * See `embla-carousel-auto-scroll` — requires `loop: true` for endless motion.
 */
const AUTO_SCROLL_SPEED = 1;
const AUTO_SCROLL_START_DELAY_MS = 500;
/** Prioritize initially visible loop neighbors so LCP never picks a lazy-loaded edge slide. */
const INITIAL_PRIORITY_DISTANCE = 1;

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

export function HomeEventBannerCarousel({
  slides,
}: {
  slides: HomeBannerSlide[];
}) {
  const prefersReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );

  const plugins = useMemo(
    () =>
      prefersReducedMotion || slides.length < 2
        ? []
        : [
            AutoScroll({
              direction: "forward",
              speed: AUTO_SCROLL_SPEED,
              startDelay: AUTO_SCROLL_START_DELAY_MS,
              playOnInit: true,
              stopOnInteraction: false,
              stopOnMouseEnter: false,
              stopOnFocusIn: true,
            }),
          ],
    [prefersReducedMotion, slides.length]
  );

  const slideFingerprint = useMemo(
    () =>
      slides
        .map((s) => `${s.bannerId}:${s.imageUrl}:${s.eventSlug}`)
        .join("|"),
    [slides]
  );

  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      /** Infinite wrap: after last slide, continues from first (and vice versa). */
      loop: slides.length > 1,
      align: "center",
      slidesToScroll: 1,
    },
    plugins
  );
  const [selected, setSelected] = useState(0);
  const [parallaxShiftPct, setParallaxShiftPct] = useState<number[]>(() =>
    slides.map(() => 0)
  );
  const parallaxRafRef = useRef<number | null>(null);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  const updateParallax = useCallback(() => {
    if (!emblaApi || prefersReducedMotion) {
      setParallaxShiftPct(slides.map(() => 0));
      return;
    }
    const scrollProgress = emblaApi.scrollProgress();
    const snaps = emblaApi.scrollSnapList();
    setParallaxShiftPct(
      snaps.map((snap) => (snap - scrollProgress) * PARALLAX_SHIFT_PCT)
    );
  }, [emblaApi, prefersReducedMotion, slides]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.reInit();
    onSelect();
    updateParallax();
  }, [emblaApi, slideFingerprint, onSelect, updateParallax]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!emblaApi || prefersReducedMotion) return;

    const onScroll = () => {
      if (parallaxRafRef.current != null) return;
      parallaxRafRef.current = requestAnimationFrame(() => {
        parallaxRafRef.current = null;
        updateParallax();
      });
    };

    emblaApi.on("scroll", onScroll);
    emblaApi.on("reInit", updateParallax);
    updateParallax();
    return () => {
      if (parallaxRafRef.current != null) {
        cancelAnimationFrame(parallaxRafRef.current);
        parallaxRafRef.current = null;
      }
      emblaApi.off("scroll", onScroll);
      emblaApi.off("reInit", updateParallax);
    };
  }, [emblaApi, prefersReducedMotion, updateParallax]);

  if (!slides.length) return null;

  const showNav = slides.length > 1;

  return (
    <section className="mb-10 w-full" aria-roledescription="carousel" aria-label="Featured events">
      <div className="relative left-1/2 w-screen -translate-x-1/2">
        <div className="overflow-hidden rounded-xl border border-[var(--glass-border)] bg-background/85">
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex gap-2 px-1 sm:px-3">
              {slides.map((slide, index) => {
                const raw = slide.imageUrl;
                const displaySrc =
                  raw.startsWith("/") || raw.includes("localhost")
                    ? raw
                    : supabaseStorageDisplaySrc(raw) || raw;
                const proxyUnoptimized = displaySrc.startsWith("/api/image-proxy");

                const isNearActive =
                  slides.length <= 1 ||
                  circularSlideDistance(index, selected, slides.length) <= 1;
                const isInitiallyVisible =
                  slides.length <= 1 ||
                  circularSlideDistance(index, 0, slides.length) <= INITIAL_PRIORITY_DISTANCE;
                const shift = parallaxShiftPct[index] ?? 0;
                const parallaxStyle =
                  prefersReducedMotion || !showNav
                    ? undefined
                    : {
                        transform: `translateX(${shift}%) scale(${PARALLAX_IMAGE_SCALE})`,
                      };

                return (
                  <div
                    className="relative min-w-0 shrink-0 flex-[0_0_92%] sm:flex-[0_0_82%] lg:flex-[0_0_66%] xl:flex-[0_0_60%]"
                    key={slide.bannerId}
                  >
                    <Link
                      href={`/${slide.eventSlug}`}
                      className="relative block aspect-[1280/543] w-full overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wish-orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      aria-label={`View event: ${slide.eventTitle}`}
                    >
                      {isNearActive ? (
                        <span
                          className={cn(
                            "absolute inset-0 block origin-center rounded-xl",
                            !prefersReducedMotion && showNav && "will-change-transform"
                          )}
                          style={parallaxStyle}
                          aria-hidden
                        >
                          <Image
                            src={displaySrc}
                            alt={slide.eventTitle}
                            fill
                            className="rounded-xl object-cover"
                            sizes="(max-width: 639px) 92vw, (max-width: 1023px) 82vw, (max-width: 1279px) 66vw, 60vw"
                            priority={index === 0}
                            loading={isInitiallyVisible ? "eager" : "lazy"}
                            fetchPriority={isInitiallyVisible ? "high" : "low"}
                            unoptimized={proxyUnoptimized || !remoteImageCanOptimize(raw)}
                          />
                        </span>
                      ) : (
                        <span
                          className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/[0.06]"
                          aria-hidden
                        >
                          <span className="h-12 w-12 animate-pulse rounded-full bg-white/10" />
                        </span>
                      )}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {showNav && (
        <div className="mt-3 flex justify-center gap-1.5" role="tablist" aria-label="Slides">
          {slides.map((s, i) => (
            <button
              key={s.bannerId}
              type="button"
              role="tab"
              aria-selected={i === selected}
              aria-label={`Go to slide ${i + 1}`}
              className={cn(
                "h-2 rounded-full transition-colors",
                i === selected
                  ? "w-6 bg-[var(--wish-orange)]"
                  : "w-2 bg-white/30 hover:bg-white/50"
              )}
              onClick={() => emblaApi?.scrollTo(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
