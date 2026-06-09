import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function generateCode(length = 8): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return result;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const denied = await forbiddenUnlessEventSection(id, "admissionsCodes");
  if (denied) return denied;
  const supabase = await createClient();
  const { data: event } = await supabase.rpc("get_admin_event_by_id", { p_id: id });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const adminSupabase = createAdminClient();

  const { data: codes, error } = await adminSupabase
    .from("event_admissions_codes")
    .select("id, code, label, assignee_email, created_at")
    .eq("event_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ codes: codes ?? [] });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const denied = await forbiddenUnlessEventSection(id, "admissionsCodes");
  if (denied) return denied;
  const supabase = await createClient();
  const { data: event } = await supabase.rpc("get_admin_event_by_id", { p_id: id });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const adminSupabase = createAdminClient();

  // Generate unique code (retry on collision)
  let code: string;
  let attempts = 0;
  const maxAttempts = 10;
  do {
    code = generateCode(8);
    const { data: existing } = await adminSupabase
      .from("event_admissions_codes")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!existing) break;
    attempts++;
  } while (attempts < maxAttempts);

  if (attempts >= maxAttempts) {
    return NextResponse.json(
      { error: "Could not generate unique code" },
      { status: 500 }
    );
  }

  const { data: inserted, error } = await adminSupabase
    .from("event_admissions_codes")
    .insert({ event_id: id, code })
    .select("id, code, label, assignee_email, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ code: inserted });
}
