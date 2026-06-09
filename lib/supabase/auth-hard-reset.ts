import type { SupabaseClient } from "@supabase/supabase-js";

const AUTH_RESET_TIMEOUT_MS = 5000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Timed out")), timeoutMs);
    }),
  ]);
}

/**
 * Clear both local auth state and server cookie session, then fetch fresh auth truth.
 */
export async function hardAuthReset(supabase: SupabaseClient): Promise<void> {
  try {
    await withTimeout(
      fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      }),
      AUTH_RESET_TIMEOUT_MS
    );
  } catch {
    // Best effort.
  }

  try {
    await withTimeout(supabase.auth.signOut(), AUTH_RESET_TIMEOUT_MS);
  } catch {
    try {
      await withTimeout(supabase.auth.signOut({ scope: "local" }), AUTH_RESET_TIMEOUT_MS);
    } catch {
      // Continue with marker cleanup anyway.
    }
  }

  try {
    await withTimeout(
      fetch("/api/session/logout-mark", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      }),
      AUTH_RESET_TIMEOUT_MS
    );
  } catch {
    // Best effort marker only.
  }

  try {
    await withTimeout(supabase.auth.getUser(), AUTH_RESET_TIMEOUT_MS);
  } catch {
    // Keep silent; caller decides UI behavior.
  }
}
