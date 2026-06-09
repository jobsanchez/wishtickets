import { createBrowserClient } from "@supabase/ssr";
import { supabaseSessionCookieDefaults } from "@/lib/supabase/auth-cookie-options";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: supabaseSessionCookieDefaults }
  );
}
