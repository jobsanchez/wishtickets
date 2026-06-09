"use client";

import {
  useState,
  useRef,
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import { cn } from "@/lib/utils";
import { hexToRgba, normalizeHexColor } from "./assign-seats-helpers";
import type { SeatInfo } from "./assign-seats-types";

const MARQUEE_COMMIT_PX_SQ = 25; // 5px movement starts marquee (clicks stay taps)

/** Free/standing physical seats: click toggle, Shift+click range, drag marquee (toggles each seat in the box). */
export function FreeStandingChipPicker({
  fsSeats,
  selectedSeatIds,
  setSelectedSeatIds,
  accentColor,
}: {
  fsSeats: SeatInfo[];
  selectedSeatIds: Set<string>;
  setSelectedSeatIds: Dispatch<SetStateAction<Set<string>>>;
  accentColor?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectRect, setSelectRect] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);
  const lastAnchorIndexRef = useRef<number | null>(null);
  /** After a real marquee, ignore the synthetic click so we don’t double-toggle the start chip. */
  const suppressChipClickRef = useRef(false);

  const seatsById = useMemo(() => new Map(fsSeats.map((s) => [s.id, s])), [fsSeats]);
  const normalizedAccent = normalizeHexColor(accentColor);

  const handlePointerDownBubble = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const root = containerRef.current;
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

        suppressChipClickRef.current = true;

        const chipEls = root.querySelectorAll<HTMLElement>("[data-fs-seat-id]");
        const ids: string[] = [];
        for (const el of chipEls) {
          const seatId = el.getAttribute("data-fs-seat-id");
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
        setSelectedSeatIds((prev) => {
          const next = new Set(prev);
          for (const id of ids) {
            if (!seatsById.get(id)?.available) continue;
            if (next.has(id)) next.delete(id);
            else next.add(id);
          }
          return next;
        });
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [seatsById, setSelectedSeatIds]
  );

  const handleChipClick = useCallback(
    (e: React.MouseEvent, s: SeatInfo, idx: number) => {
      if (suppressChipClickRef.current) {
        suppressChipClickRef.current = false;
        return;
      }
      if (!s.available) return;
      if (e.shiftKey && lastAnchorIndexRef.current !== null) {
        const a = lastAnchorIndexRef.current;
        const lo = Math.min(a, idx);
        const hi = Math.max(a, idx);
        setSelectedSeatIds((prev) => {
          const next = new Set(prev);
          for (let i = lo; i <= hi; i++) {
            const row = fsSeats[i];
            if (row?.available) next.add(row.id);
          }
          return next;
        });
        return;
      }
      setSelectedSeatIds((prev) => {
        const next = new Set(prev);
        if (next.has(s.id)) next.delete(s.id);
        else next.add(s.id);
        return next;
      });
      lastAnchorIndexRef.current = idx;
    },
    [fsSeats, setSelectedSeatIds]
  );

  return (
    <div
      ref={containerRef}
      className="relative max-h-56 overflow-y-auto rounded-md border border-[var(--glass-border)]/80 bg-black/20 p-2 select-none"
      style={
        normalizedAccent
          ? { borderColor: normalizedAccent, backgroundColor: hexToRgba(normalizedAccent, 0.1) }
          : undefined
      }
      onPointerDown={handlePointerDownBubble}
    >
      <div className="flex flex-wrap gap-1.5">
        {fsSeats.map((s, idx) => {
          const isSelected = selectedSeatIds.has(s.id);
          const label = String(s.seat_number ?? "").trim() || `#${idx + 1}`;
          const title = `${s.row_label ?? ""} ${s.seat_number ?? ""}`.trim() || `Ticket ${idx + 1}`;
          return (
            <button
              key={s.id}
              type="button"
              data-fs-seat-id={s.id}
              title={`${title} — Click to toggle · Shift+click range · Drag (~5px+) to marquee (toggle seats in box)`}
              disabled={!s.available}
              onClick={(e) => handleChipClick(e, s, idx)}
              className={cn(
                "min-w-[2.25rem] rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                !s.available &&
                  "cursor-not-allowed border-white/10 bg-white/5 text-foreground-muted/50",
                s.available &&
                  !isSelected &&
                  "border-white/20 bg-white/5 text-foreground hover:bg-white/10",
                s.available &&
                  isSelected &&
                  "border-amber-400/80 bg-amber-500/25 text-foreground ring-1 ring-amber-400/50"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {selectRect ? (
        <div
          className="fixed border-2 border-[var(--wish-orange)] bg-[var(--wish-orange)]/20 pointer-events-none z-50"
          style={{
            left: Math.min(selectRect.startX, selectRect.endX),
            top: Math.min(selectRect.startY, selectRect.endY),
            width: Math.abs(selectRect.endX - selectRect.startX),
            height: Math.abs(selectRect.endY - selectRect.startY),
          }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
