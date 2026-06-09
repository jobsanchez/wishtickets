import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import { requireSuperAdminOrCapability } from "@/lib/auth";
import { ProducersTable } from "@/components/admin/producers-table";

export default async function AdminProducersPage() {
  const canManage = await requireSuperAdminOrCapability("manage_events");
  if (!canManage) {
    redirect("/admin");
  }

  const supabase = await createClient();
  const { data: producers } = await supabase
    .from("event_producers")
    .select("id, name, producer_representative, contact, email")
    .order("name");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <NavButtonWithProgress
          href="/admin"
          variant="secondary"
          size="sm"
          className="bg-amber-400 text-black hover:bg-amber-300 border-transparent"
          loadingMessage="Loading dashboard…"
        >
          ← Back to Dashboard
        </NavButtonWithProgress>
        <NavButtonWithProgress
          href="/admin/producers/new"
          loadingMessage="Loading…"
        >
          New producer
        </NavButtonWithProgress>
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-4">Producers</h1>
      <ProducersTable producers={producers} canDelete={true} />
    </div>
  );
}
