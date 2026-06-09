import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";

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

export async function GET(request: NextRequest) {
  const canManage = await canManagePromos();
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const scope = request.nextUrl.searchParams.get("scope");
  const eventId = request.nextUrl.searchParams.get("event_id");

  const supabase = await createClient();

  let query = supabase
    .from("promo_codes")
    .select("id, code, event_id, discount_type, discount_value, max_uses, used_count, starts_at, expires_at, active, created_at")
    .order("created_at", { ascending: false });

  if (scope === "general" || (!eventId && !scope)) {
    query = query.is("event_id", null);
  } else if (eventId) {
    query = query.eq("event_id", eventId);
  }

  const { data: promos, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ promos: promos ?? [] });
}
