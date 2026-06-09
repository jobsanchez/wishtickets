import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventForm } from "@/components/admin/event-form";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import { requireSuperAdminOrCapability } from "@/lib/auth";

export default async function NewEventPage() {
  const canManage = await requireSuperAdminOrCapability("manage_events");
  if (!canManage) redirect("/admin");

  const canCreateVenue = await requireSuperAdminOrCapability("manage_venues");

  const supabase = await createClient();
  const [{ data: venues }, { data: producers }] = await Promise.all([
    supabase.from("venues").select("id, name").order("name"),
    supabase.from("event_producers").select("id, name").order("name"),
  ]);

  return (
    <div>
      <NavButtonWithProgress
        href="/admin/events"
        variant="secondary"
        size="sm"
        className="mb-4 bg-amber-400 text-black hover:bg-amber-300 border-transparent"
        loadingMessage="Loading events…"
      >
        ← Back to events
      </NavButtonWithProgress>
      <h1 className="text-2xl font-bold text-foreground mb-6">New event</h1>
      <EventForm
        venues={venues ?? []}
        producers={producers ?? []}
        canCreateVenue={canCreateVenue}
      />
    </div>
  );
}
