import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildPricedCartUnits } from "@/lib/promo-cart-units";
import {
  discountCentsForPromo,
  getPromoByCode,
  isStructuredRulePromo,
  type PromoRow,
} from "@/lib/promo-apply";
import { parsePromoRule } from "@/lib/promo-rule-schema";
import { structuredPromoZeroDiscountOutcome } from "@/lib/promo-structured-messages";

const uuidLike = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z.string().uuid()
);
const validateSchema = z.object({
  code: z.string().min(1).max(64),
  event_id: uuidLike,
  cart_id: uuidLike,
  applied_promo_codes: z.array(z.string()).optional(),
});

const NOT_STACKABLE_MESSAGE =
  "This promo code cannot be combined with early bird pricing or other promotions.";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = validateSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        {
          error: "Invalid payload",
          message: first?.message ?? "Invalid request",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { code, event_id, cart_id, applied_promo_codes = [] } = parsed.data;

    const built = await buildPricedCartUnits(supabase, event_id, cart_id, {
      admin,
      userId: user.id,
    });
    if ("error" in built) {
      return NextResponse.json(
        {
          valid: false,
          message:
            built.error === "expired"
              ? "Your cart has expired. Refresh and try again."
              : "Cart not found or invalid for this event",
        },
        { status: 400 }
      );
    }

    const { units, subtotal_cents: initialSubtotal } = built;
    if (initialSubtotal <= 0) {
      return NextResponse.json({
        valid: false,
        message: "Nothing to discount",
      });
    }

    const promo = await getPromoByCode(supabase, code);
    if (!promo || !promo.active) {
      return NextResponse.json({
        valid: false,
        message: "Invalid or inactive promo code",
      });
    }

    if (promo.event_id && promo.event_id !== event_id) {
      return NextResponse.json({
        valid: false,
        message: "This promo code is not valid for this event",
      });
    }

    if (promo.rule != null && !parsePromoRule(promo.rule)) {
      return NextResponse.json({
        valid: false,
        message: "This promo is misconfigured. Contact the event organizer.",
      });
    }

    const codeUpper = code.trim().toUpperCase();
    if (applied_promo_codes.some((c) => c.trim().toUpperCase() === codeUpper)) {
      return NextResponse.json({
        valid: false,
        message: "This promo code is already applied",
      });
    }

    for (const prior of applied_promo_codes) {
      const p = await getPromoByCode(supabase, prior);
      if (p && p.stackable !== true) {
        return NextResponse.json({
          valid: false,
          message: "A non-stackable promo code cannot be combined with other promotions.",
        });
      }
    }

    const stackable = promo.stackable === true;
    if (!stackable) {
      const hasOtherPromos = applied_promo_codes.length > 0;
      let earlyBirdActive = false;
      if (!hasOtherPromos) {
        const { data: eventRow } = await admin
          .from("events")
          .select("early_bird_starts_at, early_bird_ends_at")
          .eq("id", event_id)
          .in("status", ["draft", "published"])
          .single();
        const now = new Date().toISOString();
        earlyBirdActive =
          eventRow?.early_bird_starts_at != null &&
          eventRow?.early_bird_ends_at != null &&
          now >= eventRow.early_bird_starts_at &&
          now <= eventRow.early_bird_ends_at;
      }
      if (hasOtherPromos || earlyBirdActive) {
        return NextResponse.json({
          valid: false,
          message: NOT_STACKABLE_MESSAGE,
          reason: "not_stackable",
        });
      }
    }

    let priorRuleCount = 0;
    for (const prior of applied_promo_codes) {
      const p = await getPromoByCode(supabase, prior);
      if (p && isStructuredRulePromo(p)) priorRuleCount += 1;
    }
    if (isStructuredRulePromo(promo) && priorRuleCount >= 1) {
      return NextResponse.json({
        valid: false,
        message:
          "Only one structured promo (bundle / tiered / threshold) can be used per order.",
      });
    }

    const now = new Date().toISOString();
    if (promo.starts_at && promo.starts_at > now) {
      return NextResponse.json({
        valid: false,
        message: "This promo code is not yet active",
      });
    }
    if (promo.expires_at && promo.expires_at < now) {
      return NextResponse.json({
        valid: false,
        message: "This promo code has expired",
      });
    }

    if (promo.max_uses != null && promo.used_count >= promo.max_uses) {
      return NextResponse.json({
        valid: false,
        message: "This promo code has reached its usage limit",
      });
    }

    let running = initialSubtotal;
    for (const prior of applied_promo_codes) {
      const p = await getPromoByCode(supabase, prior);
      if (!p || !p.active) {
        return NextResponse.json({
          valid: false,
          message: "Remove an invalid applied promo and try again.",
        });
      }
      if (p.event_id && p.event_id !== event_id) {
        return NextResponse.json({
          valid: false,
          message: "Applied promo is not valid for this event.",
        });
      }
      if (p.starts_at && p.starts_at > now) continue;
      if (p.expires_at && p.expires_at < now) continue;
      if (p.max_uses != null && p.used_count >= p.max_uses) continue;
      if (p.rule != null && !parsePromoRule(p.rule)) continue;
      const d = discountCentsForPromo(p as PromoRow, running, units);
      running = Math.max(0, running - d);
    }

    const discountCents = discountCentsForPromo(promo as PromoRow, running, units);
    const finalCents = Math.max(0, running - discountCents);

    const zeroOutcome = structuredPromoZeroDiscountOutcome(
      promo as PromoRow,
      units,
      discountCents
    );
    if (zeroOutcome.action === "reject") {
      return NextResponse.json({
        valid: false,
        message: zeroOutcome.message,
      });
    }
    if (zeroOutcome.action === "zero_with_hint") {
      return NextResponse.json({
        valid: true,
        promo_code_id: promo.id,
        discount_cents: 0,
        final_cents: running,
        message: zeroOutcome.message,
        promo_no_discount_hint: true,
      });
    }

    return NextResponse.json({
      valid: true,
      promo_code_id: promo.id,
      discount_cents: discountCents,
      final_cents: finalCents,
      message: `Discount applied: ${(discountCents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" })}`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
