import { z } from "zod";

/**
 * Scope: a cart line item is eligible if its section_id is listed OR its section's
 * group label (trimmed) matches one of section_groups (trimmed, case-insensitive).
 * At least one of section_ids or section_groups must be non-empty.
 */
export const promoScopeSchema = z
  .object({
    section_ids: z.array(z.string().uuid()).default([]),
    section_groups: z.array(z.string().min(1)).default([]),
  })
  .strict()
  .superRefine((s, ctx) => {
    const hasSections = s.section_ids.length > 0;
    const hasGroups = s.section_groups.length > 0;
    if (!hasSections && !hasGroups) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scope must include at least one section or one section group",
        path: ["section_ids"],
      });
    }
  });

export type PromoScope = z.infer<typeof promoScopeSchema>;

/** Buy P, get F free per full bundle of (P+F) tickets; partial outside a full bundle → no free seats from that remainder. */
export const buyPayGetFreeRuleSchema = z
  .object({
    type: z.literal("buy_pay_get_free"),
    pay: z.number().int().min(1),
    free: z.number().int().min(1),
    scope: promoScopeSchema,
  })
  .strict();

/** Quantity-based % off the eligible subtotal (sum of eligible unit prices). */
export const tieredPercentRuleSchema = z
  .object({
    type: z.literal("tiered_percent"),
    tiers: z
      .array(
        z
          .object({
            min_qty: z.number().int().min(1),
            max_qty: z.number().int().min(1),
            percent: z.number().int().min(0).max(100),
          })
          .strict()
      )
      .min(1),
    scope: promoScopeSchema,
  })
  .strict()
  .superRefine((r, ctx) => {
    for (const t of r.tiers) {
      if (t.max_qty < t.min_qty) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "max_qty must be >= min_qty",
          path: ["tiers"],
        });
        return;
      }
    }
  });

/** N tickets for a fixed bundle total; optional multiple full bundles. */
export const flatBundleRuleSchema = z
  .object({
    type: z.literal("flat_bundle"),
    bundle_size: z.number().int().min(2),
    bundle_total_cents: z.number().int().min(0),
    allow_multiple: z.boolean().default(true),
    scope: promoScopeSchema,
  })
  .strict();

/** Once per order: if eligible qty >= min_qty, discount = sum of cheapest free_qty unit prices. */
export const thresholdFreeRuleSchema = z
  .object({
    type: z.literal("threshold_free"),
    min_qty: z.number().int().min(2),
    free_qty: z.number().int().min(1),
    scope: promoScopeSchema,
  })
  .strict();

export const promoRuleSchema = z.discriminatedUnion("type", [
  buyPayGetFreeRuleSchema,
  tieredPercentRuleSchema,
  flatBundleRuleSchema,
  thresholdFreeRuleSchema,
]);

export type PromoRule = z.infer<typeof promoRuleSchema>;

export function parsePromoRule(raw: unknown): PromoRule | null {
  if (raw == null) return null;
  const r = promoRuleSchema.safeParse(raw);
  return r.success ? r.data : null;
}
