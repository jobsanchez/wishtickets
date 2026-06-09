/**
 * Bounded parallel async work: process `items` in waves of at most `concurrency`
 * concurrent `fn` calls (back-pressure for CPU/IO-heavy tasks like Sharp).
 */

export interface RunPoolOptions {
  /** If true, stop processing remaining items (e.g. job cancelled). Checked before each wave. */
  beforeEachWave?: () => boolean | Promise<boolean>;
}

export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
  options?: RunPoolOptions
): Promise<void> {
  const conc = Math.max(1, Math.floor(concurrency));
  let i = 0;
  while (i < items.length) {
    if (options?.beforeEachWave) {
      const stop = await options.beforeEachWave();
      if (stop) return;
    }
    const end = Math.min(i + conc, items.length);
    const wave = items.slice(i, end);
    await Promise.all(wave.map((item) => fn(item)));
    i = end;
  }
}

const MAX_PRINT_TICKET_GEN_CONCURRENCY = 32;
/** Default when env is unset or invalid. */
const DEFAULT_PRINT_TICKET_GEN_CONCURRENCY = MAX_PRINT_TICKET_GEN_CONCURRENCY;

/**
 * Server-side concurrency for print ticket image generation (`POST /api/admin/print-tickets/generate`).
 * Set `PRINT_TICKET_GEN_CONCURRENCY` (1–32); invalid values fall back to 10.
 */
export function getPrintTicketGenConcurrency(): number {
  const raw = process.env.PRINT_TICKET_GEN_CONCURRENCY;
  if (raw === undefined || raw === "") return DEFAULT_PRINT_TICKET_GEN_CONCURRENCY;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PRINT_TICKET_GEN_CONCURRENCY;
  return Math.min(n, MAX_PRINT_TICKET_GEN_CONCURRENCY);
}

const MAX_CLIENT_PRINT_GEN_CONCURRENCY = 32;
const DEFAULT_CLIENT_PRINT_GEN_CONCURRENCY = MAX_CLIENT_PRINT_GEN_CONCURRENCY;

/**
 * Browser-only: parallel `POST /api/admin/print-tickets/generate` calls per tab for bulk admin generation.
 * Set `NEXT_PUBLIC_PRINT_CLIENT_GEN_CONCURRENCY` (1–32); invalid -> max.
 * Rebuild/restart dev after changing — value is inlined at compile time.
 */
export function getClientPrintGenConcurrency(): number {
  const raw = process.env.NEXT_PUBLIC_PRINT_CLIENT_GEN_CONCURRENCY;
  if (raw === undefined || raw === "") return DEFAULT_CLIENT_PRINT_GEN_CONCURRENCY;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_CLIENT_PRINT_GEN_CONCURRENCY;
  return Math.min(n, MAX_CLIENT_PRINT_GEN_CONCURRENCY);
}

/** @see {@link getClientPrintGenConcurrency} */
export const CLIENT_PRINT_GEN_CONCURRENCY = getClientPrintGenConcurrency();

/**
 * Set to 0 so generation always uses `CLIENT_PRINT_GEN_CONCURRENCY`.
 */
export const PRINT_GEN_SEQUENTIAL_UNDER = 0;
