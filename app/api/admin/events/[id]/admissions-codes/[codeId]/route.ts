import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";
import { z } from "zod";

const patchBodySchema = z.object({
  label: z.string().max(200).nullable().optional(),
  assignee_email: z
    .union([z.string().max(320), z.literal(""), z.null()])
    .optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; codeId: string }> }
) {
  const { id: eventId, codeId } = await params;
  const denied = await forbiddenUnlessEventSection(eventId, "admissionsCodes");
  if (denied) return denied;
  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const bodyParsed = patchBodySchema.safeParse(bodyJson);
  if (!bodyParsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const body = bodyParsed.data;

  const supabase = await createClient();
  const { data: event } = await supabase.rpc("get_admin_event_by_id", { p_id: eventId });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: row, error: fetchError } = await admin
    .from("event_admissions_codes")
    .select("id, event_id, code")
    .eq("id", codeId)
    .maybeSingle();

  if (fetchError || !row) {
    return NextResponse.json({ error: "Admissions code not found" }, { status: 404 });
  }
  if (row.event_id !== eventId) {
    return NextResponse.json({ error: "Admissions code not found" }, { status: 404 });
  }

  const update: { label?: string | null; assignee_email?: string | null } = {};
  if (body.label !== undefined) {
    const v = body.label;
    update.label = v == null || v.trim() === "" ? null : v.trim();
  }
  if (body.assignee_email !== undefined) {
    const n = body.assignee_email;
    if (n === "" || n == null) {
      update.assignee_email = null;
    } else {
      const t = n.trim();
      const parsed = z.string().email().max(320).safeParse(t);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
      }
      update.assignee_email = parsed.data;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("event_admissions_codes")
    .update(update)
    .eq("id", codeId)
    .select("id, code, label, assignee_email, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ code: updated });
}
