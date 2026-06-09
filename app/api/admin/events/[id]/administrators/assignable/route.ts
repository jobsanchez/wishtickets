import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const supabase = await createClient();

  const { data: authorized } = await supabase.rpc("is_authorized_event_admin_manager", {
    p_event_id: eventId,
  });
  if (!authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: rows, error } = await supabase.rpc("get_assignable_event_admins", {
    p_event_id: eventId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = (rows ?? []).map((r: { id: string; email: string | null; full_name: string | null; role: string; capabilities: string[] }) => ({
    id: r.id,
    email: r.email,
    full_name: r.full_name,
    role: r.role ?? "user",
    capabilities: r.capabilities ?? [],
  }));

  return NextResponse.json({ users });
}
