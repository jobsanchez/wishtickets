import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PermissionDialogProvider } from "@/components/providers/permission-dialog-provider";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [roleResult, capsResult] = await Promise.all([
    supabase.rpc("get_my_role"),
    supabase.from("user_capabilities").select("capability").eq("user_id", user.id),
  ]);

  const role =
    roleResult.error != null
      ? null
      : (roleResult.data as string | null | undefined);
  const profile = role ? { role } : null;

  let caps: { capability: string }[] | null = null;
  if (!capsResult.error && capsResult.data) caps = capsResult.data;

  const capabilityRows = (caps ?? []) as { capability: string }[];
  const capabilities = new Set(capabilityRows.map((c) => c.capability));
  const isAdmin =
    profile?.role === "admin" || profile?.role === "super_admin";
  const hasAnyCapability =
    capabilities.has("manage_events") ||
    capabilities.has("manage_venues") ||
    capabilities.has("manage_seats") ||
    capabilities.has("manage_prices") ||
    capabilities.has("view_sales_analytics") ||
    capabilities.has("manage_assignments") ||
    capabilities.has("refund_lookup") ||
    capabilities.has("resend_tickets");

  if (!isAdmin && !hasAnyCapability) {
    redirect("/dashboard");
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <PermissionDialogProvider>{children}</PermissionDialogProvider>
    </div>
  );
}
