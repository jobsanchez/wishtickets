"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Optional display formatter (e.g. for currency). Default: String(value) */
  format?: (n: number) => string;
  /** Optional parser from input string. Default: parseInt(s, 10) || min */
  parse?: (s: string, min: number) => number;
  className?: string;
  inputClassName?: string;
  /** Accessibility */
  "aria-label"?: string;
}

export function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (n) => String(n),
  parse = (s, m) => Math.max(m, parseInt(s, 10) || m),
  className,
  inputClassName,
  "aria-label": ariaLabel,
}: NumberStepperProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(clamp(parse(e.target.value, min)));
  };
  const inc = () => onChange(clamp(value + step));
  const dec = () => onChange(clamp(value - step));

  return (
    <div
      className={cn(
        "group flex h-11 items-stretch overflow-hidden rounded-xl border border-[var(--glass-border)] bg-background/40 shadow-sm backdrop-blur-sm",
        "focus-within:border-[var(--wish-orange)] focus-within:shadow-[0_0_0_2px_var(--wish-orange-muted)]",
        "transition-[border-color,box-shadow,background-color]",
        className
      )}
      aria-label={ariaLabel}
    >
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={format(value)}
        onChange={handleChange}
        className={cn(
          "h-full min-w-0 flex-1 border-0 rounded-none bg-transparent px-3 text-center text-sm font-semibold tracking-wide focus-visible:ring-0 focus-visible:ring-offset-0",
          "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          inputClassName
        )}
        aria-label={ariaLabel}
      />
      <div className="flex shrink-0 flex-col border-l border-[var(--glass-border)] bg-white/5">
        <button
          type="button"
          onClick={inc}
          disabled={value >= max}
          className="flex h-1/2 w-10 items-center justify-center text-foreground-muted transition-colors hover:bg-[var(--wish-orange-muted)] hover:text-[var(--wish-orange)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-foreground-muted"
          aria-label="Increase"
        >
          <ChevronUp className="size-3.5" />
        </button>
        <div className="h-px bg-[var(--glass-border)]" />
        <button
          type="button"
          onClick={dec}
          disabled={value <= min}
          className="flex h-1/2 w-10 items-center justify-center text-foreground-muted transition-colors hover:bg-[var(--wish-orange-muted)] hover:text-[var(--wish-orange)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-foreground-muted"
          aria-label="Decrease"
        >
          <ChevronDown className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
