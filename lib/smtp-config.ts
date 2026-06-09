import { createAdminClient } from "@/lib/supabase/admin";

export interface SmtpCredentials {
  user: string;
  pass: string;
  from?: string;
}

/** Get SMTP credentials from app_config or env. Prefers DB when both user and pass exist. */
export async function getSmtpCredentials(): Promise<SmtpCredentials | null> {
  try {
    const admin = createAdminClient();
    const keys = ["smtp_user", "smtp_pass", "smtp_from"] as const;
    const rows: Record<string, string> = {};
    for (const key of keys) {
      const { data } = await admin.from("app_config").select("value").eq("key", key).single();
      const val = typeof data?.value === "string" ? data.value.trim() : "";
      rows[key] = val;
    }
    const dbUser = rows.smtp_user;
    const dbPass = rows.smtp_pass;
    if (dbUser && dbPass) {
      return {
        user: dbUser,
        pass: dbPass,
        from: rows.smtp_from || undefined,
      };
    }
  } catch {
    // Fall through to env
  }
  const envUser = process.env.SMTP_USER?.trim();
  const envPass = process.env.SMTP_PASS?.trim();
  if (!envUser || !envPass) return null;
  return {
    user: envUser,
    pass: envPass,
    from: process.env.SMTP_FROM?.trim() || undefined,
  };
}
