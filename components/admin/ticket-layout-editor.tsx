"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { GripVertical, Maximize2 } from "lucide-react";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { getDirectTicketImageDisplayUrl } from "@/lib/image-proxy";
import {
  TICKET_TEMPLATE_WIDTH_PX,
  TICKET_TEMPLATE_HEIGHT_PX,
  DEFAULT_TICKET_LAYOUT,
  resolveTicketLayoutFromPersistence,
  TICKET_LAYOUT_SCHEMA_VERSION,
  type RegionPos,
  type TicketLayoutConfig,
} from "@/lib/ticket-canvas-spec";

export type { RegionPos, TicketLayoutConfig } from "@/lib/ticket-canvas-spec";

const DISPLAY_MAX_W = 375;

const DEFAULT_LAYOUT = DEFAULT_TICKET_LAYOUT;

const REGIONS = [
  {
    key: "eventInfo" as const,
    label: "Event Title / Venue / Date",
    defaultW: DEFAULT_LAYOUT.eventInfo.width ?? TICKET_TEMPLATE_WIDTH_PX,
    defaultH: DEFAULT_LAYOUT.eventInfo.height ?? 268,
    resizable: true,
  },
  {
    key: "section" as const,
    label: "Section & Seat",
    defaultW: DEFAULT_LAYOUT.section.width ?? 372,
    defaultH: DEFAULT_LAYOUT.section.height ?? 86,
    resizable: true,
  },
  {
    key: "price" as const,
    label: "Price",
    defaultW: DEFAULT_LAYOUT.price.width ?? 200,
    defaultH: DEFAULT_LAYOUT.price.height ?? 40,
    resizable: true,
  },
  {
    key: "qr" as const,
    label: "QR Code",
    defaultW: DEFAULT_LAYOUT.qr.size ?? 120,
    defaultH: DEFAULT_LAYOUT.qr.size ?? 120,
    resizable: true,
    isSquare: true,
  },
  {
    key: "ticketNumber" as const,
    label: "Ticket Number",
    defaultW: DEFAULT_LAYOUT.ticketNumber.width ?? 160,
    defaultH: DEFAULT_LAYOUT.ticketNumber.height ?? 43,
    resizable: true,
  },
  {
    key: "encryptedQr" as const,
    label: "Encrypted QR",
    defaultW: DEFAULT_LAYOUT.encryptedQr.width ?? 160,
    defaultH: DEFAULT_LAYOUT.encryptedQr.height ?? 43,
    resizable: true,
  },
  {
    key: "ticketNumber2" as const,
    label: "Ticket Number (2)",
    defaultW: DEFAULT_LAYOUT.ticketNumber2.width ?? 450,
    defaultH: DEFAULT_LAYOUT.ticketNumber2.height ?? 43,
    resizable: true,
  },
  {
    key: "admitOne" as const,
    label: "ADMIT ONE",
    defaultW: DEFAULT_LAYOUT.admitOne.width ?? 300,
    defaultH: DEFAULT_LAYOUT.admitOne.height ?? 44,
    resizable: true,
  },
] as const;

type RegionKey = (typeof REGIONS)[number]["key"];

interface TicketLayoutEditorProps {
  /** Preview background; each event can still use its own uploaded template image when generating tickets. */
  templateImageUrl?: string | null;
  initialConfig?: TicketLayoutConfig | null;
  onSaved?: (config: TicketLayoutConfig) => void;
  canvasWidth?: number;
  canvasHeight?: number;
}

