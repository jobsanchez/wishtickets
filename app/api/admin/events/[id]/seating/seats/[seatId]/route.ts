import { createClient } from "@/lib/supabase/server";
import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";
import { NextRequest, NextResponse } from "next/server";


export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; seatId: string }> }
) {
  const { id, seatId } = await params;
  const denied = await forbiddenUnlessAnyEventSection(id, ["seating", "selector"]);
  if (denied) return denied;

  let body: { grid_x?: number | null; grid_y?: number | null } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, number | null> = {};
  if (body.grid_x !== undefined) updates.grid_x = body.grid_x;
  if (body.grid_y !== undefined) updates.grid_y = body.grid_y;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_seats")
    .update(updates)
    .eq("id", seatId)
    .eq("event_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; seatId: string }> }
) {
  const { id, seatId } = await params;
  const denied = await forbiddenUnlessAnyEventSection(id, ["seating", "selector"]);
  if (denied) return denied;

  const supabase = await createClient();

  const { error } = await supabase
    .from("event_seats")
    .delete()
    .eq("id", seatId)
    .eq("event_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
