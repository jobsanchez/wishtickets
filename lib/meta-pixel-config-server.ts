import { getAdminClientIfAvailable } from "@/lib/supabase/admin";
import {
  META_PIXEL_APP_CONFIG_KEY,
  parseMetaPixelAppConfig,
} from "@/lib/meta-pixel-config";

/**
 * When non-null, root layout should inject Meta Pixel for this numeric `pixelId`.
 * Production-only; requires service role to read `app_config` (RLS is super_admin-only).
 */
export async function getMetaPixelInjectConfig(): Promise<{ pixelId: string } | null> {
  if (process.env.NODE_ENV !== "production") return null;
  const admin = getAdminClientIfAvailable();
  if (!admin) return null;
  const { data, error } = await admin
    .from("app_config")
    .select("value")
    .eq("key", META_PIXEL_APP_CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return null;
  const cfg = parseMetaPixelAppConfig(data.value);
  if (!cfg.enabled || !cfg.pixel_id) return null;
  return { pixelId: cfg.pixel_id };
}
