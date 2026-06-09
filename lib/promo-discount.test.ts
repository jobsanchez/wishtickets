import { describe, expect, it } from "vitest";
import {
  computeLegacyPromoDiscountCents,
  computeRulePromoDiscountCents,
  filterUnitsByScope,
  sumSmallestK,
} from "./promo-discount";
import type { PromoRule } from "./promo-rule-schema";
import type { PricedCartUnit } from "./promo-cart-units";

const scopeAll = (sectionId: string): PromoRule["scope"] => ({
  section_ids: [sectionId],
  section_groups: [],
});

function u(price: number, sectionId: string, group: string | null = "vip"): PricedCartUnit {
  return { price_cents: price, section_id: sectionId, section_group: group };
}

describe("computeLegacyPromoDiscountCents", () => {
  it("returns 0 for non-positive subtotal", () => {
    expect(computeLegacyPromoDiscountCents(0, "percentage", 10)).toBe(0);
    expect(computeLegacyPromoDiscountCents(-100, "fixed", 50)).toBe(0);
  });

  it("floors percentage discount", () => {
    expect(computeLegacyPromoDiscountCents(100, "percentage", 10)).toBe(10);
    expect(computeLegacyPromoDiscountCents(99, "percentage", 33)).toBe(32);
  });

  it("clamps fixed to subtotal and percentage to 0–100", () => {
    expect(computeLegacyPromoDiscountCents(100, "fixed", 500)).toBe(100);
    expect(computeLegacyPromoDiscountCents(100, "percentage", 200)).toBe(100);
    expect(computeLegacyPromoDiscountCents(100, "percentage", -5)).toBe(0);
  });
});

describe("sumSmallestK", () => {
  it("sums K smallest values", () => {
    expect(sumSmallestK([5, 1, 3, 2], 2)).toBe(3);
  });

  it("returns 0 when k is 0 or empty array", () => {
    expect(sumSmallestK([1, 2], 0)).toBe(0);
    expect(sumSmallestK([], 3)).toBe(0);
  });
});

describe("filterUnitsByScope", () => {
  it("keeps section_ids and section_groups (case-insensitive group)", () => {
    const sec = "sec-1";
    const units: PricedCartUnit[] = [
      u(100, "other", "main"),
      u(200, sec, "balcony"),
    ];
    const scope: PromoRule["scope"] = { section_ids: [sec], section_groups: ["MAIN"] };
    const out = filterUnitsByScope(units, scope);
    expect(new Set(out.map((x) => x.price_cents))).toEqual(new Set([100, 200]));
  });
});

describe("computeRulePromoDiscountCents — buy_pay_get_free", () => {
  const sid = "s1";
  const rule = (p: number, f: number): PromoRule => ({
    type: "buy_pay_get_free",
    pay: p,
    free: f,
    scope: scopeAll(sid),
  });

  it("is 0 when eligible count is below one full bundle", () => {
    // 3+1 => need 4; 3 tickets => 0
    const r = rule(3, 1);
    const units = [u(100, sid), u(100, sid), u(100, sid)];
    expect(computeRulePromoDiscountCents(r, units)).toBe(0);
  });

  it("3+1 with 4 tickets discounts cheapest free seat", () => {
    const r = rule(3, 1);
    const units = [u(200, sid), u(200, sid), u(200, sid), u(100, sid)];
    expect(computeRulePromoDiscountCents(r, units)).toBe(100);
  });

  it("3+1 with 8 tickets: two full bundles => 2 free = sum of 2 cheapest", () => {
    const r = rule(3, 1);
    const prices = [300, 300, 300, 100, 100, 100, 50, 20];
    const units = prices.map((p) => u(p, sid));
    expect(computeRulePromoDiscountCents(r, units)).toBe(20 + 50);
  });
});

