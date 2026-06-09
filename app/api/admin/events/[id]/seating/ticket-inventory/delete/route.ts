import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";
import { deleteInventoryForSections } from "@/lib/ticket-inventory/delete-inventory";
import { TicketInventoryError } from "@/lib/ticket-inventory/types";

const bodySchema = z.object({
  section_ids: z.array(z.string().uuid()).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const denied = await forbiddenUnlessAnyEventSection(eventId, ["seating", "selector"]);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let sectionIds = parsed.data.section_ids ?? [];
  if (sectionIds.length === 0) {
    const { data: sections, error } = await admin
      .from("event_sections")
      .select("id")
      .eq("event_id", eventId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    sectionIds = (sections ?? []).map((s) => s.id as string);
  }

  try {
    const result = await deleteInventoryForSections(admin, eventId, sectionIds);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof TicketInventoryError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Failed to delete ticket inventory";
    console.error("[ticket-inventory/delete]", msg, e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
