"use client";

import type { ComponentProps } from "react";
import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  memo,
} from "react";
import { cn, getContrastTextColor } from "@/lib/utils";
import { supabaseStorageDisplaySrc } from "@/lib/image-remote";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SeatStatus = "available" | "reserved" | "sold" | "hold";

export interface SeatInfo {
  id: string;
  row_label: string | null;
  seat_number: string | null;
  section_id: string | null;
  available: boolean;
  status?: SeatStatus;
  grid_x?: number | null;
  grid_y?: number | null;
}

export interface SectionInfo {
  id: string;
  name: string;
  section_code?: string | null;
  color?: string | null;
  column_direction?: string | null;
}

interface SeatSelectorProps {
  seats: SeatInfo[];
  selectedIds: Set<string>;
  onToggle: (seatId: string, available: boolean) => void;
  onAutoSelectSectionSeats?: (
    sectionId: string,
    quantity: number
  ) => boolean | Promise<boolean>;
  autoSelectResetSignal?: number;
  sections?: SectionInfo[];
  backgroundImage?: string | null;
  backgroundScale?: number;
  backgroundOpacity?: number;
  displayMode?: "auto" | "map" | "grid";
  className?: string;
}

const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 900;
const SEAT_SIZE = 20;
const CANVAS_BBOX_PADDING = 20;
const GAP = 4;

/** Logical grid coords from API (handles numeric strings). */
function logicalGridXY(seat: SeatInfo): { x: number; y: number } {
  const gx = Number(seat.grid_x);
  const gy = Number(seat.grid_y);
  return {
    x: Number.isFinite(gx) ? gx : 0,
    y: Number.isFinite(gy) ? gy : 0,
  };
}
/** Allow zoom-out far enough for wide native canvases to fit the viewport width. */
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 2;
/**
 * Subtract from scroll container width when computing fit-width zoom (breathing room vs frame).
 * Tuned between “too tight” (0) and “too much zoom out” (large inset + extra multiplier).
 */
const ZOOM_FIT_WIDTH_HORIZONTAL_INSET = 40;

/** Touch: second tap within this time/distance → same as “Fit width”. */
const FIT_WIDTH_DOUBLE_TAP_MS = 420;
const FIT_WIDTH_DOUBLE_TAP_MAX_DIST_PX = 48;

/** Layout metrics for setup-style canvas (shared by fit-width zoom and `SetupStyleCanvas`). */
function computeSetupStyleCanvasLayout(
  seats: SeatInfo[],
  imageNaturalSize: { w: number; h: number } | null,
  backgroundImage: string | null | undefined
) {
  const baseCanvasW =
    backgroundImage && imageNaturalSize
      ? Math.max(1, imageNaturalSize.w)
      : CANVAS_WIDTH;
  const baseCanvasH =
    backgroundImage && imageNaturalSize
      ? Math.max(1, imageNaturalSize.h)
      : CANVAS_HEIGHT;
  const uniformScale = 1;
  const seatPx = SEAT_SIZE * uniformScale;

  let minLeft = Infinity;
  let minTop = Infinity;
  let maxRight = 0;
  let maxBottom = 0;
  const seatLeftEdges: number[] = [];
  const seatRightEdges: number[] = [];
  for (const s of seats) {
    const { x, y } = logicalGridXY(s);
    const displayX = x * uniformScale;
    const displayY = y * uniformScale;
    seatLeftEdges.push(displayX);
    seatRightEdges.push(displayX + seatPx);
    minLeft = Math.min(minLeft, displayX);
    minTop = Math.min(minTop, displayY);
    maxRight = Math.max(maxRight, displayX + seatPx);
    maxBottom = Math.max(maxBottom, displayY + seatPx);
  }

  const minL = Number.isFinite(minLeft) ? minLeft : 0;
  const minT = Number.isFinite(minTop) ? minTop : 0;
  const originX = Math.min(0, minL);
  const originY = Math.min(0, minT);
  const spanX = maxRight - originX;
  const spanY = maxBottom - originY;

  const seatSpanW = Math.max(1, Math.ceil(spanX + CANVAS_BBOX_PADDING));
  const seatSpanH = Math.max(1, Math.ceil(spanY + CANVAS_BBOX_PADDING));
  /**
   * Buyer map mode should honor the uploaded seat-map image frame.
   * Outlier seat coordinates can otherwise explode canvas size and make fit-width tiny.
   */
  const imageBackedCanvas = Boolean(backgroundImage && imageNaturalSize);
  const canvasW = imageBackedCanvas ? baseCanvasW : Math.max(baseCanvasW, seatSpanW);
  const canvasH = imageBackedCanvas ? baseCanvasH : Math.max(baseCanvasH, seatSpanH);
  const fitSpanW = (() => {
    /**
     * Ignore extreme coordinate outliers when computing buyer "Fit width".
     * Some events include a few seats with stray grid_x values, which can inflate
     * full span and force the fit zoom to become a tiny thumbnail.
     */
    if (seatLeftEdges.length < 24 || seatRightEdges.length < 24) return seatSpanW;
    const leftSorted = [...seatLeftEdges].sort((a, b) => a - b);
    const rightSorted = [...seatRightEdges].sort((a, b) => a - b);
    const lowIdx = Math.floor(leftSorted.length * 0.02);
    const highIdx = Math.ceil(rightSorted.length * 0.98) - 1;
    const trimmedLeft = leftSorted[Math.max(0, Math.min(lowIdx, leftSorted.length - 1))] ?? minL;
    const trimmedRight = rightSorted[Math.max(0, Math.min(highIdx, rightSorted.length - 1))] ?? maxRight;
    const trimmedSpan = Math.max(1, Math.ceil((trimmedRight - trimmedLeft) + CANVAS_BBOX_PADDING));
    return trimmedSpan;
  })();
  /** Buyer fit-width baseline follows the visible image frame when available. */
  const fitBasisW = imageBackedCanvas ? baseCanvasW : (seats.length === 0 ? canvasW : fitSpanW);
  return {
    canvasW,
    canvasH,
    fitBasisW,
    baseCanvasW,
    baseCanvasH,
    originX,
    originY,
    uniformScale,
  };
}