describe("computeRulePromoDiscountCents — threshold_free", () => {
  it("0 when n < min_qty", () => {
    const r: PromoRule = {
      type: "threshold_free",
      min_qty: 6,
      free_qty: 1,
      scope: scopeAll("s1"),
    };
    const units = Array.from({ length: 5 }, () => u(100, "s1"));
    expect(computeRulePromoDiscountCents(r, units)).toBe(0);
  });

  it("once: discount = cheapest K when n >= min_qty", () => {
    const r: PromoRule = {
      type: "threshold_free",
      min_qty: 4,
      free_qty: 2,
      scope: scopeAll("s1"),
    };
    const units = [u(100, "s1"), u(200, "s1"), u(50, "s1"), u(30, "s1")];
    expect(computeRulePromoDiscountCents(r, units)).toBe(30 + 50);
  });
});

describe("computeRulePromoDiscountCents — tiered_percent", () => {
  it("applies % to full eligible subtotal for matching band", () => {
    const r: PromoRule = {
      type: "tiered_percent",
      tiers: [
        { min_qty: 2, max_qty: 3, percent: 5 },
        { min_qty: 4, max_qty: 99, percent: 10 },
      ],
      scope: scopeAll("s1"),
    };
    // n=2, sub=300 => 5% = 15
    const units = [u(100, "s1"), u(200, "s1")];
    expect(computeRulePromoDiscountCents(r, units)).toBe(15);
  });

  it("returns 0 when n outside all tiers", () => {
    const r: PromoRule = {
      type: "tiered_percent",
      tiers: [{ min_qty: 3, max_qty: 5, percent: 10 }],
      scope: scopeAll("s1"),
    };
    const units = [u(100, "s1"), u(200, "s1")];
    expect(computeRulePromoDiscountCents(r, units)).toBe(0);
  });
});

describe("computeRulePromoDiscountCents — flat_bundle", () => {
  it("two packs: discount = subtotal - 2 * bundle total (remainder at list price)", () => {
    // 5+5=10 units @ 1000 = 10_000; 2×5000 = 10_000 => 0; use higher list to get discount
    const r: PromoRule = {
      type: "flat_bundle",
      bundle_size: 5,
      bundle_total_cents: 4000,
      allow_multiple: true,
      scope: scopeAll("s1"),
    };
    const units = Array.from({ length: 10 }, () => u(1000, "s1"));
    // 10*1000 = 10000, 2 packs * 4000 = 8000, discount 2000
    expect(computeRulePromoDiscountCents(r, units)).toBe(2000);
  });

  it("0 when n < bundle_size", () => {
    const r: PromoRule = {
      type: "flat_bundle",
      bundle_size: 5,
      bundle_total_cents: 4000,
      allow_multiple: true,
      scope: scopeAll("s1"),
    };
    const units = [u(100, "s1"), u(200, "s1")];
    expect(computeRulePromoDiscountCents(r, units)).toBe(0);
  });

  it("allow_multiple false: at most one pack", () => {
    const r: PromoRule = {
      type: "flat_bundle",
      bundle_size: 2,
      bundle_total_cents: 100,
      allow_multiple: false,
      scope: scopeAll("s1"),
    };
    // 3 units @ 100,200,300: one pack of 2 most expensive 300+200=500, charge 100+300 remainder
    // bundled: 300,200 (top 2), remainder 100. sub=600, charge=100+100=200, discount=400
    const units = [u(100, "s1"), u(200, "s1"), u(300, "s1")];
    expect(computeRulePromoDiscountCents(r, units)).toBe(400);
  });
});

describe("out-of-scope units excluded from rule math", () => {
  it("empty eligible => 0", () => {
    const r: PromoRule = {
      type: "buy_pay_get_free",
      pay: 1,
      free: 1,
      scope: { section_ids: ["only-here"], section_groups: [] },
    };
    const units = [u(500, "other")];
    expect(computeRulePromoDiscountCents(r, units)).toBe(0);
  });
});
