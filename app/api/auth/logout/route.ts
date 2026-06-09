import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;

/**
 * Best-effort server-side auth cookie cleanup.
 * Used as a hard reset for stale mobile sessions where client/server auth state drifts.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { error: activityError } = await admin
        .from("user_session_activity")
        .upsert(
          {
            profile_id: user.id,
            logged_in: false,
            has_active_cart: false,
            in_paymongo_flow: false,
            force_logout: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "profile_id" }
        );
      if (activityError) {
        console.error("[auth logout] failed to clear session activity", activityError);
      }
    }
    await supabase.auth.signOut();
  } catch {
    // Best effort only; respond 200 so callers can continue local cleanup.
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
