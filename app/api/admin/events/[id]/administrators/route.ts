import { getAdminClientIfAvailable } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_EVENT_ADMIN_SECTIONS } from "@/lib/event-admin-sections";

const postSchema = z.object({ user_id: z.string().uuid() });

/** Use service role to bypass RLS when user is authorized (avoids RLS bugs). */
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const { client: supabase, authorized } = await getClientForAuthorizedEventAdminManager(eventId);

  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: admins, error } = await supabase!
    .from("event_administrators")
    .select("user_id, created_at, allowed_sections")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if ((admins ?? []).length === 0) {
    return NextResponse.json({ administrators: [] });
  }

  const userIds = [...new Set((admins ?? []).map((a) => a.user_id))];
  const { data: profiles } = await supabase!
    .from("profiles")
    .select("id, email, full_name, role")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const administrators = (admins ?? []).map((a) => ({
    user_id: a.user_id,
    created_at: a.created_at,
    allowed_sections: (a as { allowed_sections?: string[] | null }).allowed_sections ?? null,
    email: profileMap.get(a.user_id)?.email ?? null,
    full_name: profileMap.get(a.user_id)?.full_name ?? null,
    role: profileMap.get(a.user_id)?.role ?? null,
  }));

  return NextResponse.json({ administrators });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", valid: ["user_id (uuid)"] },
      { status: 400 }
    );
  }

  const { client: supabase, authorized } = await getClientForAuthorizedEventAdminManager(eventId);

  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: event } = await supabase!
    .from("events")
    .select("id")
    .eq("id", eventId)
    .single();
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const { data, error } = await supabase!
    .from("event_administrators")
    .insert({
      event_id: eventId,
      user_id: parsed.data.user_id,
      allowed_sections: [...DEFAULT_EVENT_ADMIN_SECTIONS],
    })
    .select("user_id, created_at, allowed_sections")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "User is already an administrator for this event" },
        { status: 409 }
      );
    }
    if (error.code === "42501") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ administrator: data });
}
