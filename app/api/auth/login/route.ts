import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { looksLikeEmail, validateUsername } from "@/lib/auth/username";

export const dynamic = "force-dynamic";

const GENERIC_AUTH_ERROR = "Invalid login credentials.";

type LoginBody = {
  identifier?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as LoginBody | null;
    const identifier = body?.identifier?.trim() ?? "";
    const password = body?.password ?? "";

    if (!identifier || !password) {
      return NextResponse.json({ error: "Identifier and password are required." }, { status: 400 });
    }

    let emailForAuth = identifier.toLowerCase();
    let profileId: string | null = null;
    if (!looksLikeEmail(identifier)) {
      const usernameValidation = validateUsername(identifier);
      if (!usernameValidation.ok || !usernameValidation.normalized) {
        return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
      }

      const admin = createAdminClient();
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("id,email")
        .eq("username", usernameValidation.normalized)
        .maybeSingle();

      if (profileError) {
        console.error("[auth login] username lookup", profileError);
        return NextResponse.json({ error: "Unable to sign in right now." }, { status: 500 });
      }

      if (!profile?.email) {
        return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
      }
      emailForAuth = profile.email;
      profileId = profile.id;
    } else {
      const admin = createAdminClient();
      const { data: profileByEmail, error: profileByEmailError } = await admin
        .from("profiles")
        .select("id")
        .eq("email", emailForAuth)
        .maybeSingle();
      if (profileByEmailError) {
        console.error("[auth login] email lookup", profileByEmailError);
        return NextResponse.json({ error: "Unable to sign in right now." }, { status: 500 });
      }
      profileId = profileByEmail?.id ?? null;
    }

    if (profileId) {
      const admin = createAdminClient();
      const { data: existingSession, error: sessionLookupError } = await admin
        .from("user_session_activity")
        .select("logged_in,force_logout")
        .eq("profile_id", profileId)
        .maybeSingle();

      if (sessionLookupError) {
        console.error("[auth login] session lookup", sessionLookupError);
        return NextResponse.json({ error: "Unable to sign in right now." }, { status: 500 });
      }

      if (existingSession?.logged_in && !existingSession.force_logout) {
        return NextResponse.json(
          { error: "This account is already logged in on another device.", code: "active_session_exists" },
          { status: 409 }
        );
      }
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: emailForAuth,
      password,
    });
    if (error) {
      return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const admin = createAdminClient();
      const now = new Date().toISOString();
      const { error: sessionActivityError } = await admin.from("user_session_activity").upsert(
        {
          profile_id: user.id,
          logged_in: true,
          force_logout: false,
          updated_at: now,
          last_activity_at: now,
          last_heartbeat_at: now,
        },
        { onConflict: "profile_id" }
      );
      if (sessionActivityError) {
        console.error("[auth login] session activity", sessionActivityError);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[auth login] unexpected", error);
    return NextResponse.json({ error: "Unable to sign in right now." }, { status: 500 });
  }
}
