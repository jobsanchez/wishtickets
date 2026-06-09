import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateUsername } from "@/lib/auth/username";

export const dynamic = "force-dynamic";

type ProfileUpdateBody = {
  fullName?: string;
  username?: string | null;
};

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as ProfileUpdateBody | null;
    const hasFullName = typeof body?.fullName === "string";
    const hasUsername = Object.prototype.hasOwnProperty.call(body ?? {}, "username");
    if (!hasFullName && !hasUsername) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const updates: { full_name?: string; username?: string | null; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };

    if (hasFullName) {
      updates.full_name = body?.fullName?.trim() ?? "";
    }

    if (hasUsername) {
      const rawUsername = body?.username;
      if (rawUsername === null || rawUsername === undefined || rawUsername.trim() === "") {
        updates.username = null;
      } else {
        const usernameValidation = validateUsername(rawUsername);
        if (!usernameValidation.ok || !usernameValidation.normalized) {
          return NextResponse.json(
            { error: usernameValidation.message ?? "Invalid username." },
            { status: 400 }
          );
        }
        updates.username = usernameValidation.normalized;
      }
    }

    const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Username is already taken." }, { status: 409 });
      }
      console.error("[account profile] update", error);
      return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, username: updates.username ?? null });
  } catch (error) {
    console.error("[account profile] unexpected", error);
    return NextResponse.json({ error: "Something went wrong while updating profile." }, { status: 500 });
  }
}
