import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;

export type AuthMeUser = { id: string; email: string | null };

export type AuthMeResponse = { user: AuthMeUser | null };

/** Cookie/session truth for the current request (server-side `getUser`). */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      const body: AuthMeResponse = { user: null };
      return NextResponse.json(body, { headers: NO_STORE });
    }
    const body: AuthMeResponse = {
      user: { id: user.id, email: user.email ?? null },
    };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch {
    const body: AuthMeResponse = { user: null };
    return NextResponse.json(body, { status: 200, headers: NO_STORE });
  }
}
