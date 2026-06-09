import { createClient } from "@/lib/supabase/server";
import { AdminCardLink } from "@/components/admin/admin-card-link";
import { DangerZoneClearDatabase } from "@/components/admin/danger-zone-clear-database";
import {
  CalendarDays,
  MapPin,
  Users,
  BarChart3,
  Receipt,
  Settings,
  Mail,
  TicketX,
} from "lucide-react";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: role }, { data: caps }] = await Promise.all([
    supabase.rpc("get_my_role"),
    user
      ? supabase
          .from("user_capabilities")
          .select("capability")
          .eq("user_id", user.id)
      : Promise.resolve({ data: null } as { data: { capability: string }[] | null }),
  ]);

  const capabilityRows = (caps ?? []) as { capability: string }[];
  const capabilities = new Set(capabilityRows.map((c) => c.capability));
  const isSuperAdmin = role === "super_admin";

  const canManageEvents = isSuperAdmin || capabilities.has("manage_events");
  const canManageVenues = isSuperAdmin || capabilities.has("manage_venues");
  const canAccessSettingsCard = isSuperAdmin;
  const canViewReports = isSuperAdmin || capabilities.has("view_sales_analytics");
  const canUseRefundLookup = isSuperAdmin || capabilities.has("refund_lookup");
  const canUseTicketResending = isSuperAdmin || capabilities.has("resend_tickets");
  const canUseTicketInvalidation = canUseTicketResending;

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Admin Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <AdminCardLink
          href="/admin/events"
          allowed={canManageEvents}
          className="group block glass rounded-xl border border-[var(--glass-border)] p-6 cursor-pointer hover:bg-white/5 hover:scale-105 transition-all duration-200"
        >
          <div className="flex items-center gap-2 text-xl text-foreground dark:text-[var(--wish-yellow)] transition-colors duration-200">
            <CalendarDays className="h-5 w-5 shrink-0" />
            <span>Events</span>
          </div>
        </AdminCardLink>
        <AdminCardLink
          href="/admin/venues"
          allowed={canManageVenues}
          className="group block glass rounded-xl border border-[var(--glass-border)] p-6 cursor-pointer hover:bg-white/5 hover:scale-105 transition-all duration-200"
        >
          <div className="flex items-center gap-2 text-xl text-foreground dark:text-[var(--wish-yellow)] transition-colors duration-200">
            <MapPin className="h-5 w-5 shrink-0" />
            <span>Venues</span>
          </div>
        </AdminCardLink>
        {canManageEvents && (
          <AdminCardLink
            href="/admin/producers"
            allowed={true}
            className="group block glass rounded-xl border border-[var(--glass-border)] p-6 cursor-pointer hover:bg-white/5 hover:scale-105 transition-all duration-200"
          >
            <div className="flex items-center gap-2 text-xl text-foreground dark:text-[var(--wish-yellow)] transition-colors duration-200">
              <Users className="h-5 w-5 shrink-0" />
              <span>Producers</span>
            </div>
          </AdminCardLink>
        )}
        <AdminCardLink
          href="/admin/reports"
          allowed={canViewReports}
          className="group block glass rounded-xl border border-[var(--glass-border)] p-6 cursor-pointer hover:bg-white/5 hover:scale-105 transition-all duration-200"
        >
          <div className="flex items-center gap-2 text-xl text-foreground dark:text-[var(--wish-yellow)] transition-colors duration-200">
            <BarChart3 className="h-5 w-5 shrink-0" />
            <span>Reports</span>
          </div>
        </AdminCardLink>
        {canUseRefundLookup && (
          <AdminCardLink
            href="/admin/refund-lookup"
            allowed
            className="group block glass rounded-xl border border-[var(--glass-border)] p-6 cursor-pointer hover:bg-white/5 hover:scale-105 transition-all duration-200"
          >
            <div className="flex items-center gap-2 text-xl text-foreground dark:text-[var(--wish-yellow)] transition-colors duration-200">
              <Receipt className="h-5 w-5 shrink-0" />
              <span>Refund lookup</span>
            </div>
          </AdminCardLink>
        )}
        {canAccessSettingsCard && (
          <AdminCardLink
            href="/admin/settings"
            allowed={true}
            className="group block glass rounded-xl border border-[var(--glass-border)] p-6 cursor-pointer hover:bg-white/5 hover:scale-105 transition-all duration-200"
          >
            <div className="flex items-center gap-2 text-xl text-foreground dark:text-[var(--wish-yellow)] transition-colors duration-200">
              <Settings className="h-5 w-5 shrink-0" />
              <span>Global Settings</span>
            </div>
          </AdminCardLink>
        )}
        {canUseTicketResending && (
          <AdminCardLink
            href="/admin/ticket-resending"
            allowed={canUseTicketResending}
            className="group block glass rounded-xl border border-[var(--glass-border)] p-6 cursor-pointer hover:bg-white/5 hover:scale-105 transition-all duration-200"
          >
            <div className="flex items-center gap-2 text-xl text-foreground dark:text-[var(--wish-yellow)] transition-colors duration-200">
              <Mail className="h-5 w-5 shrink-0" />
              <span>Ticket Resending</span>
            </div>
          </AdminCardLink>
        )}
        {canUseTicketInvalidation && (
          <AdminCardLink
            href="/admin/ticket-invalidation"
            allowed={canUseTicketInvalidation}
            className="group block glass rounded-xl border border-[var(--glass-border)] p-6 cursor-pointer hover:bg-white/5 hover:scale-105 transition-all duration-200"
          >
            <div className="flex items-center gap-2 text-xl text-foreground dark:text-[var(--wish-yellow)] transition-colors duration-200">
              <TicketX className="h-5 w-5 shrink-0" />
              <span>Invalidate Ticket</span>
            </div>
          </AdminCardLink>
        )}
      </div>
      {isSuperAdmin && user?.id && (
        <DangerZoneClearDatabase superAdminId={user.id} />
      )}
    </div>
  );
}
