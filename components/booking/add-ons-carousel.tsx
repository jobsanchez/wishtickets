"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabaseStorageDisplaySrc } from "@/lib/image-remote";
import { cn } from "@/lib/utils";

export type AddOnCatalogItem = {
  id: string;
  title: string;
  image_url: string;
  price_cents: number;
  stock_quantity: number;
  /** Max units per cart for this add-on (server also enforces stock). */
  max_qty_per_cart: number;
  sold_out: boolean;
};

function displaySrc(url: string): string {
  if (!url) return "";
  if (url.startsWith("/") || url.includes("localhost")) return url;
  return supabaseStorageDisplaySrc(url) || url;
}

function formatAddOnBuyerPrice(cents: number): string {
  if (cents <= 0) return "Free";
  return (cents / 100).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
}

export function AddOnsCarousel({
  addOns,
  quantityById,
  onQuantityChange,
  canAddWithoutTickets = false,
}: {
  addOns: AddOnCatalogItem[];
  quantityById: Record<string, number>;
  onQuantityChange: (addOnId: string, quantity: number, maxStock: number) => void;
  canAddWithoutTickets?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startLeft: number;
    moved: boolean;
  } | null>(null);
  const autoScrollPausedRef = useRef(false);
  const autoScrollResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fullscreen, setFullscreen] = useState<AddOnCatalogItem | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set());

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const scrollStepPx = 280;

  const scrollLoopBy = useCallback(
    (delta: number) => {
      const c = scrollRef.current;
      if (!c) return;
      const max = Math.max(0, c.scrollWidth - c.clientWidth);
      if (max <= 1) return;
      const behavior = prefersReducedMotion ? ("auto" as const) : ("smooth" as const);
      const sl = c.scrollLeft;
      const atStart = sl <= 2;
      const atEnd = sl >= max - 2;
      if (delta < 0) {
        if (atStart) {
          c.scrollTo({ left: max, behavior });
        } else {
          c.scrollBy({ left: delta, behavior });
        }
      } else {
        if (atEnd) {
          c.scrollTo({ left: 0, behavior });
        } else {
          c.scrollBy({ left: delta, behavior });
        }
      }
    },
    [prefersReducedMotion]
  );

  const pauseAutoScrollFor = useCallback((ms: number) => {
    autoScrollPausedRef.current = true;
    if (autoScrollResumeTimerRef.current) {
      clearTimeout(autoScrollResumeTimerRef.current);
    }
    autoScrollResumeTimerRef.current = setTimeout(() => {
      autoScrollPausedRef.current = false;
      autoScrollResumeTimerRef.current = null;
    }, ms);
  }, []);

  useEffect(() => {
    if (!expanded || prefersReducedMotion) return;
    const id = window.setInterval(() => {
      if (autoScrollPausedRef.current) return;
      scrollLoopBy(scrollStepPx);
    }, 4500);
    return () => clearInterval(id);
  }, [expanded, prefersReducedMotion, scrollLoopBy, scrollStepPx, addOns.length]);

  useEffect(() => {
    return () => {
      if (autoScrollResumeTimerRef.current) {
        clearTimeout(autoScrollResumeTimerRef.current);
        autoScrollResumeTimerRef.current = null;
      }
    };
  }, []);

  const setCardVisible = useCallback((id: string, isVis: boolean) => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (isVis) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const onTrackPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const c = scrollRef.current;
    if (!c) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, input, textarea, select, a, [role='button']")) return;
    pauseAutoScrollFor(5000);
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startLeft: c.scrollLeft,
      moved: false,
    };
    c.setPointerCapture(e.pointerId);
  }, [pauseAutoScrollFor]);

  const onTrackPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const c = scrollRef.current;
    const state = dragStateRef.current;
    if (!c || !state || state.pointerId !== e.pointerId) return;
    const dx = e.clientX - state.startX;
    if (Math.abs(dx) > 2) state.moved = true;
    c.scrollLeft = state.startLeft - dx;
  }, []);

  const onTrackPointerEnd = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const c = scrollRef.current;
    const state = dragStateRef.current;
    if (!c || !state || state.pointerId !== e.pointerId) return;
    c.releasePointerCapture(e.pointerId);
    dragStateRef.current = null;
    pauseAutoScrollFor(3500);
  }, [pauseAutoScrollFor]);

  if (addOns.length === 0) return null;

  return (
    <>
      <div className="glass-light rounded-xl border border-[var(--glass-border)] overflow-hidden">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-3 border-b border-[var(--glass-border)] px-4 py-3 text-left outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--wish-orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse add-ons section" : "Expand add-ons section"}
          onClick={() => setExpanded((prev) => !prev)}
        >
          <div className="min-w-0 pr-1">
            <h2 className="text-base font-semibold leading-snug text-foreground sm:text-lg">
              Limited event merch, made to be remembered
            </h2>
            <p className="text-sm text-foreground-muted">
              Optional merchandise — add-ons require at least one ticket in your cart.
            </p>
          </div>
          <ChevronDown
            className={cn(
              "mt-0.5 h-5 w-5 shrink-0 text-foreground-muted transition-transform duration-200",
              expanded ? "rotate-180" : "rotate-0"
            )}
            aria-hidden
          />
        </button>
        {expanded ? (
          <div className="flex items-center gap-2 px-2 pb-2 pt-1 sm:px-3 sm:pb-3 sm:pt-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 self-center rounded-full bg-black/50 text-white hover:bg-black/70"
              aria-label="Scroll add-ons left (loops)"
              onClick={() => {
                pauseAutoScrollFor(4000);
                scrollLoopBy(-scrollStepPx);
              }}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div
              ref={scrollRef}
              className="flex min-w-0 flex-1 gap-4 overflow-x-auto py-3 touch-pan-x scrollbar-thin cursor-grab active:cursor-grabbing"
              style={{ scrollBehavior: prefersReducedMotion ? "auto" : "smooth" }}
              onMouseEnter={() => {
                autoScrollPausedRef.current = true;
                if (autoScrollResumeTimerRef.current) {
                  clearTimeout(autoScrollResumeTimerRef.current);
                  autoScrollResumeTimerRef.current = null;
                }
              }}
              onMouseLeave={() => {
                autoScrollPausedRef.current = false;
              }}
              onPointerDown={onTrackPointerDown}
              onPointerMove={onTrackPointerMove}
              onPointerUp={onTrackPointerEnd}
              onPointerCancel={onTrackPointerEnd}
              onPointerLeave={onTrackPointerEnd}
            >
              {addOns.map((item) => {
                const qty = quantityById[item.id] ?? 0;
                const soldOut = item.sold_out || item.stock_quantity <= 0;
                const loadImage = visibleIds.has(item.id) || !item.image_url;
                return (
                  <AddOnSlide
                    key={item.id}
                    item={item}
                    qty={qty}
                    soldOut={soldOut}
                    canIncrease={canAddWithoutTickets || qty > 0}
                    loadImage={loadImage}
                    onVisible={(vis) => setCardVisible(item.id, vis)}
                    onImageClick={() => setFullscreen(item)}
                    onQuantityChange={onQuantityChange}
                  />
                );
              })}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 self-center rounded-full bg-black/50 text-white hover:bg-black/70"
              aria-label="Scroll add-ons right (loops)"
              onClick={() => {
                pauseAutoScrollFor(4000);
                scrollLoopBy(scrollStepPx);
              }}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog open={!!fullscreen} onOpenChange={(o) => !o && setFullscreen(null)}>
        <DialogContent
          hideClose
          className="max-w-[min(100vw-2rem,900px)] border-[var(--glass-border)] bg-black/90 p-0 gap-0"
        >
          <DialogTitle className="sr-only">
            {fullscreen?.title ?? "Add-on preview"}
          </DialogTitle>
          {fullscreen?.image_url ? (
            <div className="relative aspect-square w-full max-h-[85vh]">
              <Image
                src={displaySrc(fullscreen.image_url)}
                alt={fullscreen.title}
                fill
                className="object-contain"
                sizes="900px"
                unoptimized={displaySrc(fullscreen.image_url).startsWith("http")}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 rounded-full bg-black/60 text-white"
                onClick={() => setFullscreen(null)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddOnSlide({
  item,
  qty,
  soldOut,
  canIncrease,
  loadImage,
  onVisible,
  onImageClick,
  onQuantityChange,
}: {
  item: AddOnCatalogItem;
  qty: number;
  soldOut: boolean;
  canIncrease: boolean;
  loadImage: boolean;
  onVisible: (visible: boolean) => void;
  onImageClick: () => void;
  onQuantityChange: (addOnId: string, quantity: number, maxStock: number) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => onVisible(!!e?.isIntersecting),
      { threshold: 0.12, rootMargin: "80px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [onVisible]);

  const maxPurchasable = Math.max(
    0,
    Math.min(Math.floor(item.stock_quantity), Math.max(1, item.max_qty_per_cart ?? 10))
  );

  return (
    <div
      ref={cardRef}
      className={cn(
        "flex w-[220px] shrink-0 flex-col rounded-lg border border-[var(--glass-border)] bg-white/[0.04] overflow-hidden"
      )}
    >
      <button
        type="button"
        className="relative aspect-square w-full bg-black/30 outline-none focus-visible:ring-2 focus-visible:ring-[var(--wish-orange)]"
        onClick={onImageClick}
        disabled={!item.image_url}
      >
        {soldOut ? (
          <span className="absolute left-2 top-2 z-[1] rounded bg-red-600/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Sold out
          </span>
        ) : null}
        {item.image_url && loadImage ? (
          <Image
            src={displaySrc(item.image_url)}
            alt=""
            fill
            className="object-cover"
            sizes="220px"
            loading="lazy"
            unoptimized={displaySrc(item.image_url).startsWith("http")}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-foreground-muted px-2">
            No image
          </div>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="text-sm font-medium text-foreground line-clamp-2 leading-tight">
          {item.title.trim() || "Untitled"}
        </p>
        <p className="text-sm font-semibold text-[var(--wish-orange)]">
          {formatAddOnBuyerPrice(item.price_cents)}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--glass-border)] pt-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={soldOut || qty <= 0}
            aria-label="Decrease quantity"
            onClick={() => onQuantityChange(item.id, qty - 1, maxPurchasable)}
          >
            −
          </Button>
          <span className="text-sm tabular-nums text-foreground">{qty}</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={soldOut || qty >= maxPurchasable || !canIncrease}
            aria-label="Increase quantity"
            onClick={() => onQuantityChange(item.id, qty + 1, maxPurchasable)}
          >
            +
          </Button>
        </div>
      </div>
    </div>
  );
}
