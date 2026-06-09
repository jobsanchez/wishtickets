import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Capability } from "@/lib/capabilities";

export type AppRole = "user" | "admin" | "admissions_staff" | "super_admin";

export async function getProfileRole(): Promise<AppRole | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: role } = await supabase.rpc("get_my_role");
  return (role as AppRole) ?? null;
}

export async function requireAdmin() {
  const role = await getProfileRole();
  if (role !== "admin" && role !== "super_admin") {
    return false;
  }
  return true;
}

export async function requireSuperAdmin(): Promise<boolean> {
  const role = await getProfileRole();
  return role === "super_admin";
}

/** super_admin: always allowed. Others: must have the capability. */
export async function requireSuperAdminOrCapability(
  capability: Capability
): Promise<boolean> {
  const role = await getProfileRole();
  if (role === "super_admin") return true;
  const userId = await getCurrentUserId();
  if (!userId) return false;
  return hasCapability(userId, capability);
}

export async function requireStaff() {
  const role = await getProfileRole();
  if (role !== "admissions_staff" && role !== "admin" && role !== "super_admin") {
    return false;
  }
  return true;
}

/** Only super_admin can access Global Settings. */
export async function requireSettingsAccess(): Promise<boolean> {
  return requireSuperAdmin();
}

export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function getUserCapabilities(userId: string): Promise<Capability[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_capabilities")
    .select("capability")
    .eq("user_id", userId);
  return (data?.map((r) => r.capability as Capability) ?? []);
}

export async function hasCapability(
  userId: string,
  capability: Capability
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_capabilities")
    .select("capability")
    .eq("user_id", userId)
    .eq("capability", capability)
    .maybeSingle();
  return !!data;
}

export async function requireCapability(
  capability: Capability
): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;
  return hasCapability(userId, capability);
}

export async function requireAnyCapability(
  capabilities: Capability[]
): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_capabilities")
    .select("capability")
    .eq("user_id", userId)
    .in("capability", capabilities);
  return (data?.length ?? 0) > 0;
}

/**
 * Admin ticket resend (search, POST resend, page): `super_admin`; role `admin`;
 * or `resend_tickets` (dashboard box); or legacy `view_sales_analytics` until
 * all rows have `resend_tickets` from backfill.
 */
export async function canAccessTicketResendAdminTools(): Promise<boolean> {
  const role = await getProfileRole();
  if (role === "super_admin" || role === "admin") return true;
  const userId = await getCurrentUserId();
  if (!userId) return false;
  if (await hasCapability(userId, "resend_tickets")) return true;
  if (await hasCapability(userId, "view_sales_analytics")) return true;
  return false;
}

/**
 * Same rules as {@link canAccessTicketResendAdminTools} but uses a request-scoped client
 * (e.g. `createSupabasePagesApiClient` from `@/lib/supabase/pages-api`) so `pages/api`
 * handlers do not call `cookies()` from `next/headers`.
 */
export async function canAccessTicketResendAdminToolsWithClient(
  supabase: SupabaseClient
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: role } = await supabase.rpc("get_my_role");
  const r = (role as AppRole) ?? null;
  if (r === "super_admin" || r === "admin") return true;

  const { data: resendRow } = await supabase
    .from("user_capabilities")
    .select("capability")
    .eq("user_id", user.id)
    .eq("capability", "resend_tickets")
    .maybeSingle();
  if (resendRow) return true;

  const { data: analyticsRow } = await supabase
    .from("user_capabilities")
    .select("capability")
    .eq("user_id", user.id)
    .eq("capability", "view_sales_analytics")
    .maybeSingle();
  return !!analyticsRow;
}
