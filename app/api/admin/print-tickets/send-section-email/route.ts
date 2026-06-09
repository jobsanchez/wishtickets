import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";
import { loadPrintTicketRowsForSectionEmail } from "@/lib/print-tickets/load-section-print-tickets-for-email";
import { parseRecipientEmails } from "@/lib/print-tickets/parse-recipient-emails";
import { runPrintTicketsEmailFromRows } from "@/lib/print-tickets/run-print-tickets-email-from-rows";

export const dynamic = "force-dynamic";
/** Same as `LONG_PRINT_TICKETS_ROUTE_MAX_DURATION` — literal required by Next.js route config. */
export const maxDuration = 86400;
const SECTION_EMAIL_DEDUPE_WINDOW_MS = 2 * 60 * 1000;

async function canManagePrintTickets() {
  const role = await getProfileRole();
  if (role === "super_admin" || role === "admin" || role === "admissions_staff")
    return true;
  const userId = await getCurrentUserId();
  if (!userId) return false;
  return (
    hasCapability(userId, "manage_seats") ||
    hasCapability(userId, "manage_assignments")
  );
}

export async function POST(request: NextRequest) {
  if (!(await canManagePrintTickets())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventId =
    typeof (body as { eventId?: string }).eventId === "string"
      ? (body as { eventId: string }).eventId
      : null;
  const eventSectionId =
    typeof (body as { eventSectionId?: string }).eventSectionId === "string"
      ? (body as { eventSectionId: string }).eventSectionId
      : null;
  const recipientEmail =
    typeof (body as { recipientEmail?: string }).recipientEmail === "string"
      ? (body as { recipientEmail: string }).recipientEmail.trim()
      : null;

  if (!eventId || !eventSectionId) {
    return NextResponse.json(
      { error: "eventId and eventSectionId are required" },
      { status: 400 }
    );
  }
  if (!recipientEmail) {
    return NextResponse.json(
      { error: "At least one recipient email is required" },
      { status: 400 }
    );
  }

  const parsedRecipients = parseRecipientEmails(recipientEmail);
  if (!parsedRecipients.ok) {
    return NextResponse.json({ error: parsedRecipients.error }, { status: 400 });
  }
  const recipientEmails = parsedRecipients.emails;
  const recipientKey = [...recipientEmails]
    .map((v) => v.trim().toLowerCase())
    .sort((a, b) => a.localeCompare(b))
    .join(",");

  const supabase = await createClient();

  // Best-effort cleanup of old lock keys (ignore errors).
  const cleanupBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("print_ticket_section_email_send_locks")
    .delete()
    .lt("created_at", cleanupBefore);

  // Idempotency lock: prevent duplicate sends for same section + recipients in the same short time window.
  const dedupeBucket = Math.floor(Date.now() / SECTION_EMAIL_DEDUPE_WINDOW_MS);
  const idempotencyKey = `section:${eventId}:${eventSectionId}:${recipientKey}:${dedupeBucket}`;
  const { error: lockErr } = await supabase
    .from("print_ticket_section_email_send_locks")
    .insert({
      idempotency_key: idempotencyKey,
      event_id: eventId,
      event_section_id: eventSectionId,
      recipient_key: recipientKey,
    });

  if (lockErr) {
    const code = (lockErr as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json({
        success: true,
        deduped: true,
        sent: 0,
        recipientCount: recipientEmails.length,
      });
    }
    return NextResponse.json({ error: lockErr.message }, { status: 500 });
  }

  const loaded = await loadPrintTicketRowsForSectionEmail(supabase, eventId, eventSectionId);

  if (!loaded.ok) {
    if (loaded.kind === "db") {
      return NextResponse.json({ error: loaded.message }, { status: 500 });
    }
    if (loaded.kind === "no_seats") {
      return NextResponse.json(
        { error: "Section has no seats to send." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "No generated tickets found for this section. Generate tickets first." },
      { status: 400 }
    );
  }

  const rows = loaded.rows;

  const { data: sectionRow } = await supabase
    .from("event_sections")
    .select("name")
    .eq("id", eventSectionId)
    .single();

  const sectionName = (sectionRow as { name?: string } | null)?.name ?? "—";

  try {
    const { sent } = await runPrintTicketsEmailFromRows(supabase, {
      eventId,
      ticketsInOrder: rows,
      recipientEmails,
      sectionNameForEmail: sectionName,
      seatNumbersSummary: "Multiple seats – see attached tickets.",
    });

    return NextResponse.json({
      success: true,
      sent,
      recipientCount: recipientEmails.length,
    });
  } catch (err) {
    console.error("[print-tickets/send-section-email] failed:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to send email",
      },
      { status: 500 }
    );
  }
}
