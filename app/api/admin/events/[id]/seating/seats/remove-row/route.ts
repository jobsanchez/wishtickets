import { createClient } from "@/lib/supabase/server";
import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";


const schema = z.object({
  event_section_id: z.string().uuid(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const denied = await forbiddenUnlessAnyEventSection(id, ["seating", "selector"]);
  if (denied) return denied;

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: section } = await supabase
    .from("event_sections")
    .select("id")
    .eq("id", parsed.data.event_section_id)
    .eq("event_id", id)
    .single();

  if (!section) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  const { data: existingSeats } = await supabase
    .from("event_seats")
    .select("row_label")
    .eq("event_section_id", parsed.data.event_section_id)
    .eq("event_id", id);

  if (!existingSeats || existingSeats.length === 0) {
    return NextResponse.json(
      { error: "Section has no seats to remove." },
      { status: 400 }
    );
  }

  const rowLabels = [...new Set(existingSeats.map((s) => s.row_label))].sort(
    (a, b) => (a.length !== b.length ? a.length - b.length : a.localeCompare(b))
  );
  const lastRow = rowLabels[rowLabels.length - 1];

  const { data: deleted, error: deleteError } = await supabase
    .from("event_seats")
    .delete()
    .eq("event_section_id", parsed.data.event_section_id)
    .eq("event_id", id)
    .eq("row_label", lastRow)
    .select("id");

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const removedCount = deleted?.length ?? 0;
  const newCapacity = Math.max(0, existingSeats.length - removedCount);

  await supabase
    .from("event_sections")
    .update({ capacity: newCapacity })
    .eq("id", parsed.data.event_section_id)
    .eq("event_id", id);

  return NextResponse.json({
    success: true,
    count: removedCount,
    row_label: lastRow,
  });
}
