import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";
import {
  generateTicketImageForPrint,
  ticketAttachmentExtFromImageUrl,
} from "@/lib/ticket-image";
import { buildPrintTicketsEmailSubject } from "@/lib/email/scoped-email-subject";
import { sendPrintTicketEmail } from "@/lib/send-print-ticket-email";
import { formatEventDateTimeLong } from "@/lib/event-datetime";

export const dynamic = "force-dynamic";
/** Same as `LONG_PRINT_TICKETS_ROUTE_MAX_DURATION` — literal required by Next.js route config. */
export const maxDuration = 86400;

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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: printTicketId } = await params;
  if (!(await canManagePrintTickets())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const recipientEmail =
    typeof (body as { recipientEmail?: string }).recipientEmail === "string"
      ? (body as { recipientEmail: string }).recipientEmail.trim()
      : null;

  if (!recipientEmail || !EMAIL_REGEX.test(recipientEmail)) {
    return NextResponse.json(
      { error: "Valid recipient email is required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: printTicket, error: ptError } = await supabase
    .from("print_tickets")
    .select(
      "id, event_id, event_section_id, event_seat_id, ticket_image_url, qr_data, encrypted_qr, section_slot_index"
    )
    .eq("id", printTicketId)
    .single();

  if (ptError || !printTicket) {
    return NextResponse.json(
      { error: "Print ticket not found" },
      { status: 404 }
    );
  }

  let ticketImageUrl = printTicket.ticket_image_url;
  if (!ticketImageUrl) {
    const slot =
      printTicket.event_seat_id == null
        ? Math.max(
            1,
            Math.floor(
              (printTicket as { section_slot_index?: number }).section_slot_index ?? 1
            )
          )
        : undefined;
    const url = await generateTicketImageForPrint({
      eventId: printTicket.event_id,
      eventSectionId: printTicket.event_section_id,
      eventSeatId: printTicket.event_seat_id,
      printTicketId: printTicket.id,
      qrData: printTicket.encrypted_qr ?? undefined,
      ticketNumberData: printTicket.qr_data ?? undefined,
      sectionSlotIndex: slot,
    });
    if (url) {
      await supabase
        .from("print_tickets")
        .update({ ticket_image_url: url })
        .eq("id", printTicketId);
      ticketImageUrl = url;
    }
  }

  if (!ticketImageUrl) {
    return NextResponse.json(
      { error: "Could not generate or retrieve ticket image" },
      { status: 500 }
    );
  }

  const { data: eventRow } = await supabase
    .from("events")
    .select("title, event_start, venue_id")
    .eq("id", printTicket.event_id)
    .single();

  if (!eventRow) {
    return NextResponse.json({ error: "Event not found" }, { status: 500 });
  }

  const venueName = eventRow.venue_id
    ? (
        await supabase
          .from("venues")
          .select("name")
          .eq("id", eventRow.venue_id)
          .single()
      ).data?.name ?? "TBA"
    : "TBA";

  const eventDate = eventRow.event_start
    ? formatEventDateTimeLong(eventRow.event_start)
    : "TBA";

  const { data: sectionRow } = await supabase
    .from("event_sections")
    .select("name")
    .eq("id", printTicket.event_section_id)
    .single();

  const sectionName = (sectionRow as { name?: string } | null)?.name ?? "—";

  let seatNumbers = "—";
  if (printTicket.event_seat_id) {
    const { data: seatRow } = await supabase
      .from("event_seats")
      .select("row_label, seat_number")
      .eq("id", printTicket.event_seat_id)
      .single();
    seatNumbers = seatRow
      ? `Row ${seatRow.row_label ?? "-"} Seat ${seatRow.seat_number ?? "-"}`
      : "—";
  } else {
    seatNumbers = "Section ticket (Free/Standing)";
  }

  const res = await fetch(ticketImageUrl);
  const imageBuf = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  if (!imageBuf) {
    return NextResponse.json(
      { error: "Could not fetch ticket image" },
      { status: 500 }
    );
  }

  try {
    await sendPrintTicketEmail({
      to: recipientEmail,
      eventTitle: eventRow.title ?? "Event",
      eventDate,
      venueName,
      sectionName,
      seatNumbers,
      attachments: [
        { filename: `ticket.${ticketAttachmentExtFromImageUrl(ticketImageUrl)}`, content: imageBuf },
      ],
      subjectLine: buildPrintTicketsEmailSubject(sectionName, eventRow.title ?? "Event"),
    });

    await supabase.from("print_ticket_emails").insert({
      print_ticket_id: printTicketId,
      recipient_email: recipientEmail,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[print-tickets/send-email] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send email" },
      { status: 500 }
    );
  }
}
