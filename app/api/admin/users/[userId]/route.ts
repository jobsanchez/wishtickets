import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfileRole, getCurrentUserId } from "@/lib/auth";

/** PATCH: super_admin only; update profile full_name (names only, not email). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const role = await getProfileRole();
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { full_name?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const full_name =
    body.full_name === undefined ? undefined : (body.full_name === null ? null : String(body.full_name).trim() || null);

  if (full_name === undefined) {
    return NextResponse.json({ error: "full_name is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ full_name: full_name ?? null })
    .eq("id", userId);

  if (error) {
    console.error("[patch-user] profiles update:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const role = await getProfileRole();
  const currentUserId = await getCurrentUserId();

  if (role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (currentUserId === userId) {
    return NextResponse.json(
      { error: "Cannot delete yourself" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (profile.role === "super_admin") {
    return NextResponse.json(
      { error: "Cannot delete another Super Admin" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error: capsError } = await admin
    .from("user_capabilities")
    .delete()
    .eq("user_id", userId);
  if (capsError) {
    console.error("[delete-user] user_capabilities delete:", capsError);
    return NextResponse.json(
      { error: "Failed to remove user capabilities" },
      { status: 500 }
    );
  }

  const { error: profileError } = await admin
    .from("profiles")
    .delete()
    .eq("id", userId);
  if (profileError) {
    console.error("[delete-user] profiles delete:", profileError);
    return NextResponse.json(
      { error: "Failed to remove user profile" },
      { status: 500 }
    );
  }

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) {
    console.error("[delete-user] auth delete:", authError);
    return NextResponse.json(
      { error: "Failed to remove user from authentication" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
