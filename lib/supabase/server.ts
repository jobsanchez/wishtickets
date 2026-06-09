import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseSessionCookieDefaults } from "@/lib/supabase/auth-cookie-options";

async function createServerClientFromEnv(url: string, key: string): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookieOptions: supabaseSessionCookieDefaults,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from Server Component; ignore
        }
      },
    },
  });
}

/** Cookie-backed server client; throws if public Supabase env is not set. */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createServerClientFromEnv(url, key);
}

/**
 * Same as {@link createClient} but returns null when env is missing.
 * Use from `generateMetadata` (and similar build-time paths) so `next build` does not fail
 * when Netlify/CI omits `NEXT_PUBLIC_*` at compile time.
 */
export async function getServerClientIfAvailable(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createServerClientFromEnv(url, key);
}
