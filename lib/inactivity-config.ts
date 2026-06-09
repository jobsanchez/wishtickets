export const INACTIVITY_ENABLED_KEY = "inactivity_auto_logout_enabled";
export const INACTIVITY_MINUTES_KEY = "inactivity_auto_logout_minutes";
export const DEFAULT_INACTIVITY_ENABLED = true;
export const DEFAULT_INACTIVITY_MINUTES = 5;
export const MIN_INACTIVITY_MINUTES = 1;
export const MAX_INACTIVITY_MINUTES = 120;

export type InactivityConfig = {
  enabled: boolean;
  minutes: number;
};

export function clampInactivityMinutes(value: unknown): number {
  const raw = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(raw)) return DEFAULT_INACTIVITY_MINUTES;
  return Math.max(MIN_INACTIVITY_MINUTES, Math.min(MAX_INACTIVITY_MINUTES, Math.round(raw)));
}

export function getInactivityCutoffIso(minutes: number): string {
  return new Date(Date.now() - clampInactivityMinutes(minutes) * 60_000).toISOString();
}

export function shouldForceInactivityLogout(row: {
  force_logout?: boolean | null;
  has_active_cart?: boolean | null;
  in_paymongo_flow?: boolean | null;
  last_activity_at?: string | null;
  last_heartbeat_at?: string | null;
}, config: InactivityConfig): boolean {
  if (!config.enabled) return false;
  if (row.force_logout) return true;
  if (row.has_active_cart || row.in_paymongo_flow) return false;
  const activityMs = row.last_activity_at
    ? new Date(row.last_activity_at).getTime()
    : NaN;
  const heartbeatMs = row.last_heartbeat_at
    ? new Date(row.last_heartbeat_at).getTime()
    : NaN;
  const latest = Math.max(
    Number.isFinite(activityMs) ? activityMs : 0,
    Number.isFinite(heartbeatMs) ? heartbeatMs : 0
  );
  if (latest <= 0) return false;
  return Date.now() - latest > config.minutes * 60_000;
}
