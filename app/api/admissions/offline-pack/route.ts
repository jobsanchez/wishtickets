import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decodeSession, COOKIE_NAME } from "@/lib/admissions-session";
import { buildAdmissionsOfflinePack } from "@/lib/admissions/build-offline-pack";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;

export async function GET() {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(COOKIE_NAME)?.value;
  const session = cookieValue ? decodeSession(cookieValue) : null;

  if (!session) {
    return NextResponse.json(
      { error: "Enter an admissions code first" },
      { status: 401, headers: NO_STORE }
    );
  }

  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("validate_admissions_code", {
    p_code: session.code,
  });
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!row || row.event_id !== session.event_id) {
    return NextResponse.json(
      { error: "Admissions code expired or invalid" },
      { status: 401, headers: NO_STORE }
    );
  }

  const event_id = row.event_id as string;
  const event_title = (row.event_title as string | undefined) ?? "";

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  try {
    const pack = await buildAdmissionsOfflinePack(admin, {
      eventId: event_id,
      eventTitle: event_title,
      admissionsCode: session.code,
    });
    return NextResponse.json(pack, { headers: NO_STORE });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to build offline pack";
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE });
  }
}
