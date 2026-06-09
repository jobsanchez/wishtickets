/**
 * Canonical `maxDuration` (seconds) for long print-ticket API routes.
 * Next.js does not clamp this; your host still enforces its plan maximum (often well below 24h).
 *
 * **App Router `route.ts` must set `export const maxDuration = 86400` as a numeric literal.**
 * The build fails if `maxDuration` is assigned from an imported binding (static analysis).
 */
export const LONG_PRINT_TICKETS_ROUTE_MAX_DURATION = 86400;
