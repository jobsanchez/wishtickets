import { getAdminClientIfAvailable } from "@/lib/supabase/admin";
import {
  clampInactivityMinutes,
  DEFAULT_INACTIVITY_ENABLED,
  DEFAULT_INACTIVITY_MINUTES,
  INACTIVITY_ENABLED_KEY,
  INACTIVITY_MINUTES_KEY,
  type InactivityConfig,
} from "@/lib/inactivity-config";

let cache: { value: InactivityConfig; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(lowered)) return true;
    if (["false", "0", "no", "off"].includes(lowered)) return false;
  }
  return fallback;
}

export async function getInactivityConfigServer(): Promise<InactivityConfig> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.value;
  }

  const admin = getAdminClientIfAvailable();
  if (!admin) {
    return {
      enabled: DEFAULT_INACTIVITY_ENABLED,
      minutes: DEFAULT_INACTIVITY_MINUTES,
    };
  }

  const { data } = await admin
    .from("app_config")
    .select("key, value")
    .in("key", [INACTIVITY_ENABLED_KEY, INACTIVITY_MINUTES_KEY]);

  let enabled = DEFAULT_INACTIVITY_ENABLED;
  let minutes = DEFAULT_INACTIVITY_MINUTES;
  for (const row of data ?? []) {
    if (row.key === INACTIVITY_ENABLED_KEY) {
      enabled = asBoolean(row.value, DEFAULT_INACTIVITY_ENABLED);
    }
    if (row.key === INACTIVITY_MINUTES_KEY) {
      minutes = clampInactivityMinutes(row.value);
    }
  }

  const value = { enabled, minutes };
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}
