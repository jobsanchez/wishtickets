import type { SupabaseClient as AdminSupabaseClient } from "@supabase/supabase-js";

/**
 * Same suffix scheme as checkout `registerUniqueQr`: `base`, then `base-1`, `base-2`, …
 * scoped to `print_tickets` for this event (unique index on `(event_id, qr_data)`).
 */
export async function allocateUniquePrintQrData(
  admin: AdminSupabaseClient,
  eventId: string,
  base: string
): Promise<string> {
  for (let suffix = 0; suffix < 100; suffix++) {
    const candidate = suffix === 0 ? base : `${base}-${suffix}`;
    const { data: clash } = await admin
      .from("print_tickets")
      .select("id")
      .eq("event_id", eventId)
      .eq("qr_data", candidate)
      .limit(1)
      .maybeSingle();
    if (!clash) return candidate;
  }
  throw new Error("Could not allocate unique print_tickets.qr_data for event");
}
