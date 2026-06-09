import { getAdminClientIfAvailable } from "@/lib/supabase/admin";
import { getCurrentUserId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  EVENT_ADMIN_SECTION_IDS,
  parseEventAdminSections,
} from "@/lib/event-admin-sections";

const patchSchema = z.object({
  allowed_sections: z.array(z.string()).min(1, "Select at least one page"),
});

/** Use service role to bypass RLS when user is authorized (avoids RLS blocking delete). */
async function getClientForAuthorizedEventAdminManager(eventId: string) {
  const userClient = await createClient();
  const { data: authorized } = await userClient.rpc("is_authorized_event_admin_manager", {
    p_event_id: eventId,
  });
  if (!authorized) {
    return { client: null, authorized: false };
  }
  const adminClient = getAdminClientIfAvailable();
  return { client: adminClient ?? userClient, authorized: true };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: eventId, userId } = await params;
  const { client: supabase, authorized } = await getClientForAuthorizedEventAdminManager(eventId);

  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors.allowed_sections?.[0] ?? "Invalid payload" },
      { status: 400 }
    );
  }

  const sections = parseEventAdminSections(parsed.data.allowed_sections);
  if (sections.length === 0) {
    return NextResponse.json({ error: "No valid page keys" }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("event_administrators")
    .update({ allowed_sections: sections })
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .select("user_id, allowed_sections")
    .single();

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Administrator not found" }, { status: 404 });
  }

  return NextResponse.json({
    administrator: data,
    valid_section_ids: [...EVENT_ADMIN_SECTION_IDS],
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: eventId, userId } = await params;
  const currentUserId = await getCurrentUserId();

  if (currentUserId && userId === currentUserId) {
    return NextResponse.json(
      { error: "You cannot remove yourself from event administrators" },
      { status: 400 }
    );
  }

  const { client: supabase, authorized } = await getClientForAuthorizedEventAdminManager(eventId);

  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase!
    .from("event_administrators")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId);

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
