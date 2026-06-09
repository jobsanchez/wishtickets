import { describe, expect, it } from "vitest";
import {
  DASHBOARD_CACHE_DATE_SENTINEL,
  dashboardCacheStorageKey,
  denormalizeCacheDate,
  getDashboardCacheTTL,
  isCacheFresh,
  isEventDayFromEventStart,
  normalizeCacheDate,
} from "./dashboard-cache";

describe("dashboard-cache", () => {
  it("normalizes all-time dates to sentinel", () => {
    expect(normalizeCacheDate(null)).toBe(DASHBOARD_CACHE_DATE_SENTINEL);
    expect(denormalizeCacheDate(DASHBOARD_CACHE_DATE_SENTINEL)).toBeNull();
    expect(normalizeCacheDate("2026-05-01")).toBe("2026-05-01");
  });

  it("uses 30s TTL on event day and 5m otherwise", () => {
    expect(getDashboardCacheTTL(true)).toBe(30_000);
    expect(getDashboardCacheTTL(false)).toBe(300_000);
  });

  it("detects freshness within TTL", () => {
    const now = Date.now();
    expect(isCacheFresh(new Date(now - 5_000).toISOString(), 30_000, now)).toBe(true);
    expect(isCacheFresh(new Date(now - 60_000).toISOString(), 30_000, now)).toBe(false);
  });

  it("builds stable storage keys", () => {
    const a = dashboardCacheStorageKey("ev-1", null, null);
    const b = dashboardCacheStorageKey("ev-1", null, null);
    expect(a).toBe(b);
    expect(a).not.toBe(dashboardCacheStorageKey("ev-1", "2026-05-01", null));
  });

  it("matches event day by UTC calendar date", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(isEventDayFromEventStart(`${today}T18:00:00.000Z`)).toBe(true);
    expect(isEventDayFromEventStart("2020-01-01T12:00:00.000Z")).toBe(false);
  });
});
