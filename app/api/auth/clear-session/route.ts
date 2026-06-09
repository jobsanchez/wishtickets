import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { looksLikeEmail, validateUsername } from "@/lib/auth/username";

export const dynamic = "force-dynamic";

type ClearSessionBody = {
  identifier?: string;
  password?: string;
};

const GENERIC_AUTH_ERROR = "Invalid login credentials.";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as ClearSessionBody | null;
    const identifier = body?.identifier?.trim() ?? "";
    const password = body?.password ?? "";

    if (!identifier || !password) {
      return NextResponse.json({ error: "Identifier and password are required." }, { status: 400 });
    }

    let emailForAuth = identifier.toLowerCase();
    if (!looksLikeEmail(identifier)) {
      const usernameValidation = validateUsername(identifier);
      if (!usernameValidation.ok || !usernameValidation.normalized) {
        return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
      }

      const admin = createAdminClient();
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("email")
        .eq("username", usernameValidation.normalized)
        .maybeSingle();

      if (profileError) {
        console.error("[auth clear-session] username lookup", profileError);
        return NextResponse.json({ error: "Unable to clear session right now." }, { status: 500 });
      }

      if (!profile?.email) {
        return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
      }
      emailForAuth = profile.email;
    }

    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: emailForAuth,
      password,
    });

    if (signInError) {
      return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const admin = createAdminClient();
      const now = new Date().toISOString();
      const { error: sessionActivityError } = await admin
        .from("user_session_activity")
        .upsert(
          {
            profile_id: user.id,
            logged_in: false,
            force_logout: false,
            has_active_cart: false,
            in_paymongo_flow: false,
            updated_at: now,
            last_activity_at: now,
            last_heartbeat_at: now,
          },
          { onConflict: "profile_id" }
        );
      if (sessionActivityError) {
        console.error("[auth clear-session] session activity", sessionActivityError);
        return NextResponse.json({ error: "Unable to clear session right now." }, { status: 500 });
      }
    }

    await supabase.auth.signOut();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[auth clear-session] unexpected", error);
    return NextResponse.json({ error: "Unable to clear session right now." }, { status: 500 });
  }
}
