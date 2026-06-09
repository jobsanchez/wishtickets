import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type ActivityBody = {
  event?: "heartbeat" | "interaction";
  hasActiveCart?: boolean;
  inPaymongoFlow?: boolean;
};

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const now = new Date().toISOString();
  const body = ((await request.json().catch(() => ({}))) ?? {}) as ActivityBody;
  const isInteraction = body.event === "interaction";

  const { data: current } = await supabase
    .from("user_session_activity")
    .select("force_logout")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (current?.force_logout) {
    return NextResponse.json(
      { ok: false, reason: "force_logout" },
      { status: 409, headers: NO_STORE }
    );
  }

  const updatePayload: Record<string, unknown> = {
    profile_id: user.id,
    logged_in: true,
    last_heartbeat_at: now,
    has_active_cart: body.hasActiveCart === true,
    in_paymongo_flow: body.inPaymongoFlow === true,
    updated_at: now,
  };
  if (isInteraction) {
    updatePayload.last_activity_at = now;
  }

  const { error } = await supabase
    .from("user_session_activity")
    .upsert(updatePayload, { onConflict: "profile_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
