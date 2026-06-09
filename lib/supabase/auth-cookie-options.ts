/**
 * Cookie attributes shared by browser + server Supabase clients so PKCE / OAuth
 * sessions use the same path and SameSite behavior across middleware, routes, and refreshes.
 */
export const supabaseSessionCookieDefaults = {
  path: "/" as const,
  sameSite: "lax" as const,
  /** Local dev is usually http; production should use HTTPS. */
  secure: process.env.NODE_ENV === "production",
};
