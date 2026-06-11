import { createAdminClient } from "@/lib/supabase/admin";

export type BootstrapSessionActivityResult = {
  ok: boolean;
  error?: string;
};

/**
 * Mark a profile as freshly logged in with cleared force-logout flags and fresh timestamps.
 * Call after successful password login or OAuth code exchange.
 */
export async function bootstrapSessionActivity(
  profileId: string
): Promise<BootstrapSessionActivityResult> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin.from("user_session_activity").upsert(
    {
      profile_id: profileId,
      logged_in: true,
      force_logout: false,
      has_active_cart: false,
      in_paymongo_flow: false,
      updated_at: now,
      last_activity_at: now,
      last_heartbeat_at: now,
    },
    { onConflict: "profile_id" }
  );

  if (error) {
    console.error("[session bootstrap] upsert failed", error);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
