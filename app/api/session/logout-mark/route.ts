import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;

export async function POST() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { error } = await admin
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
    if (error) {
      console.error("[session logout-mark] failed to clear session activity", error);
    }
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
