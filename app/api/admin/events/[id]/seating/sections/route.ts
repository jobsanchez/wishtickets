import { createClient } from "@/lib/supabase/server";
import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";
import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";
import { resolveSectionAccentHex } from "@/lib/section-color";

function normalizeSectionName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeSectionCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

const sectionSchema = z.object({
  name: z.string().min(1, "Section name is required"),
  section_code: z.string().min(1, "Section code is required"),
  section_group: z.string().trim().max(120).optional().nullable(),
  sort_order: z.number().int().min(0).optional(),
  seating_type: z.enum(["assigned", "free", "standing"]).optional(),
  show_seat_selection: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const denied = await forbiddenUnlessAnyEventSection(id, ["seating", "selector"]);
  if (denied) return denied;

  const body = await request.json();
  const parsed = sectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const normalizedName = normalizeSectionName(parsed.data.name);
  const normalizedCode = normalizeSectionCode(parsed.data.section_code);

  const { data: existingSections, error: existingError } = await supabase
    .from("event_sections")
    .select("id, name, section_code")
    .eq("event_id", id);
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const hasDuplicateName = (existingSections ?? []).some(
    (section) => normalizeSectionName(section.name) === normalizedName
  );
  if (hasDuplicateName) {
    return NextResponse.json({ error: "Section name already exists" }, { status: 409 });
  }
  const hasDuplicateCode = (existingSections ?? []).some(
    (section) => normalizeSectionCode(section.section_code) === normalizedCode
  );
  if (hasDuplicateCode) {
    return NextResponse.json({ error: "Section code already exists" }, { status: 409 });
  }

  const showSeatSelection = parsed.data.show_seat_selection ?? false;
  const sortOrder = parsed.data.sort_order ?? 0;
  /** Persist a default hex so buyer APIs (e.g. get_event_availability) return `color` without an extra admin save. */
  const placeholderId = `new:${id}:${parsed.data.section_code}:${sortOrder}`;
  const defaultColor = resolveSectionAccentHex(null, placeholderId);

  const { data, error } = await supabase
    .from("event_sections")
    .insert({
      event_id: id,
      name: parsed.data.name,
      section_code: parsed.data.section_code,
      section_group: parsed.data.section_group?.trim() || null,
      capacity: 0,
      sort_order: sortOrder,
      seating_type: parsed.data.seating_type ?? "assigned",
      show_seat_selection: showSeatSelection,
      color: defaultColor,
    })
    .select("id, name, section_code, section_group, capacity, sort_order, seating_type, show_seat_selection, color")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