function scaleLayoutToCanvas(
  layout: TicketLayoutConfig,
  targetWidth: number,
  targetHeight: number
): TicketLayoutConfig {
  const sx = targetWidth / TICKET_TEMPLATE_WIDTH_PX;
  const sy = targetHeight / TICKET_TEMPLATE_HEIGHT_PX;
  return {
    eventInfo: {
      ...layout.eventInfo,
      top: Math.round(layout.eventInfo.top * sy),
      left: Math.round(layout.eventInfo.left * sx),
      width: layout.eventInfo.width != null ? Math.max(1, Math.round(layout.eventInfo.width * sx)) : undefined,
      height: layout.eventInfo.height != null ? Math.max(1, Math.round(layout.eventInfo.height * sy)) : undefined,
    },
    section: {
      ...layout.section,
      top: Math.round(layout.section.top * sy),
      left: Math.round(layout.section.left * sx),
      width: layout.section.width != null ? Math.max(1, Math.round(layout.section.width * sx)) : undefined,
      height: layout.section.height != null ? Math.max(1, Math.round(layout.section.height * sy)) : undefined,
    },
    price: {
      ...layout.price,
      top: Math.round(layout.price.top * sy),
      left: Math.round(layout.price.left * sx),
      width: layout.price.width != null ? Math.max(1, Math.round(layout.price.width * sx)) : undefined,
      height: layout.price.height != null ? Math.max(1, Math.round(layout.price.height * sy)) : undefined,
    },
    qr: {
      ...layout.qr,
      top: Math.round(layout.qr.top * sy),
      left: Math.round(layout.qr.left * sx),
      size: layout.qr.size != null ? Math.max(1, Math.round(layout.qr.size * Math.sqrt(sx * sy))) : undefined,
    },
    ticketNumber: {
      ...layout.ticketNumber,
      top: Math.round(layout.ticketNumber.top * sy),
      left: Math.round(layout.ticketNumber.left * sx),
      width: layout.ticketNumber.width != null ? Math.max(1, Math.round(layout.ticketNumber.width * sx)) : undefined,
      height:
        layout.ticketNumber.height != null
          ? Math.max(1, Math.round(layout.ticketNumber.height * sy))
          : undefined,
    },
    encryptedQr: {
      ...layout.encryptedQr,
      top: Math.round(layout.encryptedQr.top * sy),
      left: Math.round(layout.encryptedQr.left * sx),
      width: layout.encryptedQr.width != null ? Math.max(1, Math.round(layout.encryptedQr.width * sx)) : undefined,
      height:
        layout.encryptedQr.height != null
          ? Math.max(1, Math.round(layout.encryptedQr.height * sy))
          : undefined,
    },
    ticketNumber2: {
      ...layout.ticketNumber2,
      top: Math.round(layout.ticketNumber2.top * sy),
      left: Math.round(layout.ticketNumber2.left * sx),
      width:
        layout.ticketNumber2.width != null
          ? Math.max(1, Math.round(layout.ticketNumber2.width * sx))
          : undefined,
      height:
        layout.ticketNumber2.height != null
          ? Math.max(1, Math.round(layout.ticketNumber2.height * sy))
          : undefined,
    },
    admitOne: {
      ...layout.admitOne,
      top: Math.round(layout.admitOne.top * sy),
      left: Math.round(layout.admitOne.left * sx),
      width: layout.admitOne.width != null ? Math.max(1, Math.round(layout.admitOne.width * sx)) : undefined,
      height: layout.admitOne.height != null ? Math.max(1, Math.round(layout.admitOne.height * sy)) : undefined,
    },
    qrSize:
      layout.qrSize != null
        ? Math.max(1, Math.round(layout.qrSize * Math.sqrt(sx * sy)))
        : undefined,
  };
}

function normalizeLayout(cfg: unknown, canvasWidth: number, canvasHeight: number): TicketLayoutConfig {
  const normalized = resolveTicketLayoutFromPersistence(cfg);
  if (canvasWidth === TICKET_TEMPLATE_WIDTH_PX && canvasHeight === TICKET_TEMPLATE_HEIGHT_PX) {
    return normalized;
  }
  return scaleLayoutToCanvas(normalized, canvasWidth, canvasHeight);
}

function getRegionSize(
  layout: TicketLayoutConfig,
  key: (typeof REGIONS)[number]["key"]
): { w: number; h: number } {
  const region = REGIONS.find((r) => r.key === key)!;
  const pos = layout[key] as RegionPos;
  if (key === "qr" && typeof pos.size === "number") return { w: pos.size, h: pos.size };
  return {
    w: pos.width ?? region.defaultW,
    h: pos.height ?? region.defaultH,
  };
}

