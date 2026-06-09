"use client";

import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type CSSProperties,
  type MutableRefObject,
  type MouseEvent,
} from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/providers/theme-provider";
import { cn, getContrastTextColor } from "@/lib/utils";

export type SeatStatus = "available" | "reserved" | "sold" | "hold";

/** Reserved / sold seats (buyer grid) — dark gray, semi-transparent. */
const RESERVED_OR_SOLD_SEAT_BG = "rgba(69, 69, 69, 0.42)";
const RESERVED_OR_SOLD_SEAT_FG = "rgba(255, 255, 255, 0.92)";

export interface SeatInfo {
  id: string;
  row_label: string | null;
  seat_number: string | null;
  section_id: string | null;
  available: boolean;
  status?: SeatStatus;
}

export interface SectionInfo {
  id: string;
  name: string;
  section_code?: string | null;
  color?: string | null;
  section_group?: string | null;
}

interface SeatMapProps {
  seats: SeatInfo[];
  selectedIds: Set<string>;
  onToggle: (seatId: string, available: boolean) => void;
  sections?: SectionInfo[];
  className?: string;
  /** Collapsible section headers (default: true when multiple sections) */
  collapsible?: boolean;
  /** Max height for section content, enables scroll (e.g. "24rem", 480) */
  sectionMaxHeight?: string | number;
  /** When set, enables legacy marquee (immediate drag; addToExisting = Ctrl/Cmd). */
  onSelectMultiple?: (seatIds: string[], addToExisting: boolean) => void;
  /**
   * Manual-distribution style: drag after ~5px toggles each seat in the box; clicks still toggle.
   * When set, legacy `onSelectMultiple` marquee is disabled (Ctrl/Cmd union no longer applies).
   */
  onMarqueeToggle?: (seatIds: string[]) => void;
  /** Shift+click range: union-add available seats (pair with `onMarqueeToggle`). */
  onShiftRangeSelect?: (seatIds: string[]) => void;
  /** Override the helper text below the seat grid */
  helperText?: string;
  /** When true, section cards start collapsed (default: false) */
  defaultCollapsed?: boolean;
  /** When set, shows “All available” and “Clear” per section (`selectAll`: true = select all available, false = clear section selection). */
  onSectionSelectionToggle?: (sectionId: string, selectAll: boolean) => void;
  /** Optional row-level action renderer (e.g. add seat in row). */
  renderRowActions?: (args: { sectionId: string; rowLabel: string }) => ReactNode;
}

/** Sort row labels: A–Z first, then AA–AZ, BA–BZ, etc. */
function sortRowLabels(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a.localeCompare(b);
}

function seatsByRow(seats: SeatInfo[]): [string, SeatInfo[]][] {
  const map = new Map<string, SeatInfo[]>();
  for (const s of seats) {
    const row = s.row_label ?? "?";
    if (!map.has(row)) map.set(row, []);
    map.get(row)!.push(s);
  }
  for (const arr of map.values()) {
    arr.sort(
      (a, b) =>
        parseInt(a.seat_number ?? "0", 10) -
        parseInt(b.seat_number ?? "0", 10)
    );
  }
  return Array.from(map.entries()).sort(([a], [b]) => sortRowLabels(a, b));
}

const DEFAULT_SECTION_COLOR = "#22c55e";

/** Same threshold as manual distribution free-standing picker (~5px). */
const MARQUEE_COMMIT_PX_SQ = 25;

