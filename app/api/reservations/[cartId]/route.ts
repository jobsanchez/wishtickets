import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { validateExplicitSeatsForReservation } from "@/lib/reservation-explicit-seats";
import { rpcReplaceReservationCartItems } from "@/lib/reservation-cart-replace-items";
import { z } from "zod";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;

async function allocateSeatsForSection(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  eventId: string,
  sectionId: string,
  quantity: number,
  excludeCartId: string | null
): Promise<{ seat_ids: string[]; error?: string }> {
  const { data: section } = await supabase
    .from("event_sections")
    .select("id")
    .eq("id", sectionId)
    .eq("event_id", eventId)
    .single();

  if (!section) {
    return { seat_ids: [], error: "Section not found" };
  }

  const { data: bookingIds } = await supabase
    .from("bookings")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "confirmed");
  const bidList = (bookingIds ?? []).map((b) => b.id);

  let bookedSeatIds: string[] = [];
  if (bidList.length > 0) {
    const { data: tk } = await supabase
      .from("tickets")
      .select("seat_id")
      .in("booking_id", bidList)
      .not("seat_id", "is", null);
    bookedSeatIds = (tk ?? []).map((t) => t.seat_id as string);
  }

  const { data: activeCarts } = await supabase
    .from("reservation_carts")
    .select("id")
    .eq("event_id", eventId)
    .gt("expires_at", new Date().toISOString());
  const cartIds = (activeCarts ?? [])
    .map((c) => c.id)
    .filter((id) => id !== excludeCartId);

  let reservedSeatIds: string[] = [];
  if (cartIds.length > 0) {
    const { data: ri } = await supabase
      .from("reservation_items")
      .select("seat_id")
      .in("cart_id", cartIds)
      .not("seat_id", "is", null);
    reservedSeatIds = (ri ?? []).map((r) => r.seat_id as string);
  }

  const { data: adminReserved } = await supabase
    .from("event_seats")
    .select("id")
    .eq("event_id", eventId)
    .eq("event_section_id", sectionId)
    .or("assignment_id.not.is.null,status.eq.reserved,status.eq.hold,status.eq.sold");
  const adminReservedIds = (adminReserved ?? []).map((s) => s.id);

  const taken = new Set([...bookedSeatIds, ...reservedSeatIds, ...adminReservedIds]);

  const { data: availableSeats } = await supabase
    .from("event_seats")
    .select("id")
    .eq("event_id", eventId)
    .eq("event_section_id", sectionId)
    .order("row_label")
    .order("seat_number")
    .limit(quantity + 100);

  const usable = (availableSeats ?? []).filter((s) => !taken.has(s.id)).slice(0, quantity);

  // Cap at available: allocate what we can, no error
  return { seat_ids: usable.map((s) => s.id) };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cartId: string }> }
) {
  const { cartId } = await params;
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
      .eq("id", cartId)
      .eq("profile_id", user.id)
      .gt("expires_at", now)
      .single();

    if (cartError || !cart) {
      return NextResponse.json(
        { error: "Cart not found or expired" },
        { status: 404, headers: NO_STORE }
      );
    }

    const eventId = cart.event_id;

    const { data: reservationItems } = await supabase
      .from("reservation_items")
      .select("seat_id, section_id, quantity, add_on_id")
      .eq("cart_id", cartId);

    const seatIds = [...new Set((reservationItems ?? []).filter((r) => r.seat_id).map((r) => r.seat_id as string))];
    const { data: seats } = seatIds.length && eventId
      ? await supabase.from("event_seats").select("id, event_section_id").in("id", seatIds)
      : { data: [] };
    const sectionBySeat = new Map((seats ?? []).map((s) => [s.id, s.event_section_id]));

    const { data: sections } = eventId
      ? await supabase.from("event_sections").select("id, seating_type").eq("event_id", eventId)
      : { data: [] };
    const seatingTypeBySection = new Map(
      (sections ?? []).map((s) => [s.id, s.seating_type ?? "assigned"])
    );

    const items: {
      seat_id?: string;
      section_id?: string;
      add_on_id?: string;
      quantity: number;
    }[] = [];
    const sectionQuantities = new Map<string, number>();

    for (const row of reservationItems ?? []) {
      if (row.add_on_id) {
        items.push({ add_on_id: row.add_on_id, quantity: row.quantity ?? 1 });
        continue;
      }
      if (row.seat_id) {
        const sectionId = row.section_id ?? sectionBySeat.get(row.seat_id);
        const seatingType = sectionId ? seatingTypeBySection.get(sectionId) : "assigned";
        const isAssigned = seatingType !== "free" && seatingType !== "standing";
        if (isAssigned) {
          items.push({ seat_id: row.seat_id, quantity: 1 });
        } else if (sectionId) {
          const qty = sectionQuantities.get(sectionId) ?? 0;
          sectionQuantities.set(sectionId, qty + 1);
        } else {
          items.push({ seat_id: row.seat_id, quantity: 1 });
        }
      } else if (row.section_id) {
        const qty = sectionQuantities.get(row.section_id) ?? 0;
        sectionQuantities.set(row.section_id, qty + (row.quantity ?? 1));
      }
    }
    for (const [section_id, quantity] of sectionQuantities) {
      items.push({ section_id, quantity });
    }

    return NextResponse.json({
      reservation_cart_id: cart.id,
      event_id: cart.event_id,
      expires_at: cart.expires_at,
      items,
    }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500, headers: NO_STORE }
    );
  }
}

