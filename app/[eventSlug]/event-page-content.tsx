"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { Calendar, MapPin } from "lucide-react";
import { EventHeroDeferredZoom } from "./event-hero-deferred-zoom";
import { EventPageActions } from "./event-page-actions";
import { remoteImageCanOptimize } from "@/lib/image-remote";
import { cn, getVideoEmbedInfo, isYouTubeShortsUrl } from "@/lib/utils";
import { eventScheduleDisplayLine, eventVenueDisplayName } from "@/lib/event-public-display";

interface EventPageContentProps {
  event: {
    title: string;
    status?: string | null;
    image_url?: string | null;
    thumbnail_url?: string | null;
    teaser_video_url?: string | null;
    description?: string | null;
    short_description?: string | null;
    event_start: string;
    venue_to_be_announced?: boolean | null;
    schedule_to_be_announced?: boolean | null;
    venue?: { name: string; google_maps_url?: string | null } | null;
  };
  eventSlug: string;
}

function containedDisplaySize(
  boxW: number,
  boxH: number,
  natW: number,
  natH: number
): { width: number; height: number } | null {
  if (!Number.isFinite(boxW) || !Number.isFinite(boxH) || boxW <= 0 || boxH <= 0) {
    return null;
  }
  if (!Number.isFinite(natW) || !Number.isFinite(natH) || natW <= 0 || natH <= 0) {
    return { width: boxW, height: boxH };
  }
  const scale = Math.min(boxW / natW, boxH / natH);
  return { width: natW * scale, height: natH * scale };
}

