import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";
import { z } from "zod";
import { promoRuleSchema } from "@/lib/promo-rule-schema";
import { isMissingPromoDesignerColumnsError, MIGRATION_HINT } from "@/lib/promo-admin-fallback";

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
    code: z.string().min(1).max(64).transform((s) => s.trim().toUpperCase()).optional(),
    event_id: z
      .union([z.string().uuid(), z.literal(""), z.null()])
      .transform((v) => (v && v !== "" ? v : null))
      .optional(),
    display_name: z.string().max(200).trim().optional().nullable(),
    rule: z.unknown().optional().nullable(),
    discount_type: z.enum(["percentage", "fixed"]).optional(),
    discount_value: z.number().int().min(0).optional(),
    max_uses: z.number().int().min(0).nullable().optional(),
    starts_at: z.string().datetime().nullable().optional(),
    expires_at: z.string().datetime().nullable().optional(),
    active: z.boolean().default(true).optional(),
    stackable: z.boolean().default(false).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.rule === undefined) return;
    if (data.rule === null) return;
    const p = promoRuleSchema.safeParse(data.rule);
    if (!p.success) {
      ctx.addIssue({ code: "custom", message: "Invalid promo rule", path: ["rule"] });
    }
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const canManage = await canManagePromos();
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const eventIdParam = request.nextUrl.searchParams.get("event_id");

  const supabase = await createClient();
  let enforcedEventId: string | null = null;
  if (eventIdParam) {
    const { data: existing } = await supabase
      .from("promo_codes")
      .select("event_id")
      .eq("id", id)
      .single();
    if (!existing || existing.event_id !== eventIdParam) {
      return NextResponse.json({ error: "Promo does not belong to this event" }, { status: 403 });
    }
    enforcedEventId = eventIdParam;
  }

  const body = await request.json();
  const parsed = promoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.code !== undefined) updateData.code = parsed.data.code;
  if (enforcedEventId !== null) updateData.event_id = enforcedEventId;
  else if (parsed.data.event_id !== undefined) updateData.event_id = parsed.data.event_id;
  if (parsed.data.display_name !== undefined) {
    const dn = parsed.data.display_name;
    updateData.display_name = dn == null || dn === "" ? null : dn.trim();
  }
  if (parsed.data.rule !== undefined) {
    if (parsed.data.rule == null) {
      updateData.rule = null;
    } else {
      updateData.rule = promoRuleSchema.parse(parsed.data.rule) as unknown;
    }
  }
  if (parsed.data.discount_type !== undefined) updateData.discount_type = parsed.data.discount_type;
  if (parsed.data.discount_value !== undefined) updateData.discount_value = parsed.data.discount_value;
  if (parsed.data.max_uses !== undefined) updateData.max_uses = parsed.data.max_uses;
  if (parsed.data.starts_at !== undefined) updateData.starts_at = parsed.data.starts_at;
  if (parsed.data.expires_at !== undefined) updateData.expires_at = parsed.data.expires_at;
  if (parsed.data.active !== undefined) updateData.active = parsed.data.active;
  if (parsed.data.stackable !== undefined) updateData.stackable = parsed.data.stackable;

  if (updateData.rule != null) {
    updateData.discount_type = "percentage";
    updateData.discount_value = 0;
  }

  const { error } = await supabase
    .from("promo_codes")
    .update(updateData)
    .eq("id", id);

  if (error && isMissingPromoDesignerColumnsError(error)) {
    if (updateData.rule != null) {
      return NextResponse.json(
        { error: "Promo rules require the latest database schema.", hint: MIGRATION_HINT },
        { status: 503 }
      );
    }
    const legacyOnly = { ...updateData } as Record<string, unknown>;
    delete legacyOnly.display_name;
    delete legacyOnly.rule;
    if (Object.keys(legacyOnly).length === 0) {
      return NextResponse.json(
        { error: "Database schema is missing promo display/rule columns.", hint: MIGRATION_HINT },
        { status: 503 }
      );
    }
    const { error: e2 } = await supabase
      .from("promo_codes")
      .update(legacyOnly)
      .eq("id", id);
    if (e2) {
      return NextResponse.json({ error: e2.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, notice: MIGRATION_HINT });
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const canManage = await canManagePromos();
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const eventIdParam = request.nextUrl.searchParams.get("event_id");
  const supabase = await createClient();

  if (eventIdParam) {
    const { data: existing } = await supabase
      .from("promo_codes")
      .select("event_id")
      .eq("id", id)
      .single();
    if (!existing || existing.event_id !== eventIdParam) {
      return NextResponse.json({ error: "Promo does not belong to this event" }, { status: 403 });
    }
  }

  const { error } = await supabase.from("promo_codes").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
