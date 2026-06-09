"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Mail,
  MapPin,
  Share2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { remoteImageCanOptimize } from "@/lib/image-remote";
import { eventScheduleDisplayLine, eventVenueDisplayName } from "@/lib/event-public-display";
import { cn, getVideoEmbedInfo } from "@/lib/utils";
import type { Event } from "@/lib/types";
import {
  formatEarlyBirdCountdown,
  isEarlyBirdWindowActive,
} from "@/lib/event-early-bird";

const PREFETCH_AVAILABILITY_TIMEOUT_MS = 10_000;
const PREFETCH_AVAILABILITY_STALE_MS = 15_000;

type PrefetchSection = {
  id: string;
  seating_type?: "assigned" | "free" | "standing";
};

async function prefetchAvailabilityJson(url: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PREFETCH_AVAILABILITY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Prefetch failed with status ${res.status}`);
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json || typeof json !== "object") throw new Error("Invalid prefetch payload");
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.88 3.77-3.88 1.09 0 2.23.2 2.23.2v2.46h-1.25c-1.24 0-1.62.77-1.62 1.56V12h2.76l-.44 2.89h-2.32v6.99A10 10 0 0 0 22 12Z"
      />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M18.901 1.153h3.68l-8.04 9.19 9.458 12.504h-7.405l-5.8-7.58-6.63 7.58H.48l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.932Zm-1.292 19.49h2.04L6.486 3.24H4.298l13.31 17.403Z"
      />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm8.5 1.8h-8.5A3.95 3.95 0 0 0 3.8 7.75v8.5a3.95 3.95 0 0 0 3.95 3.95h8.5a3.95 3.95 0 0 0 3.95-3.95v-8.5a3.95 3.95 0 0 0-3.95-3.95ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.8A3.2 3.2 0 1 0 12 15.2 3.2 3.2 0 0 0 12 8.8Zm5.2-2.25a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1Z"
      />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M14.2 2h2.4a4.3 4.3 0 0 0 3.4 3.4V7.8a6.6 6.6 0 0 1-3.4-1V13a6 6 0 1 1-6-6c.3 0 .6 0 .9.1v2.5a3.4 3.4 0 1 0 2.7 3.4V2Z"
      />
    </svg>
  );
}

export function EventCardDetailsDialog({
  event,
  open,
  onOpenChange,
}: {
  event: Event;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const modalVideoRef = useRef<HTMLVideoElement>(null);
  const [embedReady, setEmbedReady] = useState(false);
  const [directVideoReady, setDirectVideoReady] = useState(false);
  const [earlyBirdTick, setEarlyBirdTick] = useState(0);
  const [imageWidth, setImageWidth] = useState<number | null>(null);
  const [imageHeight, setImageHeight] = useState<number | null>(null);
  const [videoWidth, setVideoWidth] = useState<number | null>(null);
  const [videoHeight, setVideoHeight] = useState<number | null>(null);
  const [mediaView, setMediaView] = useState<"video" | "image">("video");
  const [canSeeAdminActions, setCanSeeAdminActions] = useState(false);
  const queryClient = useQueryClient();

  const prefetchBookRouteData = useCallback(async () => {
    const eventId = event.id;
    if (!eventId) return;
    queryClient.setQueryData(["event", event.slug], event);
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: ["availability", eventId, "manifest"],
        queryFn: async () => {
          const q = `${Date.now()}&r=${Math.random().toString(36).slice(2)}`;
          const json = await prefetchAvailabilityJson(
            `/api/events/${eventId}/availability?mode=manifest&t=${q}`
          );
          return {
            sections: Array.isArray(json.sections)
              ? (json.sections as PrefetchSection[])
              : [],
            canvases: Array.isArray(json.canvases)
              ? (json.canvases as Array<Record<string, unknown>>)
              : [],
          };
        },
        staleTime: PREFETCH_AVAILABILITY_STALE_MS,
      }),
      queryClient.prefetchQuery({
        queryKey: ["event-prices", eventId],
        queryFn: async () => {
          const res = await fetch(`/api/events/${eventId}/prices?t=${Date.now()}`, {
            cache: "no-store",
          });
          if (!res.ok) throw new Error("Failed to load prices");
          return res.json();
        },
        staleTime: PREFETCH_AVAILABILITY_STALE_MS,
      }),
      queryClient.prefetchQuery({
        queryKey: ["event-add-ons", eventId],
        queryFn: async () => {
          const res = await fetch(`/api/events/${eventId}/add-ons`, {
            cache: "no-store",
          });
          if (!res.ok) return [];
          const json = await res.json().catch(() => null);
          return Array.isArray(json?.items) ? json.items : [];
        },
        staleTime: PREFETCH_AVAILABILITY_STALE_MS,
      }),
    ]);
  }, [event, queryClient]);

  const videoInfo = useMemo(
    () => getVideoEmbedInfo(event.teaser_video_url),
    [event.teaser_video_url]
  );
  const isEmbedVideo = videoInfo?.type === "youtube" || videoInfo?.type === "vimeo";
  const isDirectVideo = videoInfo?.type === "direct";

  const earlyBirdActive = useMemo(
    () =>
      isEarlyBirdWindowActive(event.early_bird_starts_at, event.early_bird_ends_at),
    [event.early_bird_starts_at, event.early_bird_ends_at]
  );

  useEffect(() => {
    if (!earlyBirdActive || !event.early_bird_ends_at) return;
    const id = setInterval(() => setEarlyBirdTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [earlyBirdActive, event.early_bird_ends_at]);

  const timeRemaining = useMemo(() => {
    if (!earlyBirdActive || !event.early_bird_ends_at) return null;
    const endsAt = new Date(event.early_bird_ends_at).getTime();
    return formatEarlyBirdCountdown(
      endsAt - Date.now() + earlyBirdTick * 0 /** tick dep; +0 avoids unused-var */
    );
  }, [earlyBirdActive, event.early_bird_ends_at, earlyBirdTick]);

  const promoLabel = useMemo(
    () => (event.sale_label?.trim() || "EARLY BIRD PROMO"),
    [event.sale_label]
  );

  useEffect(() => {
    if (!open) {
      setEmbedReady(false);
      setDirectVideoReady(false);
      setImageWidth(null);
      setImageHeight(null);
      setVideoWidth(null);
      setVideoHeight(null);
      setMediaView("video");
      return;
    }
    const t = setTimeout(() => {
      setEmbedReady(true);
      setDirectVideoReady(true);
    }, 2000);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const supabase = createClient();
    const resolveAdminActionsVisibility = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        if (!cancelled) setCanSeeAdminActions(false);
        return;
      }

      const { data: roleData } = await supabase.rpc("get_my_role");
      const role = (roleData as string | null) ?? null;
      if (role === "super_admin") {
        if (!cancelled) setCanSeeAdminActions(true);
        return;
      }

      if (role !== "admin") {
        if (!cancelled) setCanSeeAdminActions(false);
        return;
      }

      const { data: assignment } = await supabase
        .from("event_administrators")
        .select("user_id")
        .eq("event_id", event.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!cancelled) setCanSeeAdminActions(Boolean(assignment));
    };

    void resolveAdminActionsVisibility();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void resolveAdminActionsVisibility();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [open, event.id]);

  useEffect(() => {
    if (!open || !isDirectVideo) return;
    const v = modalVideoRef.current;
    if (!v) return;
    v.muted = false;
    v.defaultMuted = false;
    v.volume = 1;
    const p = v.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {});
    }
  }, [open, isDirectVideo]);

  useEffect(() => {
    if (!open || !event.id) return;

    void (async () => {
      try {
        await prefetchBookRouteData();
      } catch {
        // Prefetch is opportunistic; ignore transient failures.
      }
    })();
  }, [open, event.id, prefetchBookRouteData]);

  const applyImageDimensions = (w: number, h: number) => {
    setImageWidth(w);
    setImageHeight(h);
  };

  const applyVideoDimensions = (w: number, h: number) => {
    setVideoWidth(w);
    setVideoHeight(h);
  };

  const handleModalImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    applyImageDimensions(img.naturalWidth, img.naturalHeight);
  };

  const handleDirectVideoMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    applyVideoDimensions(v.videoWidth, v.videoHeight);
  };

  const hasImageDimensions =
    imageWidth != null && imageHeight != null && imageWidth > 0 && imageHeight > 0;
  const hasVideoDimensions =
    videoWidth != null && videoHeight != null && videoWidth > 0 && videoHeight > 0;
  const isPortraitMedia =
    mediaView === "image"
      ? hasImageDimensions && imageHeight > imageWidth
      : isDirectVideo
        ? hasVideoDimensions && videoHeight > videoWidth
        : false;
  const hasVideoAndImage =
    event.image_url &&
    (isEmbedVideo || isDirectVideo);
  const embedAutoplayUrl =
    isEmbedVideo && "embedUrl" in videoInfo
      ? `${videoInfo.embedUrl}${videoInfo.embedUrl.includes("?") ? "&" : "?"}autoplay=1&mute=0&muted=0&playsinline=1`
      : null;
  const desktopMediaHeightClass =
    mediaView === "video"
      ? isPortraitMedia
        ? "lg:h-[min(78vh,860px)]"
        : "lg:h-[min(68vh,680px)]"
      : isPortraitMedia
        ? "lg:h-[min(78vh,860px)]"
        : "lg:h-[min(40vh,380px)]";

  const venueName = eventVenueDisplayName(event);
  const fullDescription =
    event.description ?? event.short_description ?? "No description.";
  const shareText = `${event.title}\n\n${fullDescription}`;
  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/${event.slug}` : "";
  const shareTextWithUrl = `${shareText}\n\n${shareUrl}`;

  const copyShareText = async () => {
    if (!shareTextWithUrl) return;
    try {
      await navigator.clipboard?.writeText(shareTextWithUrl);
      toast.success("Event details copied. You can now paste your post.");
    } catch {
      toast.error("Could not copy event details");
    }
  };

  const copyEventLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard?.writeText(shareUrl);
      toast.success("Event link copied to clipboard");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleShareNative = async () => {
    if (!shareUrl) return;
    if (!navigator.share) {
      toast.error("Native sharing is not available on this device");
      return;
    }
    try {
      await navigator.share({
        title: event.title,
        text: fullDescription,
        url: shareUrl,
      });
    } catch {
      // User cancelled or platform denied; no toast needed.
    }
  };

  const openShareWindow = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleShareFacebook = () => {
    if (!shareUrl) return;
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
      shareUrl
    )}&quote=${encodeURIComponent(`${event.title}\n\n${fullDescription}`)}`;
    openShareWindow(facebookUrl);
  };

  const handleShareX = () => {
    if (!shareUrl) return;
    const xText = `${event.title}\n\n${fullDescription}`;
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      xText
    )}&url=${encodeURIComponent(shareUrl)}`;
    openShareWindow(xUrl);
  };

  const handleShareEmail = () => {
    if (!shareUrl) return;
    const mailto = `mailto:?subject=${encodeURIComponent(
      event.title
    )}&body=${encodeURIComponent(shareTextWithUrl)}`;
    window.location.href = mailto;
  };

  const handleShareInstagram = async () => {
    await copyShareText();
    openShareWindow("https://www.instagram.com/");
    toast.info("Instagram opened. Paste the copied event details into your post.");
  };

  const handleShareTikTok = async () => {
    await copyShareText();
    openShareWindow("https://www.tiktok.com/upload");
    toast.info("TikTok opened. Paste the copied event details into your caption.");
  };

  const dialogActions = (wrapperClassName: string) => (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2",
        wrapperClassName
      )}
    >
      <NavButtonWithProgress
        href={`/${event.slug}/book`}
        className="choose-seats-pulse w-full sm:w-auto bg-[var(--wish-orange)] hover:bg-[var(--wish-orange-hover)]"
        loadingMessage="Opening seat selection…"
        onBeforeNavigate={prefetchBookRouteData}
      >
        Choose seats
      </NavButtonWithProgress>
      <Button
        type="button"
        variant="secondary"
        className="w-full sm:w-auto"
        onClick={copyEventLink}
      >
        Copy Event Link
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" className="w-full sm:w-auto">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={handleShareNative}>
            <Share2 className="h-4 w-4" />
            Share to available apps
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleShareFacebook}>
            <FacebookIcon className="h-4 w-4" />
            Facebook
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleShareX}>
            <XIcon className="h-4 w-4" />X
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleShareInstagram}>
            <InstagramIcon className="h-4 w-4" />
            Instagram
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleShareTikTok}>
            <TikTokIcon className="h-4 w-4" />
            TikTok
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleShareEmail}>
            <Mail className="h-4 w-4" />
            Email
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        type="button"
        variant="secondary"
        className="w-full sm:w-auto"
        onClick={() => onOpenChange(false)}
      >
        Close Window
      </Button>
      {canSeeAdminActions && (
        <>
          <Button type="button" variant="secondary" className="w-full sm:w-auto" asChild>
            <Link href={`/admin/events/${event.id}`}>Manage Event</Link>
          </Button>
          <Button type="button" variant="secondary" className="w-full sm:w-auto" asChild>
            <Link href={`/admin/reports?event_id=${encodeURIComponent(event.id)}`}>
              View Report
            </Link>
          </Button>
        </>
      )}
      {earlyBirdActive && (
        <div className="hidden sm:flex flex-col items-center gap-0.5" title={promoLabel}>
          <div
            className="inline-flex min-w-[140px] justify-center items-center gap-1.5 rounded-md border border-amber-400/60 bg-amber-500/95 px-4 py-1 text-center text-xs font-bold uppercase tracking-wide text-foreground"
            style={{
              boxShadow:
                "0 0 12px rgba(245,158,11,0.6), 0 0 24px rgba(245,158,11,0.3)",
            }}
          >
            <Zap className="h-3.5 w-3.5 shrink-0" />
            {promoLabel}
          </div>
          {timeRemaining != null && (
            <span className="font-mono text-[10px] text-amber-200/90 text-center w-full" suppressHydrationWarning>
              {timeRemaining} left
            </span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[95vw] h-[95vh] max-w-[95vw] max-h-[95vh] overflow-y-auto flex flex-col"
      >
        <DialogHeader>
          <DialogTitle>{event.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto lg:grid lg:h-full lg:grid-cols-[1.15fr_0.85fr] lg:gap-x-6 lg:items-stretch">
          <div className="contents lg:flex lg:min-h-0 lg:flex-col lg:gap-4">
          {isEmbedVideo && "embedUrl" in videoInfo ? (
            <div
              className={cn(
                "relative flex-1 min-h-0 rounded-lg overflow-hidden bg-[var(--surface)] aspect-video lg:w-full lg:flex-none lg:shrink-0 lg:[aspect-ratio:auto]",
                desktopMediaHeightClass,
                mediaView === "video" ? "aspect-video" : ""
              )}
            >
              {event.image_url && (
                <Image
                  src={event.image_url}
                  alt=""
                  aria-hidden
                  fill
                  unoptimized={!remoteImageCanOptimize(event.image_url)}
                  sizes="95vw"
                  onLoadingComplete={(img) => applyImageDimensions(img.naturalWidth, img.naturalHeight)}
                  className={`transition-opacity duration-500 ease-out ${
                    mediaView === "image" ? "object-contain" : "object-cover"
                  } ${
                    mediaView === "image" || (mediaView === "video" && !embedReady)
                      ? "opacity-100"
                      : "opacity-0 pointer-events-none"
                  }`}
                />
              )}
              <iframe
                src={embedAutoplayUrl ?? videoInfo.embedUrl}
                title={event.title}
                className={`absolute inset-0 h-full w-full transition-opacity duration-500 ease-out ${
                  mediaView === "video" && embedReady ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                onLoad={() => setEmbedReady(true)}
              />
              <div className="absolute inset-0 z-10 pointer-events-none" aria-hidden />
              {hasVideoAndImage && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMediaView("image");
                    }}
                    className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
                    aria-label="Show event image"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMediaView("video");
                    }}
                    className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
                    aria-label="Show video"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}
              {earlyBirdActive && (
                <div
                  role="status"
                  aria-label={`Sale promo: ${promoLabel}`}
                  className="absolute inset-x-0 bottom-2 z-20 flex items-center px-3 pointer-events-none sm:hidden"
                >
                  <div
                    className="flex w-full flex-col items-center justify-center gap-0.5 rounded-md border border-amber-400/60 bg-amber-500/95 px-4 py-2 text-center text-xs font-bold uppercase tracking-wide text-foreground"
                    style={{
                      boxShadow:
                        "0 0 12px rgba(245,158,11,0.6), 0 0 24px rgba(245,158,11,0.3)",
                    }}
                  >
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
            </div>
          ) : isDirectVideo && "url" in videoInfo ? (
            <div
              className={`relative flex-1 min-h-0 rounded-lg overflow-hidden bg-[var(--surface)] flex items-center justify-center aspect-video lg:w-full ${desktopMediaHeightClass} lg:flex-none lg:shrink-0 lg:[aspect-ratio:auto]`}
            >
              {event.image_url && (
                <Image
                  src={event.image_url}
                  alt=""
                  aria-hidden
                  fill
                  unoptimized={!remoteImageCanOptimize(event.image_url)}
                  sizes="95vw"
                  onLoadingComplete={(img) => applyImageDimensions(img.naturalWidth, img.naturalHeight)}
                  className={`transition-opacity duration-500 ease-out ${
                    mediaView === "image" ? "object-contain" : "object-cover"
                  } ${
                    mediaView === "image" || (mediaView === "video" && !directVideoReady)
                      ? "opacity-100"
                      : "opacity-0 pointer-events-none"
                  }`}
                />
              )}
              <video
                ref={modalVideoRef}
                src={videoInfo.url}
                className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-500 ease-out ${
                  mediaView === "video" && directVideoReady ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
                loop
                playsInline
                autoPlay
                controls
                onCanPlay={() => setDirectVideoReady(true)}
                onLoadedMetadata={handleDirectVideoMetadata}
              />
              <div className="absolute inset-0 z-10 pointer-events-none" aria-hidden />
              {hasVideoAndImage && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMediaView("image");
                    }}
                    className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
                    aria-label="Show event image"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMediaView("video");
                    }}
                    className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
                    aria-label="Show video"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}
              {earlyBirdActive && (
                <div
                  role="status"
                  aria-label={`Sale promo: ${promoLabel}`}
                  className="absolute inset-x-0 bottom-2 z-20 flex items-center px-3 pointer-events-none sm:hidden"
                >
                  <div
                    className="flex w-full flex-col items-center justify-center gap-0.5 rounded-md border border-amber-400/60 bg-amber-500/95 px-4 py-2 text-center text-xs font-bold uppercase tracking-wide text-foreground"
                    style={{
                      boxShadow:
                        "0 0 12px rgba(245,158,11,0.6), 0 0 24px rgba(245,158,11,0.3)",
                    }}
                  >
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
            </div>
          ) : event.image_url ? (
            <div
              className={`relative flex-1 min-h-0 rounded-lg overflow-hidden bg-[var(--surface)] flex items-center justify-center aspect-video lg:w-full ${desktopMediaHeightClass} lg:flex-none lg:shrink-0 lg:[aspect-ratio:auto]`}
            >
              <Image
                src={event.image_url}
                alt={event.title}
                fill
                unoptimized={!remoteImageCanOptimize(event.image_url)}
                sizes="95vw"
                onLoad={handleModalImageLoad}
                onLoadingComplete={(img) => applyImageDimensions(img.naturalWidth, img.naturalHeight)}
                className="object-contain animate-in fade-in duration-500"
              />
              {earlyBirdActive && (
                <div
                  role="status"
                  aria-label={`Sale promo: ${promoLabel}`}
                  className="absolute inset-x-0 bottom-2 z-20 flex items-center px-3 pointer-events-none sm:hidden"
                >
                  <div
                    className="flex w-full flex-col items-center justify-center gap-0.5 rounded-md border border-amber-400/60 bg-amber-500/95 px-4 py-2 text-center text-xs font-bold uppercase tracking-wide text-foreground"
                    style={{
                      boxShadow:
                        "0 0 12px rgba(245,158,11,0.6), 0 0 24px rgba(245,158,11,0.3)",
                    }}
                  >
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
            </div>
          ) : null}
          {dialogActions(
            "hidden lg:flex w-full shrink-0 lg:self-start lg:flex-row lg:flex-wrap lg:justify-center"
          )}
          </div>
          <div className="flex flex-col gap-4 lg:h-full lg:min-h-0 lg:self-stretch">
            <div className="max-h-[20vh] min-h-0 overflow-y-auto rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-2 lg:w-full lg:max-h-none lg:flex-1">
              <p className="text-lg text-foreground-muted leading-relaxed whitespace-pre-wrap">
                {fullDescription}
              </p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-foreground-muted lg:mt-auto lg:w-full lg:flex-col lg:items-start lg:gap-2">
              <span className="flex items-center gap-1" suppressHydrationWarning>
                <Calendar className="h-4 w-4" />
                {eventScheduleDisplayLine(event)}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
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
          </div>
        </div>
        {dialogActions("justify-end lg:hidden")}
      </DialogContent>
    </Dialog>
  );
}
