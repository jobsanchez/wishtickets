import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";
import { z } from "zod";

const patchSchema = z.object({
  is_active: z.boolean(),
});

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; bannerId: string }>;
  }
) {
  const { id, bannerId } = await params;
  const denied = await forbiddenUnlessEventSection(id, "details");
  if (denied) return denied;

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload: is_active boolean required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_banners")
    .update({
      is_active: parsed.data.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bannerId)
    .eq("event_id", id)
    .select("id, event_id, image_url, sort_order, is_active, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Banner not found" }, { status: 404 });
  }

  return NextResponse.json({ banner: data });
}

export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; bannerId: string }>;
  }
) {
  const { id, bannerId } = await params;
  const denied = await forbiddenUnlessEventSection(id, "details");
  if (denied) return denied;

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_banners")
    .delete()
    .eq("id", bannerId)
    .eq("event_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
