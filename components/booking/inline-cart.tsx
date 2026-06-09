"use client";

import { useState, useMemo } from "react";
import { Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionQuantityStepper } from "@/components/seat-picker/section-quantity-stepper";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ReservationItem } from "@/store/reservation-store";
import { resolveSectionAccentHex } from "@/lib/section-color";

const DEFAULT_PRICE_CENTS = 0;

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
}

function formatBuyerLineTotal(cents: number): string {
  if (cents <= 0) return "Free";
  return formatPrice(cents);
}

/** Open-seating / GA row copy for the Seat / Details column (and mobile subtitle). */
function openSeatingDetailLabel(
  seatingType: "assigned" | "free" | "standing" | undefined
): string | null {
  const t = (seatingType ?? "assigned").toLowerCase();
  if (t === "free") return "Free seating";
  if (t === "standing") return "Standing";
  return null;
}

interface SeatInfo {
  id: string;
  row_label: string | null;
  seat_number: string | null;
  section_id: string | null;
  available: boolean;
}

interface SectionInfo {
  id: string;
  name: string;
  section_code?: string | null;
  capacity: number;
  available: number;
  seating_type?: "assigned" | "free" | "standing";
  color?: string | null;
}

interface InlineCartProps {
  seats: SeatInfo[];
  sections: SectionInfo[];
  items: ReservationItem[];
  priceCentsBySectionId?: Record<string, number>;
  basePriceCentsBySectionId?: Record<string, number>;
  addOnsById?: Record<string, { title: string; price_cents: number }>;
  addOnStockById?: Record<string, number>;
  /** Per add-on: min(stock, max_qty_per_cart); controls +/- when set. */
  addOnPurchaseMaxById?: Record<string, number>;
  expiresAt?: string | null;
  onRemoveSeat: (seatId: string) => void;
  onSectionQtyChange: (sectionId: string, quantity: number) => void;
  onAddOnQtyChange?: (addOnId: string, quantity: number, maxStock: number) => void;
  onClearCart: () => void;
  onProceedToCheckout: () => void;
  onExpired?: () => void;
  isClearing?: boolean;
  isProceedingToCheckout?: boolean;
}

