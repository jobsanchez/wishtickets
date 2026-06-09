import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";
import { z } from "zod";
import { promoRuleSchema } from "@/lib/promo-rule-schema";
import {
  isMissingPromoDesignerColumnsError,
  migrationHintForStructuredPromo,
  MIGRATION_HINT,
} from "@/lib/promo-admin-fallback";

async function canManagePromos() {
  const role = await getProfileRole();
  if (role === "super_admin" || role === "admin") return true;
  const userId = await getCurrentUserId();
  if (!userId) return false;
  const [canManageEvents, canManagePrices] = await Promise.all([
    hasCapability(userId, "manage_events"),
    hasCapability(userId, "manage_prices"),
  ]);
  return canManageEvents || canManagePrices;
}

const promoSchema = z
  .object({
    code: z.string().min(1).max(64).transform((s) => s.trim().toUpperCase()),
    event_id: z
      .union([z.string().uuid(), z.literal(""), z.null()])
      .transform((v) => (v && v !== "" ? v : null)),
    display_name: z.string().max(200).trim().optional().nullable(),
    /** Structured promo; when set, discount_type/value are stored as 0 (ignored at runtime). */
    rule: z.unknown().optional().nullable(),
    discount_type: z.enum(["percentage", "fixed"]).optional(),
    discount_value: z.number().int().min(0).optional(),
    max_uses: z.number().int().min(0).nullable(),
    starts_at: z.string().datetime().nullable(),
    expires_at: z.string().datetime().nullable(),
    active: z.boolean().default(true),
    stackable: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.rule != null) {
      const p = promoRuleSchema.safeParse(data.rule);
      if (!p.success) {
        ctx.addIssue({
          code: "custom",
          message: "Invalid promo rule",
          path: ["rule"],
        });
      }
    } else {
      if (data.discount_type == null || data.discount_value == null) {
        ctx.addIssue({
          code: "custom",
          message: "discount_type and discount_value are required when rule is omitted (legacy promos).",
        });
      }
    }
  });

export async function POST(request: NextRequest) {
  const canManage = await canManagePromos();
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = promoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const d = parsed.data;
  const hasRule = d.rule != null;
  const ruleParsed = hasRule ? promoRuleSchema.parse(d.rule) : null;
  const displayName = d.display_name?.trim() || null;

  const insertRow = {
    code: d.code,
    event_id: d.event_id,
    display_name: displayName,
    rule: ruleParsed ? (ruleParsed as unknown as Record<string, unknown>) : null,
    discount_type: hasRule ? "percentage" : d.discount_type!,
    discount_value: hasRule ? 0 : d.discount_value!,
    max_uses: d.max_uses,
    starts_at: d.starts_at,
    expires_at: d.expires_at,
    active: d.active,
    stackable: d.stackable,
  };

  let usedLegacySchema = false;
  let { data: promo, error } = await supabase
    .from("promo_codes")
    .insert(insertRow)
    .select("id")
    .single();

  if (error && isMissingPromoDesignerColumnsError(error)) {
    if (hasRule) {
      return NextResponse.json(
        { ...migrationHintForStructuredPromo() },
        { status: 503 }
      );
    }
    const { data: legacyPromo, error: legacyError } = await supabase
      .from("promo_codes")
      .insert({
        code: d.code,
        event_id: d.event_id,
        discount_type: d.discount_type!,
        discount_value: d.discount_value!,
        max_uses: d.max_uses,
        starts_at: d.starts_at,
        expires_at: d.expires_at,
        active: d.active,
        stackable: d.stackable,
      })
      .select("id")
      .single();
    if (legacyError) {
      if (legacyError.code === "23505") {
        return NextResponse.json(
          { error: "A promo code with this code already exists" },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: legacyError.message }, { status: 500 });
    }
    promo = legacyPromo;
    error = null;
    usedLegacySchema = true;
  }

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A promo code with this code already exists" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!promo) {
    return NextResponse.json({ error: "Insert returned no id" }, { status: 500 });
  }

  return NextResponse.json({
    id: promo.id,
    ...(usedLegacySchema ? { notice: MIGRATION_HINT } : {}),
  });
}
