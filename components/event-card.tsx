"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Calendar, MapPin, Zap } from "lucide-react";
import { WishLoadingSpinner } from "@/components/ui/route-loading";
import { CardContent } from "@/components/ui/card";
import { eventScheduleDisplayLine, eventVenueDisplayName } from "@/lib/event-public-display";
import { remoteImageCanOptimize, supabaseStorageDisplaySrc } from "@/lib/image-remote";
import type { Event } from "@/lib/types";
import {
  formatEarlyBirdCountdown,
  isEarlyBirdWindowActive,
} from "@/lib/event-early-bird";
import {
  getEventCardCountdownDisplay,
  getEventCountdownParts,
} from "@/lib/event-public-visibility";

const EventCardDetailsDialog = dynamic(
  () =>
    import("@/components/event-card-details-dialog").then((m) => ({
      default: m.EventCardDetailsDialog,
    })),
  { ssr: false, loading: () => null }
);

const EVENT_CARD_HOVER_ACTIONS = [
  "Enter",
  "Explore",
  "Discover",
  "Experience",
  "See More",
  "Be There",
  "Unlock Access",
  "See What Everyone’s Waiting For",
  "Make Memories",
  "Witness The Moment",
  "Find Your Seat",
  "Be In The Crowd",
  "Start The Experience",
  "Explore What’s Inside",
  "Catch The Magic",
  "Feel The Rush",
  "Be There",
  "Enjoy The Experience",
  "Experience Something Different",
  "Enter A Different World",
  "Create Your Next Memory",
  "Explore The Vibe",
  "See What’s Waiting",
  "Find The Experience",
  "Be Where It Happens",
  "Experience The Moment",
  "Step Into The Crowd",
  "Start Your Experience",
  "Join The Experience",
  "See It Before It’s Gone",
] as const;

interface EventCardProps {
  event: Event;
  onViewDetails?: (event: Event) => void;
  /** Called when image loads with dimensions; used for masonry layout (portrait vs landscape) */
  onImageLoad?: (eventId: string, width: number, height: number) => void;
  /** Preload cover for LCP; use only for the first few above-the-fold cards per grid. */
  coverImagePriority?: boolean;
}

