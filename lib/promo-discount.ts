import type { PromoRule, PromoScope } from "./promo-rule-schema";
import type { PricedCartUnit } from "./promo-cart-units";

export function computeLegacyPromoDiscountCents(
  subtotalCents: number,
  discountType: "percentage" | "fixed",
  discountValue: number
): number {
  if (subtotalCents <= 0) return 0;
  if (discountType === "percentage") {
    const pct = Math.min(100, Math.max(0, discountValue));
    return Math.floor((subtotalCents * pct) / 100);
  }
  return Math.min(subtotalCents, discountValue);
}

function normGroup(s: string): string {
  return s.trim().toLowerCase();
}

/** Units whose section is in scope (section_id list or section_group label). */
export function filterUnitsByScope(units: PricedCartUnit[], scope: PromoScope): PricedCartUnit[] {
  const idSet = new Set(scope.section_ids);
  const groupSet = new Set(scope.section_groups.map(normGroup));
  return units.filter((u) => {
    if (idSet.has(u.section_id)) return true;
    if (u.section_group && groupSet.has(normGroup(u.section_group))) return true;
    return false;
  });
}

function sumCents(a: number[]): number {
  return a.reduce((s, n) => s + n, 0);
}

/** Sum of K smallest values (K capped by array length). */
export function sumSmallestK(prices: number[], k: number): number {
  if (k <= 0) return 0;
  const sorted = [...prices].sort((a, b) => a - b);
  return sumCents(sorted.slice(0, Math.min(k, sorted.length)));
}

/**
 * - Full bundles only: if eligible count < (pay+free), discount is 0.
 * - Free seats: sum of the cheapest `freeCount` unit prices in the eligible pool.
 */
function buyPayGetFree(prices: number[], pay: number, free: number): number {
  const bundle = pay + free;
  if (bundle < 2) return 0;
  const n = prices.length;
  const fullBundles = Math.floor(n / bundle);
  if (fullBundles < 1) return 0;
  const freeCount = fullBundles * free;
  return sumSmallestK(prices, freeCount);
}

function thresholdFree(prices: number[], minQty: number, freeQty: number): number {
  if (prices.length < minQty) return 0;
  return sumSmallestK(prices, freeQty);
}

function tieredPercent(subtotal: number, n: number, rule: Extract<PromoRule, { type: "tiered_percent" }>): number {
  for (const t of rule.tiers) {
    if (n >= t.min_qty && n <= t.max_qty) {
      const pct = Math.min(100, Math.max(0, t.percent));
      return Math.floor((subtotal * pct) / 100);
    }
  }
  return 0;
}

/**
 * Packs: floor(n / N) when allow_multiple, else at most 1 full pack.
 * BUNDLE ALLOCATION: take the `packs * N` most expensive units into bundle slots; rest pay list price.
 * Discount = subtotal - (packs * bundle_total + sum(remainder list prices))
 */
function flatBundle(
  pricesDesc: number[],
  bundleSize: number,
  bundleTotalCents: number,
  allowMultiple: boolean
): number {
  const n = pricesDesc.length;
  if (n < bundleSize) return 0;
  const maxPacks = allowMultiple ? Math.floor(n / bundleSize) : n >= bundleSize ? 1 : 0;
  if (maxPacks < 1) return 0;
  const bundledCount = maxPacks * bundleSize;
  const sorted = [...pricesDesc].sort((a, b) => b - a);
  const bundled = sorted.slice(0, bundledCount);
  const remainder = sorted.slice(bundledCount);
  const sub = sumCents(bundled) + sumCents(remainder);
  const charge = maxPacks * bundleTotalCents + sumCents(remainder);
  return Math.max(0, sub - charge);
}

/**
 * @param allUnits - full cart, one entry per ticket
 */
export function computeRulePromoDiscountCents(
  rule: PromoRule,
  allUnits: PricedCartUnit[]
): number {
  const eligible = filterUnitsByScope(allUnits, rule.scope);
  const prices = eligible.map((u) => u.price_cents);
  const sub = sumCents(prices);
  if (sub <= 0) return 0;
  const n = prices.length;

  switch (rule.type) {
    case "buy_pay_get_free":
      return buyPayGetFree(prices, rule.pay, rule.free);
    case "threshold_free":
      return thresholdFree(prices, rule.min_qty, rule.free_qty);
    case "tiered_percent":
      return tieredPercent(sub, n, rule);
    case "flat_bundle":
      return flatBundle(
        prices,
        rule.bundle_size,
        rule.bundle_total_cents,
        rule.allow_multiple
      );
    default: {
      const _x: never = rule;
      return _x;
    }
  }
}
