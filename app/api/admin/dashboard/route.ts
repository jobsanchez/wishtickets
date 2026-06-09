import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminOrCapability } from "@/lib/auth";
import { buildDashboardMetricsReport } from "@/lib/reports/dashboard-metrics";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  dashboardCacheStorageKey,
  getDashboardCacheTTL,
  isCacheFresh,
  isEventDayFromEventStart,
  readDashboardCache,
  writeDashboardCache,
} from "@/lib/reports/dashboard-cache";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;

const inflightByKey = new Map<string, Promise<Record<string, unknown>>>();

async function computeDashboardReport(params: {
  eventId: string;
  pDateFrom: string | null;
  pDateTo: string | null;
}): Promise<Record<string, unknown>> {
  const { eventId, pDateFrom, pDateTo } = params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_dashboard_metrics", {
    p_event_id: eventId,
    p_date_from: pDateFrom,
    p_date_to: pDateTo,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data?.error === "Event not found") {
    const err = new Error("Event not found");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  if (data?.error === "Forbidden") {
    const err = new Error("Forbidden");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }

  return buildDashboardMetricsReport({
    eventId,
    dateFrom: pDateFrom,
    dateTo: pDateTo,
    baseData: data as Record<string, unknown>,
  });
}

function jsonDashboard(
  report: Record<string, unknown>,
  meta: { cache: "hit" | "miss"; computedAt?: string }
) {
  const headers: Record<string, string> = {
    ...NO_STORE_HEADERS,
    "X-Dashboard-Cache": meta.cache,
  };
  if (meta.computedAt) {
    headers["X-Dashboard-Computed-At"] = meta.computedAt;
  }
  return NextResponse.json(report, { headers });
}

export async function GET(request: NextRequest) {
  const canView = await requireSuperAdminOrCapability("view_sales_analytics");
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");

  if (!eventId || !UUID_REGEX.test(eventId)) {
    return NextResponse.json(
      { error: "event_id is required and must be a valid UUID" },
      { status: 400 }
    );
  }

  let pDateFrom: string | null = null;
  let pDateTo: string | null = null;
  if (dateFrom && DATE_REGEX.test(dateFrom)) pDateFrom = dateFrom;
  if (dateTo && DATE_REGEX.test(dateTo)) pDateTo = dateTo;

  const admin = createAdminClient();
  const { data: eventRow } = await admin
    .from("events")
    .select("event_start")
    .eq("id", eventId)
    .maybeSingle();

  const isEventDay = isEventDayFromEventStart(
    (eventRow as { event_start?: string | null } | null)?.event_start ?? null
  );
  const ttlMs = getDashboardCacheTTL(isEventDay);

  const cached = await readDashboardCache(admin, eventId, pDateFrom, pDateTo);
  if (cached && isCacheFresh(cached.computed_at, ttlMs)) {
    return jsonDashboard(cached.report, { cache: "hit", computedAt: cached.computed_at });
  }

  const storageKey = dashboardCacheStorageKey(eventId, pDateFrom, pDateTo);
  let inflight = inflightByKey.get(storageKey);
  if (!inflight) {
    inflight = (async () => {
      try {
        const report = await computeDashboardReport({ eventId, pDateFrom, pDateTo });
        await writeDashboardCache(admin, eventId, pDateFrom, pDateTo, report);
        return report;
      } finally {
        inflightByKey.delete(storageKey);
      }
    })();
    inflightByKey.set(storageKey, inflight);
  }

  try {
    const report = await inflight;
    const computedAt = new Date().toISOString();
    return jsonDashboard(report, { cache: "miss", computedAt });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load dashboard";
    const status =
      e instanceof Error && "status" in e && typeof (e as { status?: number }).status === "number"
        ? (e as { status: number }).status
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
