import { getAdminClientIfAvailable } from "@/lib/supabase/admin";

export const DEFAULT_RESERVATION_TTL_MINUTES = 15;

/** Reads global TTL from app_config.reservation.ttl_minutes. Falls back to default when unset or on error. */
export async function getGlobalReservationTtlMinutes(): Promise<number> {
  const admin = getAdminClientIfAvailable();
  if (!admin) return DEFAULT_RESERVATION_TTL_MINUTES;
  const { data } = await admin
    .from("app_config")
    .select("value")
    .eq("key", "reservation")
    .single();
  const val = data?.value as { ttl_minutes?: number } | null;
  const min = val?.ttl_minutes;
  return typeof min === "number" && min >= 1 && min <= 120 ? min : DEFAULT_RESERVATION_TTL_MINUTES;
}

export function getExpiresAt(minutes: number = DEFAULT_RESERVATION_TTL_MINUTES): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

export function getHeartbeatIntervalMs(minutes: number = DEFAULT_RESERVATION_TTL_MINUTES): number {
  return (minutes * 60 * 1000) / 2;
}
