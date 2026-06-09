import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfileRole } from "@/lib/auth";

function isStaffAdminRole(role: string | null): boolean {
  const r = (role ?? "").trim();
  return r === "admin" || r === "super_admin";
}

export async function GET(request: NextRequest) {
  const role = await getProfileRole();
  const isSuperAdmin = role === "super_admin";
  if (!isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const audience = request.nextUrl.searchParams.get("audience");

  const supabase = await createClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let rows = profiles ?? [];
  if (audience === "registered") {
    rows = rows.filter((p) => !isStaffAdminRole(p.role as string | null));
  }

  const { data: allCaps } = await supabase
    .from("user_capabilities")
    .select("user_id, capability");

  const capsByUser = (allCaps ?? []).reduce<Record<string, string[]>>(
    (acc, row) => {
      if (!acc[row.user_id]) acc[row.user_id] = [];
      acc[row.user_id].push(row.capability);
      return acc;
    },
    {}
  );

  const users = rows.map((p) => ({
    ...p,
    capabilities: capsByUser[p.id] ?? [],
  }));

  return NextResponse.json(users);
}
