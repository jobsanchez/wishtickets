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

export async function POST(request: NextRequest) {
  if (!(await canManageAssignments())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const toEmail = typeof body.to === "string" ? body.to.trim() : null;
  const ticketIds = Array.isArray(body.ticket_ids)
    ? (body.ticket_ids as string[]).filter((id): id is string => typeof id === "string")
    : [];

  if (!toEmail) {
    return NextResponse.json(
      { error: "Recipient email (to) is required" },
      { status: 400 }
    );
  }

  if (ticketIds.length === 0) {
    return NextResponse.json(
      { error: "ticket_ids array is required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: tickets, error: ticketError } = await supabase
    .from("tickets")
    .select("id, booking_id, qr_data, encrypted_qr, ticket_image_url, seat_id, section_id")
    .in("id", ticketIds);

  if (ticketError || !tickets || tickets.length === 0) {
    return NextResponse.json(
      { error: "No valid tickets found" },
      { status: 404 }
    );
  }

  const bookingIds = [...new Set(tickets.map((t) => t.booking_id))];
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, status, event_id")
    .in("id", bookingIds);

  const invalid = tickets.some((t) => {
    const b = bookings?.find((x) => x.id === t.booking_id);
    return !b || b.status !== "confirmed";
  });
  if (invalid) {
    return NextResponse.json(
      { error: "All tickets must belong to confirmed bookings" },
      { status: 400 }
    );
  }

  const eventId = bookings?.[0]?.event_id;
  if (!eventId) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const { data: eventRow } = await supabase
    .from("events")
    .select("title, event_start, venue_id")
    .eq("id", eventId)
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

  const sectionNames = new Set<string>();
  const seatLabels: string[] = [];

  for (const t of tickets) {
    if (t.seat_id) {
      const { data: seat } = await supabase
        .from("event_seats")
        .select("row_label, seat_number, event_section_id")
        .eq("id", t.seat_id)
        .single();
      if (seat?.event_section_id) {
        const { data: sec } = await supabase
          .from("event_sections")
          .select("section_code, name")
          .eq("id", seat.event_section_id)
          .single();
        const secLabel = sec?.name ?? sec?.section_code ?? "Section";
        sectionNames.add(secLabel);
      }
      seatLabels.push(
        seat
          ? `${seat.row_label ?? ""}${seat.seat_number ?? ""}`.trim() || "—"
          : "—"
      );
    } else if (t.section_id) {
      const { data: sec } = await supabase
        .from("event_sections")
        .select("section_code, name")
        .eq("id", t.section_id)
        .single();
      const secLabel = sec?.name ?? sec?.section_code ?? "Section";
      sectionNames.add(secLabel);
      seatLabels.push(`${secLabel} (general)`);
    }
  }

  const sectionName = Array.from(sectionNames).join(", ") || "—";
  const seatNumbers = seatLabels.join(", ") || "—";

  const attachments: { filename: string; content: Buffer }[] = [];
  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    let buf: Buffer;
    const qrPayload = t.encrypted_qr ?? t.qr_data;
    let ticketImageUrl = t.ticket_image_url;
    if (!ticketImageUrl) {
      const generated = await generateTicketImageForTicketId(t.id);
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
    attachments.push({ filename: `ticket-${i + 1}.${ext}`, content: buf });
  }

  try {
    await sendManualDistributionEmail({
      to: toEmail,
      recipientName: "Recipient",
      eventTitle: eventRow.title ?? "Event",
      eventDate,
      venueName,
      sectionName,
      seatNumbers,
      attachments,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[send-email-bulk] failed:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to send email",
      },
      { status: 500 }
    );
  }
}
