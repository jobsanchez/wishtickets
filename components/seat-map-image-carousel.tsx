"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { remoteImageCanOptimize } from "@/lib/image-remote";
import { cn } from "@/lib/utils";

interface SeatMapImageCarouselProps {
  images: string[];
  onDelete?: (index: number) => void;
  className?: string;
  frameStyle?: "default" | "minimal" | "none";
  disableImageCache?: boolean;
}

export function SeatMapImageCarousel({
  images,
  onDelete,
  className,
  frameStyle = "default",
  disableImageCache = false,
}: SeatMapImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const cacheBustRef = useState(() => Date.now().toString())[0];
  const [retryKey, setRetryKey] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (images.length === 0) return;
    setCurrentIndex((prev) => Math.min(prev, images.length - 1));
  }, [images.length]);

  useEffect(() => {
    setRetryCount(0);
    setRetryKey(0);
  }, [currentIndex, images]);

  // Auto-loop when multiple images
  useEffect(() => {
    if (images.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((i) => (i >= images.length - 1 ? 0 : i + 1));
    }, 5000);
    return () => clearInterval(interval);
  }, [images.length]);

  if (images.length === 0) return null;

  const prev = () => {
    setCurrentIndex((i) => (i <= 0 ? images.length - 1 : i - 1));
  };
  const next = () => {
    setCurrentIndex((i) => (i >= images.length - 1 ? 0 : i + 1));
  };

  const currentSrc = images[currentIndex];
  const currentSrcWithCacheControl =
    disableImageCache && currentSrc
      ? `${currentSrc}${currentSrc.includes("?") ? "&" : "?"}cb=${cacheBustRef}-${retryKey}`
      : currentSrc;
  const hasMultiple = images.length > 1;

  const mainImageContent = (
    <div
      className={cn(
        "relative aspect-video max-h-[28rem] w-full overflow-hidden",
        frameStyle === "none"
          ? "rounded-md border-0 bg-transparent"
          : frameStyle === "minimal"
            ? "rounded-md border border-white/10 bg-transparent"
            : "rounded-lg border border-[var(--glass-border)] bg-white/5"
      )}
    >
      <Image
        src={currentSrcWithCacheControl}
        alt={`Seat map ${currentIndex + 1}`}
        fill
        priority={currentIndex === 0}
        unoptimized={disableImageCache || !remoteImageCanOptimize(currentSrc)}
        sizes="(max-width: 768px) 100vw, min(896px, 100vw)"
        className="object-contain"
        onError={() => {
          if (!disableImageCache) return;
          if (retryCount >= 3) return;
          setRetryCount((prev) => prev + 1);
          setTimeout(() => {
            setRetryKey((prev) => prev + 1);
          }, 300);
        }}
      />
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(currentIndex)}
          className="absolute top-2 right-2 h-8 w-8 rounded-full bg-red-500/90 text-white flex items-center justify-center hover:bg-red-500 z-10"
          aria-label="Remove image"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            aria-label="Previous image"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-black/50 text-foreground flex items-center justify-center hover:bg-black/70"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            aria-label="Next image"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-black/50 text-foreground flex items-center justify-center hover:bg-black/70"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}
    </div>
  );

  return (
    <div
      className={cn("relative", className)}
      role="group"
      aria-label="Seat map images carousel"
    >
      {onDelete ? (
        mainImageContent
      ) : (
        <PhotoProvider>
          <PhotoView src={currentSrcWithCacheControl}>
            <button
              type="button"
              className="block w-full cursor-zoom-in text-left"
              aria-label={`Open seat map image ${currentIndex + 1} in zoom view`}
            >
              {mainImageContent}
            </button>
          </PhotoView>
        </PhotoProvider>
      )}

      {hasMultiple && (
        <div className="flex gap-1.5 justify-center mt-3">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrentIndex(i)}
              aria-label={`Go to image ${i + 1}`}
              className={cn(
                "h-2 rounded-full transition-colors",
                i === currentIndex
                  ? "w-6 bg-[var(--wish-orange)]"
                  : "w-2 bg-white/30 hover:bg-white/50"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