/** Sort row labels: A–Z first, then AA–AZ, etc. */
function sortRowLabels(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a.localeCompare(b);
}

/** column_direction "right-to-left" reverses seat order within each row */
function seatsByRow(
  seats: SeatInfo[],
  columnDirection?: string | null
): [string, SeatInfo[]][] {
  const map = new Map<string, SeatInfo[]>();
  for (const s of seats) {
    const row = s.row_label ?? "?";
    if (!map.has(row)) map.set(row, []);
    map.get(row)!.push(s);
  }
  for (const arr of map.values()) {
    arr.sort(
      (a, b) =>
        parseInt(a.seat_number ?? "0", 10) - parseInt(b.seat_number ?? "0", 10)
    );
    if (columnDirection === "right-to-left") {
      arr.reverse();
    }
  }
  return Array.from(map.entries()).sort(([a], [b]) => sortRowLabels(a, b));
}

const DEFAULT_SECTION_COLOR = "#22c55e";
/** Reserved / sold seats (buyer map & grid) — dark gray, semi-transparent. */
const RESERVED_OR_SOLD_SEAT_BG = "rgba(255, 255, 255, 0.20)";
const RESERVED_OR_SOLD_SEAT_FG = "rgba(255, 255, 255, 0.50)";

function SeatButtonImpl({
  seat,
  selected,
  available,
  status,
  sectionColor,
  onToggle,
}: {
  seat: SeatInfo;
  selected: boolean;
  available: boolean;
  status: SeatStatus;
  sectionColor: string;
  onToggle: (seatId: string, available: boolean) => void;
}) {
  const disabled = !available && !selected;
  const baseColor = sectionColor || DEFAULT_SECTION_COLOR;
  const isUnclickable = status === "reserved" || status === "sold" || status === "hold";
  const alphaHex = status === "sold" ? "59" : "cc";

  let bgStyle: React.CSSProperties | undefined;
  if (selected) {
    const bg = "var(--wish-orange)";
    bgStyle = { backgroundColor: bg, color: getContrastTextColor("#f97316") };
  } else if (status === "reserved" || status === "sold") {
    bgStyle = {
      backgroundColor: RESERVED_OR_SOLD_SEAT_BG,
      color: RESERVED_OR_SOLD_SEAT_FG,
      cursor: "not-allowed",
    };
  } else if (status === "hold") {
    bgStyle = {
      backgroundColor: "#000000",
      color: "#ffffff",
      cursor: "not-allowed",
    };
  } else {
    const bg = `${baseColor}${alphaHex}`;
    bgStyle = {
      backgroundColor: bg,
      color: getContrastTextColor(bg),
    };
  }

  const label =
    `${seat.row_label ?? ""}${seat.seat_number ?? ""}` || seat.id.slice(0, 4);
  const statusTitle =
    status === "sold"
      ? "Sold"
      : status === "reserved"
        ? "Held — not available"
        : status === "hold"
          ? "Seat Hold — not available"
        : "Available";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => available && onToggle(seat.id, available)}
      className={cn(
        "w-full h-full rounded text-[10px] font-medium transition-all flex items-center justify-center",
        "focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-background select-none",
        selected && "ring-2 ring-offset-1 ring-[var(--wish-orange)] ring-offset-background",
        available && !selected && !isUnclickable && "hover:scale-105 hover:ring-2 hover:ring-white/30"
      )}
      style={bgStyle}
      title={`${label} — ${statusTitle}`}
    >
      {((seat.row_label ?? "") + (seat.seat_number ?? "")) || seat.id.slice(0, 4)}
    </button>
  );
}

function seatButtonPropsEqual(
  a: ComponentProps<typeof SeatButtonImpl>,
  b: ComponentProps<typeof SeatButtonImpl>
): boolean {
  return (
    a.seat.id === b.seat.id &&
    a.seat.row_label === b.seat.row_label &&
    a.seat.seat_number === b.seat.seat_number &&
    a.seat.available === b.seat.available &&
    a.seat.status === b.seat.status &&
    a.selected === b.selected &&
    a.available === b.available &&
    a.status === b.status &&
    a.sectionColor === b.sectionColor &&
    a.onToggle === b.onToggle
  );
}

