import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import { getProfileRole, requireSuperAdminOrCapability } from "@/lib/auth";
import { VenuesTable } from "@/components/admin/venues-table";
import type { VenueRow } from "@/components/admin/venues-table";

export default async function AdminVenuesPage() {
  const canManage = await requireSuperAdminOrCapability("manage_venues");
  if (!canManage) {
    redirect("/admin");
  }

  const role = await getProfileRole();
  const isSuperAdmin = role === "super_admin";

  const supabase = await createClient();
  const { data: venues } = await supabase
    .from("venues")
    .select(
      "id, name, province_id, city_id, standard_capacity, provinces(name), cities(name)"
    )
    .order("name");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Venues</h1>
        <NavButtonWithProgress
          href="/admin/venues/new"
          loadingMessage="Loading…"
        >
          New venue
        </NavButtonWithProgress>
      </div>
      <VenuesTable venues={venues as VenueRow[] | null} isSuperAdmin={isSuperAdmin} />
    </div>
  );
}
