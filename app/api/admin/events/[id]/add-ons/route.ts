import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";
import { z } from "zod";

export const dynamic = "force-dynamic";

const itemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  image_url: z.string(),
  price_cents: z.number().int().min(0),
  stock_quantity: z.number().int().min(0),
  max_qty_per_cart: z.number().int().min(1).max(9999),
  is_hidden: z.boolean(),
});

const patchSchema = z.object({
  items: z.array(itemSchema),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const denied = await forbiddenUnlessEventSection(eventId, "addOns");
  if (denied) return denied;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_add_ons")
    .select(
      "id, event_id, title, image_url, price_cents, stock_quantity, max_qty_per_cart, is_hidden, sort_order, created_at"
    )
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: bookingRows, error: bookingErr } = await supabase
    .from("bookings")
    .select("id, user_id, buyer_email_override, created_at")
    .eq("event_id", eventId)
    .eq("status", "confirmed");
  if (bookingErr) {
    return NextResponse.json({ error: bookingErr.message }, { status: 500 });
  }
  const bookingIds = [...new Set((bookingRows ?? []).map((b) => b.id).filter(Boolean))];

  const { data: soldRows, error: soldErr } = bookingIds.length
    ? await supabase
        .from("booking_add_ons")
        .select(
          "id, booking_id, title, quantity, released_quantity, unit_price_cents, created_at"
        )
        .in("booking_id", bookingIds)
    : { data: [], error: null };
  if (soldErr) {
    return NextResponse.json({ error: soldErr.message }, { status: 500 });
  }
  const userIds = [...new Set((bookingRows ?? []).map((b) => b.user_id).filter(Boolean))];
  const { data: profileRows, error: profileErr } = userIds.length
    ? await supabase.from("profiles").select("id, email").in("id", userIds)
    : { data: [], error: null };
  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  const emailByUserId = new Map(
    (profileRows ?? []).map((p) => [p.id, p.email ?? ""])
  );
  type BookingMeta = {
    user_id: string | null;
    buyer_email_override: string | null;
    created_at: string | null;
  };
  const bookingById = new Map<string, BookingMeta>(
    (bookingRows ?? []).map((b) => [
      b.id,
      {
        user_id: b.user_id,
        buyer_email_override: b.buyer_email_override,
        created_at:
          "created_at" in b && typeof b.created_at === "string" ? b.created_at : null,
      },
    ])
  );

  type SoldLine = {
    id: string;
    title: string;
    quantity: number;
    released_quantity: number;
    pending_quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
    fully_received: boolean;
  };

  type SoldOrder = {
    booking_id: string;
    booking_created_at: string | null;
    pending_units: number;
    total_units: number;
    total_cents: number;
    items: SoldLine[];
  };

  type SoldBuyer = {
    email: string;
    pending_units: number;
    total_units: number;
    total_cents: number;
    orders: SoldOrder[];
  };

  const ordersByBookingId = new Map<string, SoldOrder>();

  for (const row of soldRows ?? []) {
    const bid = row.booking_id as string;
    const qty = Math.max(0, Number(row.quantity ?? 0));
    const released = Math.max(
      0,
      Math.min(qty, Number((row as { released_quantity?: number }).released_quantity ?? 0))
    );
    const pending = Math.max(0, qty - released);
    const unit = Math.max(0, Number(row.unit_price_cents ?? 0));
    const lineTotal = qty * unit;
    const line: SoldLine = {
      id: String(row.id),
      title: String(row.title ?? "Add-on"),
      quantity: qty,
      released_quantity: released,
      pending_quantity: pending,
      unit_price_cents: unit,
      line_total_cents: lineTotal,
      fully_received: pending === 0 && qty > 0,
    };

    let ord = ordersByBookingId.get(bid);
    if (!ord) {
      const meta = bookingById.get(bid);
      ord = {
        booking_id: bid,
        booking_created_at: meta?.created_at ?? null,
        pending_units: 0,
        total_units: 0,
        total_cents: 0,
        items: [],
      };
      ordersByBookingId.set(bid, ord);
    }
    ord.items.push(line);
    ord.pending_units += pending;
    ord.total_units += qty;
    ord.total_cents += lineTotal;
  }

  const soldByBuyer = new Map<string, SoldBuyer>();

  for (const ord of ordersByBookingId.values()) {
    const meta = bookingById.get(ord.booking_id);
    const email =
      meta?.buyer_email_override?.trim() ||
      (meta?.user_id ? emailByUserId.get(meta.user_id) ?? "" : "") ||
      "unknown@buyer";

    let buyer = soldByBuyer.get(email);
    if (!buyer) {
      buyer = {
        email,
        pending_units: 0,
        total_units: 0,
        total_cents: 0,
        orders: [],
      };
      soldByBuyer.set(email, buyer);
    }
    buyer.orders.push(ord);
    buyer.pending_units += ord.pending_units;
    buyer.total_units += ord.total_units;
    buyer.total_cents += ord.total_cents;
  }

  for (const buyer of soldByBuyer.values()) {
    buyer.orders.sort((a, b) => {
      const ta = a.booking_created_at ? new Date(a.booking_created_at).getTime() : 0;
      const tb = b.booking_created_at ? new Date(b.booking_created_at).getTime() : 0;
      return tb - ta;
    });
  }

  const sold_by_buyer = [...soldByBuyer.values()].sort((a, b) =>
    a.email.localeCompare(b.email)
  );

  return NextResponse.json({ items: data ?? [], sold_by_buyer });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const denied = await forbiddenUnlessEventSection(eventId, "addOns");
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const items = parsed.data.items;
  const ids = new Set(items.map((i) => i.id));

  const { data: existing, error: exErr } = await supabase
    .from("event_add_ons")
    .select("id")
    .eq("event_id", eventId);

  if (exErr) {
    return NextResponse.json({ error: exErr.message }, { status: 500 });
  }

  const toRemove = (existing ?? [])
    .map((r) => r.id)
    .filter((rowId) => !ids.has(rowId));

  if (toRemove.length > 0) {
    const { error: delErr } = await supabase
      .from("event_add_ons")
      .delete()
      .in("id", toRemove);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  }

  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    const { error: upErr } = await supabase.from("event_add_ons").upsert(
      {
        id: row.id,
        event_id: eventId,
        title: row.title.trim(),
        image_url: row.image_url.trim(),
        price_cents: row.price_cents,
        stock_quantity: row.stock_quantity,
        max_qty_per_cart: row.max_qty_per_cart,
        is_hidden: row.is_hidden,
        sort_order: i,
      },
      { onConflict: "id" }
    );
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  const { data: after, error: readErr } = await supabase
    .from("event_add_ons")
    .select(
      "id, event_id, title, image_url, price_cents, stock_quantity, max_qty_per_cart, is_hidden, sort_order, created_at"
    )
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  return NextResponse.json({ items: after ?? [] });
}
