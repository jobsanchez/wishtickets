import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getProfileRole, getCurrentUserId, hasCapability, requireSuperAdminOrCapability } from "@/lib/auth";
import { ReportsPageClient } from "./reports-page-client";

async function canRelease() {
  const role = await getProfileRole();
  if (role === "super_admin" || role === "admin" || role === "admissions_staff")
    return true;
  const userId = await getCurrentUserId();
  if (!userId) return false;
  return (
    (await hasCapability(userId, "manage_seats")) ||
    (await hasCapability(userId, "manage_assignments"))
  );
}

async function canDeleteAdmissions() {
  const role = await getProfileRole();
  return role === "super_admin" || role === "admin";
}

async function canClearSoldSection() {
  const role = await getProfileRole();
  return role === "super_admin";
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminReportsPage(props: {
  searchParams: Promise<{ event_id?: string; producer_id?: string }>;
}) {
  const canView = await requireSuperAdminOrCapability("view_sales_analytics");
  if (!canView) {
    redirect("/admin");
  }

  const { event_id: eventIdParam, producer_id: producerIdParam } = await props.searchParams;

  const supabase = await createClient();
  const [{ data: events }, { data: producers }] = await Promise.all([
    supabase.rpc("get_admin_events"),
    supabase.from("event_producers").select("id, name").order("name"),
  ]);

  const eventOptions = (events ?? []).map((e: { id: string; title: string | null; event_start: string | null; producer_id?: string | null }) => ({
    id: e.id,
    title: e.title ?? "",
    event_start: e.event_start,
    producer_id: e.producer_id ?? null,
  }));

  const producerOptions = (producers ?? []).map((p: { id: string; name: string | null }) => ({
    id: p.id,
    name: p.name ?? "",
  }));

  const initialEventId =
    eventIdParam && UUID_REGEX.test(eventIdParam) ? eventIdParam : undefined;

  const initialProducerId =
    producerIdParam === "__none__"
      ? "__none__"
      : producerIdParam && UUID_REGEX.test(producerIdParam)
        ? producerIdParam
        : undefined;

  const canReleaseTickets = await canRelease();
  const canDeleteAdmissionsTickets = await canDeleteAdmissions();
  const canClearSold = await canClearSoldSection();

  return (
    <ReportsPageClient
      events={eventOptions}
      producers={producerOptions}
      initialEventId={initialEventId}
      initialProducerId={initialProducerId}
      canRelease={canReleaseTickets}
      canDeleteAdmissions={canDeleteAdmissionsTickets}
      canClearSoldSection={canClearSold}
    />
  );
}
