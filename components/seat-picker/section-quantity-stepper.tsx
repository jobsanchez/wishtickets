"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Availability + cart sync are debounced (~520ms); `maxQuantity` can briefly dip on refetch — wait before forcing a lower quantity. */
const CAP_OVER_MAX_DEBOUNCE_MS = 450;

export interface SectionQuantityStepperProps {
  quantity: number;
  /** Maximum selectable quantity (same upper bound as before, inclusive). */
  maxQuantity: number;
  onChange: (next: number) => void;
  /** Passed to the control for screen readers. */
  ariaLabel: string;
  /** Stable id for the Radix Select (e.g. section id). Do not pass a changing max here — it remounts and resets the value. */
  instanceKey?: string;
  size?: "default" | "compact";
  className?: string;
  accentColor?: string;
}

export function SectionQuantityStepper({
  quantity,
  maxQuantity,
  onChange,
  ariaLabel,
  instanceKey,
  size = "default",
  className,
  accentColor,
}: SectionQuantityStepperProps) {
  const isCompact = size === "compact";
  const safeMax = Math.max(0, maxQuantity);

  const accent =
    accentColor && /^#[0-9a-fA-F]{3,8}$/.test(accentColor)
      ? accentColor
      : "var(--wish-orange)";

  const cappedQty = Math.min(Math.max(0, quantity), safeMax);

  const qtyRef = useRef(quantity);
  const maxRef = useRef(safeMax);
  qtyRef.current = quantity;
  maxRef.current = safeMax;

  useEffect(() => {
    if (quantity < 0) {
      onChange(0);
    }
  }, [quantity, onChange]);

  useEffect(() => {
    if (quantity <= safeMax) return;

    const timer = window.setTimeout(() => {
      const q = qtyRef.current;
      const m = maxRef.current;
      if (q > m) onChange(m);
    }, CAP_OVER_MAX_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [quantity, safeMax, onChange]);

  const options = useMemo(
    () => Array.from({ length: safeMax + 1 }, (_, i) => i),
    [safeMax]
  );

  return (
    <Select
      key={instanceKey ?? "section-qty"}
      value={String(cappedQty)}
      onValueChange={(v) => onChange(parseInt(v, 10))}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          "w-auto max-w-none shrink-0 gap-1.5 rounded-lg border-2 border-solid bg-white/5 shadow-none ring-offset-background",
          "justify-between hover:bg-white/[0.08]",
          "data-[state=open]:bg-white/[0.08]",
          isCompact
            ? "h-8 min-w-[4.25rem] px-2.5 py-0 text-base font-bold tabular-nums [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:opacity-70"
            : "h-11 min-w-[5rem] px-3 text-2xl font-bold tabular-nums sm:text-3xl [&>svg]:opacity-70",
          className
        )}
        style={{ borderColor: accent }}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        align="end"
        sideOffset={6}
        position="popper"
        className="max-h-[min(16rem,calc(100vh-6rem))] min-w-[var(--radix-select-trigger-width)] border-2 border-solid bg-[var(--glass-bg)] shadow-xl backdrop-blur-xl"
        style={{ borderColor: accent }}
      >
        {options.map((n) => (
          <SelectItem
            key={n}
            value={String(n)}
            className="cursor-pointer py-2 pl-8 pr-3 text-base font-semibold tabular-nums focus:bg-white/12 data-[highlighted]:bg-white/10"
          >
            {n}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
