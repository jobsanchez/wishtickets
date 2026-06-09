import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { decodeSession, COOKIE_NAME } from "@/lib/admissions-session";

export async function GET() {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  if (!value) {
    return NextResponse.json({ session: null });
  }

  const session = decodeSession(value);
  if (!session) {
    return NextResponse.json({ session: null });
  }

  // Re-validate code is still valid
  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("validate_admissions_code", {
    p_code: session.code,
  });
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!row || row.event_id !== session.event_id) {
    return NextResponse.json({ session: null });
  }

  return NextResponse.json({
    session: { event_id: row.event_id, event_title: row.event_title ?? "" },
  });
}
