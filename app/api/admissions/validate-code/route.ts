import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { encodeSession, COOKIE_NAME } from "@/lib/admissions-session";

const schema = z.object({ code: z.string().min(1).max(64) });

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const code = parsed.data.code.trim();
  const supabase = await createClient();

  const { data: rows } = await supabase.rpc("validate_admissions_code", {
    p_code: code,
  });

  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!row || !row.event_id) {
    return NextResponse.json({ error: "Invalid admissions code" }, { status: 400 });
  }

  const session = encodeSession({ event_id: row.event_id, code });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 hours
    path: "/",
  });

  return NextResponse.json({
    event_id: row.event_id,
    event_title: row.event_title ?? "",
  });
}
