import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfileRole } from "@/lib/auth";
import { z } from "zod";

const roleSchema = z.enum(["user", "admin", "admissions_staff", "super_admin"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const role = await getProfileRole();

  if (role !== "super_admin" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (role === "admin") {
    const supabase = await createClient();
    const { data: target } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (!target || target.role !== "user") {
      return NextResponse.json(
        { error: "Admins can only assign roles to users with User role" },
        { status: 403 }
      );
    }
  }

  const body = await request.json().catch(() => ({}));
  const parsed = roleSchema.safeParse(body.role ?? body.new_role ?? body.role_name);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid role", valid: ["user", "admin", "admissions_staff", "super_admin"] },
      { status: 400 }
    );
  }

  const newRole = parsed.data;

  if (role === "admin" && newRole !== "admissions_staff") {
    return NextResponse.json(
      { error: "Admins can only assign Admissions Staff or Usher role" },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const { data: ok, error } = await supabase.rpc("set_user_role", {
    p_user_id: userId,
    p_new_role: newRole,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!ok) {
    return NextResponse.json(
      { error: "You do not have permission to assign this role" },
      { status: 403 }
    );
  }
  return NextResponse.json({ success: true });
}
