import { getInactivityConfigServer } from "@/lib/inactivity-config-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

function getCronSecret(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  return request.headers.get("x-cron-secret")?.trim() ?? null;
}

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export async function GET(request: NextRequest) {
  const secret = getCronSecret(request);
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inactivity = await getInactivityConfigServer();
  if (!inactivity.enabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_session_activity")
    .select(
      "profile_id,logged_in,force_logout,has_active_cart,in_paymongo_flow,last_activity_at,last_heartbeat_at"
    )
    .eq("logged_in", true)
    .eq("force_logout", false)
    .eq("has_active_cart", false)
    .eq("in_paymongo_flow", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const cutoffMs = Date.now() - inactivity.minutes * 60_000;
  const staleIds = (data ?? [])
    .filter((row) => {
      const latestMs = Math.max(
        parseIsoMs(row.last_activity_at) ?? 0,
        parseIsoMs(row.last_heartbeat_at) ?? 0
      );
      return latestMs > 0 && latestMs < cutoffMs;
    })
    .map((row) => row.profile_id);

  if (staleIds.length > 0) {
    const { error: updateError } = await admin
      .from("user_session_activity")
      .update({
        logged_in: false,
        force_logout: true,
        updated_at: new Date().toISOString(),
      })
      .in("profile_id", staleIds);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: data?.length ?? 0,
    flagged: staleIds.length,
    inactivityMinutes: inactivity.minutes,
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
