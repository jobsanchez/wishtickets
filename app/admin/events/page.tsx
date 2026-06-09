import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import { getProfileRole, requireSuperAdminOrCapability } from "@/lib/auth";
import { EventsTable } from "@/components/admin/events-table";

export default async function AdminEventsPage() {
  const role = await getProfileRole();
  const canListEvents =
    role === "super_admin" ||
    role === "admin" ||
    (await requireSuperAdminOrCapability("manage_events"));
  if (!canListEvents) {
    redirect("/admin");
  }

  const canCreateEvents =
    role === "super_admin" || (await requireSuperAdminOrCapability("manage_events"));

  const supabase = await createClient();
  const [{ data: events }, { data: producers }] = await Promise.all([
    supabase.rpc("get_admin_events"),
    supabase.from("event_producers").select("id, name"),
  ]);

  const producerMap: Record<string, string> = {};
  for (const p of producers ?? []) {
    producerMap[p.id] = p.name;
  }

  const allEvents = events ?? [];
  const archivedEvents = allEvents.filter(
    (e: { status?: string }) => (e.status ?? "").toLowerCase() === "archived"
  );
  const nonArchivedEvents = allEvents.filter(
    (e: { status?: string }) => (e.status ?? "").toLowerCase() !== "archived"
  );

  const now = Date.now();
  const endedEvents = nonArchivedEvents.filter((e: { event_start?: string }) => {
    if (!e.event_start) return false;
    const t = new Date(e.event_start).getTime();
    if (Number.isNaN(t)) return false;
    return t < now;
  });
  const upcomingEvents = nonArchivedEvents.filter((e: { event_start?: string }) => {
    if (!e.event_start) return true;
    const t = new Date(e.event_start).getTime();
    if (Number.isNaN(t)) return true;
    return t >= now;
  });

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
        {canCreateEvents && (
          <NavButtonWithProgress
            href="/admin/events/new"
            loadingMessage="Loading…"
          >
            New event
          </NavButtonWithProgress>
        )}
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-4">Events</h1>
      <EventsTable
        events={upcomingEvents}
        producerMap={producerMap}
        showFeatured={role === "super_admin"}
        canDuplicate={canCreateEvents}
        emptyMessage="No events yet."
      />
      {endedEvents.length > 0 && (
        <div id="ended" className="mt-12 scroll-mt-6">
          <h2 className="text-xl font-semibold text-foreground mb-4">Ended Events</h2>
          <EventsTable
            events={endedEvents}
            producerMap={producerMap}
            showFeatured={role === "super_admin"}
            canDuplicate={canCreateEvents}
            emptyMessage="No ended events."
            defaultCollapsed
          />
        </div>
      )}
      {archivedEvents.length > 0 && (
        <div id="archived" className="mt-12 scroll-mt-6">
          <h2 className="text-xl font-semibold text-foreground mb-4">Archived Events</h2>
          <EventsTable
            events={archivedEvents}
            producerMap={producerMap}
            showFeatured={role === "super_admin"}
            canDuplicate={canCreateEvents}
            emptyMessage="No archived events."
            defaultCollapsed
          />
        </div>
      )}
    </div>
  );
}
