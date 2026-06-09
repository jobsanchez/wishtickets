import type { SupabaseClient } from "@supabase/supabase-js";

/** Stored in DB when API date filter is all-time (null). */
export const DASHBOARD_CACHE_DATE_SENTINEL = "1970-01-01";

export const DASHBOARD_CACHE_TTL_EVENT_DAY_MS = 30_000;
export const DASHBOARD_CACHE_TTL_DEFAULT_MS = 300_000;

export function normalizeCacheDate(date: string | null): string {
  return date ?? DASHBOARD_CACHE_DATE_SENTINEL;
}

export function denormalizeCacheDate(date: string): string | null {
  return date === DASHBOARD_CACHE_DATE_SENTINEL ? null : date;
}

export function getDashboardCacheTTL(isEventDay: boolean): number {
  return isEventDay ? DASHBOARD_CACHE_TTL_EVENT_DAY_MS : DASHBOARD_CACHE_TTL_DEFAULT_MS;
}

export function isCacheFresh(computedAt: string, ttlMs: number, nowMs = Date.now()): boolean {
  const at = new Date(computedAt).getTime();
  if (!Number.isFinite(at)) return false;
  return nowMs - at < ttlMs;
}

/** Match get_admin_dashboard_metrics: event_start::date = CURRENT_DATE (UTC date on timestamptz). */
export function isEventDayFromEventStart(eventStart: string | null | undefined): boolean {
  if (!eventStart) return false;
  const startKey = new Date(eventStart).toISOString().slice(0, 10);
  const nowKey = new Date().toISOString().slice(0, 10);
  return startKey === nowKey;
}

export function dashboardCacheStorageKey(
  eventId: string,
  dateFrom: string | null,
  dateTo: string | null
): string {
  return `${eventId}|${normalizeCacheDate(dateFrom)}|${normalizeCacheDate(dateTo)}`;
}

export type DashboardCacheRow = {
  report: Record<string, unknown>;
  computed_at: string;
};

export async function readDashboardCache(
  admin: SupabaseClient,
  eventId: string,
  dateFrom: string | null,
  dateTo: string | null
): Promise<DashboardCacheRow | null> {
  const { data, error } = await admin
    .from("event_dashboard_report_cache")
    .select("report, computed_at")
    .eq("event_id", eventId)
    .eq("date_from", normalizeCacheDate(dateFrom))
    .eq("date_to", normalizeCacheDate(dateTo))
    .maybeSingle();

  if (error) {
    console.error("[dashboard-cache] read", error.message);
    return null;
  }
  if (!data?.report || !data.computed_at) return null;

  return {
    report: data.report as Record<string, unknown>,
    computed_at: String(data.computed_at),
  };
}

export async function writeDashboardCache(
  admin: SupabaseClient,
  eventId: string,
  dateFrom: string | null,
  dateTo: string | null,
  report: Record<string, unknown>
): Promise<void> {
  const row = {
    event_id: eventId,
    date_from: normalizeCacheDate(dateFrom),
    date_to: normalizeCacheDate(dateTo),
    report,
    computed_at: new Date().toISOString(),
  };
  const { error } = await admin.from("event_dashboard_report_cache").upsert(row, {
    onConflict: "event_id,date_from,date_to",
  });
  if (error) {
    console.error("[dashboard-cache] write", error.message);
  }
}
