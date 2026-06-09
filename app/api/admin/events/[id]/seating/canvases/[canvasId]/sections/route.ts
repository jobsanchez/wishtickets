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

  let body: { sectionIds: string[] } = { sectionIds: [] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sectionIds = Array.isArray(body.sectionIds) ? body.sectionIds : [];

  const supabase = await createClient();

  const { data: sections } = await supabase
    .from("event_sections")
    .select("id")
    .eq("event_id", eventId);

  const validIds = new Set((sections ?? []).map((s) => s.id));
  const toAssign = sectionIds.filter((id) => validIds.has(id));

  await supabase
    .from("event_sections")
    .update({ seat_layout_canvas_id: null })
    .eq("event_id", eventId)
    .eq("seat_layout_canvas_id", canvasId);

  if (toAssign.length > 0) {
    const { error } = await supabase
      .from("event_sections")
      .update({ seat_layout_canvas_id: canvasId })
      .eq("event_id", eventId)
      .in("id", toAssign);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, sectionIds: toAssign });
}