function normalizeHexColor(color?: string | null): string | null {
  if (!color) return null;
  const c = color.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(c) || /^#[0-9a-fA-F]{6}$/.test(c)) {
    return c;
  }
  return null;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "transparent";
  const raw = normalized.slice(1);
  const expanded =
    raw.length === 3 ? raw.split("").map((ch) => `${ch}${ch}`).join("") : raw;
  const n = Number.parseInt(expanded, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getSectionCardStyle(color?: string | null): CSSProperties | undefined {
  const hex = normalizeHexColor(color);
  if (!hex) return undefined;
  return {
    borderColor: hex,
    backgroundColor: hexToRgba(hex, 0.14),
  };
}

/** Normalize #RGB / #RRGGBB / #RRGGBBAA to lowercase #rrggbb for comparisons. */
function canonicalSectionHexForGrouping(color?: string | null): string | null {
  const n = normalizeHexColor(color);
  if (n) return n.toLowerCase();
  if (!color) return null;
  const c = color.trim();
  if (/^#[0-9a-fA-F]{8}$/.test(c)) {
    return `#${c.slice(1, 7).toLowerCase()}`;
  }
  return null;
}

/**
 * If every section in the group has the same configured color, return that #rrggbb (lowercase).
 * Otherwise null (mixed or missing colors → leave group header uncolored).
 */
function getUnifiedGroupSectionColor(items: { section: SectionInfo }[]): string | null {
  if (items.length === 0) return null;
  let unified: string | null = null;
  for (const { section } of items) {
    const hex = canonicalSectionHexForGrouping(section.color);
    if (!hex) return null;
    if (unified === null) unified = hex;
    else if (unified !== hex) return null;
  }
  return unified;
}

/**
 * Theme canvas (`--background` in globals.css) blended with section tint — matches visible chip.
 */
const THEME_BASE_RGB = {
  dark: { r: 13, g: 10, b: 18 },
  light: { r: 248, g: 247, b: 250 },
} as const;

const GROUP_TINT_ALPHA = 0.14;

function parseHexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHexColor(hex);
  if (!n) return null;
  const raw = n.slice(1);
  const expanded =
    raw.length === 3 ? raw.split("").map((ch) => `${ch}${ch}`).join("") : raw.slice(0, 6);
  const num = Number.parseInt(expanded, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

/** Foreground for colored group bar: contrast vs 14% section color on theme background. */
function groupHeaderForegroundOnTint(
  sectionHex: string,
  theme: "light" | "dark"
): string {
  const sec = parseHexToRgb(sectionHex);
  const base = THEME_BASE_RGB[theme];
  if (!sec) {
    return theme === "dark" ? "rgba(250,250,250,0.96)" : "rgba(17,24,39,0.94)";
  }
  const a = GROUP_TINT_ALPHA;
  const r = sec.r * a + base.r * (1 - a);
  const g = sec.g * a + base.g * (1 - a);
  const b = sec.b * a + base.b * (1 - a);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "rgba(17,24,39,0.94)" : "rgba(250,250,250,0.96)";
}

function flatOrderedSeatIds(byRow: [string, SeatInfo[]][]): string[] {
  const ids: string[] = [];
  for (const [, rowSeats] of byRow) {
    for (const s of rowSeats) ids.push(s.id);
  }
  return ids;
}

function SeatGrid({
  byRow,
  selectedIds,
  onToggle,
  sectionColorMap,
  suppressNextClickRef,
  onSeatClick,
  sectionId,
  renderRowActions,
}: {
  byRow: [string, SeatInfo[]][];
  selectedIds: Set<string>;
  onToggle: (seatId: string, available: boolean) => void;
  sectionColorMap: Map<string, string>;
  suppressNextClickRef?: MutableRefObject<boolean>;
  onSeatClick?: (e: MouseEvent<HTMLButtonElement>, seat: SeatInfo) => void;
  sectionId?: string;
  renderRowActions?: (args: { sectionId: string; rowLabel: string }) => ReactNode;
}) {
  return (
    <div className="space-y-2">
      {byRow.map(([row, rowSeats]) => (
        <div key={row} className="flex flex-wrap gap-2 items-center">
          <span className="text-foreground-muted w-8 text-sm">{row}</span>
          {sectionId && renderRowActions ? (
            <div className="shrink-0">
              {renderRowActions({ sectionId, rowLabel: row })}
            </div>
          ) : null}
          <div className="flex gap-1 flex-wrap">
            {rowSeats.map((seat) => {
              const selected = selectedIds.has(seat.id);
              const status = seat.status ?? (seat.available ? "available" : "sold");
              const available = seat.available ?? status === "available";
              const disabled = !available && !selected;
              const sectionColor =
                sectionColorMap.get(seat.section_id ?? "") ?? DEFAULT_SECTION_COLOR;
              const alphaHex = status === "sold" ? "59" : "cc";
              let style: React.CSSProperties | undefined;
              if (selected) {
                const bg = "var(--wish-orange)";
                style = { backgroundColor: bg, color: getContrastTextColor("#f97316") };
              } else if (status === "reserved" || status === "sold") {
                style = {
                  backgroundColor: RESERVED_OR_SOLD_SEAT_BG,
                  color: RESERVED_OR_SOLD_SEAT_FG,
                  cursor: "not-allowed",
                };
              } else if (status === "hold") {
                style = {
                  backgroundColor: "#000000",
                  color: "#ffffff",
                  cursor: "not-allowed",
                };
              } else {
                const bg = `${sectionColor}${alphaHex}`;
                style = {
                  backgroundColor: bg,
                  color: getContrastTextColor(bg),
                  borderColor: `${sectionColor}80`,
                };
              }
              const label =
                `${seat.row_label ?? ""}${seat.seat_number ?? ""}` ||
                seat.id.slice(0, 4);
              const statusTitle =
                status === "sold"
                  ? "Sold"
                  : status === "reserved"
                    ? "Held — not available"
                    : status === "hold"
                      ? "Seat Hold — not available"
                    : "Available";
              const handleBtnClick = (e: MouseEvent<HTMLButtonElement>) => {
                if (suppressNextClickRef?.current) {
                  suppressNextClickRef.current = false;
                  return;
                }
                if (onSeatClick) {
                  onSeatClick(e, seat);
                } else if (available) {
                  onToggle(seat.id, available);
                }
              };
              return (
                <button
                  key={seat.id}
                  type="button"
                  disabled={disabled}
                  data-seat-id={seat.id}
                  onClick={handleBtnClick}
                  className={cn(
                    "w-8 h-8 rounded text-xs font-medium transition-colors border",
                    selected &&
                      "ring-2 ring-offset-2 ring-[var(--wish-orange)] ring-offset-background",
                    available && !selected && status !== "reserved" && status !== "sold" && status !== "hold" &&
                      "hover:opacity-90"
                  )}
                  style={style}
                  title={`${label} — ${statusTitle}`}
                >
                  {((seat.row_label ?? "") + (seat.seat_number ?? "")) || seat.id.slice(0, 4)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SeatMap({
  seats,
  selectedIds,
  onToggle,
  sections,
  className,
  collapsible = true,
  sectionMaxHeight = 480,
  onSelectMultiple,
  onMarqueeToggle,
  onShiftRangeSelect,
  helperText: helperTextProp,
  defaultCollapsed = false,
  onSectionSelectionToggle,
  renderRowActions,
}: SeatMapProps) {
  const { theme } = useTheme();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(() => new Set());
  const hasInitializedDefault = useRef(false);
  const hasInitializedGroupDefault = useRef(false);
  useEffect(() => {
    if (defaultCollapsed && sections?.length && !hasInitializedDefault.current) {
      hasInitializedDefault.current = true;
      setCollapsedIds(new Set(sections.map((s) => s.id)));
    }
  }, [defaultCollapsed, sections]);
  const [selectRect, setSelectRect] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const marqueeSurfaceRef = useRef<HTMLDivElement>(null);
  const addToSelectionRef = useRef(false);
  const captureTargetRef = useRef<HTMLElement | null>(null);
  const suppressMarqueeClickRef = useRef(false);
  const anchorSeatIdBySectionRef = useRef<Map<string, string>>(new Map());

  const seatsById = useMemo(() => {
    const m = new Map<string, SeatInfo>();
    for (const s of seats) m.set(s.id, s);
    return m;
  }, [seats]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onSelectMultiple || onMarqueeToggle) return;
      e.preventDefault();
      e.stopPropagation();
      addToSelectionRef.current = e.ctrlKey || e.metaKey;
      captureTargetRef.current = e.target as HTMLElement;
      captureTargetRef.current.setPointerCapture?.(e.pointerId);
      setSelectRect({
        startX: e.clientX,
        startY: e.clientY,
        endX: e.clientX,
        endY: e.clientY,
      });
    },
    [onSelectMultiple, onMarqueeToggle]
  );

  const handleDistributionPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!onMarqueeToggle) return;
      if (e.button !== 0) return;
      const root = marqueeSurfaceRef.current;
      if (!root?.contains(e.target as Node)) return;

      const pointerId = e.pointerId;
      const startX = e.clientX;
      const startY = e.clientY;
      let committed = false;
      let endX = startX;
      let endY = startY;
      let finished = false;

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!committed) {
          if (dx * dx + dy * dy < MARQUEE_COMMIT_PX_SQ) return;
          committed = true;
          root.setPointerCapture?.(pointerId);
        }
        endX = ev.clientX;
        endY = ev.clientY;
        setSelectRect({ startX, startY, endX, endY });
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        if (finished) return;
        finished = true;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        try {
          root.releasePointerCapture?.(pointerId);
        } catch {
          /* ignore */
        }

        setSelectRect(null);

        if (!committed) return;

        const minX = Math.min(startX, endX);
        const maxX = Math.max(startX, endX);
        const minY = Math.min(startY, endY);
        const maxY = Math.max(startY, endY);
        const w = maxX - minX;
        const h = maxY - minY;
        if (w < 2 && h < 2) return;

        suppressMarqueeClickRef.current = true;

        const seatEls = root.querySelectorAll<HTMLElement>("[data-seat-id]");
        const ids: string[] = [];
        for (const el of seatEls) {
          const seatId = el.getAttribute("data-seat-id");
          if (!seatId) continue;
          const seat = seatsById.get(seatId);
          if (!seat?.available) continue;
          const rect = el.getBoundingClientRect();
          if (
            rect.right >= minX &&
            rect.left <= maxX &&
            rect.bottom >= minY &&
            rect.top <= maxY
          ) {
            ids.push(seatId);
          }
        }
        queueMicrotask(() => {
          onMarqueeToggle(ids);
        });
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [onMarqueeToggle, seatsById]
  );

  const handleDistributionSeatClick = useCallback(
    (sectionKey: string, orderedIds: string[]) =>
      (ev: MouseEvent<HTMLButtonElement>, seat: SeatInfo) => {
        if (!onMarqueeToggle) return;
        const available =
          seat.available ?? (seat.status ?? "available") === "available";
        if (!available) return;

        if (
          ev.shiftKey &&
          anchorSeatIdBySectionRef.current.has(sectionKey) &&
          onShiftRangeSelect
        ) {
          const anchorId = anchorSeatIdBySectionRef.current.get(sectionKey)!;
          const ia = orderedIds.indexOf(anchorId);
          const ib = orderedIds.indexOf(seat.id);
          if (ia >= 0 && ib >= 0) {
            const lo = Math.min(ia, ib);
            const hi = Math.max(ia, ib);
            const rangeIds: string[] = [];
            for (let i = lo; i <= hi; i++) {
              const id = orderedIds[i];
              const s = seatsById.get(id);
              if (s?.available) rangeIds.push(id);
            }
            onShiftRangeSelect(rangeIds);
          }
          anchorSeatIdBySectionRef.current.set(sectionKey, seat.id);
          return;
        }

        onToggle(seat.id, available);
        anchorSeatIdBySectionRef.current.set(sectionKey, seat.id);
      },
    [onMarqueeToggle, onShiftRangeSelect, onToggle, seatsById]
  );

  useEffect(() => {
    if (!selectRect || !onSelectMultiple || onMarqueeToggle) return;
    const onMove = (e: PointerEvent) => {
      setSelectRect((prev) =>
        prev ? { ...prev, endX: e.clientX, endY: e.clientY } : null
      );
    };
    const onUp = (e: PointerEvent) => {
      captureTargetRef.current?.releasePointerCapture?.(e.pointerId);
      captureTargetRef.current = null;
      setSelectRect((prev) => {
        if (!prev) return null;
        const minX = Math.min(prev.startX, prev.endX);
        const maxX = Math.max(prev.startX, prev.endX);
        const minY = Math.min(prev.startY, prev.endY);
        const maxY = Math.max(prev.startY, prev.endY);
        const w = maxX - minX;
        const h = maxY - minY;
        if (w < 2 && h < 2) return null;
        const container = containerRef.current;
        if (!container) return null;
        const seatEls = container.querySelectorAll<HTMLElement>("[data-seat-id]");
        const ids: string[] = [];
        for (const el of seatEls) {
          const seatId = el.getAttribute("data-seat-id");
          if (!seatId) continue;
          const seat = seatsById.get(seatId);
          if (!seat?.available) continue;
          const rect = el.getBoundingClientRect();
          if (
            rect.right >= minX &&
            rect.left <= maxX &&
            rect.bottom >= minY &&
            rect.top <= maxY
          ) {
            ids.push(seatId);
          }
        }
        // Defer to avoid "Cannot update a component while rendering a different component"
        queueMicrotask(() => {
          onSelectMultiple(ids, addToSelectionRef.current);
        });
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp as EventListener);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [selectRect, onSelectMultiple, onMarqueeToggle, seatsById]);

  const toggleSection = (sectionId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

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
        bySection.delete(sec.id);
      }
    }
    for (const [sid, sectionSeats] of bySection) {
      if (sid !== "__unsectioned__") {
        ordered.push({
          section: { id: sid, name: sid, section_code: null },
          seats: sectionSeats,
        });
      } else if (sectionSeats.length > 0) {
        ordered.push({
          section: { id: "__unsectioned__", name: "Other", section_code: null },
          seats: sectionSeats,
        });
      }
    }
    return ordered;
  }, [seats, sections]);
  const groupedSectionBlocks = useMemo(() => {
    if (!groupedBySection?.length) return null;
    const blocks = new Map<
      string,
      {
        key: string;
        label: string;
        items: { section: SectionInfo; seats: SeatInfo[] }[];
      }
    >();
    for (const item of groupedBySection) {
      const rawGroup = (item.section.section_group ?? "").trim();
      const key = rawGroup ? rawGroup.toLowerCase() : "__ungrouped__";
      if (!blocks.has(key)) {
        blocks.set(key, {
          key,
          label: rawGroup || "Ungrouped",
          items: [],
        });
      }
      blocks.get(key)!.items.push(item);
    }
    return Array.from(blocks.values());
  }, [groupedBySection]);

  useEffect(() => {
    if (!groupedSectionBlocks?.length || hasInitializedGroupDefault.current) return;
    hasInitializedGroupDefault.current = true;
    const keys = groupedSectionBlocks.map((g) => g.key);
    // Single "Ungrouped" bucket has no group header (see showGroupHeading). Collapsing it
    // would hide all seats with no way to expand — e.g. Seat Configurator for one section.
    if (keys.length === 1 && keys[0] === "__ungrouped__") {
      setCollapsedGroupKeys(new Set());
      return;
    }
    setCollapsedGroupKeys(new Set(keys));
  }, [groupedSectionBlocks]);

  const toggleGroupCollapsed = useCallback((groupKey: string) => {
    setCollapsedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  const byRowFlat = useMemo(() => seatsByRow(seats), [seats]);

  const sectionColorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const sec of sections ?? []) {
      if (sec.color && /^#[0-9a-fA-F]{3,8}$/.test(sec.color)) {
        m.set(sec.id, sec.color);
      }
    }
    return m;
  }, [sections]);

  const scrollStyle =
    sectionMaxHeight != null
      ? {
          maxHeight:
            typeof sectionMaxHeight === "number"
              ? `${sectionMaxHeight}px`
              : sectionMaxHeight,
          overflowY: "auto" as const,
        }
      : undefined;

  const helperText =
    helperTextProp ??
    (onMarqueeToggle
      ? "Click seats to toggle selection. Shift+click for a range. Drag ~5px+ on the map to marquee — each available seat in the box toggles."
      : onSelectMultiple
        ? "Click seats to select. Drag to select multiple seats."
        : "");

  const legacyMarquee = Boolean(onSelectMultiple && !onMarqueeToggle);
  const outerClass =
    legacyMarquee || onMarqueeToggle ? "relative" : undefined;
  const marqueeSurfaceClass = onMarqueeToggle ? "select-none" : undefined;
  const marqueeStyle = useMemo(() => {
    if (!selectRect) return null;
    const host = marqueeSurfaceRef.current ?? containerRef.current;
    if (!host) return null;
    const hostRect = host.getBoundingClientRect();
    return {
      left:
        Math.min(selectRect.startX, selectRect.endX) -
        hostRect.left +
        host.scrollLeft,
      top:
        Math.min(selectRect.startY, selectRect.endY) -
        hostRect.top +
        host.scrollTop,
      width: Math.abs(selectRect.endX - selectRect.startX),
      height: Math.abs(selectRect.endY - selectRect.startY),
    };
  }, [selectRect]);

  return (
    <div className={cn("space-y-4", className)}>
      {helperText ? (
        <p className="text-sm text-foreground-muted">{helperText}</p>
      ) : null}
      <div
        ref={containerRef}
        className={cn(outerClass, legacyMarquee && "select-none")}
        onPointerDownCapture={legacyMarquee ? handlePointerDown : undefined}
      >
        <div
          ref={marqueeSurfaceRef}
          className={marqueeSurfaceClass}
          onPointerDown={onMarqueeToggle ? handleDistributionPointerDown : undefined}
        >
        {groupedBySection?.length ? (
        <div className="space-y-4">
          {(groupedSectionBlocks ?? []).map((group) => {
            const showGroupHeading =
              (groupedSectionBlocks?.length ?? 0) > 1 || group.key !== "__ungrouped__";
            const isGroupCollapsed = collapsedGroupKeys.has(group.key);
            const groupUnifiedColor = getUnifiedGroupSectionColor(group.items);
            const groupHeaderStyle = groupUnifiedColor
              ? {
                  ...getSectionCardStyle(groupUnifiedColor),
                  color: groupHeaderForegroundOnTint(groupUnifiedColor, theme),
                }
              : undefined;
            return (
              <div key={group.key} className="space-y-3">
                {showGroupHeading ? (
                  <button
                    type="button"
                    onClick={() => toggleGroupCollapsed(group.key)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide",
                      groupUnifiedColor
                        ? "border border-transparent hover:brightness-110"
                        : "text-foreground-muted hover:bg-white/[0.03]"
                    )}
                    style={groupHeaderStyle}
                  >
                    {isGroupCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-90" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-90" />
                    )}
                    <span>{group.label}</span>
                  </button>
                ) : null}
                {!isGroupCollapsed &&
                  group.items.map(({ section, seats: sectionSeats }) => {
            const isCollapsed = collapsible && collapsedIds.has(section.id);
            const availableSeatIds = sectionSeats
              .filter((s) => s.available ?? (s.status ?? "available") === "available")
              .map((s) => s.id);
            const hasSelectionInSection = sectionSeats.some((s) =>
              selectedIds.has(s.id)
            );
            const byRow = seatsByRow(sectionSeats);
            const orderedIds = flatOrderedSeatIds(byRow);
            const sectionCardStyle = getSectionCardStyle(section.color);
            return (
              <div
                key={section.id}
                className="rounded-lg border border-[var(--glass-border)] bg-white/[0.02] overflow-hidden"
                style={sectionCardStyle}
              >
                <div className="flex items-center gap-2 p-4">
                  <button
                    type="button"
                    onClick={() => collapsible && toggleSection(section.id)}
                    className={cn(
                      "flex items-center gap-2 text-left flex-1 min-w-0",
                      collapsible && "hover:bg-white/[0.02]"
                    )}
                  >
                    {collapsible && (
                      <span className="text-foreground-muted shrink-0">
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </span>
                    )}
                    <h3 className="text-sm font-medium text-foreground-muted truncate">
                      {section.name || section.section_code}
                    </h3>
                  </button>
                  {onSectionSelectionToggle && availableSeatIds.length > 0 && (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs shrink-0 border-[var(--glass-border)]"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSectionSelectionToggle(section.id, true);
                        }}
                      >
                        All available
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSectionSelectionToggle(section.id, false);
                        }}
                        disabled={!hasSelectionInSection}
                      >
                        Clear
                      </Button>
                    </div>
                  )}
                </div>
                {!isCollapsed && (
                  <div
                    className="px-4 pb-4 pt-0"
                    style={scrollStyle}
                  >
                    <SeatGrid
                      byRow={byRow}
                      selectedIds={selectedIds}
                      onToggle={onToggle}
                      sectionColorMap={sectionColorMap}
                      sectionId={section.id}
                      renderRowActions={renderRowActions}
                      suppressNextClickRef={
                        onMarqueeToggle ? suppressMarqueeClickRef : undefined
                      }
                      onSeatClick={
                        onMarqueeToggle
                          ? handleDistributionSeatClick(section.id, orderedIds)
                          : undefined
                      }
                    />
                  </div>
                )}
              </div>
            );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="rounded-lg border border-[var(--glass-border)] p-4 bg-white/[0.02]"
          style={scrollStyle}
        >
          <SeatGrid
            byRow={byRowFlat}
            selectedIds={selectedIds}
            onToggle={onToggle}
            sectionColorMap={sectionColorMap}
            suppressNextClickRef={
              onMarqueeToggle ? suppressMarqueeClickRef : undefined
            }
            onSeatClick={
              onMarqueeToggle
                ? handleDistributionSeatClick("__flat__", flatOrderedSeatIds(byRowFlat))
                : undefined
            }
          />
        </div>
      )}
        </div>
        {selectRect && marqueeStyle && (
          <div
            className="absolute border-2 border-[var(--wish-orange)] bg-[var(--wish-orange)]/20 pointer-events-none z-50"
            style={marqueeStyle}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
