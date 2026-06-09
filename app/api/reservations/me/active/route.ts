import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;

/**
 * Returns the user's most recent still-active reservation cart across **all** events
 * so the global floating timer can resume booking even when the active cart belongs
 * to an event the user is not currently viewing. Returns `null` if none exists.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401, headers: NO_STORE }
      );
    }

    const now = new Date().toISOString();

    const { data: cart, error: cartError } = await supabase
      .from("reservation_carts")
      .select("id, event_id, expires_at")
      .eq("profile_id", user.id)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cartError || !cart || !cart.event_id) {
      return NextResponse.json(null, { headers: NO_STORE });
    }

    const { data: event } = await supabase
      .from("events")
      .select("id, slug, title")
      .eq("id", cart.event_id)
      .maybeSingle();

    if (!event?.slug) {
      // Without a slug we cannot route the user back; treat as no active cart.
      return NextResponse.json(null, { headers: NO_STORE });
    }

    const { data: items } = await supabase
      .from("reservation_items")
      .select("seat_id, section_id, add_on_id, quantity")
      .eq("cart_id", cart.id);

    let ticketCount = 0;
    let addOnCount = 0;
    for (const row of items ?? []) {
      const qty = Math.max(0, Number(row.quantity ?? 0));
      if (row.add_on_id) {
        addOnCount += qty;
        continue;
      }
      if (row.seat_id) {
        ticketCount += 1;
      } else if (row.section_id) {
        ticketCount += qty;
      }
    }

    if (ticketCount === 0 && addOnCount === 0) {
      // Empty cart row left behind; do not surface a misleading timer.
      return NextResponse.json(null, { headers: NO_STORE });
    }

    return NextResponse.json(
      {
        reservation_cart_id: cart.id,
        event_id: cart.event_id,
        event_slug: event.slug,
        event_title: event.title ?? "",
        expires_at: cart.expires_at,
        ticket_count: ticketCount,
        add_on_count: addOnCount,
        item_count: ticketCount + addOnCount,
      },
      { headers: NO_STORE }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500, headers: NO_STORE }
    );
  }
}
