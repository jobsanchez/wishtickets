import { NextRequest, NextResponse } from "next/server";
import { getCartSummary } from "@/lib/cart-summary";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const cartId = request.nextUrl.searchParams.get("cart_id");
  if (!cartId) {
    return NextResponse.json(
      { error: "cart_id required" },
      { status: 400, headers: NO_STORE }
    );
  }

  try {
    const result = await getCartSummary(eventId, cartId);
    if (!result.ok) {
      const message =
        result.code === "expired"
          ? "Cart expired or invalid"
          : "Cart not found or invalid";
      return NextResponse.json(
        { error: message, code: result.code, subtotal_cents: 0 },
        { status: 400, headers: NO_STORE }
      );
    }
    return NextResponse.json(result.data, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Server error",
        subtotal_cents: 0,
      },
      { status: 500, headers: NO_STORE }
    );
  }
}
