import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePromoRule } from "./promo-rule-schema";
import { computeLegacyPromoDiscountCents, computeRulePromoDiscountCents } from "./promo-discount";
import type { PricedCartUnit } from "./promo-cart-units";

export type PromoRow = {
  id: string;
  event_id: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  starts_at: string | null;
  expires_at: string | null;
  active: boolean;
  stackable: boolean;
  display_name: string | null;
  rule: unknown;
};

export async function getPromoByCode(
  supabase: SupabaseClient,
  code: string
): Promise<PromoRow | null> {
  const { data: promoRows } = await supabase.rpc("get_promo_by_code", { p_code: code });
  const p = Array.isArray(promoRows) && promoRows.length > 0 ? promoRows[0] : null;
  if (!p) return null;
  return p as PromoRow;
}

/** Whether this promo uses JSON rules (not legacy %/fixed on running subtotal). */
export function isStructuredRulePromo(promo: PromoRow): boolean {
  if (promo.rule == null) return false;
  return parsePromoRule(promo.rule) != null;
}

/**
 * One promo application: legacy uses `runningCents` as the base; rule-based uses full
 * `units` for eligibility/quantity math but the discount is capped at `runningCents`.
 */
export function discountCentsForPromo(
  promo: PromoRow,
  runningCents: number,
  units: PricedCartUnit[]
): number {
  if (runningCents <= 0) return 0;
  if (promo.rule != null) {
    const rule = parsePromoRule(promo.rule);
    if (!rule) return 0;
    const raw = computeRulePromoDiscountCents(rule, units);
    return Math.min(runningCents, Math.max(0, raw));
  }
  return computeLegacyPromoDiscountCents(
    runningCents,
    promo.discount_type,
    promo.discount_value
  );
}

/** Reject if more than one structured-rule promo in the code list. */
export async function assertAtMostOneRulePromo(
  supabase: SupabaseClient,
  codes: string[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  let ruleCount = 0;
  for (const c of codes) {
    const p = await getPromoByCode(supabase, c);
    if (p && isStructuredRulePromo(p)) {
      ruleCount += 1;
    }
  }
  if (ruleCount > 1) {
    return {
      ok: false,
      message: "Only one structured promo (bundle / tiered / threshold) can be used per order.",
    };
  }
  return { ok: true };
}
