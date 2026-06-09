import type { SupabaseClient } from "@supabase/supabase-js";

export type ReservationCartReplaceRow = {
  seat_id: string | null;
  section_id: string | null;
  add_on_id: string | null;
  quantity: number;
};

type RpcPayload = { ok?: boolean; error?: string };

/**
 * Atomically DELETE + INSERT reservation_items for one cart (single Postgres txn via RPC).
 * Prevents interleaved concurrent replaces from stacking duplicate rows (inflated free-section qty).
 */
export async function rpcReplaceReservationCartItems(
  supabase: SupabaseClient,
  cartId: string,
  profileId: string,
  rows: ReservationCartReplaceRow[]
): Promise<
  | { ok: true }
  | { ok: false; status: number; message: string }
> {
  const p_rows = rows.map((r) => ({
    seat_id: r.seat_id,
    section_id: r.section_id,
    add_on_id: r.add_on_id,
    quantity: r.quantity,
  }));

  const { data, error } = await supabase.rpc("replace_reservation_cart_items", {
    p_cart_id: cartId,
    p_profile_id: profileId,
    p_rows,
  });

  if (error) {
    const msg = error.message ?? "";
    const code = (error as { code?: string }).code;
    if (
      code === "23505" ||
      /another shopper|23505|unique/i.test(msg)
    ) {
      return {
        ok: false,
        status: 409,
        message:
          "One or more seats are no longer available. Refresh and try again.",
      };
    }
    const isCartFk =
      /reservation_items_cart_id_fkey|foreign key.*cart/i.test(msg);
    return {
      ok: false,
      status: isCartFk ? 404 : 500,
      message: msg || "Failed to update reservation items",
    };
  }

  const payload = data as RpcPayload | null;
  if (!payload?.ok) {
    const errKey = payload?.error ?? "unknown";
    if (errKey === "cart_not_found_or_expired") {
      return {
        ok: false,
        status: 404,
        message: "Cart was released or expired",
      };
    }
    return { ok: false, status: 500, message: errKey };
  }

  return { ok: true };
}
