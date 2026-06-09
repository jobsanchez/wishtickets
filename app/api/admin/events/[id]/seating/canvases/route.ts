import { createClient } from "@/lib/supabase/server";
import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";
import { NextRequest, NextResponse } from "next/server";


export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const denied = await forbiddenUnlessAnyEventSection(eventId, ["seating", "selector"]);
  if (denied) return denied;

  const supabase = await createClient();
  const { data: canvases, error } = await supabase
    .from("event_layout_canvases")
    .select("id, event_id, image_url, scale, opacity, sort_order")
    .eq("event_id", eventId)
    .order("sort_order")
    .order("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: sections } = await supabase
    .from("event_sections")
    .select("id, seat_layout_canvas_id")
    .eq("event_id", eventId);

  const sectionIdsByCanvas = new Map<string, string[]>();
  for (const sec of sections ?? []) {
    if (sec.seat_layout_canvas_id) {
      const list = sectionIdsByCanvas.get(sec.seat_layout_canvas_id) ?? [];
      list.push(sec.id);
      sectionIdsByCanvas.set(sec.seat_layout_canvas_id, list);
    }
  }

  const result = (canvases ?? []).map((c) => ({
    ...c,
    sectionIds: sectionIdsByCanvas.get(c.id) ?? [],
  }));

  return NextResponse.json({ canvases: result });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const denied = await forbiddenUnlessAnyEventSection(eventId, ["seating", "selector"]);
  if (denied) return denied;

  let body: { imageUrl?: string | null; scale?: number; opacity?: number } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: maxOrder } = await supabase
    .from("event_layout_canvases")
    .select("sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const sortOrder = (maxOrder?.sort_order ?? -1) + 1;

  const { data: canvas, error } = await supabase
    .from("event_layout_canvases")
    .insert({
      event_id: eventId,
      image_url: body.imageUrl ?? null,
      scale: body.scale ?? 1,
      opacity: body.opacity ?? 0.5,
      sort_order: sortOrder,
    })
    .select("id, event_id, image_url, scale, opacity, sort_order")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ canvas: { ...canvas, sectionIds: [] } });
}
