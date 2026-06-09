import { parsePromoRule } from "./promo-rule-schema";
import { filterUnitsByScope } from "./promo-discount";
import { isStructuredRulePromo, type PromoRow } from "./promo-apply";
import type { PricedCartUnit } from "./promo-cart-units";

type Outcome =
  | { action: "ok" }
  | { action: "reject"; message: string }
  | { action: "zero_with_hint"; message: string };

/**
 * When a structured promo returns 0 discount, decide whether to block apply or
 * allow with an explanatory message (e.g. incomplete buy-pay-get bundle).
 */
export function structuredPromoZeroDiscountOutcome(
  promo: PromoRow,
  units: PricedCartUnit[],
  discountCents: number
): Outcome {
  if (discountCents > 0) return { action: "ok" };
  if (!isStructuredRulePromo(promo)) return { action: "ok" };

  const rule = parsePromoRule(promo.rule);
  if (!rule) {
    return {
      action: "reject",
      message: "This promo is misconfigured. Contact the event organizer.",
    };
  }

  const eligible = filterUnitsByScope(units, rule.scope);
  const n = eligible.length;
  if (n === 0) {
    return {
      action: "reject",
      message:
        "No tickets in your cart are in the sections this promo covers. Select seats in the included sections, or use a different promo.",
    };
  }

  if (rule.type === "buy_pay_get_free") {
    const bundle = rule.pay + rule.free;
    if (bundle < 2) return { action: "ok" };
    if (Math.floor(n / bundle) < 1) {
      const need = bundle - n;
      return {
        action: "zero_with_hint",
        message: `This offer uses sets of ${bundle} tickets (${rule.pay} paid + ${rule.free} free). You have ${n} eligible ticket${n === 1 ? "" : "s"}. Add ${need} more to get the first free ticket(s).`,
      };
    }
  }

  if (rule.type === "tiered_percent") {
    return {
      action: "zero_with_hint",
      message: `No discount tier matches your current eligible ticket count (${n}). See the event’s promo details for quantity bands.`,
    };
  }

  if (rule.type === "flat_bundle") {
    return {
      action: "zero_with_hint",
      message: `This bundle price needs at least ${rule.bundle_size} eligible tickets. You have ${n}.`,
    };
  }

  if (rule.type === "threshold_free") {
    if (n < rule.min_qty) {
      return {
        action: "zero_with_hint",
        message: `This offer needs at least ${rule.min_qty} eligible tickets. You have ${n}.`,
      };
    }
  }

  return {
    action: "zero_with_hint",
    message:
      "This promo doesn’t change your current total. Check the event’s offer details or your seat sections.",
  };
}
