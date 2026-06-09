import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdminOrCapability } from "@/lib/auth";

/** GET /api/admin/geography?province_id=xxx – Returns provinces, or cities for a province */
export async function GET(request: NextRequest) {
  const canManage = await requireSuperAdminOrCapability("manage_venues");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const provinceId = searchParams.get("province_id");

  const supabase = await createClient();

  if (provinceId) {
    const { data: cities, error } = await supabase
      .from("cities")
      .select("id, name")
      .eq("province_id", provinceId)
      .order("name");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ cities: cities ?? [] });
  }

  const { data: provinces, error } = await supabase
    .from("provinces")
    .select("id, name")
    .order("name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ provinces: provinces ?? [] });
}
