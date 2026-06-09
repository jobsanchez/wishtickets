import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("event_id");
    if (!eventId) {
      return NextResponse.json(
        { error: "event_id is required" },
        { status: 400, headers: NO_STORE }
      );
    }

    const now = new Date().toISOString();

    const { data: cart, error: cartError } = await supabase
      .from("reservation_carts")
      .select("id, event_id, expires_at")
      .eq("profile_id", user.id)
      .eq("event_id", eventId)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (cartError || !cart) {
      return NextResponse.json({
        reservation_cart_id: null,
        event_id: eventId,
        expires_at: null,
        items: [],
      }, { headers: NO_STORE });
    }

    const cartId = cart.id;

    const { data: reservationItems } = await supabase
      .from("reservation_items")
      .select("seat_id, section_id, quantity, add_on_id")
      .eq("cart_id", cartId);

    const seatIds = [...new Set((reservationItems ?? []).filter((r) => r.seat_id).map((r) => r.seat_id as string))];
    const { data: seats } = seatIds.length
      ? await supabase.from("event_seats").select("id, event_section_id").in("id", seatIds)
      : { data: [] };
    const sectionBySeat = new Map((seats ?? []).map((s) => [s.id, s.event_section_id]));

    const { data: sections } = await supabase
      .from("event_sections")
      .select("id, seating_type")
      .eq("event_id", eventId);
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
