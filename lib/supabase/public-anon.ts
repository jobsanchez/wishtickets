import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Anonymous Supabase client (no cookies). Use for cached / ISR server paths
 * where `createClient()` from server.ts would pull in `cookies()` and break static generation.
 */
export function createPublicAnonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
