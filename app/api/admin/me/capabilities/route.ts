import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfileRole, getCurrentUserId, getUserCapabilities } from "@/lib/auth";

/** Debug endpoint: returns current user's role and capabilities for troubleshooting. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await getProfileRole();
  const userId = await getCurrentUserId();
  const capabilities = userId ? await getUserCapabilities(userId) : [];

  return NextResponse.json({
    role,
    capabilities,
    userId,
  });
}
