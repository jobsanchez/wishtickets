import { NextResponse } from "next/server";

/**
 * Legacy URL: print jobs previously used an external async worker here.
 * The app no longer ships that integration; keep this route so old deploy
 * URLs and bookmarks do not pull in the `inngest` package at build time.
 */
export const dynamic = "force-dynamic";

function gone() {
  return NextResponse.json(
    { error: "Print async worker has been removed. Use Admin → Print Tickets (sync generate)." },
    { status: 410 }
  );
}

export const GET = gone;
export const POST = gone;
export const PUT = gone;
