import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** PATCH /api/profile/theme - Update theme preference for authenticated user */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { theme?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const theme = body.theme;
  if (theme !== "light" && theme !== "dark") {
    return NextResponse.json(
      { error: "theme must be 'light' or 'dark'" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      theme_preference: theme,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ theme });
}
