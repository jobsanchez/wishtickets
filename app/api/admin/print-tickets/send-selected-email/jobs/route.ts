import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { parseRecipientEmails } from "@/lib/print-tickets/parse-recipient-emails";
import { resolvePrintTicketIdsForSend } from "@/lib/print-tickets/resolve-print-ticket-ids-for-send";
import { forbiddenUnlessPrintTicketsBulkScope } from "@/lib/print-tickets/print-tickets-bulk-access";
import { parseSendSelectedEmailBody } from "@/lib/print-tickets/send-selected-email-shared";
import { getAdminClientIfAvailable } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Enqueue async bulk send; the open admin tab POSTs `.../jobs/{id}/process` on an interval. */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = parseSendSelectedEmailBody(body);
  if (!parsedBody.ok) {
    return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
  }
  const { eventId, recipientEmail, items } = parsedBody.value;

  const scopeDenied = await forbiddenUnlessPrintTicketsBulkScope(eventId);
  if (scopeDenied) return scopeDenied;

  const parsedRecipients = parseRecipientEmails(recipientEmail);
  if (!parsedRecipients.ok) {
    return NextResponse.json({ error: parsedRecipients.error }, { status: 400 });
  }
  const recipientEmails = parsedRecipients.emails;

  const admin = getAdminClientIfAvailable();
  if (!admin) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 }
    );
  }

  const actorUserId = await getCurrentUserId();
  if (!actorUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uniqueIds: string[];
  try {
    uniqueIds = await resolvePrintTicketIdsForSend(admin, eventId, items);
  } catch (e) {
    console.error("[send-selected-email/jobs] resolve print ticket ids:", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Failed to resolve print tickets for the selected seats.",
      },
      { status: 500 }
    );
  }
  if (uniqueIds.length === 0) {
    return NextResponse.json(
      { error: "No generated tickets found for selected items. Generate tickets first." },
      { status: 400 }
    );
  }

  const { data: inserted, error: insErr } = await admin
    .from("print_ticket_email_jobs")
    .insert({
      event_id: eventId,
      created_by: actorUserId,
      recipient_emails: recipientEmails,
      print_ticket_ids: uniqueIds,
      cursor: 0,
      status: "pending",
      chunks_completed: 0,
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    console.error("[send-selected-email/jobs] insert failed:", insErr);
    return NextResponse.json(
      { error: insErr?.message ?? "Failed to create job" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      jobId: inserted.id,
      totalTickets: uniqueIds.length,
      message:
        "Job queued. Keep this tab open while it runs. One email with a ZIP download link for all ticket files (ZIP is built when the recipient opens the link).",
    },
    { status: 202 }
  );
}
