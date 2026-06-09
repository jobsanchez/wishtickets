import { createClient } from "@/lib/supabase/server";
import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";
import { NextRequest, NextResponse } from "next/server";


export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; canvasId: string }> }
) {
  const { id: eventId, canvasId } = await params;
  const denied = await forbiddenUnlessAnyEventSection(eventId, ["seating", "selector"]);
  if (denied) return denied;

  let body: { imageUrl?: string | null; scale?: number; opacity?: number } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, string | number | null> = {};
  if (body.imageUrl !== undefined) updates.image_url = body.imageUrl;
  if (body.scale !== undefined) updates.scale = body.scale;
  if (body.opacity !== undefined) updates.opacity = body.opacity;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_layout_canvases")
    .update(updates)
    .eq("id", canvasId)
    .eq("event_id", eventId)
    .select("id, event_id, image_url, scale, opacity, sort_order")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: sections } = await supabase
    .from("event_sections")
    .select("id")
    .eq("seat_layout_canvas_id", canvasId);

  return NextResponse.json({
    canvas: { ...data, sectionIds: (sections ?? []).map((s) => s.id) },
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; canvasId: string }> }
) {
  const { id: eventId, canvasId } = await params;
  const denied = await forbiddenUnlessAnyEventSection(eventId, ["seating", "selector"]);
  if (denied) return denied;

  const supabase = await createClient();

  await supabase
    .from("event_sections")
    .update({ seat_layout_canvas_id: null })
    .eq("seat_layout_canvas_id", canvasId);

  const { error } = await supabase
    .from("event_layout_canvases")
    .delete()
    .eq("id", canvasId)
    .eq("event_id", eventId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
