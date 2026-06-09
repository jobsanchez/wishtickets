import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { forbiddenUnlessPrintTicketsBulkScope } from "@/lib/print-tickets/print-tickets-bulk-access";
import { getAdminClientIfAvailable } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Cancel a queued job (pending only). */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAdminClientIfAvailable();
  if (!admin) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 }
    );
  }

  const { jobId } = await params;

  const { data: jobRow, error: loadErr } = await admin
    .from("print_ticket_email_jobs")
    .select("id, event_id, created_by, status")
    .eq("id", jobId)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!jobRow) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (jobRow.created_by !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const eventId = (jobRow as { event_id?: string }).event_id;
  if (typeof eventId === "string" && eventId.length > 0) {
    const scopeDenied = await forbiddenUnlessPrintTicketsBulkScope(eventId);
    if (scopeDenied) return scopeDenied;
  }

  const { data, error } = await admin
    .from("print_ticket_email_jobs")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Job not found, not yours, or already started/completed." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, jobId: data.id, status: "cancelled" });
}
