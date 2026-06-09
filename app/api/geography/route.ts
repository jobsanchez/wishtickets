import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GET /api/geography – Public provinces/cities for event filter */
export async function GET(request: NextRequest) {
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
