import { createAdminClient } from "@/lib/supabase/admin";
import { runPrintTicketEmailJobSweep } from "@/lib/print-tickets/run-print-ticket-email-job-sweep";
import { NextRequest, NextResponse } from "next/server";

/** Soft cap per invocation; host (e.g. Netlify) may enforce a shorter hard limit. */
const SOFT_TIME_BUDGET_MS = 45_000;

function getCronSecret(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  return request.headers.get("x-cron-secret")?.trim() ?? null;
}

/**
 * Process queued print-ticket email jobs in chunks (requires `CRON_SECRET` + `SUPABASE_SERVICE_ROLE_KEY`).
 * Optional global worker (e.g. `curl` + `CRON_SECRET`). Primary flow is browser `POST .../jobs/{id}/process`.
 */
export async function POST(request: NextRequest) {
  const secret = getCronSecret(request);
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const result = await runPrintTicketEmailJobSweep(admin, SOFT_TIME_BUDGET_MS);
    if (result.lockError) {
      console.error("[cron/print-ticket-email-jobs] lock RPC:", result.lockError);
      return NextResponse.json({ error: result.lockError }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      chunksProcessed: result.chunksProcessed,
      elapsedMs: result.elapsedMs,
    });
  } catch (e) {
    console.error("[cron/print-ticket-email-jobs]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}

/** Allow GET for pingers that only support GET (same auth as POST). */
export async function GET(request: NextRequest) {
  return POST(request);
}
