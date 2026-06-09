/** Upper bound for how many free/standing print slots we expand/generate in one job (env override). */
const DEFAULT_MAX = 2000;
const ABSOLUTE_MAX = 50000;

export function getFreeStandingPrintSlotCap(): number {
  const raw = process.env.MAX_FREE_STANDING_PRINT_SLOTS;
  if (raw === undefined || raw === "") return DEFAULT_MAX;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX;
  return Math.min(n, ABSOLUTE_MAX);
}

/** `min(capacity, cap)` for free/standing print slot expansion. */
export function cappedFreeStandingSlotCount(capacity: number): number {
  const cap = getFreeStandingPrintSlotCap();
  return Math.min(Math.max(0, Math.floor(capacity)), cap);
}
