import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getExpiresAt, getGlobalReservationTtlMinutes } from "@/lib/reservations";
import { validateExplicitSeatsForReservation } from "@/lib/reservation-explicit-seats";
import { allocateSeatsForSection } from "@/lib/reservation-allocate-section";
import { rpcReplaceReservationCartItems } from "@/lib/reservation-cart-replace-items";
import { z } from "zod";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;

const createReservationSchema = z.object({
  event_id: z.string().uuid(),
  extend: z.boolean().optional(),
  items: z.array(
    z.union([
      z.object({ seat_id: z.string().uuid() }),
      z.object({ section_id: z.string().uuid(), quantity: z.number().int().min(1) }),
      z.object({ add_on_id: z.string().uuid(), quantity: z.number().int().min(1) }),
    ])
  ),
});

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  let allocationMs = 0;
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

    const body = await request.json();
    const parsed = createReservationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE }
      );
    }
    const { event_id, items, extend } = parsed.data;
    const shouldExtend = extend === true;

    const ticketLikeItems = items.filter(
      (i) => "seat_id" in i || "section_id" in i
    );
    const addOnPayloadItems = items.filter(
      (i): i is { add_on_id: string; quantity: number } => "add_on_id" in i
    );
    if (addOnPayloadItems.length > 0 && ticketLikeItems.length === 0) {
      return NextResponse.json(
        { error: "Select at least one ticket before adding add-ons." },
        { status: 400, headers: NO_STORE }
      );
    }

    if (addOnPayloadItems.length > 0) {
      const qtyByAddOn = new Map<string, number>();
      for (const a of addOnPayloadItems) {
        qtyByAddOn.set(a.add_on_id, (qtyByAddOn.get(a.add_on_id) ?? 0) + a.quantity);
      }
      const addOnIds = [...qtyByAddOn.keys()];
      const { data: addOnRows, error: addOnErr } = await supabase
        .from("event_add_ons")
        .select("id, stock_quantity, max_qty_per_cart, is_hidden")
        .eq("event_id", event_id)
        .in("id", addOnIds);
      if (addOnErr || !addOnRows || addOnRows.length !== addOnIds.length) {
        return NextResponse.json(
          { error: "One or more add-ons are invalid for this event." },
          { status: 400, headers: NO_STORE }
        );
      }
      for (const r of addOnRows) {
        if (r.is_hidden) {
          return NextResponse.json(
            { error: "One or more add-ons are no longer available." },
            { status: 400, headers: NO_STORE }
          );
        }
        const want = qtyByAddOn.get(r.id) ?? 0;
        const stock = r.stock_quantity ?? 0;
        const cap = Math.max(1, Math.min(9999, Number(r.max_qty_per_cart) || 10));
        if (want > stock) {
          return NextResponse.json(
            { error: "Not enough stock for an add-on. Reduce quantity and try again." },
            { status: 409, headers: NO_STORE }
          );
        }
        if (want > cap) {
          return NextResponse.json(
            {
              error: `Add-on quantity exceeds the maximum per cart (${cap}). Reduce quantity and try again.`,
            },
            { status: 409, headers: NO_STORE }
          );
        }
      }
    }

    const ttlMinutes = await getGlobalReservationTtlMinutes();
    const now = new Date().toISOString();
    const expiresAt = getExpiresAt(ttlMinutes);
    const { data: existingCart } = await supabase
      .from("reservation_carts")
      .select("id, expires_at")
      .eq("profile_id", user.id)
      .eq("event_id", event_id)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    let idToUse: string;
    let expiresAtToReturn = expiresAt;

    if (existingCart?.id) {
      idToUse = existingCart.id;
      expiresAtToReturn = shouldExtend ? expiresAt : (existingCart.expires_at ?? expiresAt);

      if (shouldExtend) {
        const { data: updatedCart } = await supabase
          .from("reservation_carts")
          .update({ expires_at: expiresAt })
          .eq("id", idToUse)
          .eq("profile_id", user.id)
          .select("expires_at")
          .single();

        if (updatedCart?.expires_at) {
          expiresAtToReturn = updatedCart.expires_at;
        }
      }
    } else {
      const { data: newCart, error: cartError } = await supabase
        .from("reservation_carts")
        .insert({ event_id, expires_at: expiresAt, profile_id: user.id })
        .select("id")
        .single();

      if (cartError || !newCart) {
        return NextResponse.json(
          { error: cartError?.message ?? "Failed to create cart" },
          { status: 500, headers: NO_STORE }
        );
      }
      idToUse = newCart.id;
    }

    // Extending TTL only: do not replace reservation_items from the client payload.
    // Stale client state could otherwise wipe seats (e.g. checkout showed wrong count vs server).
    if (shouldExtend && existingCart?.id) {
      return NextResponse.json({
        reservation_cart_id: idToUse,
        expires_at: expiresAtToReturn,
      }, { headers: NO_STORE });
    }

    const explicitSeatIds = ticketLikeItems
      .filter((i): i is { seat_id: string } => "seat_id" in i)
      .map((i) => i.seat_id);

    const seatCheck = await validateExplicitSeatsForReservation(
      supabase,
      event_id,
      idToUse,
      explicitSeatIds
    );
    if (!seatCheck.ok) {
      return NextResponse.json({ error: seatCheck.message }, { status: 409, headers: NO_STORE });
    }

    type SeatRow = { cart_id: string; seat_id: string; section_id: null; quantity: number };
    type SectionRow = { cart_id: string; seat_id: null; section_id: string; quantity: number };
    const rows: Array<SeatRow | SectionRow> = [];

    for (const item of ticketLikeItems) {
      if ("seat_id" in item) {
        rows.push({ cart_id: idToUse, seat_id: item.seat_id, section_id: null, quantity: 1 });
      }
    }

    const sectionItems = ticketLikeItems.filter(
      (item): item is { section_id: string; quantity: number } => "section_id" in item
    );
    const tAllocStart = Date.now();
    const sectionAllocations = await Promise.all(
      sectionItems.map(async (item) => ({
        item,
        result: await allocateSeatsForSection(
          supabase,
          event_id,
          item.section_id,
          item.quantity,
          idToUse
        ),
      }))
    );
    allocationMs += Date.now() - tAllocStart;
    for (const { item, result } of sectionAllocations) {
      const { seat_ids, error } = result;
        if (error) {
          return NextResponse.json({ error }, { status: 400, headers: NO_STORE });
        }
        if (seat_ids.length > 0) {
          for (const sid of seat_ids) {
            rows.push({ cart_id: idToUse, seat_id: sid, section_id: null, quantity: 1 });
          }
        } else {
          // Section has no event_seats; store section-based row for cart-summary/checkout
          rows.push({
            cart_id: idToUse,
            seat_id: null,
            section_id: item.section_id,
            quantity: item.quantity,
          });
        }
    }

    type DbInsertRow =
      | {
          cart_id: string;
          seat_id: string;
          section_id: null;
          quantity: number;
          add_on_id?: null;
        }
      | {
          cart_id: string;
          seat_id: null;
          section_id: string;
          quantity: number;
          add_on_id?: null;
        }
      | {
          cart_id: string;
          seat_id: null;
          section_id: null;
          add_on_id: string;
          quantity: number;
        };

    const insertRows: DbInsertRow[] = [];

    for (const r of rows) {
      if ("seat_id" in r && r.seat_id) {
        insertRows.push({
          cart_id: r.cart_id,
          seat_id: r.seat_id,
          section_id: null,
          quantity: 1,
        });
      } else {
        const sr = r as SectionRow;
        insertRows.push({
          cart_id: sr.cart_id,
          seat_id: null,
          section_id: sr.section_id,
          quantity: sr.quantity,
        });
      }
    }

    const mergedAddOnQty = new Map<string, number>();
    for (const a of addOnPayloadItems) {
      mergedAddOnQty.set(a.add_on_id, (mergedAddOnQty.get(a.add_on_id) ?? 0) + a.quantity);
    }
    for (const [add_on_id, quantity] of mergedAddOnQty) {
      insertRows.push({
        cart_id: idToUse,
        seat_id: null,
        section_id: null,
        add_on_id,
        quantity,
      });
    }

    const { data: cartStillExists } = await supabase
      .from("reservation_carts")
      .select("id")
      .eq("id", idToUse)
      .gt("expires_at", now)
      .single();

    if (!cartStillExists) {
      return NextResponse.json(
        { error: "Cart was released or expired" },
        { status: 404, headers: NO_STORE }
      );
    }

    const replaceRows = insertRows.map((r) => ({
      seat_id: r.seat_id,
      section_id: r.section_id,
      add_on_id: r.add_on_id ?? null,
      quantity: r.quantity,
    }));

    const replaceResult = await rpcReplaceReservationCartItems(
      supabase,
      idToUse,
      user.id,
      replaceRows
    );
    if (!replaceResult.ok) {
      return NextResponse.json(
        { error: replaceResult.message },
        { status: replaceResult.status, headers: NO_STORE }
      );
    }

    const response = NextResponse.json({
      reservation_cart_id: idToUse,
      expires_at: expiresAtToReturn,
    }, { headers: NO_STORE });
    console.log("[api/reservations] timing", {
      event_id,
      items_count: items.length,
      allocation_ms: allocationMs,
      total_ms: Date.now() - t0,
      extend: shouldExtend,
    });
    return response;
  } catch (e) {
    console.error("[api/reservations] failed", {
      total_ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500, headers: NO_STORE }
    );
  }
}
