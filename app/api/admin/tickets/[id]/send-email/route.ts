import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";
import { generateQRBuffer } from "@/lib/qr";
import {
  generateTicketImageForTicketId,
  ticketAttachmentExtFromImageUrl,
} from "@/lib/ticket-image";
import { sendManualDistributionEmail } from "@/lib/send-manual-distribution-email";
import { formatEventDateTimeLong } from "@/lib/event-datetime";

async function canManageAssignments() {
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ticketId } = await params;
  if (!(await canManageAssignments())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const toEmail = typeof body.to === "string" ? body.to.trim() : null;

  if (!toEmail) {
    return NextResponse.json(
      { error: "Recipient email is required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select("id, booking_id, qr_data, encrypted_qr, ticket_image_url, seat_id, section_id")
    .eq("id", ticketId)
    .single();

  if (ticketError || !ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("event_id")
    .eq("id", ticket.booking_id)
    .single();

  if (!booking?.event_id) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const { data: eventRow } = await supabase
    .from("events")
    .select("title, event_start, venue_id")
    .eq("id", booking.event_id)
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

  let sectionName = "—";
  let seatLabel = "—";

  if (ticket.seat_id) {
    const { data: seat } = await supabase
      .from("event_seats")
      .select("row_label, seat_number, event_section_id")
      .eq("id", ticket.seat_id)
      .single();
    if (seat?.event_section_id) {
      const { data: sec } = await supabase
        .from("event_sections")
        .select("section_code, name")
        .eq("id", seat.event_section_id)
        .single();
      sectionName = sec?.section_code ?? sec?.name ?? "—";
      seatLabel = seat ? `${seat.row_label ?? ""}${seat.seat_number ?? ""}`.trim() || "—" : "—";
    }
  } else if (ticket.section_id) {
    const { data: sec } = await supabase
      .from("event_sections")
      .select("section_code, name")
      .eq("id", ticket.section_id)
      .single();
    sectionName = sec?.section_code ?? sec?.name ?? "—";
    seatLabel = `${sectionName} (general)`;
  }

  let buf: Buffer;
  const qrPayload = ticket.encrypted_qr ?? ticket.qr_data;
  let ticketImageUrl = ticket.ticket_image_url;
  if (!ticketImageUrl) {
    const generated = await generateTicketImageForTicketId(ticketId);
    ticketImageUrl = generated ?? undefined;
  }
  let ext: "jpg" | "png" = "png";
  if (ticketImageUrl) {
    const res = await fetch(ticketImageUrl);
    if (res.ok) {
      buf = Buffer.from(await res.arrayBuffer());
      ext = ticketAttachmentExtFromImageUrl(ticketImageUrl);
    } else {
      buf = await generateQRBuffer(qrPayload);
    }
  } else {
    buf = await generateQRBuffer(qrPayload);
  }

  try {
    await sendManualDistributionEmail({
      to: toEmail,
      recipientName: "Recipient",
      eventTitle: eventRow.title ?? "Event",
      eventDate,
      venueName,
      sectionName,
      seatNumbers: seatLabel,
      attachments: [{ filename: `ticket.${ext}`, content: buf }],
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ticket send-email] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send email" },
      { status: 500 }
    );
  }
}
