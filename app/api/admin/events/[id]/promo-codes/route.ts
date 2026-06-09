import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";
import { isMissingPromoDesignerColumnsError } from "@/lib/promo-admin-fallback";

const PROMO_LIST_SELECT_FULL =
  "id, code, event_id, display_name, rule, discount_type, discount_value, max_uses, used_count, starts_at, expires_at, active, stackable, created_at";
const PROMO_LIST_SELECT_LEGACY =
  "id, code, event_id, discount_type, discount_value, max_uses, used_count, starts_at, expires_at, active, stackable, created_at";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const denied = await forbiddenUnlessEventSection(id, "promo");
  if (denied) return denied;
  const supabase = await createClient();

  let { data: promos, error } = await supabase
    .from("promo_codes")
    .select(PROMO_LIST_SELECT_FULL)
    .eq("event_id", id)
    .order("created_at", { ascending: false });

  if (error && isMissingPromoDesignerColumnsError(error)) {
    const legacy = await supabase
      .from("promo_codes")
      .select(PROMO_LIST_SELECT_LEGACY)
      .eq("event_id", id)
      .order("created_at", { ascending: false });
    if (legacy.error) {
      return NextResponse.json({ error: legacy.error.message }, { status: 500 });
    }
    promos = (legacy.data ?? []).map((row) => ({
      ...row,
      display_name: null,
      rule: null,
    }));
    error = null;
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ promos: promos ?? [] });
}
