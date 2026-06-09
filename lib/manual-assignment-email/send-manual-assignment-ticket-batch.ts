import type { SupabaseClient } from "@supabase/supabase-js";
import { sendManualDistributionEmail } from "@/lib/send-manual-distribution-email";
import { buildAssignedTicketsEmailSubject } from "@/lib/email/scoped-email-subject";
import { formatEventDateTimeLong } from "@/lib/event-datetime";
import type { ManualDistTicketRow } from "@/lib/manual-assignment-email/collect-next-booking-tickets-for-zip-budget";
import { resolveManualAssignmentDownloadLinks } from "@/lib/manual-assignment-email/resolve-manual-assignment-download-links";
import { chunkArray } from "@/lib/array-chunks";

/** PostgREST URL limits: keep `.in(...)` batches small (same scale as other admin routes). */
const POSTGREST_IN_CHUNK = 100;

type SeatRow = {
  id: string;
  row_label: string | null;
  seat_number: string | null;
  event_section_id: string | null;
};

type SecRow = {
  id: string;
  section_code: string | null;
  name: string | null;
};

async function selectTicketsByIdsForBookingChunked(
  supabase: SupabaseClient,
  bookingId: string,
  ticketIds: string[],
  columns: string
): Promise<Record<string, unknown>[]> {
  const merged: Record<string, unknown>[] = [];
  for (const idChunk of chunkArray(ticketIds, POSTGREST_IN_CHUNK)) {
    const { data, error } = await supabase
      .from("tickets")
      .select(columns)
      .in("id", idChunk)
      .eq("booking_id", bookingId);
    if (error) {
      throw new Error(error.message ?? "Failed to load tickets");
    }
    merged.push(...((data ?? []) as unknown as Record<string, unknown>[]));
  }
  return merged;
}

async function buildManualAssignmentSeatSectionLabels(
  supabase: SupabaseClient,
  ticketRows: ManualDistTicketRow[]
): Promise<{ sectionName: string; seatNumbers: string }> {
  const seatIds = [
    ...new Set(
      ticketRows.map((t) => t.seat_id).filter((id): id is string => typeof id === "string" && !!id)
    ),
  ];

  const seatById = new Map<string, SeatRow>();
  if (seatIds.length > 0) {
    for (const idChunk of chunkArray(seatIds, POSTGREST_IN_CHUNK)) {
      const { data: seatRows } = await supabase
        .from("event_seats")
        .select("id, row_label, seat_number, event_section_id")
        .in("id", idChunk);
      for (const row of seatRows ?? []) {
        seatById.set(row.id, row as SeatRow);
      }
    }
  }

  const sectionIdSet = new Set<string>();
  for (const t of ticketRows) {
    if (t.seat_id) {
      const seat = seatById.get(t.seat_id);
      if (seat?.event_section_id) sectionIdSet.add(seat.event_section_id);
    } else if (t.section_id) {
      sectionIdSet.add(t.section_id);
    }
  }
  const sectionIds = [...sectionIdSet];

  const sectionById = new Map<string, SecRow>();
  if (sectionIds.length > 0) {
    for (const idChunk of chunkArray(sectionIds, POSTGREST_IN_CHUNK)) {
      const { data: secRows } = await supabase
        .from("event_sections")
        .select("id, section_code, name")
        .in("id", idChunk);
      for (const row of secRows ?? []) {
        sectionById.set(row.id, row as SecRow);
      }
    }
  }

  const sectionNames = new Set<string>();
  const seatLabels: string[] = [];

  for (const t of ticketRows) {
    if (t.seat_id) {
      const seat = seatById.get(t.seat_id);
      if (seat?.event_section_id) {
        const sec = sectionById.get(seat.event_section_id);
        const secLabel = sec?.section_code ?? sec?.name ?? "Section";
        sectionNames.add(secLabel);
      }
      seatLabels.push(
        seat ? `${seat.row_label ?? ""}${seat.seat_number ?? ""}`.trim() || "—" : "—"
      );
    } else if (t.section_id) {
      const sec = sectionById.get(t.section_id);
      const secLabel = sec?.section_code ?? sec?.name ?? "Section";
      sectionNames.add(secLabel);
      seatLabels.push(`${secLabel} x${t.quantity ?? 1}`);
    }
  }

  return {
    sectionName: Array.from(sectionNames).join(", ") || "—",
    seatNumbers: seatLabels.join(", ") || "—",
  };
}

/**
 * One SMTP message with one or more signed ZIP links (each ZIP stays within the configured
 * uncompressed part budget). Builds ZIPs in order without holding all PNGs in memory at once.
 */
export async function sendManualAssignmentTicketsOneEmail(
  supabase: SupabaseClient,
  opts: { assignmentId: string; orderedTicketIds: string[] }
): Promise<{ sentTicketCount: number; zipLinkCount: number }> {
  const { assignmentId, orderedTicketIds } = opts;
  if (orderedTicketIds.length === 0) {
    return { sentTicketCount: 0, zipLinkCount: 0 };
  }

  await sendManualAssignmentTicketBatch(supabase, {
    assignmentId,
    ticketIds: orderedTicketIds,
    partIndex: 1,
  });

  const { data: assignment } = await supabase
    .from("admin_seat_assignments")
    .select("booking_id, event_id")
    .eq("id", assignmentId)
    .single();
  if (!assignment?.booking_id || !assignment.event_id) {
    return { sentTicketCount: orderedTicketIds.length, zipLinkCount: 0 };
  }
  const ticketsRaw = await selectTicketsByIdsForBookingChunked(
    supabase,
    assignment.booking_id,
    orderedTicketIds,
    "id, ticket_image_url"
  );
  const items = await resolveManualAssignmentDownloadLinks(supabase, {
    eventId: assignment.event_id,
    bookingId: assignment.booking_id,
    ticketImageUrls: ticketsRaw
      .map((r) => (r.ticket_image_url as string | null | undefined) ?? "")
      .filter((u): u is string => u.length > 0),
  });
  return { sentTicketCount: orderedTicketIds.length, zipLinkCount: items.length };
}

