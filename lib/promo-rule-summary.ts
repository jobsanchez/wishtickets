import type { PromoRule } from "./promo-rule-schema";
import { parsePromoRule } from "./promo-rule-schema";

export function formatPromoRuleSummary(rule: unknown): string {
  const p = parsePromoRule(rule);
  if (!p) return "—";
  switch (p.type) {
    case "buy_pay_get_free": {
      const t = p.pay + p.free;
      return `Per set: ${t} tickets (${p.pay} paid, ${p.free} free) — need ${t} elig. tickets per free ticket(s)`;
    }
    case "tiered_percent":
      return `Tiered % (${p.tiers.length} band(s))`;
    case "flat_bundle":
      return `Flat: ${p.bundle_size} for ₱${(p.bundle_total_cents / 100).toFixed(0)}`;
    case "threshold_free":
      return `If ≥${p.min_qty} → ${p.free_qty} free`;
    default: {
      const _e: never = p;
      return _e;
    }
  }
}

export function buildPromoRuleFromForm(input: {
  mechanic: PromoRule["type"];
  scope: { section_ids: string[]; section_groups: string[] };
  pay?: number;
  free?: number;
  tiers: { min_qty: number; max_qty: number; percent: number }[];
  bundle_size?: number;
  bundle_total_cents?: number;
  allow_multiple?: boolean;
  min_qty?: number;
  free_qty?: number;
}): PromoRule {
  const scope = {
    section_ids: input.scope.section_ids,
    section_groups: input.scope.section_groups.filter((g) => g.trim().length > 0).map((g) => g.trim()),
  };
  switch (input.mechanic) {
    case "buy_pay_get_free":
      return {
        type: "buy_pay_get_free",
        pay: input.pay ?? 1,
        free: input.free ?? 1,
        scope,
      };
    case "tiered_percent":
      return { type: "tiered_percent", tiers: input.tiers, scope };
    case "flat_bundle":
      return {
        type: "flat_bundle",
        bundle_size: input.bundle_size ?? 2,
        bundle_total_cents: input.bundle_total_cents ?? 0,
        allow_multiple: input.allow_multiple !== false,
        scope,
      };
    case "threshold_free":
      return {
        type: "threshold_free",
        min_qty: input.min_qty ?? 2,
        free_qty: input.free_qty ?? 1,
        scope,
      };
    default: {
      const _x: never = input.mechanic;
      return _x;
    }
  }
}
