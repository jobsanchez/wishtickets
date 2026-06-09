"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { toast } from "@/lib/toast";
import { Upload, Save, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Square, Undo2, LayoutGrid, AlignHorizontalSpaceBetween, AlignVerticalSpaceBetween, ZoomIn, ZoomOut, RotateCcw, Lock, LockOpen, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { getContrastTextColor } from "@/lib/utils";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  useDraggable,
} from "@dnd-kit/core";

const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 900;
const SEAT_SIZE = 20;

interface Section {
  id: string;
  name: string;
  section_code: string | null;
  seating_type?: string;
  color?: string | null;
  seat_layout_image_url?: string | null;
  seat_layout_scale?: number;
  seat_layout_opacity?: number;
  seat_layout_canvas_id?: string | null;
  column_direction?: string | null;
}

interface Seat {
  id: string;
  event_section_id: string;
  row_label: string;
  seat_number: string;
  grid_x: number | null;
  grid_y: number | null;
}

interface LayoutConfig {
  imageUrl: string | null;
  scale: number;
  opacity: number;
}

interface CanvasInfo {
  id: string;
  event_id: string;
  image_url: string | null;
  scale: number;
  opacity: number;
  sort_order: number;
  sectionIds: string[];
}

interface SeatSelectorSetupProps {
  eventId: string;
  venueId: string;
}

/** Sort row labels like Seat Configurator: A, B, ..., Z, AA, AB, ... */
function sortRowLabels(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a.localeCompare(b);
}

/** Sort seat numbers numerically when possible, else lexicographically */
function sortSeatNumbers(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.localeCompare(b);
}

function autoPlaceSeats(
  seats: Seat[],
  sections: Section[],
  options?: { forceChronological?: boolean }
): Map<string, { x: number; y: number }> {
  const forceChronological = options?.forceChronological ?? false;
  const assignedSections = sections.filter(
    (s) => s.seating_type !== "free" && s.seating_type !== "standing"
  );
  const positions = new Map<string, { x: number; y: number }>();
  const step = SEAT_SIZE + 4;
  const sectionGap = step;
  let sectionStartY = 20;

  for (const sec of assignedSections) {
    const secSeats = seats.filter((s) => s.event_section_id === sec.id);

    const byRow = new Map<string, Seat[]>();
    for (const seat of secSeats) {
      const row = String(seat.row_label ?? "").trim();
      if (!byRow.has(row)) byRow.set(row, []);
      byRow.get(row)!.push(seat);
    }
    const rows = Array.from(byRow.keys()).sort(sortRowLabels);
    for (const row of rows) {
      byRow.get(row)!.sort((a, b) => sortSeatNumbers(String(a.seat_number), String(b.seat_number)));
    }

    let secY = sectionStartY;
    const secX = 20;

    const isRightToLeft = sec.column_direction === "right-to-left";
    for (const rowLabel of rows) {
      let rowSeats = byRow.get(rowLabel)!;
      if (isRightToLeft) rowSeats = [...rowSeats].reverse();
      for (let colIdx = 0; colIdx < rowSeats.length; colIdx++) {
        const seat = rowSeats[colIdx];
        const useSaved = !forceChronological && seat.grid_x != null && seat.grid_y != null;
        if (useSaved) {
          positions.set(seat.id, { x: seat.grid_x!, y: seat.grid_y! });
        } else {
          const x = secX + colIdx * step;
          const y = secY;
          positions.set(seat.id, { x, y });
        }
      }
      secY += step;
    }

    sectionStartY = secY + sectionGap;
  }

  return positions;
}

const DEFAULT_SECTION_COLOR = "#0d9488";

function SeatChip({
  seat,
  position,
  size = SEAT_SIZE,
  isDragging,
  isSelected,
  sectionColor = DEFAULT_SECTION_COLOR,
  disabled = false,
  onSelect,
}: {
  seat: Seat;
  position: { x: number; y: number };
  size?: number;
  isDragging?: boolean;
  isSelected?: boolean;
  sectionColor?: string;
  disabled?: boolean;
  onSelect: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: seat.id,
    data: { seat },
    disabled,
  });

  const bgColor = sectionColor;
  const borderColor = `${sectionColor}cc`;
  const textColor = getContrastTextColor(isDragging ? `${bgColor}e6` : disabled ? `${bgColor}99` : `${bgColor}cc`);

  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : { ...listeners, ...attributes })}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e);
      }}
      style={{
        position: "absolute",
        left: position.x,
        top: position.y,
        width: size,
        height: size,
        zIndex: isDragging ? 50 : isSelected ? 10 : 2,
        backgroundColor: isDragging ? `${bgColor}e6` : disabled ? `${bgColor}99` : `${bgColor}cc`,
        borderColor: isSelected ? "var(--wish-orange)" : borderColor,
        color: textColor,
        opacity: disabled ? 0.85 : 1,
        ...(transform && { transform: `translate(${transform.x}px, ${transform.y}px)` }),
      }}
      className={`
        flex items-center justify-center text-[10px] font-medium rounded border select-none
        ${disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing"}
        ${isSelected && !isDragging ? "ring-2 ring-[var(--wish-orange)] ring-offset-1 ring-offset-background" : ""}
      `}
      title={`${seat.row_label}${seat.seat_number}${disabled ? " (locked)" : ""}`}
    >
      {seat.row_label}{seat.seat_number}
    </div>
  );
}

