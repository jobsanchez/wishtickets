import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_PRICE_CENTS = 50000;
const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  try {
    const supabase = createAdminClient();

    const { data: event } = await supabase
      .from("events")
      .select("id, early_bird_starts_at, early_bird_ends_at")
      .eq("id", eventId)
      .in("status", ["draft", "published"])
      .single();

    if (!event) {
      return NextResponse.json(
        { error: "Event not found or not available for booking" },
        { status: 404, headers: NO_STORE }
      );
    }

    const now = new Date().toISOString();
    const useEarlyBird =
      event.early_bird_starts_at != null &&
      event.early_bird_ends_at != null &&
      now >= event.early_bird_starts_at &&
      now <= event.early_bird_ends_at;

    const [{ data: prices }, { data: earlyBird }] = await Promise.all([
      supabase
        .from("event_prices")
        .select("section_id, price_cents")
        .eq("event_id", eventId),
      supabase
        .from("early_bird_prices")
        .select("section_id, discount_percent")
        .eq("event_id", eventId),
    ]);

    const priceMap = new Map<string, number>();
    for (const p of prices ?? []) {
      priceMap.set(p.section_id, p.price_cents);
    }

    const earlyBirdPercentMap = new Map<string, number>();
    for (const eb of earlyBird ?? []) {
      earlyBirdPercentMap.set(eb.section_id, eb.discount_percent);
    }

    const resolved: Array<{
      section_id: string;
      price_cents: number;
      base_price_cents?: number;
      early_bird_price_cents?: number;
      early_bird_starts_at?: string;
      early_bird_ends_at?: string;
    }> = [];
    const allSectionIds = new Set([
      ...(prices ?? []).map((p) => p.section_id),
      ...(earlyBird ?? []).map((e) => e.section_id),
    ]);

    for (const sectionId of allSectionIds) {
      const basePrice = priceMap.get(sectionId) ?? DEFAULT_PRICE_CENTS;
      const discountPercent = earlyBirdPercentMap.get(sectionId);
      const useEb = useEarlyBird && discountPercent !== undefined;
      const earlyBirdPriceCents = useEb
        ? Math.floor((basePrice * (100 - discountPercent)) / 100)
        : basePrice;
      resolved.push({
        section_id: sectionId,
        price_cents: earlyBirdPriceCents,
        ...(useEb && {
          base_price_cents: basePrice,
          early_bird_price_cents: earlyBirdPriceCents,
          early_bird_starts_at: event.early_bird_starts_at ?? undefined,
          early_bird_ends_at: event.early_bird_ends_at ?? undefined,
        }),
      });
    }

    return NextResponse.json({
      prices: resolved,
    }, { headers: NO_STORE });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch prices";
    console.error("[api/events/prices] error:", e);
    return NextResponse.json(
      { error: msg, details: process.env.NODE_ENV === "development" ? String(e) : undefined },
      { status: 500, headers: NO_STORE }
    );
  }
}
