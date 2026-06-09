import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdmissionSessionContext } from "./admission-scan-server";

export type ReleaseBookingAddOnResult = {
  status: number;
  body: Record<string, unknown>;
};

function toPayload(row: {
  id: string;
  quantity: number | null;
  released_quantity: number | null;
  unit_price_cents: number | null;
  title: string | null;
}) {
  const quantity = Math.max(0, Number(row.quantity ?? 0));
  const released = Math.max(
    0,
    Math.min(quantity, Number(row.released_quantity ?? 0))
  );
  const unit = Math.max(0, Number(row.unit_price_cents ?? 0));
  return {
    id: row.id,
    title: row.title ?? "Add-on",
    quantity,
    released_quantity: released,
    remaining_quantity: Math.max(0, quantity - released),
    unit_price_cents: unit,
    line_total_cents: quantity * unit,
    fully_released: released >= quantity,
  };
}

export async function releaseBookingAddOn(
  adminSupabase: SupabaseClient,
  session: AdmissionSessionContext,
  input: { booking_add_on_id: string; event_id: string; release_quantity: number }
): Promise<ReleaseBookingAddOnResult> {
  if (input.event_id !== session.event_id) {
    return { status: 403, body: { error: "Event mismatch" } };
  }
  if (!Number.isFinite(input.release_quantity) || input.release_quantity < 1) {
    return { status: 400, body: { error: "Invalid release quantity" } };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error } = await adminSupabase
      .from("booking_add_ons")
      .select("id, booking_id, title, quantity, released_quantity, unit_price_cents, bookings!inner(event_id)")
      .eq("id", input.booking_add_on_id)
      .maybeSingle();
    if (error) return { status: 500, body: { error: error.message } };
    if (!row) return { status: 404, body: { error: "Add-on purchase not found" } };
    const bookingJoin = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
    const rowEventId =
      bookingJoin && typeof bookingJoin === "object" && "event_id" in bookingJoin
        ? String(bookingJoin.event_id ?? "")
        : "";
    if (rowEventId !== session.event_id) {
      return { status: 403, body: { error: "Add-on purchase is for a different event" } };
    }

    const quantity = Math.max(0, Number(row.quantity ?? 0));
    const currentReleased = Math.max(
      0,
      Math.min(quantity, Number(row.released_quantity ?? 0))
    );
    const nextReleased = Math.min(quantity, currentReleased + Math.floor(input.release_quantity));
    const applied = Math.max(0, nextReleased - currentReleased);
    if (applied <= 0) {
      return {
        status: 200,
        body: { ok: true, applied_quantity: 0, add_on: toPayload(row) },
      };
    }

    const { data: updated, error: upErr } = await adminSupabase
      .from("booking_add_ons")
      .update({
        released_quantity: nextReleased,
        released_at: nextReleased >= quantity ? new Date().toISOString() : null,
      })
      .eq("id", row.id)
      .eq("released_quantity", currentReleased)
      .select("id, title, quantity, released_quantity, unit_price_cents")
      .maybeSingle();

    if (upErr) return { status: 500, body: { error: upErr.message } };
    if (updated) {
      return {
        status: 200,
        body: { ok: true, applied_quantity: applied, add_on: toPayload(updated) },
      };
    }
  }

  return { status: 409, body: { error: "Add-on release is being updated by another scan. Try again." } };
}
