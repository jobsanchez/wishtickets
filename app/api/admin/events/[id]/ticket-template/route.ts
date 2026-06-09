import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const denied = await forbiddenUnlessEventSection(id, "ticketTemplate");
  if (denied) return denied;

  let body: { ticket_template_image_url?: string | null } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.ticket_template_image_url === undefined) {
    return NextResponse.json(
      { error: "ticket_template_image_url required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("events")
    .update({ ticket_template_image_url: body.ticket_template_image_url })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${id}`);
  return NextResponse.json({ success: true });
}
