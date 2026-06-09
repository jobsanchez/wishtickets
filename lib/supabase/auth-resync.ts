import type { SupabaseClient } from "@supabase/supabase-js";

/** Matches GET /api/auth/me JSON (avoid importing route module into client bundles). */
type AuthMeBody = { user: { id: string; email: string | null } | null };

let inflightServerMe: Promise<AuthMeBody | null> | null = null;

async function fetchServerAuthOnce(): Promise<AuthMeBody | null> {
  if (inflightServerMe) return inflightServerMe;
  inflightServerMe = (async () => {
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) return null;
      const body = (await res.json()) as AuthMeBody;
      return body && typeof body === "object" ? body : null;
    } catch {
      return null;
    } finally {
      queueMicrotask(() => {
        inflightServerMe = null;
      });
    }
  })();
  return inflightServerMe;
}

/**
 * One-shot reconcile of Supabase client auth with server cookie truth (`/api/auth/me`).
 * Call on full page load and client route changes (not on timers or tab focus).
 */
export async function resyncAuthWithServer(supabase: SupabaseClient): Promise<void> {
  const auth = supabase.auth as unknown as { startAutoRefresh?: () => void };
  auth.startAutoRefresh?.();

  const [serverSnapshot, clientResult] = await Promise.all([
    fetchServerAuthOnce(),
    supabase.auth.getUser(),
  ]);

  if (clientResult.error?.message?.includes("Invalid Refresh Token")) {
    await supabase.auth.signOut({ scope: "local" });
    return;
  }

  const clientUser = clientResult.data.user ?? null;
  const serverUser = serverSnapshot?.user ?? null;

  if (serverSnapshot == null) {
    await supabase.auth.getUser();
    return;
  }

  if (!serverUser?.id && clientUser?.id) {
    await supabase.auth.signOut({ scope: "local" });
    return;
  }

  if (serverUser?.id && clientUser?.id && serverUser.id !== clientUser.id) {
    await supabase.auth.signOut({ scope: "local" });
    await supabase.auth.refreshSession().catch(() => {});
    await supabase.auth.getUser();
    return;
  }

  if (serverUser?.id && !clientUser?.id) {
    await supabase.auth.refreshSession().catch(() => {});
    await supabase.auth.getUser();
    return;
  }

  await supabase.auth.getUser();
}
