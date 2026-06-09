import { NextResponse } from "next/server";

/** Tiny no-auth endpoint for measuring round-trip time (e.g. admissions connection indicator). */
export async function GET() {
  return NextResponse.json(
    { ok: true as const },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    }
  );
}
