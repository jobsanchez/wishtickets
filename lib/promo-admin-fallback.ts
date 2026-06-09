import type { PostgrestError } from "@supabase/supabase-js";

const MIGRATION_HINT =
  "Database is missing promo columns (display_name, rule). Apply migration: supabase/migrations/00214_promo_codes_rule_and_display_name.sql (e.g. npm run db:push from the project root).";

/**
 * When migration 00214 is not applied, PostgREST/Postgres error messages reference
 * missing columns on promo_codes. Used to fall back to legacy shape or return a clear 503.
 */
export function isMissingPromoDesignerColumnsError(
  err: PostgrestError | { message?: string; code?: string } | null
): boolean {
  if (!err) return false;
  if (err.code === "42703") return true;
  const m = (err.message ?? "").toLowerCase();
  if (m.includes("display_name") && (m.includes("column") || m.includes("schema cache"))) {
    return true;
  }
  if (m.includes("'rule'") && (m.includes("column") || m.includes("schema cache"))) {
    return true;
  }
  return false;
}

export function migrationHintForStructuredPromo(): { error: string; hint: string } {
  return { error: "Promo rules require the latest database schema.", hint: MIGRATION_HINT };
}

export { MIGRATION_HINT };
