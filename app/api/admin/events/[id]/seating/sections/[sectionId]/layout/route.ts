import { createClient } from "@/lib/supabase/server";
import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";
import { NextRequest, NextResponse } from "next/server";


export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const { id, sectionId } = await params;
  const denied = await forbiddenUnlessAnyEventSection(id, ["seating", "selector"]);
  if (denied) return denied;

  let body: {
    imageUrl?: string | null;
    scale?: number;
    opacity?: number;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, string | number | null> = {};
  if (body.imageUrl !== undefined) updates.seat_layout_image_url = body.imageUrl;
  if (body.scale !== undefined) updates.seat_layout_scale = body.scale;
  if (body.opacity !== undefined) updates.seat_layout_opacity = body.opacity;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_sections")
    .update(updates)
    .eq("id", sectionId)
    .eq("event_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
