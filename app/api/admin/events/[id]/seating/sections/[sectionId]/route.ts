import { createClient } from "@/lib/supabase/server";
import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";
import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

function normalizeSectionName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeSectionCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

const sectionSchema = z.object({
  name: z.string().min(1, "Section name is required").optional(),
  section_code: z.string().min(1, "Section code is required").optional(),
  section_group: z.string().trim().max(120).optional().nullable(),
  capacity: z.number().int().min(0).optional(),
  sort_order: z.number().int().min(0).optional(),
  seating_type: z.enum(["assigned", "free", "standing"]).optional(),
  color: z.union([z.string().regex(/^#[0-9A-Fa-f]{6}$/), z.null()]).optional(),
  show_seat_selection: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const { id, sectionId } = await params;
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
  const { data: currentSection, error: currentError } = await supabase
    .from("event_sections")
    .select("id, name, section_code")
    .eq("id", sectionId)
    .eq("event_id", id)
    .maybeSingle();
  if (currentError) {
    return NextResponse.json({ error: currentError.message }, { status: 500 });
  }
  if (!currentSection) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name != null) updates.name = parsed.data.name;
  if (parsed.data.section_code !== undefined) updates.section_code = parsed.data.section_code;
  if (parsed.data.section_group !== undefined) updates.section_group = parsed.data.section_group?.trim() || null;
  if (parsed.data.capacity != null) updates.capacity = parsed.data.capacity;
  if (parsed.data.sort_order != null) updates.sort_order = parsed.data.sort_order;
  if (parsed.data.seating_type != null) updates.seating_type = parsed.data.seating_type;
  if (parsed.data.color !== undefined) updates.color = parsed.data.color;
  if (parsed.data.show_seat_selection !== undefined) updates.show_seat_selection = parsed.data.show_seat_selection;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  if (parsed.data.name !== undefined || parsed.data.section_code !== undefined) {
    const nextName = parsed.data.name ?? currentSection.name;
    const nextSectionCode = parsed.data.section_code ?? currentSection.section_code;
    const normalizedName = normalizeSectionName(nextName);
    const normalizedCode = normalizeSectionCode(nextSectionCode);
    const { data: existingSections, error: existingError } = await supabase
      .from("event_sections")
      .select("id, name, section_code")
      .eq("event_id", id)
      .neq("id", sectionId);
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
  }

  const { data, error } = await supabase
    .from("event_sections")
    .update(updates)
    .eq("id", sectionId)
    .eq("event_id", id)
    .select("id, name, section_code, section_group, capacity, sort_order, seating_type, color, show_seat_selection")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const { id, sectionId } = await params;
  const denied = await forbiddenUnlessAnyEventSection(id, ["seating", "selector"]);
  if (denied) return denied;

  const supabase = await createClient();

  const { error } = await supabase
    .from("event_sections")
    .delete()
    .eq("id", sectionId)
    .eq("event_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
