import { getInactivityConfigServer } from "@/lib/inactivity-config-server";
import { shouldForceInactivityLogout } from "@/lib/inactivity-config";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const inactivity = await getInactivityConfigServer();

  if (!user) {
    return NextResponse.json(
      { user: null, forceLogout: false, inactivity },
      { headers: NO_STORE }
    );
  }

  const { data: row } = await supabase
    .from("user_session_activity")
    .select(
      "force_logout,has_active_cart,in_paymongo_flow,last_activity_at,last_heartbeat_at,logged_in"
    )
    .eq("profile_id", user.id)
    .maybeSingle();

  const shouldForce = shouldForceInactivityLogout(
    {
      logged_in: row?.logged_in ?? false,
      force_logout: row?.force_logout ?? false,
      has_active_cart: row?.has_active_cart ?? false,
      in_paymongo_flow: row?.in_paymongo_flow ?? false,
      last_activity_at: row?.last_activity_at ?? null,
      last_heartbeat_at: row?.last_heartbeat_at ?? null,
    },
    inactivity
  );

  if (shouldForce && !row?.force_logout) {
    await supabase
      .from("user_session_activity")
      .upsert(
        {
          profile_id: user.id,
          logged_in: false,
          force_logout: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" }
      );
  }

  return NextResponse.json(
    {
      user: { id: user.id, email: user.email ?? null },
      forceLogout: shouldForce,
      inactivity,
    },
    { headers: NO_STORE }
  );
}
