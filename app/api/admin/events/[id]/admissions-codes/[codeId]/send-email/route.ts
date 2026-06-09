import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";
import { sendAdmissionsCodeEmail } from "@/lib/admissions-code-email";
import { z } from "zod";

const bodySchema = z.object({
  assigneeName: z.string().min(1, "Name is required").max(200),
  to: z.string().min(1, "Email is required").email("Invalid email address").max(320),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; codeId: string }> }
) {
  const { id: eventId, codeId } = await params;
  const denied = await forbiddenUnlessEventSection(eventId, "admissionsCodes");
  if (denied) return denied;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    const msg =
      (f.assigneeName?.[0] ?? f.to?.[0]) ?? "Validation failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const { assigneeName: nameRaw, to: toRaw } = parsed.data;
  const to = toRaw.trim();
  const assigneeName = nameRaw.trim();

  const supabase = await createClient();
  const { data: event } = await supabase.rpc("get_admin_event_by_id", { p_id: eventId });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const eventTitle = (event as { title?: string | null })?.title?.trim() || "Event";
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

  const code = row.code as string;

  const { error: updateError } = await admin
    .from("event_admissions_codes")
    .update({ label: assigneeName, assignee_email: to })
    .eq("id", codeId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  try {
    await sendAdmissionsCodeEmail({
      to,
      eventTitle,
      assigneeName,
      code,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email";
    if (
      message.includes("not configured") ||
      message.toLowerCase().includes("smtp")
    ) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    console.error("[admissions-codes send-email]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
