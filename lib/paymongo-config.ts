import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_PAYMONGO_METHODS,
  sanitizePaymongoMethods,
  type PaymongoMethodId,
} from "@/lib/paymongo-methods";
import {
  parsePaymongoProcessingFees,
  type PaymongoProcessingFeesConfig,
} from "@/lib/paymongo-processing-fees";

/** Get PayMongo secret key from app_config or env. Prefers DB when configured. */
export async function getPaymongoSecretKey(): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data: modeRow } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "paymongo_mode")
      .single();
    const mode = modeRow?.value === "live" ? "live" : "test";
    const key = mode === "live" ? "paymongo_live_secret" : "paymongo_test_secret";
    const { data: secretRow } = await admin
      .from("app_config")
      .select("value")
      .eq("key", key)
      .single();
    const secret = typeof secretRow?.value === "string" ? secretRow.value.trim() : null;
    if (secret) return secret;
  } catch {
    // Fall through to env
  }
  return process.env.PAYMONGO_SECRET_KEY?.trim() || null;
}

/** Get PayMongo webhook secret(s) for verification. Tries DB first, then env. Returns all configured secrets so webhook can try each. */
export async function getPaymongoWebhookSecrets(): Promise<string[]> {
  const secrets: string[] = [];
  try {
    const admin = createAdminClient();
    for (const k of ["paymongo_test_webhook_secret", "paymongo_live_webhook_secret"] as const) {
      const { data } = await admin
        .from("app_config")
        .select("value")
        .eq("key", k)
        .single();
      const s = typeof data?.value === "string" ? data.value.trim() : "";
      if (s) secrets.push(s);
    }
  } catch {
    // Fall through to env
  }
  const envSecret = process.env.PAYMONGO_WEBHOOK_SECRET?.trim();
  if (envSecret) secrets.push(envSecret);
  return secrets;
}

/** Get enabled PayMongo checkout methods from app_config. */
export async function getEnabledPaymongoMethods(): Promise<PaymongoMethodId[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "paymongo_enabled_methods")
      .single();
    const methods = sanitizePaymongoMethods(data?.value);
    if (methods.length > 0) return methods;
  } catch {
    // Fall back to defaults
  }
  return [...DEFAULT_PAYMONGO_METHODS];
}

/** Stored surcharge rules for checkout (JSON in app_config `paymongo_processing_fees`). */
export async function getPaymongoProcessingFees(): Promise<PaymongoProcessingFeesConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "paymongo_processing_fees")
      .single();
    return parsePaymongoProcessingFees(data?.value);
  } catch {
    return parsePaymongoProcessingFees(undefined);
  }
}