export function EventPageContent({ event, eventSlug }: EventPageContentProps) {
  const [isImagePortrait, setIsImagePortrait] = useState<boolean | null>(null);
  const [imageNatural, setImageNatural] = useState<{ w: number; h: number } | null>(null);
  const [videoNatural, setVideoNatural] = useState<{ w: number; h: number } | null>(null);
  const [landscapeInnerSize, setLandscapeInnerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const landscapeMeasureRef = useRef<HTMLDivElement | null>(null);

  const videoInfo = getVideoEmbedInfo(event.teaser_video_url);
  const isEmbedVideo = videoInfo?.type === "youtube" || videoInfo?.type === "vimeo";
  const isDirectVideo = videoInfo?.type === "direct";
  const fullImage = event.image_url ?? event.thumbnail_url ?? null;
  const hasImage = !!fullImage;
  const isEmbedShorts = !hasImage && isEmbedVideo && isYouTubeShortsUrl(event.teaser_video_url);

  const isDirectVideoPortrait =
    isDirectVideo && videoNatural != null && videoNatural.h > videoNatural.w;

  const usePortraitLayout =
    (hasImage && isImagePortrait === true) ||
    isEmbedShorts ||
    isDirectVideoPortrait;

  const useLandscapeContainMeasure =
    !usePortraitLayout &&
    ((hasImage && isImagePortrait === false && imageNatural != null) ||
      (isDirectVideo &&
        videoNatural != null &&
        videoNatural.h <= videoNatural.w));

  const venueName = eventVenueDisplayName(event);
  const description =
    event.description ?? event.short_description ?? "No description.";

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setImageNatural({ w, h });
    setIsImagePortrait(h > w);
  };

  useLayoutEffect(() => {
    if (!useLandscapeContainMeasure) {
      setLandscapeInnerSize(null);
      return;
    }

    const el = landscapeMeasureRef.current;
    if (!el) return;

    const compute = () => {
      const boxW = el.clientWidth;
      const boxH = el.clientHeight;
      if (hasImage && imageNatural) {
        const s = containedDisplaySize(boxW, boxH, imageNatural.w, imageNatural.h);
        setLandscapeInnerSize(s);
        return;
      }
      if (isDirectVideo && videoNatural) {
        const s = containedDisplaySize(boxW, boxH, videoNatural.w, videoNatural.h);
        setLandscapeInnerSize(s);
        return;
      }
      setLandscapeInnerSize(null);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [useLandscapeContainMeasure, hasImage, imageNatural, isDirectVideo, videoNatural]);

  const landscapeDetailsWidth =
    landscapeInnerSize != null && landscapeInnerSize.width > 0
      ? landscapeInnerSize.width
      : undefined;

  const imageOrMediaBlock =
    hasImage ? (
        usePortraitLayout ? (
          <div className="flex w-full max-w-[min(100%,320px)] shrink-0 flex-col items-center overflow-hidden rounded-xl bg-[var(--surface)] mx-auto md:mx-0">
            <EventHeroDeferredZoom src={fullImage!}>
              <div
                className={cn(
                  "relative w-full max-w-[320px] cursor-zoom-in",
                  !imageNatural && "min-h-[10rem]"
                )}
                style={
                  imageNatural
                    ? { aspectRatio: `${imageNatural.w} / ${imageNatural.h}` }
                    : { aspectRatio: "3 / 4" }
                }
              >
                <Image
                  src={fullImage!}
                  alt={event.title}
                  fill
                  priority
                  unoptimized={!remoteImageCanOptimize(fullImage!)}
                  sizes="(max-width: 768px) 100vw, 320px"
                  onLoad={handleImageLoad}
                  className="object-contain"
                />
              </div>
            </EventHeroDeferredZoom>
          </div>
        ) : (
          <div
            ref={landscapeMeasureRef}
            className="w-full h-[55vh] min-h-[200px] flex items-center justify-center overflow-hidden rounded-xl bg-[var(--surface)]"
          >
            {landscapeInnerSize ? (
              <EventHeroDeferredZoom src={fullImage!}>
                <div
                  className="relative cursor-zoom-in"
                  style={{
                    width: landscapeInnerSize.width,
                    height: landscapeInnerSize.height,
                  }}
                >
                  <Image
                    src={fullImage!}
                    alt={event.title}
                    fill
                    priority
                    unoptimized={!remoteImageCanOptimize(fullImage!)}
                    sizes="(max-width: 768px) 100vw, min(896px, 100vw)"
                    onLoad={handleImageLoad}
                    className="object-contain"
                  />
                </div>
              </EventHeroDeferredZoom>
            ) : (
              <EventHeroDeferredZoom src={fullImage!}>
                <div className="relative cursor-zoom-in h-full w-full min-h-[200px]">
                  <Image
                    src={fullImage!}
                    alt={event.title}
                    fill
                    priority
                    unoptimized={!remoteImageCanOptimize(fullImage!)}
                    sizes="(max-width: 768px) 100vw, min(896px, 100vw)"
                    onLoad={handleImageLoad}
                    className="object-contain"
                  />
                </div>
              </EventHeroDeferredZoom>
            )}
          </div>
        )
      ) : isEmbedShorts && videoInfo && "embedUrl" in videoInfo ? (
        <div className="w-full max-w-[min(100%,320px)] shrink-0 overflow-hidden rounded-xl bg-[var(--surface)] mx-auto md:mx-0">
          <div className="relative mx-auto aspect-[9/16] w-full max-w-[320px]">
            <iframe
              src={videoInfo.embedUrl}
              title={event.title}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      ) : isEmbedVideo && videoInfo && "embedUrl" in videoInfo ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[var(--surface)]">
          <iframe
            src={videoInfo.embedUrl}
            title={event.title}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : isDirectVideo && videoInfo && "url" in videoInfo ? (
        usePortraitLayout ? (
          <div className="flex w-full max-w-[min(100%,320px)] shrink-0 flex-col items-center overflow-hidden rounded-xl bg-[var(--surface)] mx-auto md:mx-0">
            <div
              className="relative w-full max-w-[320px]"
              style={
                videoNatural
                  ? { aspectRatio: `${videoNatural.w} / ${videoNatural.h}` }
                  : { aspectRatio: "9 / 16" }
              }
            >
              <video
                src={videoInfo.url}
                className="absolute inset-0 h-full w-full object-contain"
                controls
                playsInline
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  setVideoNatural({ w: v.videoWidth, h: v.videoHeight });
                }}
              />
            </div>
          </div>
        ) : (
          <div
            ref={landscapeMeasureRef}
            className="w-full h-[55vh] min-h-[200px] flex items-center justify-center overflow-hidden rounded-xl bg-[var(--surface)]"
          >
            {landscapeInnerSize ? (
              <div
                className="relative"
                style={{
                  width: landscapeInnerSize.width,
                  height: landscapeInnerSize.height,
                }}
              >
                <video
                  src={videoInfo.url}
                  className="h-full w-full object-contain"
                  controls
                  playsInline
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    setVideoNatural({ w: v.videoWidth, h: v.videoHeight });
                  }}
                />
              </div>
            ) : (
              <video
                src={videoInfo.url}
                className="max-h-full max-w-full object-contain"
                controls
                playsInline
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  setVideoNatural({ w: v.videoWidth, h: v.videoHeight });
                }}
              />
            )}
          </div>
        )
      ) : (
        <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl bg-[var(--surface)] text-foreground-muted">
          No image
        </div>
      );

  const detailsBlock = (
    <div
      className={cn(
        "flex min-w-0 flex-col text-center md:text-left w-full max-w-xl md:max-w-none",
        usePortraitLayout
          ? "md:min-h-0 md:max-h-[min(55vh,800px)] md:overflow-hidden md:flex-1"
          : "flex-1"
      )}
      style={
        landscapeDetailsWidth != null
          ? { width: landscapeDetailsWidth, maxWidth: "100%", marginLeft: "auto", marginRight: "auto" }
          : undefined
      }
    >
      <div
        className={
          usePortraitLayout
            ? "flex min-h-0 flex-1 flex-col overflow-y-auto pr-1 -mr-1"
            : undefined
        }
      >
        {event.status === "draft" ? (
          <div
            className="mb-6 rounded-lg border px-4 py-3 text-sm
              border-amber-500/50 bg-amber-500/10 text-amber-950
              dark:border-amber-400/50 dark:bg-amber-950/75 dark:text-yellow-400"
            role="status"
          >
            <strong className="font-semibold text-amber-900 dark:text-yellow-300">Draft.</strong> Not shown on the public
            events list. Only people with this link can view the page and buy tickets.
          </div>
        ) : null}
        <p className="text-foreground-muted mb-6 whitespace-pre-wrap">{description}</p>
        <div className="mb-8 flex flex-wrap justify-center gap-6 text-sm text-foreground-muted md:justify-start">
          <span className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0" />
            {eventScheduleDisplayLine(event)}
          </span>
          <span className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" />
            {event.venue?.google_maps_url && !event.venue_to_be_announced ? (
              <a
                href={event.venue.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--wish-orange)] hover:underline"
              >
                {venueName}
              </a>
            ) : (
              venueName
            )}
          </span>
        </div>
        <div className="flex justify-center md:justify-start">
          <EventPageActions eventSlug={eventSlug} />
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-8",
        usePortraitLayout && "items-center md:flex-row md:items-stretch"
      )}
    >
      {imageOrMediaBlock}
      {detailsBlock}
    </div>
  );
}
