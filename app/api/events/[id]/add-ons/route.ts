import { getAdminClientIfAvailable } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  try {
    // Public endpoint: guests should still see visible add-ons.
    // Prefer service-role (bypasses RLS) while still filtering `is_hidden = false`.
    const supabase = getAdminClientIfAvailable() ?? (await createClient());
    const { data: ev, error: evErr } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventId)
      .in("status", ["draft", "published"])
      .maybeSingle();

    if (evErr || !ev) {
      return NextResponse.json({ error: "Event not found" }, { status: 404, headers: NO_STORE });
    }

    const { data, error } = await supabase
      .from("event_add_ons")
      .select("id, title, image_url, price_cents, stock_quantity, max_qty_per_cart, sort_order")
      .eq("event_id", eventId)
      .eq("is_hidden", false)
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
    }

    const items = (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      image_url: row.image_url,
      price_cents: row.price_cents,
      stock_quantity: row.stock_quantity,
      max_qty_per_cart: row.max_qty_per_cart ?? 10,
      sold_out: (row.stock_quantity ?? 0) <= 0,
    }));

    return NextResponse.json({ items }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500, headers: NO_STORE }
    );
  }
}
