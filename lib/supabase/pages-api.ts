import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serialize } from "cookie";
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseSessionCookieDefaults } from "@/lib/supabase/auth-cookie-options";

/**
 * Supabase browser-session client for legacy `pages/api` routes.
 * App Router code must keep using {@link createClient} from `@/lib/supabase/server` (cookies()).
 */
export function createSupabasePagesApiClient(
  req: NextApiRequest,
  res: NextApiResponse
): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createServerClient(url, key, {
    cookieOptions: supabaseSessionCookieDefaults,
    cookies: {
      getAll() {
        return Object.entries(req.cookies).map(([name, value]) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        const serialized = cookiesToSet.map(({ name, value, options }) =>
          serialize(name, value, options)
        );
        const existing = res.getHeader("Set-Cookie");
        const prior: string[] =
          existing == null
            ? []
            : Array.isArray(existing)
              ? existing.map(String)
              : [String(existing)];
        res.setHeader("Set-Cookie", [...prior, ...serialized]);
      },
    },
  });
}