export function TicketLayoutEditor({
  templateImageUrl,
  initialConfig,
  onSaved,
  canvasWidth = TICKET_TEMPLATE_WIDTH_PX,
  canvasHeight = TICKET_TEMPLATE_HEIGHT_PX,
}: TicketLayoutEditorProps) {
  const router = useRouter();
  const [layout, setLayout] = useState<TicketLayoutConfig>(
    () => normalizeLayout(initialConfig, canvasWidth, canvasHeight)
  );
  const [saving, setSaving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<RegionKey | null>(null);
  const [dragging, setDragging] = useState<RegionKey | null>(null);
  const [resizing, setResizing] = useState<RegionKey | null>(null);
  const dragStart = useRef<{ x: number; y: number; top: number; left: number } | null>(null);
  const resizeStart = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
    left: number;
    top: number;
  } | null>(null);
  /** True between pointer down and up; cleared synchronously on up so arrow keys work right after a click. */
  const pointerGestureActiveRef = useRef(false);

  useEffect(() => {
    setLayout(normalizeLayout(initialConfig, canvasWidth, canvasHeight));
  }, [initialConfig, canvasHeight, canvasWidth]);

  const scale = DISPLAY_MAX_W / canvasWidth;

  const nudgeRegion = useCallback((key: RegionKey, deltaLeft: number, deltaTop: number) => {
    setLayout((prev) => {
      const { w, h } = getRegionSize(prev, key);
      const pos = prev[key] as RegionPos;
      const newLeft = Math.round(Math.max(0, Math.min(canvasWidth - w, pos.left + deltaLeft)));
      const newTop = Math.round(Math.max(0, Math.min(canvasHeight - h, pos.top + deltaTop)));
      return { ...prev, [key]: { ...pos, left: newLeft, top: newTop } };
    });
  }, [canvasHeight, canvasWidth]);

  const handleRegionKeyDown = useCallback(
    (key: RegionKey, e: React.KeyboardEvent) => {
      if (pointerGestureActiveRef.current) return;
      const step = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          nudgeRegion(key, -step, 0);
          break;
        case "ArrowRight":
          e.preventDefault();
          nudgeRegion(key, step, 0);
          break;
        case "ArrowUp":
          e.preventDefault();
          nudgeRegion(key, 0, -step);
          break;
        case "ArrowDown":
          e.preventDefault();
          nudgeRegion(key, 0, step);
          break;
        case "Escape":
          e.preventDefault();
          setSelectedKey(null);
          (e.currentTarget as HTMLElement).blur();
          break;
        default:
          break;
      }
    },
    [nudgeRegion]
  );

  const handlePointerDown = useCallback(
    (key: RegionKey, e: React.PointerEvent) => {
      const el = e.currentTarget as HTMLElement;
      pointerGestureActiveRef.current = true;
      el.focus({ preventScroll: true });
      setSelectedKey(key);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const pos = layout[key] as RegionPos;
      setDragging(key);
      dragStart.current = { x: e.clientX, y: e.clientY, top: pos.top, left: pos.left };
    },
    [layout]
  );

  const handleResizePointerDown = useCallback(
    (key: RegionKey, e: React.PointerEvent) => {
      e.stopPropagation();
      pointerGestureActiveRef.current = true;
      const handleEl = e.currentTarget as HTMLElement;
      const regionEl = handleEl.parentElement as HTMLElement | null;
      regionEl?.focus({ preventScroll: true });
      setSelectedKey(key);
      try {
        (regionEl ?? handleEl).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const pos = layout[key] as RegionPos;
      const { w, h } = getRegionSize(layout, key);
      setResizing(key);
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        w,
        h,
        left: pos.left,
        top: pos.top,
      };
    },
    [layout]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (resizing && resizeStart.current) {
        const region = REGIONS.find((r) => r.key === resizing)!;
        const dx = (e.clientX - resizeStart.current.x) / scale;
        const dy = (e.clientY - resizeStart.current.y) / scale;
        let newW = Math.round(
          Math.max(40, Math.min(canvasWidth - resizeStart.current.left, resizeStart.current.w + dx))
        );
        let newH = Math.round(
          Math.max(24, Math.min(canvasHeight - resizeStart.current.top, resizeStart.current.h + dy))
        );
        if ("isSquare" in region && region.isSquare) {
          const s = Math.max(40, Math.max(newW, newH));
          newW = s;
          newH = s;
        }
        setLayout((prev) => {
          const pos = { ...prev[resizing] } as RegionPos;
          if ("isSquare" in region && region.isSquare) pos.size = newW;
          else {
            pos.width = newW;
            pos.height = newH;
          }
          return { ...prev, [resizing]: pos };
        });
        return;
      }
      if (!dragging || !dragStart.current) return;
      const { w, h } = getRegionSize(layout, dragging);
      const dx = (e.clientX - dragStart.current.x) / scale;
      const dy = (e.clientY - dragStart.current.y) / scale;
      const newTop = Math.round(Math.max(0, Math.min(canvasHeight - h, dragStart.current.top + dy)));
      const newLeft = Math.round(Math.max(0, Math.min(canvasWidth - w, dragStart.current.left + dx)));
      setLayout((prev) => ({
        ...prev,
        [dragging]: { ...(prev[dragging] as RegionPos), top: newTop, left: newLeft },
      }));
    },
    [canvasHeight, canvasWidth, dragging, resizing, layout, scale]
  );

  const releaseInteraction = useCallback(() => {
    pointerGestureActiveRef.current = false;
    setDragging(null);
    setResizing(null);
    dragStart.current = null;
    resizeStart.current = null;
  }, []);

  /** Any pointer release clears gesture + drag state (fixes ultra-fast click before React attaches window listeners). */
  useEffect(() => {
    document.addEventListener("pointerup", releaseInteraction, true);
    document.addEventListener("pointercancel", releaseInteraction, true);
    return () => {
      document.removeEventListener("pointerup", releaseInteraction, true);
      document.removeEventListener("pointercancel", releaseInteraction, true);
    };
  }, [releaseInteraction]);

  useEffect(() => {
    if (!dragging && !resizing) return;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", releaseInteraction);
    window.addEventListener("pointerleave", releaseInteraction);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", releaseInteraction);
      window.removeEventListener("pointerleave", releaseInteraction);
    };
  }, [dragging, resizing, handlePointerMove, releaseInteraction]);

  async function handleSave() {
    setSaving(true);
    try {
      const persisted = { ...layout, schemaVersion: TICKET_LAYOUT_SCHEMA_VERSION };
      const body = { global_ticket_layout_config: persisted };
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save");
      }
      onSaved?.(layout);
      router.refresh();
      toast.success("Layout saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setLayout(normalizeLayout(DEFAULT_LAYOUT, canvasWidth, canvasHeight));
    toast.success("Reset to default");
  }

  return (
    <div className="space-y-4">
      <FloatingProgressBar
        active={saving}
        {...FLOATING_PROGRESS_PRESETS.genericSave}
        message="Saving ticket layout…"
        subtitle="Template editor"
      />
      <p className="text-sm text-foreground-muted">
        Click a box to select it, then use <kbd className="rounded border border-[var(--glass-border)] px-1">arrow keys</kbd> to nudge (hold{" "}
        <kbd className="rounded border border-[var(--glass-border)] px-1">Shift</kbd> for 10px). Drag to move or drag the corner to resize.{" "}
        <kbd className="rounded border border-[var(--glass-border)] px-1">Esc</kbd> clears selection. Changes apply after Save.
      </p>
      <div
        className="relative overflow-auto rounded-lg border border-[var(--glass-border)] bg-neutral-900"
        style={{ maxHeight: 500 }}
      >
        <div
          className="relative mx-auto bg-[var(--surface)]"
          style={{
            width: canvasWidth * scale,
            height: canvasHeight * scale,
            minWidth: canvasWidth * scale,
          }}
        >
          {/* Background */}
          {templateImageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={getDirectTicketImageDisplayUrl(templateImageUrl) ?? templateImageUrl}
              alt="Template"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <div
              className="absolute inset-0 opacity-80"
              style={{
                background: "linear-gradient(180deg, #1e3a5f 0%, #0f172a 100%)",
              }}
            />
          )}
          {/* Draggable regions */}
          {REGIONS.map(({ key, label, resizable }) => {
            const pos = layout[key] as RegionPos;
            const { w, h } = getRegionSize(layout, key);
            const isSelected = selectedKey === key;
            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                aria-label={`${label} overlay. Use arrow keys to move when focused; Shift for 10 pixel steps.`}
                onPointerDown={(e) => handlePointerDown(key, e)}
                onFocus={() => setSelectedKey(key)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setSelectedKey((cur) => (cur === key ? null : cur));
                  }
                }}
                onKeyDown={(e) => handleRegionKeyDown(key, e)}
                className={`absolute flex flex-col border-2 border-dashed bg-[var(--wish-orange)]/20 transition-colors outline-none cursor-grab active:cursor-grabbing ${
                  isSelected
                    ? "border-white ring-2 ring-white/90 ring-offset-2 ring-offset-neutral-900 z-10 bg-[var(--wish-orange)]/35"
                    : "border-[var(--wish-orange)] hover:bg-[var(--wish-orange)]/30"
                }`}
                style={{
                  left: pos.left * scale,
                  top: pos.top * scale,
                  width: w * scale,
                  height: h * scale,
                  minWidth: Math.min(w * scale, 60),
                  minHeight: Math.min(h * scale, 24),
                }}
              >
                <div className="flex items-center gap-1 flex-1 min-h-0 p-0.5">
                  <GripVertical className="w-3 h-3 text-[var(--wish-orange)] shrink-0" />
                  <span className="text-[10px] text-foreground truncate">{label}</span>
                </div>
                {resizable && (
                  <div
                    role="button"
                    tabIndex={-1}
                    aria-label={`Resize ${label}`}
                    onPointerDown={(e) => handleResizePointerDown(key, e)}
                    className="absolute bottom-0 right-0 w-4 h-4 flex items-center justify-center cursor-nwse-resize bg-[var(--wish-orange)]/50 hover:bg-[var(--wish-orange)]/70 rounded-tl"
                    style={{ margin: "-1px -1px 0 0" }}
                    title="Resize"
                  >
                    <Maximize2 className="w-2.5 h-2.5 text-foreground" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}>
          Save layout
        </Button>
        <Button variant="outline" onClick={handleReset} disabled={saving} className="border-[var(--glass-border)]">
          Reset to default
        </Button>
      </div>
    </div>
  );
}