const SeatButton = memo(SeatButtonImpl, seatButtonPropsEqual);
SeatButton.displayName = "SeatButton";

/** Fallback grid: row + column layout (no spatial positions) */
function RowColumnGrid({
  byRow,
  selectedIds,
  sectionColorMap,
  onToggle,
}: {
  byRow: [string, SeatInfo[]][];
  selectedIds: Set<string>;
  sectionColorMap: Map<string, string>;
  onToggle: (seatId: string, available: boolean) => void;
}) {
  return (
    <div className="space-y-2" style={{ gap: GAP }}>
      {byRow.map(([row, rowSeats]) => (
        <div key={row} className="flex gap-1 items-center flex-wrap">
          <span className="text-foreground-muted w-6 text-sm shrink-0">{row}</span>
          <div className="flex gap-1 flex-wrap">
            {rowSeats.map((seat) => {
              const selected = selectedIds.has(seat.id);
              const status =
                (seat.status as SeatStatus) ??
                (seat.available ? "available" : "sold");
              const available = seat.available ?? status === "available";
              const sectionColor =
                sectionColorMap.get(seat.section_id ?? "") ?? DEFAULT_SECTION_COLOR;
              return (
                <div
                  key={seat.id}
                  className="w-9 h-9"
                  style={{ contentVisibility: "auto" }}
                >
                  <SeatButton
                    seat={seat}
                    selected={selected}
                    available={available}
                    status={status}
                    sectionColor={sectionColor}
                    onToggle={onToggle}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Setup-style layout: native resolution image, seats overlaid. Same as admin. */
function SetupStyleCanvas({
  seats,
  selectedIds,
  sectionColorMap,
  onToggle,
  backgroundImage,
  /** Same-origin buffered fetch for Supabase (see `/api/image-proxy`); avoids broken `<img>` on flaky CDN chunked responses. */
  backgroundImageSrc,
  backgroundOpacity = 0.5,
  zoom,
  imageNaturalSize,
}: {
  seats: SeatInfo[];
  selectedIds: Set<string>;
  sectionColorMap: Map<string, string>;
  onToggle: (seatId: string, available: boolean) => void;
  backgroundImage: string | null | undefined;
  backgroundImageSrc: string | null | undefined;
  backgroundOpacity: number;
  zoom: number;
  imageNaturalSize: { w: number; h: number } | null;
}) {
  const [bgHidden, setBgHidden] = useState(false);
  const bgSrc = backgroundImageSrc ?? backgroundImage ?? "";

  useEffect(() => {
    setBgHidden(false);
  }, [bgSrc]);

  const { canvasW, canvasH, baseCanvasW, baseCanvasH, originX, originY, uniformScale } =
    computeSetupStyleCanvasLayout(seats, imageNaturalSize, backgroundImage);

  return (
    <div
      style={{
        width: canvasW * zoom,
        height: canvasH * zoom,
        minWidth: canvasW * zoom,
        minHeight: canvasH * zoom,
        marginLeft: "auto",
        marginRight: "auto",
      }}
    >
      <div
        className="relative"
        style={{
          width: canvasW,
          height: canvasH,
          transform: `scale(${zoom})`,
          transformOrigin: "top left",
        }}
      >
        {/* Background image: base aspect box only so extra canvas area (multi-section) does not stretch the image */}
        {backgroundImage && !bgHidden && (
          <div
            className="absolute overflow-hidden"
            style={{
              zIndex: 0,
              pointerEvents: "none",
              left: -originX,
              top: -originY,
              width: baseCanvasW,
              height: baseCanvasH,
            }}
            aria-hidden
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bgSrc}
              alt=""
              draggable={false}
              onError={() => setBgHidden(true)}
              className={imageNaturalSize ? "select-none" : "w-full h-full object-contain select-none"}
              style={{
                opacity: backgroundOpacity,
                ...(imageNaturalSize
                  ? { width: baseCanvasW, height: baseCanvasH }
                  : { width: "100%", height: "100%" }),
                pointerEvents: "none",
                userSelect: "none",
              }}
            />
          </div>
        )}

        {/* Seats: keep logical coords stable; zoom comes from parent transform */}
        <div className="absolute inset-0" style={{ zIndex: 2 }}>
          {seats.map((seat) => {
            const { x, y } = logicalGridXY(seat);
            const displayX = x * uniformScale;
            const displayY = y * uniformScale;
            const selected = selectedIds.has(seat.id);
            const status =
              (seat.status as SeatStatus) ??
              (seat.available ? "available" : "sold");
            const available = seat.available ?? status === "available";
            const sectionColor =
              sectionColorMap.get(seat.section_id ?? "") ?? DEFAULT_SECTION_COLOR;

            return (
              <div
                key={seat.id}
                className="absolute"
                style={{
                  left: displayX - originX,
                  top: displayY - originY,
                  width: SEAT_SIZE * uniformScale,
                  height: SEAT_SIZE * uniformScale,
                  contentVisibility: "auto",
                }}
              >
                <SeatButton
                  seat={seat}
                  selected={selected}
                  available={available}
                  status={status}
                  sectionColor={sectionColor}
                  onToggle={onToggle}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SeatSelector({
  seats,
  selectedIds,
  onToggle,
  onAutoSelectSectionSeats,
  autoSelectResetSignal = 0,
  sections,
  backgroundImage,
  backgroundOpacity = 0.5,
  displayMode = "auto",
  className,
}: SeatSelectorProps) {
  const hasGridPositions = useMemo(() => {
    if (seats.length === 0) return false;
    return seats.every((s) => {
      const gx = Number(s.grid_x);
      const gy = Number(s.grid_y);
      return Number.isFinite(gx) && Number.isFinite(gy);
    });
  }, [seats]);

  const groupedBySection = useMemo(() => {
    if (!sections?.length) return null;
    const bySection = new Map<string, SeatInfo[]>();
    for (const s of seats) {
      const sid = s.section_id ?? "__unsectioned__";
      if (!bySection.has(sid)) bySection.set(sid, []);
      bySection.get(sid)!.push(s);
    }
    const ordered: { section: SectionInfo; seats: SeatInfo[] }[] = [];
    for (const sec of sections) {
      const sectionSeats = bySection.get(sec.id);
      if (sectionSeats?.length) {
        ordered.push({ section: sec, seats: sectionSeats });
      }
    }
    return ordered;
  }, [seats, sections]);

  const byRow = useMemo(() => seatsByRow(seats), [seats]);

  const sectionColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const sec of sections ?? []) {
      if (sec.color) map.set(sec.id, sec.color);
    }
    return map;
  }, [sections]);

  /** Supabase canvases → `/api/image-proxy` (buffers body; tolerant of sign/ URLs). Raw URL unchanged for other hosts. */
  const seatMapBackgroundDisplaySrc = useMemo(() => {
    const raw = backgroundImage?.trim();
    if (!raw) return null;
    const viaProxy = supabaseStorageDisplaySrc(raw);
    const picked = viaProxy && viaProxy.trim() !== "" ? viaProxy : raw;
    if (!picked.startsWith("/api/image-proxy")) return picked;
    try {
      const sp = new URL(picked, "http://wish.local");
      if (!sp.searchParams.get("url")?.trim()) {
        return raw;
      }
    } catch {
      return raw;
    }
    return picked;
  }, [backgroundImage]);

  const [zoom, setZoom] = useState(1);
  const [quickPickSectionId, setQuickPickSectionId] = useState("");
  const [quickPickQuantity, setQuickPickQuantity] = useState("");
  const [isAutoSelecting, setIsAutoSelecting] = useState(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  /** Dynamic zoom-out floor: never allow zoom below the current fit-width value. */
  const [fitWidthMinZoom, setFitWidthMinZoom] = useState(MIN_ZOOM);
  const fitWidthMinZoomRef = useRef(fitWidthMinZoom);
  fitWidthMinZoomRef.current = fitWidthMinZoom;
  /** Locked floor from the latest explicit "Fit width" click. */
  const fitWidthLockedFloorRef = useRef<number | null>(null);
  const effectiveMinZoom = Math.max(MIN_ZOOM, fitWidthMinZoom);
  const computeLiveFitWidthMinZoom = useCallback(() => {
    const el = scrollContainerRef.current;
    const layout = setupStyleLayoutRef.current;
    if (!el || !layout) return Math.max(MIN_ZOOM, fitWidthMinZoomRef.current);
    const basisW = Math.max(1, layout.fitBasisW);
    const available = Math.max(1, el.clientWidth - ZOOM_FIT_WIDTH_HORIZONTAL_INSET);
    const raw = available / basisW;
    const nextFloor =
      Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, raw)) * 10000) / 10000;
    return Math.max(MIN_ZOOM, nextFloor);
  }, []);

  /** Optional anchor for zoom-to-point: viewport coords inside the scroll container + zoom ratio. */
  const zoomAnchorRef = useRef<{
    vx: number;
    vy: number;
    z0: number;
    z1: number;
  } | null>(null);

  const [imageNaturalSize, setImageNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasPanRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
    hasMoved: boolean;
    lastX: number;
    lastY: number;
    lastT: number;
    velocityX: number;
    velocityY: number;
    active: boolean;
  } | null>(null);
  const suppressNextClickRef = useRef(false);
  const touchDoubleTapForFitRef = useRef<{
    t: number;
    x: number;
    y: number;
  } | null>(null);
  const momentumAnimationRef = useRef<number | null>(null);
  const activeTouchPointsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<{ startDistance: number; startZoom: number } | null>(null);
  /** After user uses +/- zoom, skip auto fit until layout size changes or they click Fit width. */
  const userAdjustedZoomRef = useRef(false);
  const setupStyleLayoutRef = useRef<ReturnType<typeof computeSetupStyleCanvasLayout> | null>(null);

  const useSetupStyle = useMemo(() => {
    if (displayMode === "grid") return false;
    if (!hasGridPositions) return false;
    if (backgroundImage) return true;
    return seats.some((s) => {
      const { x, y } = logicalGridXY(s);
      return x > 0 || y > 0;
    });
  }, [displayMode, hasGridPositions, backgroundImage, seats]);

  const startPan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!useSetupStyle) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    if (momentumAnimationRef.current != null) {
      window.cancelAnimationFrame(momentumAnimationRef.current);
      momentumAnimationRef.current = null;
    }
    const now = performance.now();
    canvasPanRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startScrollLeft: el.scrollLeft,
      startScrollTop: el.scrollTop,
      hasMoved: false,
      lastX: e.clientX,
      lastY: e.clientY,
      lastT: now,
      velocityX: 0,
      velocityY: 0,
      active: false,
    };
  }, [useSetupStyle]);

  const movePan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const pan = canvasPanRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;
    if (!useSetupStyle) return;
    if (activeTouchPointsRef.current.size >= 2) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const dx = pan.startX - e.clientX;
    const dy = pan.startY - e.clientY;
    const now = performance.now();
    const dt = Math.max(1, now - pan.lastT);
    const deltaX = e.clientX - pan.lastX;
    const deltaY = e.clientY - pan.lastY;
    pan.velocityX = deltaX / dt;
    pan.velocityY = deltaY / dt;
    pan.lastX = e.clientX;
    pan.lastY = e.clientY;
    pan.lastT = now;
    if (!pan.hasMoved && Math.hypot(dx, dy) >= 8) {
      pan.hasMoved = true;
      suppressNextClickRef.current = true;
      pan.active = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (pan.active) {
      e.preventDefault();
      el.scrollLeft = pan.startScrollLeft + dx;
      el.scrollTop = pan.startScrollTop + dy;
    }
  }, [useSetupStyle]);

  const endPan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const pan = canvasPanRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;
    if (pan.active) {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    }
    if (pan.active && pan.hasMoved) {
      const el = scrollContainerRef.current;
      if (el) {
        // Convert pointer velocity into scroll velocity with easing decay.
        let vx = -pan.velocityX * 18;
        let vy = -pan.velocityY * 18;
        const friction = 0.92;
        const minSpeed = 0.08;
        const step = () => {
          if (!scrollContainerRef.current) {
            momentumAnimationRef.current = null;
            return;
          }
          const node = scrollContainerRef.current;
          node.scrollLeft += vx;
          node.scrollTop += vy;
          vx *= friction;
          vy *= friction;
          if (Math.abs(vx) < minSpeed && Math.abs(vy) < minSpeed) {
            momentumAnimationRef.current = null;
            return;
          }
          momentumAnimationRef.current = window.requestAnimationFrame(step);
        };
        if (Math.abs(vx) >= minSpeed || Math.abs(vy) >= minSpeed) {
          momentumAnimationRef.current = window.requestAnimationFrame(step);
        }
      }
    }
    canvasPanRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (momentumAnimationRef.current != null) {
        window.cancelAnimationFrame(momentumAnimationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!seatMapBackgroundDisplaySrc) {
      setImageNaturalSize(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        setImageNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      }
    };
    img.onerror = () => setImageNaturalSize(null);
    img.src = seatMapBackgroundDisplaySrc;
  }, [seatMapBackgroundDisplaySrc]);

  const setupStyleLayout = useMemo(() => {
    if (!useSetupStyle) return null;
    return computeSetupStyleCanvasLayout(seats, imageNaturalSize, backgroundImage);
  }, [useSetupStyle, seats, imageNaturalSize, backgroundImage]);

  setupStyleLayoutRef.current = setupStyleLayout;

  const setupStyleLayoutKey = useMemo(() => {
    if (!setupStyleLayout) return null;
    return `${setupStyleLayout.canvasW}x${setupStyleLayout.canvasH}`;
  }, [setupStyleLayout]);

  /** Center horizontal scroll when content is wider than the viewport (fit-width UX). */
  const centerHorizontalScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    if (maxScrollLeft > 0) {
      el.scrollLeft = maxScrollLeft / 2;
    }
  }, []);

  const applyFitWidthZoom = useCallback((): number | null => {
    const el = scrollContainerRef.current;
    const layout = setupStyleLayoutRef.current;
    if (!el || !layout) return null;
    const basisW = Math.max(1, layout.fitBasisW);
    const available = Math.max(
      1,
      el.clientWidth - ZOOM_FIT_WIDTH_HORIZONTAL_INSET
    );
    const raw = available / basisW;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, raw));
    const rounded = Math.round(next * 10000) / 10000;
    setFitWidthMinZoom(rounded);
    setZoom((prev) => (Math.abs(prev - rounded) < 0.00001 ? prev : rounded));
    return rounded;
  }, []);

  const handleFitWidth = useCallback(() => {
    userAdjustedZoomRef.current = false;
    const applied = applyFitWidthZoom();
    if (applied != null) {
      fitWidthLockedFloorRef.current = applied;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => centerHorizontalScroll());
    });
  }, [applyFitWidthZoom, centerHorizontalScroll]);

  const endPanWithTouchDoubleTap = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const pan = canvasPanRef.current;
      const didDragCanvas = Boolean(pan?.hasMoved && pan.active);
      endPan(e);
      if (!useSetupStyle || e.pointerType !== "touch") return;
      if (didDragCanvas) {
        touchDoubleTapForFitRef.current = null;
        return;
      }
      if (activeTouchPointsRef.current.size > 0) return;
      if (pinchStateRef.current) {
        touchDoubleTapForFitRef.current = null;
        return;
      }
      const now = Date.now();
      const { clientX, clientY } = e;
      const last = touchDoubleTapForFitRef.current;
      if (
        last &&
        now - last.t <= FIT_WIDTH_DOUBLE_TAP_MS &&
        Math.hypot(clientX - last.x, clientY - last.y) <=
          FIT_WIDTH_DOUBLE_TAP_MAX_DIST_PX
      ) {
        touchDoubleTapForFitRef.current = null;
        handleFitWidth();
        return;
      }
      touchDoubleTapForFitRef.current = { t: now, x: clientX, y: clientY };
      window.setTimeout(() => {
        if (touchDoubleTapForFitRef.current?.t === now) {
          touchDoubleTapForFitRef.current = null;
        }
      }, FIT_WIDTH_DOUBLE_TAP_MS + 50);
    },
    [endPan, useSetupStyle, handleFitWidth]
  );

  const handleCanvasDoubleClickFitWidth = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!useSetupStyle) return;
      e.preventDefault();
      handleFitWidth();
    },
    [useSetupStyle, handleFitWidth]
  );

  const prevLayoutKeyForFitRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!setupStyleLayoutKey) return;
    if (prevLayoutKeyForFitRef.current !== setupStyleLayoutKey) {
      prevLayoutKeyForFitRef.current = setupStyleLayoutKey;
      userAdjustedZoomRef.current = false;
    }
    if (userAdjustedZoomRef.current) return;

    const el = scrollContainerRef.current;
    if (!el) return;
    const run = () => {
      applyFitWidthZoom();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => centerHorizontalScroll());
      });
    };
    run();
    const t = window.setTimeout(run, 120);
    return () => window.clearTimeout(t);
  }, [setupStyleLayoutKey, applyFitWidthZoom, centerHorizontalScroll]);

  /** Apply scroll correction after zoom so the point (vx, vy) stays under the cursor/focus. */
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    if (!anchor) return;
    zoomAnchorRef.current = null;
    const el = scrollContainerRef.current;
    if (!el || anchor.z0 <= 0 || !Number.isFinite(anchor.z1)) return;
    const ratio = anchor.z1 / anchor.z0;
    const nextLeft = (el.scrollLeft + anchor.vx) * ratio - anchor.vx;
    const nextTop = (el.scrollTop + anchor.vy) * ratio - anchor.vy;
    const maxL = Math.max(0, el.scrollWidth - el.clientWidth);
    const maxT = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollLeft = Math.min(maxL, Math.max(0, nextLeft));
    el.scrollTop = Math.min(maxT, Math.max(0, nextTop));
  }, [zoom]);

  const zoomIn = useCallback(() => {
    userAdjustedZoomRef.current = true;
    const el = scrollContainerRef.current;
    const z0 = zoomRef.current;
    const z1 = Math.min(MAX_ZOOM, z0 + 0.05);
    if (el && Math.abs(z1 - z0) > 1e-6) {
      zoomAnchorRef.current = {
        vx: el.clientWidth / 2,
        vy: el.clientHeight / 2,
        z0,
        z1,
      };
    }
    setZoom(z1);
  }, []);
  const zoomOut = useCallback(() => {
    userAdjustedZoomRef.current = true;
    const el = scrollContainerRef.current;
    const z0 = zoomRef.current;
    const minZoomFloor = Math.max(
      computeLiveFitWidthMinZoom(),
      fitWidthLockedFloorRef.current ?? MIN_ZOOM
    );
    const z1 = Math.max(minZoomFloor, z0 - 0.05);
    if (el && Math.abs(z1 - z0) > 1e-6) {
      zoomAnchorRef.current = {
        vx: el.clientWidth / 2,
        vy: el.clientHeight / 2,
        z0,
        z1,
      };
    }
    setZoom(z1);
  }, [computeLiveFitWidthMinZoom]);

  const handleWheelZoom = useCallback(
    (e: WheelEvent) => {
      if (!useSetupStyle) return;
      e.preventDefault();
      userAdjustedZoomRef.current = true;
      const el = scrollContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vx = e.clientX - rect.left;
      const vy = e.clientY - rect.top;
      const z0 = zoomRef.current;
      const delta = -e.deltaY;
      const step = Math.min(0.2, Math.max(0.02, Math.abs(delta) / 1200));
      const minZoomFloor = Math.max(
        computeLiveFitWidthMinZoom(),
        fitWidthLockedFloorRef.current ?? MIN_ZOOM
      );
      const next =
        delta > 0
          ? Math.min(MAX_ZOOM, z0 + step)
          : Math.max(minZoomFloor, z0 - step);
      if (Math.abs(next - z0) < 1e-8) return;
      zoomAnchorRef.current = { vx, vy, z0, z1: next };
      setZoom(next);
    },
    [useSetupStyle, computeLiveFitWidthMinZoom]
  );

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node || !useSetupStyle) return;
    node.addEventListener("wheel", handleWheelZoom, { passive: false });
    return () => {
      node.removeEventListener("wheel", handleWheelZoom);
    };
  }, [handleWheelZoom, useSetupStyle]);

  const handlePointerDownForPinch = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!useSetupStyle || e.pointerType !== "touch") return;
      activeTouchPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeTouchPointsRef.current.size === 2) {
        const pts = Array.from(activeTouchPointsRef.current.values());
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        pinchStateRef.current = {
          startDistance: Math.hypot(dx, dy),
          startZoom: zoom,
        };
        userAdjustedZoomRef.current = true;
      }
    },
    [useSetupStyle, zoom]
  );

  const handlePointerMoveForPinch = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!useSetupStyle || e.pointerType !== "touch") return;
      if (!activeTouchPointsRef.current.has(e.pointerId)) return;
      activeTouchPointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pinch = pinchStateRef.current;
      if (!pinch || activeTouchPointsRef.current.size < 2) return;
      const el = scrollContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pts = Array.from(activeTouchPointsRef.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const distance = Math.hypot(dx, dy);
      if (pinch.startDistance <= 0) return;
      const z0 = zoomRef.current;
      const raw = pinch.startZoom * (distance / pinch.startDistance);
      const minZoomFloor = Math.max(
        computeLiveFitWidthMinZoom(),
        fitWidthLockedFloorRef.current ?? MIN_ZOOM
      );
      const next = Math.min(MAX_ZOOM, Math.max(minZoomFloor, raw));
      if (Math.abs(next - z0) < 1e-8) return;
      const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
      const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
      zoomAnchorRef.current = { vx: midX, vy: midY, z0, z1: next };
      setZoom(next);
    },
    [useSetupStyle, computeLiveFitWidthMinZoom]
  );

  const clearPointerForPinch = useCallback((pointerId: number) => {
    activeTouchPointsRef.current.delete(pointerId);
    if (activeTouchPointsRef.current.size < 2) {
      pinchStateRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!useSetupStyle) return;
    const updateFitFloorOnResize = () => {
      const el = scrollContainerRef.current;
      const layout = setupStyleLayoutRef.current;
      if (!el || !layout) return;
      const basisW = Math.max(1, layout.fitBasisW);
      const available = Math.max(1, el.clientWidth - ZOOM_FIT_WIDTH_HORIZONTAL_INSET);
      const raw = available / basisW;
      const nextFloor = Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, raw)) * 10000) / 10000;
      setFitWidthMinZoom(nextFloor);
      if (zoomRef.current < nextFloor) {
        setZoom(nextFloor);
      }
    };
    updateFitFloorOnResize();
    window.addEventListener("resize", updateFitFloorOnResize);
    return () => {
      window.removeEventListener("resize", updateFitFloorOnResize);
    };
  }, [useSetupStyle, setupStyleLayoutKey]);

  useEffect(() => {
    if (!useSetupStyle) return;
    const minZoomFloor = Math.max(
      computeLiveFitWidthMinZoom(),
      fitWidthLockedFloorRef.current ?? MIN_ZOOM
    );
    setZoom((prev) => (prev < minZoomFloor ? minZoomFloor : prev));
  }, [useSetupStyle, effectiveMinZoom, computeLiveFitWidthMinZoom]);

  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const stableSeatToggle = useCallback((seatId: string, available: boolean) => {
    onToggleRef.current(seatId, available);
  }, []);

  const quickPickSections = useMemo(() => {
    return (sections ?? []).filter((section) => {
      return seats.some((seat) => seat.section_id === section.id);
    });
  }, [sections, seats]);

  const quantityOptions = useMemo(() => {
    return Array.from({ length: 10 }, (_, index) => String(index + 1));
  }, []);

  const canAutoSelect =
    !isAutoSelecting &&
    quickPickSectionId.trim().length > 0 &&
    quickPickQuantity.trim().length > 0 &&
    typeof onAutoSelectSectionSeats === "function";

  const handleAutoSelect = useCallback(async () => {
    if (!canAutoSelect || !onAutoSelectSectionSeats) return;
    const parsedQuantity = Number(quickPickQuantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 10) return;
    setIsAutoSelecting(true);
    try {
      const succeeded = await onAutoSelectSectionSeats(quickPickSectionId, parsedQuantity);
      if (succeeded) {
        setQuickPickSectionId("");
        setQuickPickQuantity("");
      }
    } finally {
      setIsAutoSelecting(false);
    }
  }, [canAutoSelect, onAutoSelectSectionSeats, quickPickQuantity, quickPickSectionId]);

  useEffect(() => {
    setQuickPickSectionId("");
    setQuickPickQuantity("");
  }, [autoSelectResetSignal]);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="relative">
        {useSetupStyle && quickPickSections.length > 0 ? (
          <div className="mb-3 rounded-lg border border-[var(--glass-border)] bg-white/[0.03] p-3">
            <h4 className="mb-2 text-sm font-medium text-foreground">Quick Seat Selection</h4>
            <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-2 sm:flex sm:flex-nowrap sm:items-center">
              <Select value={quickPickSectionId} onValueChange={setQuickPickSectionId}>
                <SelectTrigger className="h-8 min-w-0 border-[var(--glass-border)] bg-white/[0.03] text-foreground sm:flex-1">
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  {quickPickSections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.name || section.section_code || section.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={quickPickQuantity} onValueChange={setQuickPickQuantity}>
                <SelectTrigger className="h-8 w-full border-[var(--glass-border)] bg-white/[0.03] text-foreground sm:w-[7rem] sm:shrink-0">
                  <SelectValue placeholder="Quantity" />
                </SelectTrigger>
                <SelectContent>
                  {quantityOptions.map((quantity) => (
                    <SelectItem key={quantity} value={quantity}>
                      {quantity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="col-span-2 h-8 w-full px-3 border border-[var(--glass-border)] bg-white/[0.03] text-foreground hover:bg-white/[0.08] sm:col-span-1 sm:w-auto sm:shrink-0"
                disabled={!canAutoSelect}
                onClick={() => void handleAutoSelect()}
              >
                {isAutoSelecting ? "Adding..." : "Add to Selection"}
              </Button>
            </div>
          </div>
        ) : null}

        <div
          ref={scrollContainerRef}
          className="seat-selector-scroll relative overflow-auto rounded-lg border border-[var(--glass-border)] bg-white/[0.00] max-h-[520px] cursor-default"
          onPointerDownCapture={handlePointerDownForPinch}
          onPointerMoveCapture={handlePointerMoveForPinch}
          onPointerUpCapture={(e) => clearPointerForPinch(e.pointerId)}
          onPointerCancelCapture={(e) => clearPointerForPinch(e.pointerId)}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={endPanWithTouchDoubleTap}
          onPointerCancel={endPan}
          onDoubleClick={handleCanvasDoubleClickFitWidth}
          onClickCapture={(e) => {
            if (suppressNextClickRef.current) {
              e.preventDefault();
              e.stopPropagation();
              suppressNextClickRef.current = false;
            }
          }}
          style={useSetupStyle ? { touchAction: "none" } : undefined}
        >
          {useSetupStyle ? (
            <SetupStyleCanvas
              seats={seats}
              selectedIds={selectedIds}
              sectionColorMap={sectionColorMap}
              onToggle={stableSeatToggle}
              backgroundImage={backgroundImage ?? null}
              backgroundImageSrc={seatMapBackgroundDisplaySrc}
              backgroundOpacity={backgroundOpacity}
              zoom={zoom}
              imageNaturalSize={imageNaturalSize}
            />
          ) : groupedBySection?.length ? (
            <div className="p-4 space-y-4">
              {groupedBySection.map(({ section, seats: sectionSeats }) => (
                <div key={section.id}>
                  <h3 className="text-sm font-medium text-foreground-muted mb-2">
                    {section.name || section.section_code}
                  </h3>
                  <RowColumnGrid
                    byRow={seatsByRow(sectionSeats, section.column_direction)}
                    selectedIds={selectedIds}
                    sectionColorMap={sectionColorMap}
                    onToggle={stableSeatToggle}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <RowColumnGrid
                byRow={byRow}
                selectedIds={selectedIds}
                sectionColorMap={sectionColorMap}
                onToggle={stableSeatToggle}
              />
            </div>
          )}
        </div>
        {useSetupStyle && (
          <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
            <div className="max-w-full text-xs sm:text-sm text-foreground-muted leading-snug">
              <span className="font-medium text-foreground/90">Legend:</span>{" "}
              Section color = available · Dark Gray = reserved / Sold · Black = Tech Hold
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-foreground-muted">Zoom:</span>
              <div className="flex items-center gap-1 rounded-md border border-[var(--glass-border)] bg-white/[0.03] p-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={zoomOut}
                  disabled={
                    zoom <=
                    Math.max(
                      computeLiveFitWidthMinZoom(),
                      fitWidthLockedFloorRef.current ?? MIN_ZOOM
                    )
                  }
                  className="h-8 w-8 p-0 border-[var(--glass-border)]"
                  title="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={zoomIn}
                  disabled={zoom >= MAX_ZOOM}
                  className="h-8 w-8 p-0 border-[var(--glass-border)]"
                  title="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleFitWidth}
                className="h-8 px-3 border border-[var(--glass-border)] bg-white/[0.03] text-foreground hover:bg-white/[0.08]"
                title="Fit seat plan to the width of the frame"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Fit width
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
