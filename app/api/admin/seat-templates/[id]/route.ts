import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";

async function canManageSeatTemplates() {
  const role = await getProfileRole();
  if (role === "super_admin" || role === "admin") return true;
  const userId = await getCurrentUserId();
  if (!userId) return false;
  return hasCapability(userId, "manage_events") || hasCapability(userId, "manage_seats");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const canManage = await canManageSeatTemplates();
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  const { data: template, error } = await supabase
    .from("venue_seat_templates")
    .select("id, venue_id, custom_name, section_count, total_seats, payload, created_at")
    .eq("id", id)
    .single();

  if (error || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const { data: venue } = await supabase
    .from("venues")
    .select("id, name")
    .eq("id", template.venue_id)
    .single();

  return NextResponse.json({
    ...template,
    venue_name: venue?.name ?? "",
    display_name: `${venue?.name ?? ""} - ${template.custom_name}`,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const canManage = await canManageSeatTemplates();
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  const { data: template, error: fetchError } = await supabase
    .from("venue_seat_templates")
    .select("id")
    .eq("id", id)
    .single();

  if (fetchError || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const { error: deleteError } = await supabase
    .from("venue_seat_templates")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