/** Uiverse-style frame: yellow gradient border + dark inner (see globals `.event-card-frame`). */
export function EventCard({
  event,
  onViewDetails,
  onImageLoad,
  coverImagePriority = false,
}: EventCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsUiReady, setDetailsUiReady] = useState(false);
  /** Bumps once per second while early bird is active so countdown updates without effect delay. */
  const [earlyBirdTick, setEarlyBirdTick] = useState(0);
  /** Bumps once per second until event start so the “Days … To go” line stays accurate. */
  const [eventCountdownTick, setEventCountdownTick] = useState(0);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [hoverActionLine, setHoverActionLine] = useState<string>(
    EVENT_CARD_HOVER_ACTIONS[0]
  );
  const reportedMediaLoadedRef = useRef(false);

  const reportMediaLoaded = () => {
    if (reportedMediaLoadedRef.current) return;
    reportedMediaLoadedRef.current = true;
    setMediaLoaded(true);
  };

  useEffect(() => {
    reportedMediaLoadedRef.current = false;
    setMediaLoaded(false);
  }, [event.id]);

  useEffect(() => {
    if (detailsOpen) setDetailsUiReady(true);
  }, [detailsOpen]);

  const hasCoverImage = Boolean(event.thumbnail_url ?? event.image_url);
  useEffect(() => {
    if (!hasCoverImage) {
      reportMediaLoaded();
    }
  }, [hasCoverImage]);

  useEffect(() => {
    if (!hasCoverImage) return;
    const t = setTimeout(() => {
      reportMediaLoaded();
    }, 2500);
    return () => clearTimeout(t);
  }, [hasCoverImage]);

  const earlyBirdActive = useMemo(
    () =>
      isEarlyBirdWindowActive(event.early_bird_starts_at, event.early_bird_ends_at),
    [event.early_bird_starts_at, event.early_bird_ends_at]
  );

  const promoLabel = useMemo(
    () => (event.sale_label?.trim() || "EARLY BIRD PROMO"),
    [event.sale_label]
  );

  useEffect(() => {
    if (!earlyBirdActive || !event.early_bird_ends_at) return;
    const id = setInterval(() => setEarlyBirdTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [earlyBirdActive, event.early_bird_ends_at]);

  useEffect(() => {
    if (event.schedule_to_be_announced) return;
    const eventTime = new Date(event.event_start).getTime();
    if (Number.isNaN(eventTime)) return;

    const id = window.setInterval(() => {
      const display = getEventCardCountdownDisplay(
        event.event_start,
        event.schedule_to_be_announced,
        Date.now()
      );
      if (display !== "countdown") {
        window.clearInterval(id);
      }
      setEventCountdownTick((n) => n + 1);
    }, 1000);

    return () => window.clearInterval(id);
  }, [event.schedule_to_be_announced, event.event_start]);

  const timeRemaining = useMemo(() => {
    if (!earlyBirdActive || !event.early_bird_ends_at) return null;
    const endsAt = new Date(event.early_bird_ends_at).getTime();
    return formatEarlyBirdCountdown(
      endsAt - Date.now() + earlyBirdTick * 0 /** tick dep; +0 avoids unused-var */
    );
  }, [earlyBirdActive, event.early_bird_ends_at, earlyBirdTick]);

  const openDetails = () => {
    if (onViewDetails) onViewDetails(event);
    else setDetailsOpen(true);
  };

  const venueName = eventVenueDisplayName(event);
  const countdownDisplay = useMemo(
    () =>
      getEventCardCountdownDisplay(
        event.event_start,
        event.schedule_to_be_announced,
        Date.now()
      ),
    [event.schedule_to_be_announced, event.event_start, eventCountdownTick]
  );
  const eventCountdownParts = useMemo(() => {
    if (countdownDisplay !== "countdown") return null;
    return getEventCountdownParts(event.event_start, Date.now());
  }, [countdownDisplay, event.event_start, eventCountdownTick]);
  const rawCoverSrc = event.thumbnail_url ?? event.image_url ?? "";
  const coverSrc = rawCoverSrc ? supabaseStorageDisplaySrc(rawCoverSrc) || rawCoverSrc : "";
  const coverUsesProxy = coverSrc.startsWith("/api/image-proxy");
  const rotateHoverLine = () => {
    const current = hoverActionLine;
    let next = current;
    while (next === current) {
      next =
        EVENT_CARD_HOVER_ACTIONS[
          Math.floor(Math.random() * EVENT_CARD_HOVER_ACTIONS.length)
        ]!;
    }
    setHoverActionLine(next);
  };

  return (
    <>
      <div className="event-card-frame group h-full">
        <div
          role="button"
          tabIndex={0}
          className="event-card-frame__inner relative flex min-h-0 flex-1 cursor-pointer flex-col overflow-visible rounded-[19px] bg-[var(--surface)] text-foreground transition-transform duration-200 ease-out group-hover:scale-[0.98] motion-reduce:transition-none motion-reduce:group-hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wish-yellow)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
          onMouseEnter={rotateHoverLine}
          onClick={openDetails}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openDetails();
            }
          }}
        >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-visible rounded-[19px]">
        <div className="event-card-book relative z-[3] aspect-[4/5] w-full rounded-t-[19px] bg-[var(--event-card-media-fade)]">
          <div className="event-card-book__inside rounded-t-[19px]">
            <div className="event-card-book__copy">
              <p className="event-card-book__line1">Click Here To</p>
              <p className="event-card-book__line2">{hoverActionLine}</p>
            </div>
          </div>
          <div className="event-card-book__cover relative overflow-hidden rounded-t-[19px]">
              {!mediaLoaded && (
                <div
                  className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 bg-black/35 pointer-events-none"
                  role="status"
                  aria-live="polite"
                  aria-label="Loading media"
                  style={{ borderRadius: "inherit" }}
                >
                  <WishLoadingSpinner size="sm" />
                  <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/85">
                    Loading…
                  </div>
                </div>
              )}
              {earlyBirdActive && (
                <div
                  role="status"
                  aria-label={`Sale promo: ${promoLabel}`}
                  className="absolute inset-x-0 bottom-2 z-30 flex items-center px-3 pointer-events-none"
                >
                  <div className="flex w-full flex-col items-center justify-center gap-0.5 rounded-md border border-amber-400/60 bg-amber-500/95 px-4 py-2 text-center text-xs font-bold uppercase tracking-wide text-white">
                    <div className="flex w-full items-center justify-center gap-2 text-[13px] tracking-widest">
                      <Zap className="h-4 w-4 shrink-0" />
                      <span>{promoLabel}</span>
                    </div>
                    {timeRemaining != null && (
                      <span
                        className="w-full font-mono text-[11px] text-amber-100/95 text-center"
                        suppressHydrationWarning
                      >
                        {timeRemaining} left
                      </span>
                    )}
                  </div>
                </div>
              )}
              {rawCoverSrc ? (
                <Image
                  src={coverSrc}
                  alt={event.title}
                  fill
                  priority={coverImagePriority}
                  unoptimized={coverUsesProxy || !remoteImageCanOptimize(rawCoverSrc)}
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  className="origin-center rounded-[inherit] object-cover"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    onImageLoad?.(event.id, img.naturalWidth, img.naturalHeight);
                    reportMediaLoaded();
                  }}
                  onError={() => {
                    reportMediaLoaded();
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-foreground-muted">
                  No image
                </div>
              )}
          </div>
        </div>
        <CardContent className="relative z-[2] flex flex-1 flex-col gap-2 border-0 bg-transparent p-6 pt-4 shadow-none">
          <div>
            <h3 className="line-clamp-1 text-xl font-bold text-foreground">{event.title}</h3>
          </div>
          <div className="space-y-1.5 text-base text-foreground-muted">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 shrink-0" />
              <span suppressHydrationWarning>{eventScheduleDisplayLine(event)}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" />
              {event.venue?.google_maps_url && !event.venue_to_be_announced ? (
                <a
                  href={event.venue.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--wish-orange)] hover:underline line-clamp-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {venueName}
                </a>
              ) : (
                <span className="line-clamp-1">{venueName}</span>
              )}
            </div>
            {countdownDisplay === "in_progress" && (
              <p className="font-mono tracking-tight" suppressHydrationWarning>
                <span className="text-base font-semibold text-[var(--wish-yellow-text)]">
                  Event in progress
                </span>
              </p>
            )}
            {eventCountdownParts && (
              <p
                className="flex flex-wrap items-baseline gap-x-[2ch] font-mono tracking-tight"
                suppressHydrationWarning
              >
                <span className="inline-flex items-baseline gap-0">
                  <span className="text-base font-semibold tabular-nums text-[var(--wish-yellow-text)]">
                    {eventCountdownParts.days}
                  </span>
                  <span className="text-xs font-semibold text-foreground-muted">D</span>
                </span>
                <span className="inline-flex items-baseline gap-0">
                  <span className="text-base font-semibold tabular-nums text-[var(--wish-yellow-text)]">
                    {eventCountdownParts.hours}
                  </span>
                  <span className="text-xs font-semibold text-foreground-muted">H</span>
                </span>
                <span className="inline-flex items-baseline gap-0">
                  <span className="text-base font-semibold tabular-nums text-[var(--wish-yellow-text)]">
                    {eventCountdownParts.minutes}
                  </span>
                  <span className="text-xs font-semibold text-foreground-muted">M</span>
                </span>
                <span className="inline-flex items-baseline gap-0">
                  <span className="text-base font-semibold tabular-nums text-[var(--wish-yellow-text)]">
                    {eventCountdownParts.seconds}
                  </span>
                  <span className="text-xs font-semibold text-foreground-muted">S</span>
                </span>
              </p>
            )}
          </div>
          {event.min_price_cents != null && (
            <div className="mt-auto space-y-0.5 pt-1">
              <p className="text-sm text-foreground-muted">Starting from</p>
              <p className="text-xl font-bold text-[var(--wish-orange)]">
                {(event.min_price_cents / 100).toLocaleString("en-PH", {
                  style: "currency",
                  currency: "PHP",
                })}
              </p>
            </div>
          )}
        </CardContent>
        </div>
        </div>
      </div>

      {detailsUiReady && !onViewDetails && (
        <EventCardDetailsDialog
          event={event}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
        />
      )}
    </>
  );
}
