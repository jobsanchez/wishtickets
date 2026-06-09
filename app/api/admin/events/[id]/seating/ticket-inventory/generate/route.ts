import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";
import {
  ensureInventoryForSections,
  generateInventoryImages,
} from "@/lib/ticket-inventory";

const bodySchema = z.object({
  section_ids: z.array(z.string().uuid()).optional(),
  generate_images: z.boolean().optional().default(true),
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
    const ensured = await ensureInventoryForSections(admin, eventId, sectionIds);
    let images_generated = 0;
    let images_failed = 0;

    if (parsed.data.generate_images && ensured.print_ticket_ids.length > 0) {
      const img = await generateInventoryImages(admin, ensured.print_ticket_ids);
      images_generated = img.images_generated;
      images_failed = img.failed;
    }

    return NextResponse.json({
      created: ensured.created,
      existing: ensured.existing,
      skipped_allocated: ensured.skipped_allocated,
      inventory_total: ensured.print_ticket_ids.length,
      images_generated,
      images_failed,
      section_ids: sectionIds,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ticket inventory generation failed";
    console.error("[ticket-inventory/generate]", msg, e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