export function SeatSelectorSetup({ eventId }: SeatSelectorSetupProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [eventLayout, setEventLayout] = useState<LayoutConfig>({
    imageUrl: null,
    scale: 1,
    opacity: 0.5,
  });
  const [sectionLayouts, setSectionLayouts] = useState<Map<string, LayoutConfig>>(new Map());
  const [canvasLayouts, setCanvasLayouts] = useState<Map<string, LayoutConfig>>(new Map());
  const [sectionZooms, setSectionZooms] = useState<Map<string, number>>(new Map());
  const [sectionDragEnabled, setSectionDragEnabled] = useState<Map<string, boolean>>(new Map());
  const [sectionImageSizes, setSectionImageSizes] = useState<Map<string, { w: number; h: number } | null>>(new Map());
  const [canvasImageSizes, setCanvasImageSizes] = useState<Map<string, { w: number; h: number } | null>>(new Map());
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [positionsHistory, setPositionsHistory] = useState<Map<string, { x: number; y: number }>[]>([]);
  const [sectionLocked, setSectionLocked] = useState<Map<string, boolean>>(new Map());
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(new Set());
  const [canvases, setCanvases] = useState<CanvasInfo[]>([]);
  const [expandedCanvasIds, setExpandedCanvasIds] = useState<Set<string>>(new Set());
  const [canvasDeleting, setCanvasDeleting] = useState<string | null>(null);
  const [isDraggingCanvasBySection, setIsDraggingCanvasBySection] = useState<Map<string, boolean>>(new Map());
  const canvasDragRefBySection = useRef<Map<string, { startX: number; startY: number; startScrollLeft: number; startScrollTop: number }>>(new Map());

  const pushPositionHistory = useCallback(() => {
    setPositionsHistory((prev) => {
      const clone = new Map<string, { x: number; y: number }>();
      positions.forEach((v, k) => clone.set(k, { ...v }));
      const next = [...prev, clone];
      return next.slice(-30);
    });
  }, [positions]);

  const PAN_STEP = 16;
  const ZOOM_STEP = 0.05;

  const scrollContainerRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const setSectionZoom = useCallback((sectionId: string, zoom: number) => {
    setSectionZooms((prev) => {
      const next = new Map(prev);
      next.set(sectionId, Math.max(0.5, Math.min(2, zoom)));
      return next;
    });
  }, []);

  const handleCanvasPan = useCallback((sectionId: string, dx: number, dy: number) => {
    scrollContainerRefs.current.get(sectionId)?.scrollBy({ left: dx, top: dy, behavior: "smooth" });
  }, []);

  const handleCanvasDragPointerDown = useCallback(
    (sectionId: string, e: React.PointerEvent) => {
      if (sectionDragEnabled.get(sectionId) !== true) return;
      e.preventDefault();
      e.stopPropagation();
      const el = scrollContainerRefs.current.get(sectionId);
      if (!el) return;
      setIsDraggingCanvasBySection((prev) => {
        const next = new Map(prev);
        next.set(sectionId, true);
        return next;
      });
      const refs = canvasDragRefBySection.current;
      if (!refs.has(sectionId)) refs.set(sectionId, { startX: 0, startY: 0, startScrollLeft: 0, startScrollTop: 0 });
      const r = refs.get(sectionId)!;
      r.startX = e.clientX;
      r.startY = e.clientY;
      r.startScrollLeft = el.scrollLeft;
      r.startScrollTop = el.scrollTop;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [sectionDragEnabled]
  );

  const handleCanvasDragPointerMove = useCallback((sectionId: string, e: React.PointerEvent) => {
    const refs = canvasDragRefBySection.current;
    const ref = refs.get(sectionId);
    if (!ref) return;
    const el = scrollContainerRefs.current.get(sectionId);
    if (!el) return;
    const dx = ref.startX - e.clientX;
    const dy = ref.startY - e.clientY;
    el.scrollLeft = ref.startScrollLeft + dx;
    el.scrollTop = ref.startScrollTop + dy;
  }, []);

  const handleCanvasDragPointerUp = useCallback((sectionId: string, e: React.PointerEvent) => {
    canvasDragRefBySection.current.delete(sectionId);
    setIsDraggingCanvasBySection((prev) => {
      const next = new Map(prev);
      next.set(sectionId, false);
      return next;
    });
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  const handleUndo = useCallback(() => {
    setPositionsHistory((prev) => {
      if (prev.length === 0) return prev;
      const restored = prev[prev.length - 1];
      setPositions(new Map(restored));
      return prev.slice(0, -1);
    });
  }, []);

  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectRect, setSelectRect] = useState<{
    sectionId?: string;
    canvasId?: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);
  const [altHeld, setAltHeld] = useState(false);
  const [marqueeMode, setMarqueeMode] = useState(true);
  const lastClickedRef = useRef<string | null>(null);
  const fileInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());

  const moveSelectedSeatsBy = useCallback(
    (dx: number, dy: number) => {
      if (selectedSeatIds.size === 0) return;
      const filtered = Array.from(selectedSeatIds).filter((id) => positions.has(id));
      if (filtered.length === 0) return;
      pushPositionHistory();
      setPositions((prev) => {
        const next = new Map(prev);
        for (const id of filtered) {
          const pos = prev.get(id) ?? { x: 0, y: 0 };
          next.set(id, { x: pos.x + dx, y: pos.y + dy });
        }
        return next;
      });
    },
    [selectedSeatIds, positions, pushPositionHistory]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) setAltHeld(true);
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;
      if (isInput) return;
      if (selectedSeatIds.size > 0) {
        const deltas: Record<string, [number, number]> = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        };
        const d = deltas[e.key];
        if (d) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          moveSelectedSeatsBy(d[0] * step, d[1] * step);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey) setAltHeld(false);
      // Do NOT clear selectRect here - let pointerup finish the selection
    };
    const onBlur = () => {
      setAltHeld(false);
      setSelectRect(null);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [handleUndo, moveSelectedSeatsBy, selectedSeatIds]);

  const assignedSections = sections.filter(
    (s) => s.seating_type !== "free" && s.seating_type !== "standing"
  );
  const assignedSeats = seats.filter((s) =>
    assignedSections.some((sec) => sec.id === s.event_section_id)
  );
  const sectionColorMap = new Map<string, string>();
  for (const sec of assignedSections) {
    const c = sec.color?.trim();
    sectionColorMap.set(sec.id, c && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : DEFAULT_SECTION_COLOR);
  }

  const resetSectionPositions = useCallback(
    (sectionId: string) => {
      const sectionSeats = assignedSeats.filter((s) => s.event_section_id === sectionId);
      if (sectionSeats.length === 0) return;
      const defaultPositions = autoPlaceSeats(seats, sections, { forceChronological: true });
      pushPositionHistory();
      setPositions((prev) => {
        const next = new Map(prev);
        for (const seat of sectionSeats) {
          const defaultPos = defaultPositions.get(seat.id);
          if (defaultPos) next.set(seat.id, defaultPos);
        }
        return next;
      });
      toast.success("Seat positions reset to default.");
    },
    [assignedSeats, seats, sections, pushPositionHistory]
  );

  useEffect(() => {
    const assigned = sections.filter(
      (s) => s.seating_type !== "free" && s.seating_type !== "standing"
    );
    setSectionLocked((prev) => {
      const next = new Map(prev);
      for (const s of assigned) {
        if (!next.has(s.id)) next.set(s.id, false);
      }
      return next;
    });
  }, [sections]);

  const fetchSeating = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/seating`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to load seating");
        return;
      }
      const sectionsData = data.sections ?? [];
      const canvasesData = data.canvases ?? [];
      setSections(sectionsData);
      setSeats(data.seats ?? []);
      const evLayout = data.layout
        ? { imageUrl: data.layout.imageUrl ?? null, scale: data.layout.scale ?? 1, opacity: data.layout.opacity ?? 0.5 }
        : { imageUrl: null, scale: 1, opacity: 0.5 };
      setEventLayout(evLayout);
      const layouts = new Map<string, LayoutConfig>();
      const canvasById = new Map((canvasesData as CanvasInfo[]).map((c) => [c.id, c]));
      for (const sec of sectionsData) {
        if (sec.seating_type === "free" || sec.seating_type === "standing") continue;
        const canvas = sec.seat_layout_canvas_id ? canvasById.get(sec.seat_layout_canvas_id) : null;
        layouts.set(sec.id, {
          imageUrl: canvas?.image_url ?? sec.seat_layout_image_url ?? evLayout.imageUrl,
          scale: canvas?.scale ?? sec.seat_layout_scale ?? evLayout.scale,
          opacity: canvas?.opacity ?? sec.seat_layout_opacity ?? evLayout.opacity,
        });
      }
      setSectionLayouts(layouts);
      setCanvases(canvasesData);
      const canvasLayoutMap = new Map<string, LayoutConfig>();
      for (const c of canvasesData) {
        canvasLayoutMap.set(c.id, {
          imageUrl: c.image_url ?? null,
          scale: c.scale ?? 1,
          opacity: c.opacity ?? 0.5,
        });
      }
      setCanvasLayouts(canvasLayoutMap);
      setSectionZooms((prev) => {
        const next = new Map(prev);
        for (const sec of sectionsData) {
          if (sec.seating_type !== "free" && sec.seating_type !== "standing" && !next.has(sec.id)) {
            next.set(sec.id, 1);
          }
        }
        for (const c of canvasesData) {
          if (!next.has(c.id)) next.set(c.id, 1);
        }
        return next;
      });
      const posMap = autoPlaceSeats(data.seats ?? [], sectionsData);
      setPositions(posMap);
      setPositionsHistory([]);
    } catch {
      toast.error("Failed to load seating");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchSeating();
  }, [fetchSeating]);

  const getSectionCanvasSize = useCallback((sectionId: string) => {
    const layout = sectionLayouts.get(sectionId) ?? eventLayout;
    const imgSize = sectionImageSizes.get(sectionId);
    if (layout.imageUrl && imgSize) {
      const proportionalHeight = Math.max(1, Math.round((imgSize.h / imgSize.w) * CANVAS_WIDTH));
      return { w: CANVAS_WIDTH, h: proportionalHeight };
    }
    return { w: CANVAS_WIDTH, h: CANVAS_HEIGHT };
  }, [sectionLayouts, eventLayout, sectionImageSizes]);

  const getSectionUniformScale = useCallback((sectionId: string) => {
    const canvasSize = getSectionCanvasSize(sectionId);
    const scaleToDisplay = { x: canvasSize.w / CANVAS_WIDTH, y: canvasSize.h / CANVAS_HEIGHT };
    return Math.min(scaleToDisplay.x, scaleToDisplay.y);
  }, [getSectionCanvasSize]);

  const getSectionScaleToLogical = useCallback((sectionId: string) => {
    const uniformScale = getSectionUniformScale(sectionId);
    return { x: 1 / uniformScale, y: 1 / uniformScale };
  }, [getSectionUniformScale]);

  const getCanvasCanvasSize = useCallback(
    (canvasId: string) => {
      const imgSize = canvasImageSizes.get(canvasId);
      if (imgSize) {
        return { w: Math.max(1, imgSize.w), h: Math.max(1, imgSize.h) };
      }
      return { w: CANVAS_WIDTH, h: CANVAS_HEIGHT };
    },
    [canvasImageSizes]
  );

  const getCanvasUniformScale = useCallback(
    (canvasId: string) => {
      void canvasId;
      return 1;
    },
    []
  );

  const getCanvasScaleToLogical = useCallback(
    (canvasId: string) => {
      const uniformScale = getCanvasUniformScale(canvasId);
      return { x: 1 / uniformScale, y: 1 / uniformScale };
    },
    [getCanvasUniformScale]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    })
  );

  const handleSeatSelect = useCallback(
    (seatId: string, e: React.MouseEvent, sectionSeats: Seat[]) => {
      e.stopPropagation();
      setSelectedSeatIds((prev) => {
        const next = new Set(prev);
        if (e.ctrlKey || e.metaKey) {
          if (next.has(seatId)) next.delete(seatId);
          else next.add(seatId);
        } else if (e.shiftKey) {
          const idx = sectionSeats.findIndex((s) => s.id === seatId);
          const lastIdx = lastClickedRef.current
            ? sectionSeats.findIndex((s) => s.id === lastClickedRef.current)
            : -1;
          const [lo, hi] = idx < lastIdx ? [idx, lastIdx] : [lastIdx >= 0 ? lastIdx : idx, idx];
          for (let i = lo; i <= hi; i++) next.add(sectionSeats[i].id);
        } else {
          next.clear();
          next.add(seatId);
        }
        lastClickedRef.current = seatId;
        return next;
      });
    },
    []
  );

  const handleCanvasClick = useCallback(() => {
    if (justCompletedMarqueeRef.current) {
      justCompletedMarqueeRef.current = false;
      return;
    }
    if (!selectRect) setSelectedSeatIds(new Set());
  }, [selectRect]);

  const addToSelectionRef = useRef(false);
  const captureTargetRef = useRef<HTMLElement | null>(null);
  const justCompletedMarqueeRef = useRef(false);

  const getCanvasCoords = useCallback((sectionId: string, clientX: number, clientY: number) => {
    const scrollEl = scrollContainerRefs.current.get(sectionId);
    if (!scrollEl) return { x: 0, y: 0 };
    const sectionZoom = sectionZooms.get(sectionId) ?? 1;
    const scrollRect = scrollEl.getBoundingClientRect();
    const scrollLeft = scrollEl.scrollLeft ?? 0;
    const scrollTop = scrollEl.scrollTop ?? 0;
    const scrollX = clientX - scrollRect.left + scrollLeft;
    const scrollY = clientY - scrollRect.top + scrollTop;
    return {
      x: scrollX / sectionZoom,
      y: scrollY / sectionZoom,
    };
  }, [sectionZooms]);

  const handleCanvasPointerDown = useCallback(
    (containerId: string, e: React.PointerEvent, isCanvas?: boolean) => {
      e.preventDefault();
      e.stopPropagation();
      const { x, y } = getCanvasCoords(containerId, e.clientX, e.clientY);
      addToSelectionRef.current = e.ctrlKey || e.metaKey;
      captureTargetRef.current = e.target as HTMLElement;
      setSelectRect(
        isCanvas
          ? { canvasId: containerId, startX: x, startY: y, endX: x, endY: y }
          : { sectionId: containerId, startX: x, startY: y, endX: x, endY: y }
      );
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [getCanvasCoords]
  );

  useEffect(() => {
    if (!selectRect) return;
    const sectionId = selectRect.sectionId;
    const canvasId = selectRect.canvasId;
    const containerId = sectionId ?? canvasId;
    if (!containerId) return;
    const isCanvas = !!canvasId;
    const containerSeats = isCanvas
      ? assignedSeats.filter((s) =>
          canvases.find((c) => c.id === canvasId)?.sectionIds.includes(s.event_section_id)
        )
      : assignedSeats.filter((s) => s.event_section_id === sectionId);
    const scaleToLogical = isCanvas
      ? getCanvasScaleToLogical(canvasId)
      : getSectionScaleToLogical(sectionId!);
    const onMove = (e: PointerEvent) => {
      const { x, y } = getCanvasCoords(containerId, e.clientX, e.clientY);
      setSelectRect((prev) => {
        if (
          !prev ||
          !((isCanvas && prev.canvasId === canvasId) || (!isCanvas && prev.sectionId === sectionId))
        ) {
          return prev;
        }
        return { ...prev, endX: x, endY: y };
      });
    };
    const onUp = (e: PointerEvent) => {
      captureTargetRef.current?.releasePointerCapture?.(e.pointerId);
      setSelectRect((prev) => {
        const matches = prev &&
          ((isCanvas && prev.canvasId === canvasId) || (!isCanvas && prev.sectionId === sectionId));
        if (!matches) return prev;
        const minX = Math.min(prev!.startX, prev!.endX);
        const maxX = Math.max(prev!.startX, prev!.endX);
        const minY = Math.min(prev!.startY, prev!.endY);
        const maxY = Math.max(prev!.startY, prev!.endY);
        const w = maxX - minX;
        const h = maxY - minY;
        if (w < 2 && h < 2) {
          setSelectedSeatIds(new Set());
          return null;
        }
        const logicalMinX = minX * scaleToLogical.x;
        const logicalMaxX = maxX * scaleToLogical.x;
        const logicalMinY = minY * scaleToLogical.y;
        const logicalMaxY = maxY * scaleToLogical.y;
        const ids = new Set<string>();
        for (const s of containerSeats) {
          const pos = positions.get(s.id) ?? { x: 0, y: 0 };
          if (pos.x + SEAT_SIZE >= logicalMinX && pos.x <= logicalMaxX && pos.y + SEAT_SIZE >= logicalMinY && pos.y <= logicalMaxY) {
            ids.add(s.id);
          }
        }
        setSelectedSeatIds((prev) => {
          if (addToSelectionRef.current && prev.size > 0) {
            const next = new Set(prev);
            ids.forEach((id) => next.add(id));
            return next;
          }
          return ids;
        });
        justCompletedMarqueeRef.current = true;
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp as EventListener);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [selectRect, assignedSeats, positions, canvases, getCanvasCoords, getSectionScaleToLogical, getCanvasScaleToLogical]);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string);
    if (!selectedSeatIds.has(e.active.id as string)) {
      setSelectedSeatIds(new Set([e.active.id as string]));
    }
  };

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, delta } = e;
      setActiveId(null);
      if (Math.abs(delta.x) < 0.1 && Math.abs(delta.y) < 0.1) return;

      const seat = assignedSeats.find((s) => s.id === active.id);
      const sectionId = seat?.event_section_id;
      if (!sectionId) return;

      const rawIds = selectedSeatIds.has(active.id as string) ? selectedSeatIds : new Set([active.id as string]);
      const idsToMove = new Set(
        Array.from(rawIds).filter(
          (id) => {
            const s = assignedSeats.find((x) => x.id === id);
            return s && sectionLocked.get(s.event_section_id) !== true;
          }
        )
      );
      if (idsToMove.size === 0) return;

      const isCanvasMode = canvases.length > 0;
      const canvas = canvases.find((c) => c.sectionIds.includes(sectionId));
      const containerId = isCanvasMode && canvas ? canvas.id : sectionId;

      const containerZoom = sectionZooms.get(containerId) ?? 1;
      const uniformScale =
        isCanvasMode && canvas
          ? getCanvasUniformScale(containerId)
          : getSectionUniformScale(sectionId);
      const displayScale = containerZoom * uniformScale;
      const deltaX = delta.x / displayScale;
      const deltaY = delta.y / displayScale;

      const canvasSize =
        isCanvasMode && canvas
          ? getCanvasCanvasSize(containerId)
          : getSectionCanvasSize(sectionId);
      const maxX = canvasSize.w - SEAT_SIZE;
      const maxY = canvasSize.h - SEAT_SIZE;

      pushPositionHistory();
      setPositions((prev) => {
        const next = new Map(prev);
        for (const id of idsToMove) {
          const pos = next.get(id) ?? { x: 0, y: 0 };
          next.set(id, {
            x: Math.max(0, Math.min(maxX, pos.x + deltaX)),
            y: Math.max(0, Math.min(maxY, pos.y + deltaY)),
          });
        }
        return next;
      });
    },
    [
      selectedSeatIds,
      assignedSeats,
      sectionLocked,
      canvases,
      sectionZooms,
      getSectionUniformScale,
      getCanvasUniformScale,
      getSectionCanvasSize,
      getCanvasCanvasSize,
      pushPositionHistory,
    ]
  );

  const alignSeatsInSection = useCallback(
    (mode: "left" | "right" | "top" | "bottom" | "centerH" | "centerV", sectionId: string) => {
      const sectionSeatIds = new Set(assignedSeats.filter((s) => s.event_section_id === sectionId).map((s) => s.id));
      const filtered = Array.from(selectedSeatIds).filter((id) => sectionSeatIds.has(id));
      if (filtered.length < 2) return;
      pushPositionHistory();
      const posList = filtered
        .map((id) => ({ id, pos: positions.get(id) ?? { x: 0, y: 0 } }))
        .filter((p) => positions.has(p.id));
      const xs = posList.map((p) => p.pos.x);
      const ys = posList.map((p) => p.pos.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      setPositions((prev) => {
        const next = new Map(prev);
        for (const { id, pos } of posList) {
          let x = pos.x;
          let y = pos.y;
          if (mode === "left") x = minX;
          else if (mode === "right") x = maxX;
          else if (mode === "centerH") x = centerX;
          if (mode === "top") y = minY;
          else if (mode === "bottom") y = maxY;
          else if (mode === "centerV") y = centerY;
          next.set(id, { x, y });
        }
        return next;
      });
    },
    [selectedSeatIds, assignedSeats, positions, pushPositionHistory]
  );

  const arrangeAsGridInSection = useCallback(
    (sectionId: string) => {
      const sectionSeatIds = new Set(assignedSeats.filter((s) => s.event_section_id === sectionId).map((s) => s.id));
      const filtered = Array.from(selectedSeatIds).filter((id) => sectionSeatIds.has(id));
      if (filtered.length < 2) return;
      pushPositionHistory();
      const sec = sections.find((s) => s.id === sectionId);
      const isRightToLeft = sec?.column_direction === "right-to-left";
      const posList = filtered
        .map((id) => ({ id, seat: assignedSeats.find((s) => s.id === id)!, pos: positions.get(id) ?? { x: 0, y: 0 } }))
        .filter((p) => p.seat && positions.has(p.id));
      const sorted = posList.sort((a, b) => {
        const r = (a.seat.row_label || "").localeCompare(b.seat.row_label || "");
        if (r !== 0) return r;
        const na = parseInt(a.seat.seat_number || "0", 10);
        const nb = parseInt(b.seat.seat_number || "0", 10);
        return isRightToLeft ? nb - na : na - nb;
      });
      const minX = Math.min(...sorted.map((p) => p.pos.x));
      const minY = Math.min(...sorted.map((p) => p.pos.y));
      const cols = Math.ceil(Math.sqrt(sorted.length));
      const gap = SEAT_SIZE + 4;
      setPositions((prev) => {
        const next = new Map(prev);
        sorted.forEach(({ id }, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          next.set(id, { x: minX + col * gap, y: minY + row * gap });
        });
        return next;
      });
    },
    [selectedSeatIds, assignedSeats, positions, sections, pushPositionHistory]
  );

  const distributeHorizontalInSection = useCallback(
    (sectionId: string) => {
      const sectionSeatIds = new Set(assignedSeats.filter((s) => s.event_section_id === sectionId).map((s) => s.id));
      const filtered = Array.from(selectedSeatIds).filter((id) => sectionSeatIds.has(id));
      if (filtered.length < 2) return;
      pushPositionHistory();
      const posList = filtered
        .map((id) => ({ id, pos: positions.get(id) ?? { x: 0, y: 0 } }))
        .filter((p) => positions.has(p.id))
        .sort((a, b) => a.pos.x - b.pos.x);
      const n = posList.length;
      const minX = posList[0]!.pos.x;
      const maxX = posList[n - 1]!.pos.x;
      const span = maxX - minX;
      const step = n > 1 ? span / (n - 1) : 0;
      setPositions((prev) => {
        const next = new Map(prev);
        posList.forEach(({ id, pos }, i) => {
          next.set(id, { x: minX + i * step, y: pos.y });
        });
        return next;
      });
    },
    [selectedSeatIds, assignedSeats, positions, pushPositionHistory]
  );

  const distributeVerticalInSection = useCallback(
    (sectionId: string) => {
      const sectionSeatIds = new Set(assignedSeats.filter((s) => s.event_section_id === sectionId).map((s) => s.id));
      const filtered = Array.from(selectedSeatIds).filter((id) => sectionSeatIds.has(id));
      if (filtered.length < 2) return;
      pushPositionHistory();
      const posList = filtered
        .map((id) => ({ id, pos: positions.get(id) ?? { x: 0, y: 0 } }))
        .filter((p) => positions.has(p.id))
        .sort((a, b) => a.pos.y - b.pos.y);
      const n = posList.length;
      const minY = posList[0]!.pos.y;
      const maxY = posList[n - 1]!.pos.y;
      const span = maxY - minY;
      const step = n > 1 ? span / (n - 1) : 0;
      setPositions((prev) => {
        const next = new Map(prev);
        posList.forEach(({ id, pos }, i) => {
          next.set(id, { x: pos.x, y: minY + i * step });
        });
        return next;
      });
    },
    [selectedSeatIds, assignedSeats, positions, pushPositionHistory]
  );

  const sectionSelectedCount = (sectionId: string) => {
    const sectionSeatIds = new Set(assignedSeats.filter((s) => s.event_section_id === sectionId).map((s) => s.id));
    return Array.from(selectedSeatIds).filter((id) => sectionSeatIds.has(id)).length;
  };

  const canvasSelectedCount = (sectionIds: string[]) => {
    const seatIds = new Set(assignedSeats.filter((s) => sectionIds.includes(s.event_section_id)).map((s) => s.id));
    return Array.from(selectedSeatIds).filter((id) => seatIds.has(id)).length;
  };

  const alignSeatsInSections = useCallback(
    (mode: "left" | "right" | "top" | "bottom" | "centerH" | "centerV", sectionIds: string[]) => {
      const seatIds = new Set(assignedSeats.filter((s) => sectionIds.includes(s.event_section_id)).map((s) => s.id));
      const filtered = Array.from(selectedSeatIds).filter((id) => seatIds.has(id));
      if (filtered.length < 2) return;
      pushPositionHistory();
      const posList = filtered
        .map((id) => ({ id, pos: positions.get(id) ?? { x: 0, y: 0 } }))
        .filter((p) => positions.has(p.id));
      const xs = posList.map((p) => p.pos.x);
      const ys = posList.map((p) => p.pos.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      setPositions((prev) => {
        const next = new Map(prev);
        for (const { id, pos } of posList) {
          let x = pos.x;
          let y = pos.y;
          if (mode === "left") x = minX;
          else if (mode === "right") x = maxX;
          else if (mode === "centerH") x = centerX;
          if (mode === "top") y = minY;
          else if (mode === "bottom") y = maxY;
          else if (mode === "centerV") y = centerY;
          next.set(id, { x, y });
        }
        return next;
      });
    },
    [selectedSeatIds, assignedSeats, positions, pushPositionHistory]
  );

  const distributeHorizontalInSections = useCallback(
    (sectionIds: string[]) => {
      const seatIds = new Set(assignedSeats.filter((s) => sectionIds.includes(s.event_section_id)).map((s) => s.id));
      const filtered = Array.from(selectedSeatIds).filter((id) => seatIds.has(id));
      if (filtered.length < 2) return;
      pushPositionHistory();
      const posList = filtered
        .map((id) => ({ id, pos: positions.get(id) ?? { x: 0, y: 0 } }))
        .filter((p) => positions.has(p.id))
        .sort((a, b) => a.pos.x - b.pos.x);
      const n = posList.length;
      const minX = posList[0]!.pos.x;
      const maxX = posList[n - 1]!.pos.x;
      const span = maxX - minX;
      const step = n > 1 ? span / (n - 1) : 0;
      setPositions((prev) => {
        const next = new Map(prev);
        posList.forEach(({ id, pos }, i) => {
          next.set(id, { x: minX + i * step, y: pos.y });
        });
        return next;
      });
    },
    [selectedSeatIds, assignedSeats, positions, pushPositionHistory]
  );

  const distributeVerticalInSections = useCallback(
    (sectionIds: string[]) => {
      const seatIds = new Set(assignedSeats.filter((s) => sectionIds.includes(s.event_section_id)).map((s) => s.id));
      const filtered = Array.from(selectedSeatIds).filter((id) => seatIds.has(id));
      if (filtered.length < 2) return;
      pushPositionHistory();
      const posList = filtered
        .map((id) => ({ id, pos: positions.get(id) ?? { x: 0, y: 0 } }))
        .filter((p) => positions.has(p.id))
        .sort((a, b) => a.pos.y - b.pos.y);
      const n = posList.length;
      const minY = posList[0]!.pos.y;
      const maxY = posList[n - 1]!.pos.y;
      const span = maxY - minY;
      const step = n > 1 ? span / (n - 1) : 0;
      setPositions((prev) => {
        const next = new Map(prev);
        posList.forEach(({ id, pos }, i) => {
          next.set(id, { x: pos.x, y: minY + i * step });
        });
        return next;
      });
    },
    [selectedSeatIds, assignedSeats, positions, pushPositionHistory]
  );

  const arrangeAsGridInSections = useCallback(
    (sectionIds: string[]) => {
      const seatIds = new Set(assignedSeats.filter((s) => sectionIds.includes(s.event_section_id)).map((s) => s.id));
      const filtered = Array.from(selectedSeatIds).filter((id) => seatIds.has(id));
      if (filtered.length < 2) return;
      pushPositionHistory();
      const sec = sections.find((s) => sectionIds.includes(s.id));
      const isRightToLeft = sec?.column_direction === "right-to-left";
      const posList = filtered
        .map((id) => ({ id, seat: assignedSeats.find((s) => s.id === id)!, pos: positions.get(id) ?? { x: 0, y: 0 } }))
        .filter((p) => p.seat && positions.has(p.id));
      const sorted = posList.sort((a, b) => {
        const r = (a.seat.row_label || "").localeCompare(b.seat.row_label || "");
        if (r !== 0) return r;
        const na = parseInt(a.seat.seat_number || "0", 10);
        const nb = parseInt(b.seat.seat_number || "0", 10);
        return isRightToLeft ? nb - na : na - nb;
      });
      const minX = Math.min(...sorted.map((p) => p.pos.x));
      const minY = Math.min(...sorted.map((p) => p.pos.y));
      const cols = Math.ceil(Math.sqrt(sorted.length));
      const gap = SEAT_SIZE + 4;
      setPositions((prev) => {
        const next = new Map(prev);
        sorted.forEach(({ id }, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          next.set(id, { x: minX + col * gap, y: minY + row * gap });
        });
        return next;
      });
    },
    [selectedSeatIds, assignedSeats, positions, sections, pushPositionHistory]
  );

  const handleSavePositions = async () => {
    if (assignedSeats.length === 0) {
      toast.error("No assigned seats to position. Define seats in Seat Configurator first.");
      return;
    }
    setSaving(true);
    try {
      // Never default missing seat coordinates to (0,0); preserve DB/grid values when
      // in-memory positions are temporarily missing to avoid top-left resets on refresh.
      const fallbackPositions = autoPlaceSeats(seats, sections);
      const payload = {
        positions: assignedSeats.map((s) => {
          const pos =
            positions.get(s.id) ??
            (s.grid_x != null && s.grid_y != null
              ? { x: s.grid_x, y: s.grid_y }
              : fallbackPositions.get(s.id) ?? { x: 20, y: 20 });
          return { seatId: s.id, grid_x: Math.round(pos.x), grid_y: Math.round(pos.y) };
        }),
      };
      const res = await fetch(`/api/admin/events/${eventId}/seating/positions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to save positions");
        return;
      }
      const coordBySeatId = new Map(
        payload.positions.map((p) => [p.seatId, { grid_x: p.grid_x, grid_y: p.grid_y }] as const)
      );
      setSeats((prev) =>
        prev.map((s) => {
          const c = coordBySeatId.get(s.id);
          if (!c) return s;
          return { ...s, grid_x: c.grid_x, grid_y: c.grid_y };
        })
      );
      toast.success("Seat positions saved.");
    } catch {
      toast.error("Failed to save positions");
    } finally {
      setSaving(false);
    }
  };

  const saveSectionLayout = useCallback(
    async (sectionId: string, updates: Partial<LayoutConfig>, options?: { silent?: boolean }) => {
      const current = sectionLayouts.get(sectionId) ?? eventLayout;
      const next = { ...current, ...updates };
      setSectionLayouts((prev) => {
        const m = new Map(prev);
        m.set(sectionId, next);
        return m;
      });
      try {
        const res = await fetch(`/api/admin/events/${eventId}/seating/sections/${sectionId}/layout`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: next.imageUrl,
            scale: next.scale,
            opacity: next.opacity,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error ?? "Failed to update layout");
          return;
        }
        if (!options?.silent) toast.success("Layout updated.");
      } catch {
        toast.error("Failed to update layout");
      }
    },
    [eventId, sectionLayouts, eventLayout]
  );

  const opacitySaveRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const saveOpacityDebounced = useCallback(
    (sectionId: string, opacity: number) => {
      const refs = opacitySaveRefs.current;
      if (refs.has(sectionId)) clearTimeout(refs.get(sectionId)!);
      const t = setTimeout(() => {
        refs.delete(sectionId);
        saveSectionLayout(sectionId, { opacity }, { silent: true });
      }, 300);
      refs.set(sectionId, t);
    },
    [saveSectionLayout]
  );

  const handleFileUpload = async (sectionId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("slug", `seat-layout-${eventId}-${sectionId}`);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      await saveSectionLayout(sectionId, { imageUrl: data.url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleAddCanvas = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/events/${eventId}/seating/canvases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add canvas");
      setCanvases((prev) => [...prev, data.canvas]);
      setCanvasLayouts((prev) => {
        const m = new Map(prev);
        m.set(data.canvas.id, {
          imageUrl: null,
          scale: 1,
          opacity: 0.5,
        });
        return m;
      });
      setExpandedCanvasIds((prev) => new Set(prev).add(data.canvas.id));
      toast.success("Canvas added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add canvas");
    }
  }, [eventId]);

  const handleRemoveCanvas = useCallback(
    async (canvasId: string) => {
      setCanvasDeleting(canvasId);
      try {
        const res = await fetch(
          `/api/admin/events/${eventId}/seating/canvases/${canvasId}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Failed to remove canvas");
        }
        setCanvases((prev) => prev.filter((c) => c.id !== canvasId));
        setCanvasLayouts((prev) => {
          const m = new Map(prev);
          m.delete(canvasId);
          return m;
        });
        setExpandedCanvasIds((prev) => {
          const next = new Set(prev);
          next.delete(canvasId);
          return next;
        });
        fetchSeating();
        toast.success("Canvas removed");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to remove canvas");
      } finally {
        setCanvasDeleting(null);
      }
    },
    [eventId, fetchSeating]
  );

  const saveCanvasLayout = useCallback(
    async (canvasId: string, updates: Partial<LayoutConfig>, options?: { silent?: boolean }) => {
      const current = canvasLayouts.get(canvasId) ?? { imageUrl: null, scale: 1, opacity: 0.5 };
      const next = { ...current, ...updates };
      setCanvasLayouts((prev) => {
        const m = new Map(prev);
        m.set(canvasId, next);
        return m;
      });
      try {
        const res = await fetch(
          `/api/admin/events/${eventId}/seating/canvases/${canvasId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageUrl: next.imageUrl,
              scale: next.scale,
              opacity: next.opacity,
            }),
          }
        );
        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error ?? "Failed to update canvas");
          return;
        }
        if (!options?.silent) toast.success("Canvas updated");
      } catch {
        toast.error("Failed to update canvas");
      }
    },
    [eventId, canvasLayouts]
  );

  const handleCanvasFileUpload = useCallback(
    async (canvasId: string, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("slug", `seat-layout-${eventId}-canvas-${canvasId}`);
        const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        await saveCanvasLayout(canvasId, { imageUrl: data.url });
        fetchSeating();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [eventId, saveCanvasLayout, fetchSeating]
  );

  const handleCanvasSectionsChange = useCallback(
    async (canvasId: string, sectionIds: string[]) => {
      try {
        const res = await fetch(
          `/api/admin/events/${eventId}/seating/canvases/${canvasId}/sections`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sectionIds }),
          }
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Failed to update sections");
        }
        setCanvases((prev) =>
          prev.map((c) => (c.id === canvasId ? { ...c, sectionIds } : c))
        );
        setSections((prev) =>
          prev.map((sec) => {
            if (sec.seating_type === "free" || sec.seating_type === "standing") return sec;
            const onThisCanvas = sectionIds.includes(sec.id);
            return { ...sec, seat_layout_canvas_id: onThisCanvas ? canvasId : null };
          })
        );
        toast.success("Sections updated");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update sections");
      }
    },
    [eventId]
  );

  const seatSelectorProgress = useMemo(() => {
    if (uploading) {
      return {
        message: "Uploading canvas images",
        subtitle: "Seat selector setup",
        detail: FLOATING_PROGRESS_PRESETS.uploading.detail,
      };
    }
    if (saving) {
      return {
        message: "Saving seat positions",
        subtitle: "Seat selector setup",
        detail: FLOATING_PROGRESS_PRESETS.genericSave.detail,
      };
    }
    return { message: "Saving…" };
  }, [saving, uploading]);

  if (loading) {
    return (
      <>
        <FloatingProgressBar
          active
          {...FLOATING_PROGRESS_PRESETS.genericLoad}
          message="Loading seating data…"
          subtitle="Seat selector setup"
        />
        <div className="glass rounded-xl border border-[var(--glass-border)] p-6 text-foreground-muted">
          Loading seating data...
        </div>
      </>
    );
  }

  if (assignedSeats.length === 0) {
    return (
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6 text-foreground-muted">
        <p>Define seats in Seat Configurator first.</p>
        <p className="text-sm mt-2">This tab only positions seats that are already configured.</p>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl border border-[var(--glass-border)] p-6 space-y-6">
      <FloatingProgressBar
        active={saving || uploading}
        message={seatSelectorProgress.message}
        subtitle={seatSelectorProgress.subtitle}
        detail={seatSelectorProgress.detail}
      />
      <h2 className="text-lg font-semibold text-foreground">Seat Selector Setup</h2>
      <p className="text-sm text-foreground-muted">
        {canvases.length > 0
          ? "Add canvases and assign sections to each. One image can contain multiple sections. Click a seat to select. Use Marquee or hold Alt and drag to select multiple."
          : "Each section has its own card with background image and controls. Click a seat to select. Use Marquee or hold Alt and drag to select multiple. Ctrl+click or Shift+click for multi-select. Drag seats to position."}
      </p>

      <div className="flex items-center gap-2 mb-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddCanvas}
          className="border-[var(--glass-border)]"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add canvas
        </Button>
      </div>

      <div className="space-y-6">
        {canvases.length > 0 ? (
          canvases.map((canvas) => {
            const canvasSections = assignedSections.filter((s) =>
              canvas.sectionIds.includes(s.id)
            );
            const canvasSeats = assignedSeats.filter((s) =>
              canvas.sectionIds.includes(s.event_section_id)
            );
            const layout = canvasLayouts.get(canvas.id) ?? {
              imageUrl: null,
              scale: 1,
              opacity: 0.5,
            };
            const canvasZoom = sectionZooms.get(canvas.id) ?? 1;
            const canvasSize = getCanvasCanvasSize(canvas.id);
            const uniformScale = getCanvasUniformScale(canvas.id);
            const isExpanded = expandedCanvasIds.has(canvas.id);
            const toggleCanvas = () => {
              setExpandedCanvasIds((prev) => {
                const next = new Set(prev);
                if (next.has(canvas.id)) next.delete(canvas.id);
                else next.add(canvas.id);
                return next;
              });
            };
            const unassignedSections = assignedSections.filter(
              (s) => !canvases.some((c) => c.id !== canvas.id && c.sectionIds.includes(s.id))
            );
            const availableToAdd = unassignedSections.filter(
              (s) => !canvas.sectionIds.includes(s.id)
            );

            return (
              <Card key={canvas.id} className="border-[var(--glass-border)] bg-white/5 overflow-hidden">
                <div className="flex items-center justify-between gap-3 p-4">
                  <button
                    type="button"
                    onClick={toggleCanvas}
                    className="flex items-center gap-2 text-left flex-1 min-w-0"
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-foreground-muted shrink-0" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-foreground-muted shrink-0" />
                    )}
                    <CardTitle className="text-base text-foreground">
                      Canvas {canvases.indexOf(canvas) + 1}
                      {canvasSections.length > 0 && (
                        <span className="text-foreground-muted font-normal ml-2">
                          ({canvasSections.map((s) => s.name || s.section_code).join(", ")})
                        </span>
                      )}
                    </CardTitle>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveCanvas(canvas.id)}
                      disabled={canvasDeleting === canvas.id}
                      className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                </div>
                {isExpanded && (
                  <CardContent className="space-y-4 pt-0 pb-4 px-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <input
                        ref={(el) => {
                          if (el) fileInputRefs.current.set(`canvas-${canvas.id}`, el);
                        }}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => handleCanvasFileUpload(canvas.id, e)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          fileInputRefs.current.get(`canvas-${canvas.id}`)?.click()
                        }
                        disabled={uploading}
                        className="border-[var(--glass-border)]"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {uploading ? "Uploading..." : "Upload venue plan"}
                      </Button>
                      {layout.imageUrl && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => saveCanvasLayout(canvas.id, { imageUrl: null })}
                          className="border-[var(--glass-border)]"
                        >
                          Remove image
                        </Button>
                      )}
                    </div>
                    {layout.imageUrl && (
                      <div className="flex flex-wrap gap-6 items-center">
                        <div className="flex items-center gap-3 w-48">
                          <Label className="text-foreground-muted text-sm shrink-0">Opacity</Label>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={layout.opacity}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) ?? 0.5;
                              setCanvasLayouts((prev) => {
                                const m = new Map(prev);
                                m.set(canvas.id, { ...layout, opacity: v });
                                return m;
                              });
                              saveCanvasLayout(canvas.id, { opacity: v }, { silent: true });
                            }}
                            className="flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-[var(--wish-orange)] bg-white/10"
                            aria-label="Background opacity"
                          />
                          <span className="text-foreground-muted text-xs w-8 tabular-nums shrink-0">
                            {Math.round(layout.opacity * 100)}%
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label className="text-foreground-muted text-sm">
                        Sections in this canvas
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {canvasSections.map((sec) => (
                          <div
                            key={sec.id}
                            className="flex items-center gap-1 rounded-md border border-[var(--glass-border)] px-2 py-1 bg-white/5 text-sm"
                          >
                            <span
                              className="w-3 h-3 rounded shrink-0"
                              style={{
                                backgroundColor:
                                  sectionColorMap.get(sec.id) ?? DEFAULT_SECTION_COLOR,
                              }}
                            />
                            {sec.name || sec.section_code}
                            <button
                              type="button"
                              onClick={() =>
                                handleCanvasSectionsChange(
                                  canvas.id,
                                  canvas.sectionIds.filter((id) => id !== sec.id)
                                )
                              }
                              className="text-foreground-muted hover:text-foreground ml-1"
                              aria-label={`Remove ${sec.name} from canvas`}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        {availableToAdd.length > 0 && (
                          <select
                            className="rounded-md border border-[var(--glass-border)] bg-white/5 px-2 py-1 text-sm text-foreground"
                            value=""
                            onChange={(e) => {
                              const id = e.target.value;
                              if (id)
                                handleCanvasSectionsChange(canvas.id, [
                                  ...canvas.sectionIds,
                                  id,
                                ]);
                              e.target.value = "";
                            }}
                          >
                            <option value="">Add section…</option>
                            {availableToAdd.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name || s.section_code}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                    {canvasSeats.length > 0 && layout.imageUrl && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleUndo}
                            disabled={positionsHistory.length === 0}
                            className="border-[var(--glass-border)] h-8 px-2"
                          >
                            <Undo2 className="w-4 h-4 mr-1.5" />
                            Undo
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              canvasSections.forEach((sec) => resetSectionPositions(sec.id));
                            }}
                            className="border-[var(--glass-border)] h-8 px-2"
                          >
                            <RotateCcw className="w-4 h-4 mr-1.5" />
                            Reset positions
                          </Button>
                          <Label className="flex items-center gap-2 text-sm text-foreground-muted cursor-pointer ml-2">
                            <Checkbox
                              checked={marqueeMode}
                              onCheckedChange={(v) => setMarqueeMode(!!v)}
                              aria-label="Marquee select"
                            />
                            Marquee
                          </Label>
                          <span className="text-sm text-foreground-muted mx-2">Align:</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => alignSeatsInSections("left", canvas.sectionIds)}
                            disabled={canvasSelectedCount(canvas.sectionIds) < 2}
                            className="border-[var(--glass-border)] h-8 px-2"
                            title="Align left"
                          >
                            <ArrowLeft className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => alignSeatsInSections("right", canvas.sectionIds)}
                            disabled={canvasSelectedCount(canvas.sectionIds) < 2}
                            className="border-[var(--glass-border)] h-8 px-2"
                            title="Align right"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => alignSeatsInSections("top", canvas.sectionIds)}
                            disabled={canvasSelectedCount(canvas.sectionIds) < 2}
                            className="border-[var(--glass-border)] h-8 px-2"
                            title="Align top"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => alignSeatsInSections("bottom", canvas.sectionIds)}
                            disabled={canvasSelectedCount(canvas.sectionIds) < 2}
                            className="border-[var(--glass-border)] h-8 px-2"
                            title="Align bottom"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => alignSeatsInSections("centerH", canvas.sectionIds)}
                            disabled={canvasSelectedCount(canvas.sectionIds) < 2}
                            className="border-[var(--glass-border)] h-8 px-2 text-xs"
                            title="Center H"
                          >
                            Center H
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => alignSeatsInSections("centerV", canvas.sectionIds)}
                            disabled={canvasSelectedCount(canvas.sectionIds) < 2}
                            className="border-[var(--glass-border)] h-8 px-2 text-xs"
                            title="Center V"
                          >
                            Center V
                          </Button>
                          <span className="text-sm text-foreground-muted mx-2">|</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => distributeHorizontalInSections(canvas.sectionIds)}
                            disabled={canvasSelectedCount(canvas.sectionIds) < 2}
                            className="border-[var(--glass-border)] h-8 px-2"
                            title="Distribute horizontally"
                          >
                            <AlignHorizontalSpaceBetween className="w-4 h-4 mr-1.5" />
                            Dist H
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => distributeVerticalInSections(canvas.sectionIds)}
                            disabled={canvasSelectedCount(canvas.sectionIds) < 2}
                            className="border-[var(--glass-border)] h-8 px-2"
                            title="Distribute vertically"
                          >
                            <AlignVerticalSpaceBetween className="w-4 h-4 mr-1.5" />
                            Dist V
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => arrangeAsGridInSections(canvas.sectionIds)}
                            disabled={canvasSelectedCount(canvas.sectionIds) < 2}
                            className="border-[var(--glass-border)] h-8 px-2"
                            title="Arrange in grid"
                          >
                            <LayoutGrid className="w-4 h-4 mr-1.5" />
                            Grid
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-foreground-muted">Zoom:</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setSectionZoom(canvas.id, (canvasZoom ?? 1) - ZOOM_STEP)}
                            disabled={(canvasZoom ?? 1) <= 0.5}
                            className="h-8 w-8 p-0 border-[var(--glass-border)]"
                            title="Zoom out"
                          >
                            <ZoomOut className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setSectionZoom(canvas.id, (canvasZoom ?? 1) + ZOOM_STEP)}
                            disabled={(canvasZoom ?? 1) >= 2}
                            className="h-8 w-8 p-0 border-[var(--glass-border)]"
                            title="Zoom in"
                          >
                            <ZoomIn className="w-4 h-4" />
                          </Button>
                          <Input
                            type="number"
                            min={50}
                            max={200}
                            step={5}
                            value={Math.round((canvasZoom ?? 1) * 100)}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              if (!Number.isNaN(v)) setSectionZoom(canvas.id, v / 100);
                            }}
                            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                            className="w-14 h-8 text-xs tabular-nums text-center border-[var(--glass-border)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            title="Zoom (50–200)"
                            aria-label="Zoom"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setSectionZoom(canvas.id, 1)}
                            className="h-8 px-2 border-[var(--glass-border)]"
                            title="Reset zoom"
                          >
                            <RotateCcw className="w-4 h-4 mr-1" />
                            Reset
                          </Button>
                          <span className="text-neutral-600 mx-1">|</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCanvasPan(canvas.id, -PAN_STEP, 0)}
                            className="h-8 px-2 border-[var(--glass-border)]"
                            title="Pan left"
                          >
                            <ArrowLeft className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCanvasPan(canvas.id, PAN_STEP, 0)}
                            className="h-8 px-2 border-[var(--glass-border)]"
                            title="Pan right"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCanvasPan(canvas.id, 0, -PAN_STEP)}
                            className="h-8 px-2 border-[var(--glass-border)]"
                            title="Pan up"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCanvasPan(canvas.id, 0, PAN_STEP)}
                            className="h-8 px-2 border-[var(--glass-border)]"
                            title="Pan down"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                          <Label className="flex items-center gap-2 text-sm text-foreground-muted cursor-pointer ml-2">
                            <Checkbox
                              checked={sectionDragEnabled.get(canvas.id) ?? false}
                              onCheckedChange={(v) => {
                                setSectionDragEnabled((prev) => {
                                  const next = new Map(prev);
                                  next.set(canvas.id, !!v);
                                  return next;
                                });
                              }}
                              aria-label="Drag canvas"
                            />
                            Drag
                          </Label>
                        </div>
                        <div
                          className="relative rounded-lg border border-[var(--glass-border)] overflow-hidden bg-black/20 seat-selector-scroll max-h-[520px] cursor-default"
                          style={{
                            width: canvasSize.w,
                            height: canvasSize.h,
                            maxWidth: "100%",
                          }}
                          onClick={handleCanvasClick}
                        >
                          {sectionDragEnabled.get(canvas.id) && (
                            <div
                              className="absolute inset-0 z-50"
                              style={{
                                cursor: (isDraggingCanvasBySection.get(canvas.id) ?? false) ? "grabbing" : "grab",
                                pointerEvents: "auto",
                              }}
                              onPointerDown={(e) => handleCanvasDragPointerDown(canvas.id, e)}
                              onPointerMove={(e) => handleCanvasDragPointerMove(canvas.id, e)}
                              onPointerUp={(e) => handleCanvasDragPointerUp(canvas.id, e)}
                              onPointerLeave={(e) => handleCanvasDragPointerUp(canvas.id, e)}
                              onPointerCancel={(e) => handleCanvasDragPointerUp(canvas.id, e)}
                              aria-hidden
                              title="Drag to pan"
                            />
                          )}
                          <div
                            ref={(el) => {
                              if (el) scrollContainerRefs.current.set(canvas.id, el);
                            }}
                            className="overflow-auto w-full h-full"
                            style={{
                              maxHeight: 520,
                            }}
                          >
                            <div
                              style={{
                                width: canvasSize.w * (canvasZoom ?? 1),
                                height: canvasSize.h * (canvasZoom ?? 1),
                                minWidth: canvasSize.w * (canvasZoom ?? 1),
                                minHeight: canvasSize.h * (canvasZoom ?? 1),
                              }}
                            >
                              <div
                                className="relative"
                                style={{
                                  width: canvasSize.w,
                                  height: canvasSize.h,
                                  transform: `scale(${canvasZoom ?? 1})`,
                                  transformOrigin: "top left",
                                }}
                              >
                              {layout.imageUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={layout.imageUrl}
                                  alt=""
                                  className="absolute inset-0 w-full h-full object-contain"
                                  style={{ opacity: layout.opacity }}
                                  onLoad={(e) => {
                                    const img = e.target as HTMLImageElement;
                                    if (img.naturalWidth && img.naturalHeight) {
                                      setCanvasImageSizes((prev) => {
                                        const m = new Map(prev);
                                        m.set(canvas.id, {
                                          w: img.naturalWidth,
                                          h: img.naturalHeight,
                                        });
                                        return m;
                                      });
                                    }
                                  }}
                                />
                              )}
                              {selectRect?.canvasId === canvas.id && (
                                <div
                                  className="absolute border-2 border-[var(--wish-orange)] bg-[var(--wish-orange)]/20 pointer-events-none"
                                  style={{
                                    left: Math.min(selectRect.startX, selectRect.endX),
                                    top: Math.min(selectRect.startY, selectRect.endY),
                                    width: Math.abs(selectRect.endX - selectRect.startX),
                                    height: Math.abs(selectRect.endY - selectRect.startY),
                                  }}
                                />
                              )}
                              {(altHeld || marqueeMode) && (
                                <div
                                  className="absolute inset-0 cursor-crosshair"
                                  style={{ zIndex: 0, pointerEvents: "auto" }}
                                  onPointerDown={(e) => handleCanvasPointerDown(canvas.id, e, true)}
                                  aria-hidden
                                  title="Drag to select"
                                />
                              )}
                              <div className="relative" style={{ zIndex: 10 }}>
                              <DndContext
                                sensors={sensors}
                                onDragStart={handleDragStart}
                                onDragEnd={handleDragEnd}
                              >
                                {canvasSeats.map((seat) => {
                                  const pos = positions.get(seat.id) ?? { x: 0, y: 0 };
                                  const displayPos = {
                                    x: pos.x * uniformScale,
                                    y: pos.y * uniformScale,
                                  };
                                  const displaySeatSize = SEAT_SIZE * uniformScale;
                                  const sectionColor =
                                    sectionColorMap.get(seat.event_section_id) ??
                                    DEFAULT_SECTION_COLOR;
                                  const isLocked =
                                    sectionLocked.get(seat.event_section_id) === true;
                                  return (
                                    <SeatChip
                                      key={seat.id}
                                      seat={seat}
                                      position={displayPos}
                                      size={displaySeatSize}
                                      isDragging={activeId === seat.id}
                                      isSelected={selectedSeatIds.has(seat.id)}
                                      sectionColor={sectionColor}
                                      disabled={isLocked}
                                      onSelect={(e) =>
                                        handleSeatSelect(seat.id, e, canvasSeats)
                                      }
                                    />
                                  );
                                })}
                              </DndContext>
                              </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {canvasSeats.length === 0 && (
                      <p className="text-sm text-foreground-muted py-4">
                        Add sections above and upload a venue plan to position seats.
                      </p>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })
        ) : (
        assignedSections.map((sec) => {
          const sectionSeats = assignedSeats.filter((s) => s.event_section_id === sec.id);
          if (sectionSeats.length === 0) return null;
          const layout = sectionLayouts.get(sec.id) ?? eventLayout;
          const sectionZoom = sectionZooms.get(sec.id) ?? 1;
          const dragEnabled = sectionDragEnabled.get(sec.id) ?? false;
          const isDragging = isDraggingCanvasBySection.get(sec.id) ?? false;
          const imageNaturalSize = sectionImageSizes.get(sec.id) ?? null;
          const canvasSize = getSectionCanvasSize(sec.id);
          const uniformScale = getSectionUniformScale(sec.id);
          const sectionColor = sectionColorMap.get(sec.id) ?? DEFAULT_SECTION_COLOR;
          const selCount = sectionSelectedCount(sec.id);

          const isExpanded = expandedSectionIds.has(sec.id);
          const toggleSection = () => {
            setExpandedSectionIds((prev) => {
              const next = new Set(prev);
              if (next.has(sec.id)) next.delete(sec.id);
              else next.add(sec.id);
              return next;
            });
          };

          return (
            <Card key={sec.id} className="border-[var(--glass-border)] bg-white/5 overflow-hidden">
              <button
                type="button"
                onClick={toggleSection}
                className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-white/5 transition-colors"
                aria-expanded={isExpanded}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div
                    className="h-6 w-6 shrink-0 rounded border border-[var(--glass-border)]"
                    style={{ backgroundColor: sectionColor }}
                    aria-hidden
                  />
                  <CardTitle className="text-base text-foreground">
                    {sec.name || sec.section_code || "Section"}
                  </CardTitle>
                </div>
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-foreground-muted shrink-0" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-foreground-muted shrink-0" />
                )}
              </button>
              {isExpanded && (
              <CardContent className="space-y-4 pt-0 pb-4 px-4">
                <div className="flex flex-wrap items-center gap-4">
                  <input
                    ref={(el) => {
                      if (el) fileInputRefs.current.set(sec.id, el);
                    }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => handleFileUpload(sec.id, e)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRefs.current.get(sec.id)?.click()}
                    disabled={uploading}
                    className="border-[var(--glass-border)]"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {uploading ? "Uploading..." : "Upload venue plan"}
                  </Button>
                  {layout.imageUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => saveSectionLayout(sec.id, { imageUrl: null })}
                      className="border-[var(--glass-border)]"
                    >
                      Remove
                    </Button>
                  )}
                </div>
                {layout.imageUrl && (
                  <div className="flex flex-wrap gap-6 items-center">
                    <div className="flex items-center gap-3 w-48">
                      <Label className="text-foreground-muted text-sm shrink-0">Opacity</Label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={layout.opacity}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) ?? 0.5;
                          setSectionLayouts((prev) => {
                            const m = new Map(prev);
                            m.set(sec.id, { ...layout, opacity: v });
                            return m;
                          });
                          saveOpacityDebounced(sec.id, v);
                        }}
                        onPointerUp={(e) => {
                          const v = parseFloat((e.target as HTMLInputElement).value) ?? 0.5;
                          opacitySaveRefs.current.delete(sec.id);
                          saveSectionLayout(sec.id, { opacity: v }, { silent: true });
                        }}
                        className="flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-[var(--wish-orange)] bg-white/10"
                        aria-label="Background image opacity"
                      />
                      <span className="text-foreground-muted text-xs w-8 tabular-nums shrink-0">
                        {Math.round(layout.opacity * 100)}%
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleUndo}
          disabled={positionsHistory.length === 0}
          className="border-[var(--glass-border)] h-8 px-2"
          title="Undo last move or align (Ctrl/Cmd+Z)"
        >
          <Undo2 className="w-4 h-4 mr-1.5" />
          Undo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => resetSectionPositions(sec.id)}
          className="border-[var(--glass-border)] h-8 px-2"
          title="Reset all seats in this section to default positions"
        >
          <RotateCcw className="w-4 h-4 mr-1.5" />
          Reset positions
        </Button>
        <Button
          type="button"
          variant={marqueeMode ? "default" : "outline"}
          size="sm"
          onClick={() => setMarqueeMode((m) => !m)}
          className="border-[var(--glass-border)] h-8 px-2"
          title="Click to drag-select multiple seats from anywhere. Or hold Alt and drag."
        >
          <Square className="w-4 h-4 mr-1.5" />
          Marquee
        </Button>
        <span className="text-sm text-foreground-muted mr-2">Align:</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => alignSeatsInSection("left", sec.id)}
          disabled={selCount < 2}
          className="border-[var(--glass-border)] h-8 px-2"
          title="Align left"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => alignSeatsInSection("right", sec.id)}
          disabled={selCount < 2}
          className="border-[var(--glass-border)] h-8 px-2"
          title="Align right"
        >
          <ArrowRight className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => alignSeatsInSection("top", sec.id)}
          disabled={selCount < 2}
          className="border-[var(--glass-border)] h-8 px-2"
          title="Align top"
        >
          <ArrowUp className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => alignSeatsInSection("bottom", sec.id)}
          disabled={selCount < 2}
          className="border-[var(--glass-border)] h-8 px-2"
          title="Align bottom"
        >
          <ArrowDown className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => alignSeatsInSection("centerH", sec.id)}
          disabled={selCount < 2}
          className="border-[var(--glass-border)] h-8 px-2 text-xs"
          title="Center H"
        >
          Center H
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => alignSeatsInSection("centerV", sec.id)}
          disabled={selCount < 2}
          className="border-[var(--glass-border)] h-8 px-2 text-xs"
          title="Center V"
        >
          Center V
        </Button>
        <span className="text-sm text-foreground-muted mx-2">|</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => distributeHorizontalInSection(sec.id)}
          disabled={selCount < 2}
          className="border-[var(--glass-border)] h-8 px-2"
          title="Distribute horizontally with equal spacing"
        >
          <AlignHorizontalSpaceBetween className="w-4 h-4 mr-1.5" />
          Dist H
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => distributeVerticalInSection(sec.id)}
          disabled={selCount < 2}
          className="border-[var(--glass-border)] h-8 px-2"
          title="Distribute vertically with equal spacing"
        >
          <AlignVerticalSpaceBetween className="w-4 h-4 mr-1.5" />
          Dist V
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => arrangeAsGridInSection(sec.id)}
          disabled={selCount < 2}
          className="border-[var(--glass-border)] h-8 px-2"
          title="Arrange selected seats in a grid"
        >
          <LayoutGrid className="w-4 h-4 mr-1.5" />
          Grid
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground-muted">Zoom:</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSectionZoom(sec.id, sectionZoom - ZOOM_STEP)}
          disabled={sectionZoom <= 0.5}
          className="h-8 w-8 p-0 border-[var(--glass-border)]"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSectionZoom(sec.id, sectionZoom + ZOOM_STEP)}
          disabled={sectionZoom >= 2}
          className="h-8 w-8 p-0 border-[var(--glass-border)]"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Input
          type="number"
          min={50}
          max={200}
          step={5}
          value={Math.round(sectionZoom * 100)}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) setSectionZoom(sec.id, v / 100);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="w-14 h-8 text-xs tabular-nums text-center border-[var(--glass-border)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          title="Zoom (50–200)"
          aria-label="Zoom"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSectionZoom(sec.id, 1)}
          className="h-8 px-2 border-[var(--glass-border)]"
          title="Reset zoom"
        >
          <RotateCcw className="w-4 h-4 mr-1" />
          Reset
        </Button>
        <span className="text-neutral-600 mx-1">|</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleCanvasPan(sec.id, -PAN_STEP, 0)}
          className="h-8 px-2 border-[var(--glass-border)]"
          title="Pan left"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleCanvasPan(sec.id, PAN_STEP, 0)}
          className="h-8 px-2 border-[var(--glass-border)]"
          title="Pan right"
        >
          <ArrowRight className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleCanvasPan(sec.id, 0, -PAN_STEP)}
          className="h-8 px-2 border-[var(--glass-border)]"
          title="Pan up"
        >
          <ArrowUp className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleCanvasPan(sec.id, 0, PAN_STEP)}
          className="h-8 px-2 border-[var(--glass-border)]"
          title="Pan down"
        >
          <ArrowDown className="w-4 h-4" />
        </Button>
        <Label className="flex items-center gap-2 text-sm text-foreground-muted cursor-pointer ml-2">
          <Checkbox
            checked={dragEnabled}
            onCheckedChange={(v) => {
              setSectionDragEnabled((prev) => {
                const next = new Map(prev);
                next.set(sec.id, !!v);
                return next;
              });
            }}
            aria-label="Drag canvas"
          />
          Drag
        </Label>
      </div>

      <div
        ref={(el) => {
          if (el) scrollContainerRefs.current.set(sec.id, el);
        }}
        className="seat-selector-scroll relative overflow-auto rounded-lg border border-[var(--glass-border)] bg-white/5 max-h-[520px] cursor-default"
        onClick={handleCanvasClick}
      >
        {dragEnabled && (
          <div
            className="absolute inset-0 z-50"
            style={{
              cursor: isDragging ? "grabbing" : "grab",
              pointerEvents: "auto",
            }}
            onPointerDown={(e) => handleCanvasDragPointerDown(sec.id, e)}
            onPointerMove={(e) => handleCanvasDragPointerMove(sec.id, e)}
            onPointerUp={(e) => handleCanvasDragPointerUp(sec.id, e)}
            onPointerLeave={(e) => handleCanvasDragPointerUp(sec.id, e)}
            onPointerCancel={(e) => handleCanvasDragPointerUp(sec.id, e)}
            aria-hidden
            title="Drag to pan"
          />
        )}
        <div
          style={{
            width: canvasSize.w * sectionZoom,
            height: canvasSize.h * sectionZoom,
            minWidth: canvasSize.w * sectionZoom,
            minHeight: canvasSize.h * sectionZoom,
          }}
        >
          <div
            className="relative"
            style={{
              width: canvasSize.w,
              height: canvasSize.h,
              transform: `scale(${sectionZoom})`,
              transformOrigin: "top left",
            }}
          >
            {layout.imageUrl && (
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ zIndex: 0, pointerEvents: "none" }}
                aria-hidden
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={layout.imageUrl}
                  alt=""
                  draggable={false}
                  className={imageNaturalSize ? "select-none" : "w-full h-full object-contain select-none"}
                  style={{
                    opacity: layout.opacity,
                    ...(imageNaturalSize
                      ? { width: imageNaturalSize.w, height: imageNaturalSize.h, maxWidth: "none", maxHeight: "none" }
                      : { width: "100%", height: "100%" }),
                    pointerEvents: "none",
                    userSelect: "none",
                  }}
                  onLoad={(e) => {
                    const img = e.target as HTMLImageElement;
                    if (img.naturalWidth && img.naturalHeight) {
                      setSectionImageSizes((prev) => {
                        const m = new Map(prev);
                        m.set(sec.id, { w: img.naturalWidth, h: img.naturalHeight });
                        return m;
                      });
                    }
                  }}
                />
              </div>
            )}
            {/* Hit target for marquee/drag-to-select */}
            <div
              className="absolute inset-0"
              style={{ zIndex: 1 }}
              onPointerDown={(e) => handleCanvasPointerDown(sec.id, e)}
              aria-hidden
            />
            <div className="absolute inset-0" style={{ zIndex: 2, pointerEvents: "none" }}>
              {selectRect?.sectionId === sec.id && (
                <div
                  className="absolute border-2 border-[var(--wish-orange)] bg-[var(--wish-orange)]/20"
                  style={{
                    left: Math.min(selectRect.startX, selectRect.endX),
                    top: Math.min(selectRect.startY, selectRect.endY),
                    width: Math.abs(selectRect.endX - selectRect.startX),
                    height: Math.abs(selectRect.endY - selectRect.startY),
                  }}
                />
              )}
            </div>

            {/* Marquee overlay: when Alt held or Marquee mode on, start rect-select from anywhere */}
            {(altHeld || marqueeMode) && (
              <div
                className="absolute inset-0 cursor-crosshair"
                style={{ zIndex: 0, pointerEvents: "auto" }}
                onPointerDown={(e) => handleCanvasPointerDown(sec.id, e)}
                aria-hidden
                title="Drag to select"
              />
            )}

            <div className="relative" style={{ zIndex: 10 }}>
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              {sectionSeats.map((seat) => {
                const pos = positions.get(seat.id) ?? { x: 0, y: 0 };
                const displayPos = {
                  x: pos.x * uniformScale,
                  y: pos.y * uniformScale,
                };
                const displaySeatSize = SEAT_SIZE * uniformScale;
                const sectionColor = sectionColorMap.get(seat.event_section_id) ?? DEFAULT_SECTION_COLOR;
                const isLocked = sectionLocked.get(seat.event_section_id) === true;
                return (
                  <SeatChip
                    key={seat.id}
                    seat={seat}
                    position={displayPos}
                    size={displaySeatSize}
                    isDragging={activeId === seat.id}
                    isSelected={selectedSeatIds.has(seat.id)}
                    sectionColor={sectionColor}
                    disabled={isLocked}
                    onSelect={(e) => handleSeatSelect(seat.id, e, sectionSeats)}
                  />
                );
              })}
            </DndContext>
            </div>
          </div>
        </div>
      </div>
              </CardContent>
              )}
            </Card>
          );
        }) )}
      </div>

      <Button onClick={handleSavePositions} disabled={saving}>
        <Save className="w-4 h-4 mr-2" />
        {saving ? "Saving..." : "Save positions"}
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Section controls</CardTitle>
          <CardDescription>
            Lock sections to protect seat positions while editing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSectionLocked((prev) => {
                  const next = new Map(prev);
                  assignedSections.forEach((s) => next.set(s.id, true));
                  return next;
                });
              }}
              className="h-8 px-2 border-[var(--glass-border)]"
              title="Lock all sections"
            >
              <Lock className="w-4 h-4 mr-1.5" />
              Lock all
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSectionLocked((prev) => {
                  const next = new Map(prev);
                  assignedSections.forEach((s) => next.set(s.id, false));
                  return next;
                });
              }}
              className="h-8 px-2 border-[var(--glass-border)]"
              title="Unlock all sections"
            >
              <LockOpen className="w-4 h-4 mr-1.5" />
              Unlock all
            </Button>
          </div>
          {assignedSections.map((sec) => {
            const color = sectionColorMap.get(sec.id) ?? DEFAULT_SECTION_COLOR;
            const locked = sectionLocked.get(sec.id) === true;
            return (
              <div
                key={sec.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--glass-border)] p-3 bg-white/5"
              >
                <div
                  className="h-6 w-6 shrink-0 rounded border border-[var(--glass-border)]"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span className="text-sm font-medium text-foreground min-w-[100px]">
                  {sec.name || sec.section_code || "Section"}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={locked ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      setSectionLocked((prev) => {
                        const next = new Map(prev);
                        next.set(sec.id, !locked);
                        return next;
                      })
                    }
                    className="h-8 px-2 border-[var(--glass-border)]"
                    title={locked ? "Unlock section" : "Lock section"}
                  >
                    {locked ? (
                      <Lock className="w-4 h-4 mr-1.5" />
                    ) : (
                      <LockOpen className="w-4 h-4 mr-1.5" />
                    )}
                    {locked ? "Locked" : "Unlocked"}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