const updateReservationSchema = z.object({
  items: z.array(
    z.union([
      z.object({ seat_id: z.string().uuid() }),
      z.object({ section_id: z.string().uuid(), quantity: z.number().int().min(1) }),
      z.object({ add_on_id: z.string().uuid(), quantity: z.number().int().min(1) }),
    ])
  ),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ cartId: string }> }
) {
  const { cartId } = await params;
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
    const parsed = updateReservationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE }
      );
    }
    const { items } = parsed.data;

    const now = new Date().toISOString();

    const { data: cart, error: cartError } = await supabase
      .from("reservation_carts")
      .select("id, expires_at")
      .eq("id", cartId)
      .eq("profile_id", user.id)
      .gt("expires_at", now)
      .single();

    if (cartError || !cart) {
      return NextResponse.json(
        { error: "Cart not found or expired" },
        { status: 404, headers: NO_STORE }
      );
    }

    const eventIdForPatch = (
      await supabase.from("reservation_carts").select("event_id").eq("id", cartId).single()
    ).data?.event_id;
    if (!eventIdForPatch) {
      return NextResponse.json({ error: "Cart not found" }, { status: 400, headers: NO_STORE });
    }

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
        .eq("event_id", eventIdForPatch)
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

    const explicitSeatIds = ticketLikeItems
      .filter((i): i is { seat_id: string } => "seat_id" in i)
      .map((i) => i.seat_id);

    const seatCheck = await validateExplicitSeatsForReservation(
      supabase,
      eventIdForPatch,
      cartId,
      explicitSeatIds
    );
    if (!seatCheck.ok) {
      return NextResponse.json({ error: seatCheck.message }, { status: 409, headers: NO_STORE });
    }

    const eventId = eventIdForPatch;
    type SeatRow = { cart_id: string; seat_id: string; section_id: null; quantity: number };
    type SectionRow = { cart_id: string; seat_id: null; section_id: string; quantity: number };
    const rows: Array<SeatRow | SectionRow> = [];

    for (const item of ticketLikeItems) {
      if ("seat_id" in item) {
        rows.push({ cart_id: cartId, seat_id: item.seat_id, section_id: null, quantity: 1 });
      }
    }

    const sectionItems = ticketLikeItems.filter(
      (item): item is { section_id: string; quantity: number } => "section_id" in item
    );
    for (const item of sectionItems) {
      const { seat_ids, error } = await allocateSeatsForSection(
        supabase,
        eventId,
        item.section_id,
        item.quantity,
        cartId
      );
      if (error) {
        return NextResponse.json({ error }, { status: 400, headers: NO_STORE });
      }
      if (seat_ids.length > 0) {
        for (const sid of seat_ids) {
          rows.push({ cart_id: cartId, seat_id: sid, section_id: null, quantity: 1 });
        }
      } else {
        rows.push({
          cart_id: cartId,
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
        cart_id: cartId,
        seat_id: null,
        section_id: null,
        add_on_id,
        quantity,
      });
    }

    const { data: cartStillExists } = await supabase
      .from("reservation_carts")
      .select("id")
      .eq("id", cartId)
      .gt("expires_at", new Date().toISOString())
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
      cartId,
      user.id,
      replaceRows
    );
    if (!replaceResult.ok) {
      return NextResponse.json(
        { error: replaceResult.message },
        { status: replaceResult.status, headers: NO_STORE }
      );
    }

    return NextResponse.json({
      reservation_cart_id: cartId,
      expires_at: cart.expires_at,
    }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500, headers: NO_STORE }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ cartId: string }> }
) {
  const { cartId } = await params;
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
    // Idempotent: checkout (PayMongo) already deletes the cart before returning redirect_url,
    // so abandon/cancel often runs when the row is already gone — still success.
    const { data: existing } = await supabase
      .from("reservation_carts")
      .select("id, profile_id")
      .eq("id", cartId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }
    if (existing.profile_id !== user.id) {
      return NextResponse.json({ error: "Cart not found" }, { status: 404, headers: NO_STORE });
    }
    await supabase.from("reservation_items").delete().eq("cart_id", cartId);
    await supabase.from("reservation_carts").delete().eq("id", cartId);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500, headers: NO_STORE }
    );
  }
}
