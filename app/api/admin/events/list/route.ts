import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";

export async function GET() {
  const role = await getProfileRole();
  const isAdmin = role === "admin" || role === "super_admin";
  const userId = await getCurrentUserId();
  const hasManageEvents = userId
    ? await hasCapability(userId, "manage_events")
    : false;
  const hasManagePrices = userId
    ? await hasCapability(userId, "manage_prices")
    : false;
  const hasViewSales = userId
    ? await hasCapability(userId, "view_sales_analytics")
    : false;

  if (!isAdmin && !hasManageEvents && !hasManagePrices && !hasViewSales) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, title, event_start")
    .order("event_start", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}
