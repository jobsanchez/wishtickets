import { createClient } from "@/lib/supabase/server";
import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";


const reorderSchema = z.object({
  section_ids: z.array(z.string().uuid()),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const denied = await forbiddenUnlessAnyEventSection(id, ["seating", "selector"]);
  if (denied) return denied;

  const body = await request.json();
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: eventSections } = await supabase
    .from("event_sections")
    .select("id")
    .eq("event_id", id);

  const validIds = new Set((eventSections ?? []).map((s) => s.id));
  for (const sectionId of parsed.data.section_ids) {
    if (!validIds.has(sectionId)) {
      return NextResponse.json(
        { error: "One or more section_ids do not belong to this event" },
        { status: 400 }
      );
    }
  }

  for (let i = 0; i < parsed.data.section_ids.length; i++) {
    const { error } = await supabase
      .from("event_sections")
      .update({ sort_order: i })
      .eq("id", parsed.data.section_ids[i])
      .eq("event_id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