export function InlineCart({
  seats,
  sections,
  items,
  priceCentsBySectionId = {},
  basePriceCentsBySectionId = {},
  addOnsById = {},
  addOnStockById = {},
  addOnPurchaseMaxById,
  onRemoveSeat,
  onSectionQtyChange,
  onAddOnQtyChange,
  onClearCart,
  onProceedToCheckout,
  isClearing = false,
  isProceedingToCheckout = false,
}: InlineCartProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const hasItems = items.length > 0;

  const groupedItems = useMemo(() => {
    const groups: Array<{
      sectionId: string;
      section: SectionInfo | null;
      seatItems: typeof items;
      sectionItems: typeof items;
    }> = [];
    const bySection = new Map<
      string,
      { section: SectionInfo | null; seatItems: typeof items; sectionItems: typeof items }
    >();
    const getOrCreate = (sectionId: string, section: SectionInfo | null) => {
      if (!bySection.has(sectionId)) {
        bySection.set(sectionId, {
          section,
          seatItems: [],
          sectionItems: [],
        });
      }
      return bySection.get(sectionId)!;
    };
    for (const item of items) {
      if (item.type === "seat") {
        const seat = seats.find((s) => s.id === (item.type === "seat" ? item.seat_id : ""));
        const sid = seat?.section_id ?? "__unspecified__";
        const sec = sid !== "__unspecified__" ? sections.find((s) => s.id === sid) ?? null : null;
        getOrCreate(sid, sec).seatItems.push(item);
      } else if (item.type === "section") {
        const sec = sections.find((s) => s.id === item.section_id) ?? null;
        getOrCreate(item.section_id, sec).sectionItems.push(item);
      }
    }
    const order = sections.map((s) => s.id);
    for (const sec of sections) {
      const g = bySection.get(sec.id);
      if (g && (g.seatItems.length > 0 || g.sectionItems.length > 0)) {
        groups.push({ sectionId: sec.id, ...g });
      }
    }
    for (const [sectionId, g] of bySection) {
      if (!order.includes(sectionId) && (g.seatItems.length > 0 || g.sectionItems.length > 0)) {
        groups.push({ sectionId, ...g });
      }
    }
    return groups;
  }, [items, seats, sections]);

  /** Flat list in section order (no section header rows); colors come from each row. */
  const flatCartRows = useMemo(() => {
    const rows: Array<
      | {
          kind: "seat";
          item: Extract<ReservationItem, { type: "seat" }>;
          section: SectionInfo | null;
          sectionId: string;
        }
      | {
          kind: "section";
          item: Extract<ReservationItem, { type: "section" }>;
          section: SectionInfo | null;
          sectionId: string;
        }
    > = [];
    for (const { sectionId, section, seatItems, sectionItems } of groupedItems) {
      for (const item of seatItems) {
        if (item.type === "seat") {
          rows.push({ kind: "seat", item, section, sectionId });
        }
      }
      for (const item of sectionItems) {
        if (item.type === "section") {
          rows.push({ kind: "section", item, section, sectionId });
        }
      }
    }
    return rows;
  }, [groupedItems]);

  const ticketCount =
    items.filter((i) => i.type === "seat").length +
    items
      .filter((i) => i.type === "section")
      .reduce((sum, i) => sum + i.quantity, 0);

  const addOnUnitCount = items
    .filter((i) => i.type === "add_on")
    .reduce((sum, i) => sum + i.quantity, 0);

  const headerCountLabel = (() => {
    const t = `${ticketCount} ticket${ticketCount !== 1 ? "s" : ""} selected`;
    if (addOnUnitCount > 0) {
      return `${t} · ${addOnUnitCount} add-on${addOnUnitCount !== 1 ? "s" : ""}`;
    }
    return t;
  })();

  const totalCents = useMemo(() => {
    let sum = 0;
    for (const item of items) {
      if (item.type === "seat") {
        const seat = seats.find((s) => s.id === (item.type === "seat" ? item.seat_id : ""));
        const sectionId = seat?.section_id;
        const cents = sectionId
          ? (priceCentsBySectionId[sectionId] ?? DEFAULT_PRICE_CENTS)
          : DEFAULT_PRICE_CENTS;
        sum += cents;
      } else if (item.type === "section") {
        const cents =
          priceCentsBySectionId[item.section_id] ?? DEFAULT_PRICE_CENTS;
        sum += cents * item.quantity;
      } else if (item.type === "add_on") {
        const cents = addOnsById[item.add_on_id]?.price_cents ?? 0;
        sum += cents * item.quantity;
      }
    }
    return sum;
  }, [items, seats, priceCentsBySectionId, addOnsById]);

  const hasMissingSectionPrice = useMemo(() => {
    for (const item of items) {
      if (item.type === "seat") {
        const seat = seats.find((s) => s.id === item.seat_id);
        const sectionId = seat?.section_id;
        if (sectionId && priceCentsBySectionId[sectionId] == null) return true;
      } else if (item.type === "section") {
        if (priceCentsBySectionId[item.section_id] == null) return true;
      }
    }
    return false;
  }, [items, seats, priceCentsBySectionId]);

  return (
    <div className="space-y-4">
      <div className="glass rounded-xl border border-[var(--glass-border)] p-4 sm:p-6">
        <button
          type="button"
          onClick={() => hasItems && setIsExpanded((e) => !e)}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={isExpanded}
        >
          <h2 className="text-lg font-semibold text-foreground">Cart</h2>
          <div className="flex items-center gap-3">
            <p className="text-sm text-foreground-muted">
              {headerCountLabel}
            </p>
            {hasItems && (
              <span className="text-foreground-muted" aria-hidden>
                {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </span>
            )}
          </div>
        </button>

        {isExpanded && (
          <>
            {!hasItems ? (
              <p className="text-foreground-muted py-4 mt-4">Cart is empty.</p>
            ) : (
              <div className="mt-4" role="region" aria-label="Cart items">
                <div
                  className="hidden sm:grid sm:grid-cols-12 sm:items-end sm:gap-x-2 sm:gap-y-0 sm:border-b sm:border-[var(--glass-border)] sm:pb-2 sm:mb-0"
                  aria-hidden
                >
                  <div className="col-span-3 text-left text-sm font-medium text-foreground-muted">
                    Section
                  </div>
                  <div className="col-span-4 text-left text-sm font-medium text-foreground-muted">
                    Seat / Details
                  </div>
                  <div className="col-span-2 text-right text-sm font-medium text-foreground-muted">
                    Price
                  </div>
                  <div className="col-span-3 text-right text-sm font-medium text-foreground-muted pr-0">
                    Actions
                  </div>
                </div>
                <ul className="list-none p-0 m-0 space-y-3 sm:space-y-0">
                    {flatCartRows.map((row, idx) => {
                      if (row.kind === "seat") {
                        const { item, section } = row;
                        const seat = seats.find((s) => s.id === item.seat_id);
                        const label = seat
                          ? `Row ${seat.row_label ?? "?"}, Seat ${seat.seat_number ?? "?"}`
                          : "Seat";
                        const sectionIdForSeat = seat?.section_id;
                        const seatCents =
                          sectionIdForSeat && priceCentsBySectionId[sectionIdForSeat] != null
                            ? priceCentsBySectionId[sectionIdForSeat]
                            : null;
                        const seatBaseCents = sectionIdForSeat
                          ? basePriceCentsBySectionId[sectionIdForSeat]
                          : undefined;
                        const sectionName =
                          (section?.name || section?.section_code) ?? "Section";
                        const itemColor = section?.color ?? null;
                        const rowStyle = itemColor?.startsWith("#")
                          ? { backgroundColor: `${itemColor}18` }
                          : undefined;
                        const firstCellStyle = itemColor?.startsWith("#")
                          ? { borderLeftWidth: 4, borderLeftColor: itemColor }
                          : undefined;
                        const sectionCellPad =
                          itemColor?.startsWith("#") ? "pl-3.5" : "pl-0 sm:pl-3";
                        const priceBlock = (
                          <div className="text-right text-sm text-foreground-muted tabular-nums">
                            {seatBaseCents != null && seatCents != null ? (
                              <>
                                <span className="line-through opacity-75">{formatPrice(seatBaseCents)}</span>{" "}
                                <span className="text-[var(--wish-orange)]">{formatPrice(seatCents)}</span>
                                <span className="ml-1 text-xs">(Early bird)</span>
                              </>
                            ) : (
                              seatCents != null
                                ? formatPrice(seatCents)
                                : "Updating price…"
                            )}
                          </div>
                        );
                        return (
                          <li
                            key={`seat-${row.sectionId}-${item.seat_id}-${idx}`}
                            className="rounded-xl border border-[var(--glass-border)] bg-white/5 p-4 sm:grid sm:grid-cols-12 sm:items-center sm:gap-x-2 sm:rounded-none sm:border-0 sm:border-b sm:p-0 sm:py-2.5 sm:px-0 sm:last:border-b-0"
                            style={rowStyle}
                          >
                            <div
                              className="flex items-start justify-between gap-3 sm:contents"
                            >
                              <div
                                className={`min-w-0 flex-1 sm:col-span-3 sm:flex sm:items-center sm:pr-2 text-foreground font-medium [text-wrap:balance] ${sectionCellPad}`}
                                style={firstCellStyle}
                              >
                                {sectionName}
                              </div>
                              <div className="shrink-0 sm:hidden text-right text-sm text-foreground-muted tabular-nums">
                                {priceBlock}
                              </div>
                            </div>
                            <div className="mt-1.5 text-sm text-foreground sm:col-span-4 sm:mt-0 sm:pr-2">
                              {label}
                            </div>
                            <div className="mt-1.5 hidden sm:col-span-2 sm:mt-0 sm:block sm:pr-2">
                              {priceBlock}
                            </div>
                            <div className="mt-3 flex justify-end sm:col-span-3 sm:mt-0 sm:justify-end sm:pr-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0"
                                onClick={() => onRemoveSeat(item.seat_id)}
                                aria-label="Remove seat"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </li>
                        );
                      }

                      const { item } = row;
                      const sec = sections.find((s) => s.id === item.section_id);
                      const name = (sec?.name || sec?.section_code) ?? "Section";
                      const currentQty = item.quantity;
                      const maxQty = (sec?.available ?? 0) + currentQty;
                      const sectionCents =
                        priceCentsBySectionId[item.section_id] ?? null;
                      const sectionBaseCents = basePriceCentsBySectionId[item.section_id];
                      const itemTotalCents =
                        sectionCents != null ? sectionCents * currentQty : null;
                      const itemColor = sec?.color ?? null;
                      const rowStyle = itemColor?.startsWith("#")
                        ? { backgroundColor: `${itemColor}18` }
                        : undefined;
                      const firstCellStyle = itemColor?.startsWith("#")
                        ? { borderLeftWidth: 4, borderLeftColor: itemColor }
                        : undefined;
                      const sectionCellPad =
                        itemColor?.startsWith("#") ? "pl-3.5" : "pl-0 sm:pl-3";
                      const openDetail = openSeatingDetailLabel(sec?.seating_type);
                      /** Free / standing: quantity is changed only in the section card, not in the cart. */
                      const isFreeOrStanding =
                        sec?.seating_type === "free" || sec?.seating_type === "standing";
                      const sectionAndQty = (
                        <span className="inline-block min-w-0 text-left">
                          <span className="text-foreground font-medium break-words">{name}</span>
                          <span className="text-foreground-muted font-normal">{` x ${currentQty}`}</span>
                        </span>
                      );
                      const priceBlock = (
                        <div className="text-right text-sm text-foreground-muted tabular-nums">
                          {sectionBaseCents != null && itemTotalCents != null ? (
                            <>
                              <span className="line-through opacity-75">
                                {formatPrice(sectionBaseCents * currentQty)}
                              </span>{" "}
                              <span className="text-[var(--wish-orange)]">{formatPrice(itemTotalCents)}</span>
                              <span className="ml-1 text-xs">(Early bird)</span>
                            </>
                          ) : (
                            itemTotalCents != null
                              ? formatPrice(itemTotalCents)
                              : "Updating price…"
                          )}
                        </div>
                      );
                      return (
                        <li
                          key={`section-${item.section_id}-${idx}`}
                          className="rounded-xl border border-[var(--glass-border)] bg-white/5 p-4 sm:grid sm:grid-cols-12 sm:items-center sm:gap-x-2 sm:rounded-none sm:border-0 sm:border-b sm:p-0 sm:py-2.5 sm:px-0 sm:last:border-b-0"
                          style={rowStyle}
                        >
                          <div className="flex items-start justify-between gap-3 sm:contents">
                            <div
                              className={`min-w-0 flex-1 sm:col-span-3 sm:flex sm:items-baseline sm:pr-2 ${sectionCellPad}`}
                              style={firstCellStyle}
                            >
                              {sectionAndQty}
                            </div>
                            <div className="shrink-0 sm:hidden text-right">
                              {priceBlock}
                            </div>
                          </div>
                          {openDetail ? (
                            <div className="mt-1.5 text-sm text-foreground-muted sm:hidden">
                              {openDetail}
                            </div>
                          ) : null}
                          <div className="hidden sm:col-span-4 sm:block sm:pr-2 text-sm text-foreground-muted">
                            {openDetail ?? "—"}
                          </div>
                          <div className="hidden sm:col-span-2 sm:block sm:pr-2">
                            {priceBlock}
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 sm:col-span-3 sm:mt-0 sm:justify-end">
                            {!isFreeOrStanding && (
                              <SectionQuantityStepper
                                quantity={currentQty}
                                maxQuantity={Math.min(10, maxQty)}
                                onChange={(next) => onSectionQtyChange(item.section_id, next)}
                                ariaLabel={`Quantity for ${name}`}
                                instanceKey={`cart-${item.section_id}`}
                                size="compact"
                                accentColor={resolveSectionAccentHex(itemColor, item.section_id)}
                              />
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0 shrink-0"
                              onClick={() => onSectionQtyChange(item.section_id, 0)}
                              aria-label="Remove section"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                    {items
                      .filter(
                        (i): i is Extract<ReservationItem, { type: "add_on" }> =>
                          i.type === "add_on"
                      )
                      .map((item, idx) => {
                        const meta = addOnsById[item.add_on_id];
                        const title = meta?.title?.trim() || "Add-on";
                        const cents = meta?.price_cents ?? 0;
                        const maxStock =
                          addOnPurchaseMaxById?.[item.add_on_id] ??
                          addOnStockById[item.add_on_id] ??
                          0;
                        const lineTotal = cents * item.quantity;
                        const canStep = !!onAddOnQtyChange;
                        return (
                          <li
                            key={`addon-${item.add_on_id}-${idx}`}
                            className="rounded-xl border border-[var(--glass-border)] bg-white/5 p-4 sm:grid sm:grid-cols-12 sm:items-center sm:gap-x-2 sm:rounded-none sm:border-0 sm:border-b sm:p-0 sm:py-2.5 sm:px-0 sm:last:border-b-0"
                          >
                            <div className="min-w-0 sm:col-span-3 sm:pr-2">
                              <span className="text-foreground font-medium">{title}</span>
                              <span className="ml-2 text-xs text-foreground-muted">Add-on</span>
                            </div>
                            <div className="mt-1 text-sm text-foreground-muted sm:col-span-4 sm:mt-0 sm:pr-2">
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  disabled={!canStep || item.quantity <= 0}
                                  aria-label="Decrease add-on quantity"
                                  onClick={() =>
                                    onAddOnQtyChange?.(item.add_on_id, item.quantity - 1, maxStock)
                                  }
                                >
                                  −
                                </Button>
                                <span className="tabular-nums">{item.quantity}</span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  disabled={
                                    !canStep || item.quantity >= maxStock || maxStock <= 0
                                  }
                                  aria-label="Increase add-on quantity"
                                  onClick={() =>
                                    onAddOnQtyChange?.(item.add_on_id, item.quantity + 1, maxStock)
                                  }
                                >
                                  +
                                </Button>
                              </div>
                            </div>
                            <div className="mt-2 text-right text-sm tabular-nums text-foreground-muted sm:col-span-2 sm:mt-0">
                              {formatBuyerLineTotal(lineTotal)}
                            </div>
                            <div className="mt-3 flex justify-end sm:col-span-3 sm:mt-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 px-3"
                                disabled={!canStep}
                                onClick={() => onAddOnQtyChange?.(item.add_on_id, 0, maxStock)}
                              >
                                Remove
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      <div className="glass rounded-xl border border-[var(--glass-border)] p-4 sm:p-6">
        <div className="flex flex-col gap-2">
          {hasItems && (
            <p className="text-2xl font-semibold text-foreground dark:text-yellow-400">
              {addOnUnitCount > 0
                ? "Tickets and Add-ons Total:"
                : "Tickets Total:"}{" "}
              {formatPrice(totalCents)}
            </p>
          )}
          {hasItems && hasMissingSectionPrice ? (
            <p className="text-sm text-amber-300">
              Updating latest ticket prices. Please wait before checkout.
            </p>
          ) : null}
          <Button
            onClick={onProceedToCheckout}
            disabled={ticketCount === 0 || isProceedingToCheckout || hasMissingSectionPrice}
            className="w-full bg-[var(--wish-yellow)] text-neutral-950 hover:bg-[#FFF9B8] hover:text-neutral-950 disabled:pointer-events-none disabled:opacity-45 disabled:saturate-50"
          >
            {isProceedingToCheckout ? "Proceeding..." : "Proceed to Checkout"}
          </Button>
          <Button
            variant="destructive"
            onClick={() => setClearConfirmOpen(true)}
            disabled={items.length === 0 || isClearing}
            className="w-full"
          >
            {isClearing ? "Clearing..." : "Clear Cart"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        title="Clear cart and release seats?"
        description="This will remove all tickets from your cart and release any reserved seats back to the pool for others to purchase."
        cancelLabel="Keep my selections"
        confirmLabel="Clear cart"
        variant="destructive"
        onConfirm={onClearCart}
      />
    </div>
  );
}
