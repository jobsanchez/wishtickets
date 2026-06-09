import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { resolvePrintTicketIdsForSend } from "@/lib/print-tickets/resolve-print-ticket-ids-for-send";
import { forbiddenUnlessPrintTicketsBulkScope } from "@/lib/print-tickets/print-tickets-bulk-access";
import { parseRecipientEmails } from "@/lib/print-tickets/parse-recipient-emails";
import { runPrintTicketsEmailFromRows } from "@/lib/print-tickets/run-print-tickets-email-from-rows";
import type { PrintTicketEmailRow } from "@/lib/print-tickets/run-print-tickets-email-from-rows";
import { fetchPrintTicketsForEmailByIds } from "@/lib/print-tickets/fetch-print-tickets-for-email-by-ids";
import { parseSendSelectedEmailBody } from "@/lib/print-tickets/send-selected-email-shared";
import { getAdminClientIfAvailable } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
/** Same as `LONG_PRINT_TICKETS_ROUTE_MAX_DURATION` — literal required by Next.js route config. */
export const maxDuration = 86400;

export async function POST(request: NextRequest) {
  const actorUserId = await getCurrentUserId();
  if (!actorUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  let uniqueIds: string[];
  try {
    uniqueIds = await resolvePrintTicketIdsForSend(admin, eventId, items);
  } catch (e) {
    console.error("[print-tickets/send-selected-email] resolve ids:", e);
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

  const { rows: printTickets, error: fetchErr } = await fetchPrintTicketsForEmailByIds(
    admin,
    uniqueIds
  );

  if (fetchErr || !printTickets.length) {
    return NextResponse.json(
      { error: fetchErr ?? "Could not load print tickets" },
      { status: 500 }
    );
  }

  const byId = new Map(
    printTickets.map((p) => [p.id, { ...p }])
  );
  const ticketsInOrder: PrintTicketEmailRow[] = [];
  for (const id of uniqueIds) {
    const row = byId.get(id);
    if (row) ticketsInOrder.push(row);
  }

  const seatNumbers =
    ticketsInOrder.length > 1
      ? "Multiple seats – see attached tickets."
      : "See attached ticket.";

  try {
    const { sent } = await runPrintTicketsEmailFromRows(admin, {
      eventId,
      ticketsInOrder,
      recipientEmails,
      sectionNameForEmail: "",
      seatNumbersSummary: seatNumbers,
    });

    return NextResponse.json({
      success: true,
      sent,
      recipientCount: recipientEmails.length,
    });
  } catch (err) {
    console.error("[print-tickets/send-selected-email] failed:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to send email",
      },
      { status: 500 }
    );
  }
}
