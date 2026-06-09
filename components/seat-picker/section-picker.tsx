"use client";

import type { CSSProperties } from "react";
import { Label } from "@/components/ui/label";
import { SectionQuantityStepper } from "@/components/seat-picker/section-quantity-stepper";
import { resolveSectionAccentHex } from "@/lib/section-color";
import { cn } from "@/lib/utils";

const DEFAULT_PRICE_CENTS = 50000;

/** Tinted glass row: border + soft inset wash from the admin-configured section color (matches seat map / assigned headers). */
function openSeatingRowStyle(color: string): CSSProperties {
  return {
    borderColor: color,
    boxShadow: `inset 0 0 72px color-mix(in srgb, ${color} 24%, transparent)`,
  };
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
}

export interface SectionInfo {
  id: string;
  name: string;
  section_code?: string | null;
  capacity: number;
  available: number;
  /** Hex from seating config — used for row border / tint in open seating. */
  color?: string | null;
}

interface SectionPickerProps {
  sections: SectionInfo[];
  selected: Map<string, number>;
  onChange: (sectionId: string, quantity: number) => void;
  priceCentsBySectionId?: Record<string, number>;
  basePriceCentsBySectionId?: Record<string, number>;
  className?: string;
}

export function SectionPicker({
  sections,
  selected,
  onChange,
  priceCentsBySectionId = {},
  basePriceCentsBySectionId = {},
  className,
}: SectionPickerProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid gap-4">
        {sections.map((sec) => {
          const qty = selected.get(sec.id) ?? 0;
          /** Manifest counts exclude seats held in carts (including yours); add qty back so max matches handleSectionQtyChange. */
          const available = Math.max(0, Number(sec.available ?? 0));
          const maxSelectable = Math.min(10, available + qty);
          const isSoldOut = maxSelectable <= 0 && qty <= 0;
          const priceCents = priceCentsBySectionId[sec.id] ?? DEFAULT_PRICE_CENTS;
          const sectionHex = resolveSectionAccentHex(sec.color, sec.id);
          return (
            <div
              key={sec.id}
              className={cn(
                "relative flex items-center justify-between gap-4 rounded-lg p-4 border-2 border-solid [background:var(--glass-bg)]",
                isSoldOut && "opacity-75"
              )}
              style={openSeatingRowStyle(sectionHex)}
            >
              {isSoldOut && (
                <div
                  role="status"
                  aria-label="Sold out"
                  className="absolute top-2 right-2 z-10 px-4 py-1.5 rounded pointer-events-none -rotate-6 bg-amber-400/95 border border-red-600 shadow-sm"
                >
                  <span className="text-sm font-bold uppercase tracking-wide text-red-600">
                    Sold Out
                  </span>
                </div>
              )}
              <div>
                <Label className="text-lg font-semibold text-foreground">
                  {sec.name || sec.section_code}
                </Label>
                <p className="text-sm text-foreground-muted mt-0.5">
                  {basePriceCentsBySectionId[sec.id] != null ? (
                    <>
                      <span className="line-through opacity-75">{formatPrice(basePriceCentsBySectionId[sec.id])}</span>{" "}
                      <span>{formatPrice(priceCents)}</span>
                      <span className="ml-1">(Early bird) per ticket</span>
                    </>
                  ) : (
                    `${formatPrice(priceCents)} per ticket`
                  )}
                </p>
              </div>
              {!isSoldOut && (
                <SectionQuantityStepper
                  quantity={qty}
                  maxQuantity={maxSelectable}
                  onChange={(next) => onChange(sec.id, next)}
                  ariaLabel={`Quantity for ${sec.name || sec.section_code}`}
                  instanceKey={`picker-${sec.id}`}
                  size="compact"
                  className="shrink-0"
                  accentColor={sectionHex}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
