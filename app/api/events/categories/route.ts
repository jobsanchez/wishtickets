import { NextResponse } from "next/server";
import { getEventCategoriesForHome } from "@/lib/events/categories-server";

export async function GET() {
  try {
    const categories = await getEventCategoriesForHome();
    return NextResponse.json(categories, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
