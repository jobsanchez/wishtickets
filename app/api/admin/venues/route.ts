import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminOrCapability } from "@/lib/auth";
import { z } from "zod";

const venueSchema = z.object({
  name: z.string().min(1),
  province_id: z.string().uuid().optional().nullable(),
  city_id: z.string().uuid().optional().nullable(),
  standard_capacity: z.coerce.number().int().min(1).optional(),
  google_maps_url: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .nullable(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canManage = await requireSuperAdminOrCapability("manage_venues");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = venueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("venues")
    .insert({
      name: parsed.data.name,
      province_id: parsed.data.province_id ?? null,
      city_id: parsed.data.city_id ?? null,
      google_maps_url:
        parsed.data.google_maps_url === "" || parsed.data.google_maps_url == null
          ? null
          : parsed.data.google_maps_url,
      ...(parsed.data.standard_capacity != null && {
        standard_capacity: parsed.data.standard_capacity,
      }),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