export async function sendManualAssignmentTicketBatch(
  supabase: SupabaseClient,
  opts: {
    assignmentId: string;
    ticketIds: string[];
    partIndex: number;
    /** When set with &gt;1, subject/body use "part i of n". */
    partsTotal?: number;
    /** True when this assignment spans multiple SMTP messages (byte-sized batches). */
    multiPartDelivery?: boolean;
  }
): Promise<{ sentInBatch: number }> {
  const { assignmentId, ticketIds, partIndex, partsTotal, multiPartDelivery } = opts;
  if (ticketIds.length === 0) {
    return { sentInBatch: 0 };
  }

  const { data: assignment, error: assignError } = await supabase
    .from("admin_seat_assignments")
    .select("id, recipient_name, recipient_email, booking_id, event_id, status")
    .eq("id", assignmentId)
    .single();

  if (assignError || !assignment) {
    throw new Error("Manual distribution not found");
  }
  if (assignment.status !== "confirmed" || !assignment.booking_id) {
    throw new Error("Manual distribution must be confirmed before sending email");
  }

  const email = assignment.recipient_email?.trim();
  if (!email) {
    throw new Error("Add recipient email first");
  }

  const { data: eventRow } = await supabase
    .from("events")
    .select("title, event_start, venue_id, slug")
    .eq("id", assignment.event_id)
    .single();

  if (!eventRow) {
    throw new Error("Event not found");
  }

  const venueName =
    eventRow.venue_id
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

  const ticketsRawFull = (await selectTicketsByIdsForBookingChunked(
    supabase,
    assignment.booking_id,
    ticketIds,
    "id, qr_data, encrypted_qr, ticket_image_url, seat_id, section_id, quantity"
  )) as ManualDistTicketRow[];

  const byId = new Map(ticketsRawFull.map((t) => [t.id, t]));
  const ticketRows = ticketIds
    .map((id) => byId.get(id))
    .filter((row): row is ManualDistTicketRow => row != null);

  if (ticketRows.length === 0) {
    throw new Error("No tickets found for this batch");
  }
  if (ticketRows.length !== ticketIds.length) {
    throw new Error(
      `Expected ${ticketIds.length} ticket(s) for this send but only loaded ${ticketRows.length}. Retry or check booking data.`
    );
  }

  const { sectionName, seatNumbers } = await buildManualAssignmentSeatSectionLabels(
    supabase,
    ticketRows
  );
  const missingImageCount = ticketRows.filter(
    (t) => !(typeof t.ticket_image_url === "string" && t.ticket_image_url.length > 0)
  ).length;
  if (missingImageCount > 0) {
    throw new Error(
      `Missing ${missingImageCount} generated ticket image(s). Run Generate missing first, then send email.`
    );
  }

  const multiPart =
    multiPartDelivery === true || (typeof partsTotal === "number" && partsTotal > 1);

  const items = (
    await resolveManualAssignmentDownloadLinks(supabase, {
      eventId: assignment.event_id as string,
      bookingId: assignment.booking_id,
      ticketImageUrls: ticketRows
        .map((t) => t.ticket_image_url)
        .filter((u): u is string => typeof u === "string" && u.length > 0),
    })
  ).map((x) => ({ url: x.url, label: x.label }));
  const bulkDownloadUrls = items.map((x) => x.url);
  const bulkDownloadLinkLabels = items.map((x) => x.label);
  if (!bulkDownloadUrls.length) {
    throw new Error("Could not resolve pre-generated folder links for manual distribution.");
  }

  const multiPartUnknownTotal = multiPart && !(typeof partsTotal === "number" && partsTotal > 1);

  const seatForEmail =
    bulkDownloadUrls?.length && bulkDownloadUrls.length > 0
      ? typeof partsTotal === "number" && partsTotal > 1
        ? `This is part ${partIndex} of ${partsTotal}. Seats/slots in this ZIP: ${seatNumbers}`
        : multiPartUnknownTotal
          ? `This is batch ${partIndex} of your ticket delivery (more may follow in separate emails). Seats/slots in this ZIP: ${seatNumbers}`
          : "Various seats or slots — see the PNG files in the download folder."
      : seatNumbers;

  const subjectLine = buildAssignedTicketsEmailSubject(sectionName, eventRow.title ?? "Event");

  await sendManualDistributionEmail({
    to: email,
    recipientName: assignment.recipient_name ?? "Recipient",
    eventTitle: eventRow.title ?? "Event",
    eventDate,
    venueName,
    sectionName,
    seatNumbers: seatForEmail,
    attachments: [],
    bulkDownloadUrls,
    bulkDownloadLinkLabels,
    bulkTicketCount: bulkDownloadUrls?.length ? ticketRows.length : undefined,
    partIndex: multiPart ? partIndex : undefined,
    partsTotal: typeof partsTotal === "number" && partsTotal > 1 ? partsTotal : undefined,
    multiPartUnknownTotal: multiPartUnknownTotal || undefined,
    subjectLine,
  });

  return { sentInBatch: ticketRows.length };
}
