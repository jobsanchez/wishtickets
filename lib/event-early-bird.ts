/** Event-level early bird window (`events.early_bird_*`) for cards, pricing, checkout. */

export function isEarlyBirdWindowActive(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (startsAt == null || endsAt == null) return false;
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return nowMs >= start && nowMs <= end;
}

export function formatEarlyBirdCountdown(ms: number): string {
  if (ms <= 0) return "Ended";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${min}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}
