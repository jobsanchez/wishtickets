import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";
import { z } from "zod";

const postSchema = z.object({
  image_url: z.string().url(),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const denied = await forbiddenUnlessEventSection(id, "details");
  if (denied) return denied;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_banners")
    .select("id, event_id, image_url, sort_order, is_active, created_at, updated_at")
    .eq("event_id", id)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ banners: data ?? [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const denied = await forbiddenUnlessEventSection(id, "details");
  if (denied) return denied;

  const body = await request.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload: image_url must be a valid URL" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: maxRows } = await supabase
    .from("event_banners")
    .select("sort_order")
    .eq("event_id", id)
    .order("sort_order", { ascending: false })
    .limit(1);

  const maxOrder = maxRows?.[0]?.sort_order;
  const nextOrder = typeof maxOrder === "number" ? maxOrder + 1 : 0;

  const { data: inserted, error } = await supabase
    .from("event_banners")
    .insert({
      event_id: id,
      image_url: parsed.data.image_url,
      sort_order: nextOrder,
      is_active: true,
    })
    .select("id, event_id, image_url, sort_order, is_active, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ banner: inserted });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const denied = await forbiddenUnlessEventSection(id, "details");
  if (denied) return denied;

  const body = await request.json();
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload: orderedIds must be a non-empty array of UUIDs" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("event_banners")
    .select("id")
    .eq("event_id", id);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const existingIds = new Set((existing ?? []).map((r) => r.id));
  const ordered = parsed.data.orderedIds;
  if (ordered.some((bannerId) => !existingIds.has(bannerId))) {
    return NextResponse.json(
      { error: "orderedIds must only include banners for this event" },
      { status: 400 }
    );
  }
  if (ordered.length !== existingIds.size) {
    return NextResponse.json(
      { error: "orderedIds must include every banner for this event" },
      { status: 400 }
    );
  }

  for (let i = 0; i < ordered.length; i++) {
    const { error } = await supabase
      .from("event_banners")
      .update({ sort_order: i, updated_at: new Date().toISOString() })
      .eq("id", ordered[i])
      .eq("event_id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
