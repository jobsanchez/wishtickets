import type { SupabaseClient } from "@supabase/supabase-js";
import { ticketAttachmentExtFromImageUrl } from "@/lib/ticket-image";
import { sendPrintTicketEmail } from "@/lib/send-print-ticket-email";
import { getPrintTicketGenConcurrency, runPool } from "@/lib/print-tickets/run-pool";
import { loadPngBufferFromUrl } from "@/lib/print-tickets/load-png-from-url";
import { buildPrintTicketsEmailSubject } from "@/lib/email/scoped-email-subject";
import { formatEventDateTimeLong } from "@/lib/event-datetime";
import { resolveBestPrintDownloadLinks } from "@/lib/print-tickets/resolve-download-links";

export type PrintTicketEmailRow = {
  id: string;
  event_id: string;
  event_section_id: string;
  event_seat_id: string | null;
  ticket_image_url: string | null;
  qr_data: string | null;
  encrypted_qr?: string | null;
  section_slot_index?: number | null;
};

const EMAIL_LOG_CHUNK = 500;

type SectionRowForZip = {
  id: string;
  name: string | null;
  section_code: string | null;
};

/**
 * Fetch PNGs from Seat Configurator inventory, optional ZIP for large batches, SMTP send, and log `print_ticket_emails`.
 * Used by HTTP routes (user Supabase client).
 */
export async function runPrintTicketsEmailFromRows(
  supabase: SupabaseClient,
  opts: {
    eventId: string;
    /** Rows in send order (e.g. selection order). */
    ticketsInOrder: PrintTicketEmailRow[];
    /** One or more recipients (same ticket payload emailed to each). */
    recipientEmails: string[];
    sectionNameForEmail: string;
    seatNumbersSummary: string;
    /** When length matches `ticketsInOrder`, skip generate + storage fetch (caller already loaded PNGs). */
    preloadedPngBuffers?: Buffer[];
  }
): Promise<{ sent: number }> {
  const {
    eventId,
    ticketsInOrder,
    recipientEmails,
    sectionNameForEmail,
    seatNumbersSummary,
    preloadedPngBuffers,
  } = opts;

  if (!recipientEmails.length) {
    throw new Error("At least one recipient email is required");
  }

  const usePreloaded =
    Array.isArray(preloadedPngBuffers) &&
    preloadedPngBuffers.length === ticketsInOrder.length &&
    ticketsInOrder.length > 0;

  const conc = getPrintTicketGenConcurrency();
  let ticketsWithImages: PrintTicketEmailRow[];
  let attachments: Array<{ filename: string; content: Buffer; eventSectionId: string }>;

  if (usePreloaded) {
    ticketsWithImages = ticketsInOrder.map((p) => ({ ...p }));
    attachments = preloadedPngBuffers.map((content, idx) => {
      const pt = ticketsWithImages[idx]!;
      const safeName = (pt.encrypted_qr ?? pt.qr_data ?? pt.id).replace(/[^a-zA-Z0-9_-]/g, "_");
      const ext = ticketAttachmentExtFromImageUrl(pt.ticket_image_url);
      return {
        filename: `ticket-${safeName}.${ext}`,
        content,
        eventSectionId: pt.event_section_id,
      };
    });
  } else {
    const missingImages = ticketsInOrder.filter((pt) => !pt.ticket_image_url?.trim());
    if (missingImages.length > 0) {
      throw new Error(
        `${missingImages.length} ticket${missingImages.length === 1 ? "" : "s"} missing images — generate ticket inventory in Seat Configurator first.`
      );
    }

    ticketsWithImages = ticketsInOrder.map((p) => ({ ...p }));

    const attachmentSlots: Array<{
      filename: string;
      content: Buffer;
      eventSectionId: string;
    } | null> = ticketsWithImages.map(() => null);
    await runPool(
      ticketsWithImages.map((pt, idx) => ({ pt, idx })),
      conc,
      async ({ pt, idx }) => {
        const ticketImageUrl = pt.ticket_image_url;
        if (!ticketImageUrl) return;
        const imageBuf = await loadPngBufferFromUrl(ticketImageUrl);
        if (!imageBuf) return;
        const safeName = (pt.encrypted_qr ?? pt.qr_data ?? pt.id).replace(/[^a-zA-Z0-9_-]/g, "_");
        const ext = ticketAttachmentExtFromImageUrl(ticketImageUrl);
        attachmentSlots[idx] = {
          filename: `ticket-${safeName}.${ext}`,
          content: imageBuf,
          eventSectionId: pt.event_section_id,
        };
      }
    );

    attachments = attachmentSlots.filter(
      (x): x is { filename: string; content: Buffer; eventSectionId: string } => x != null
    );
  }

  if (attachments.length === 0) {
    throw new Error("Could not fetch ticket images");
  }

  const { data: eventRow, error: evErr } = await supabase
    .from("events")
    .select("title, event_start, venue_id, slug")
    .eq("id", eventId)
    .single();

  if (evErr || !eventRow) {
    throw new Error("Event not found");
  }

  const sectionIds = [...new Set(ticketsWithImages.map((t) => t.event_section_id))];
  let sectionsDisplayForEmail =
    sectionNameForEmail.trim() || "—";
  if (sectionIds.length > 0) {
    const { data: secRows, error: secErr } = await supabase
      .from("event_sections")
      .select("id, name, section_code")
      .in("id", sectionIds);

    if (!secErr && secRows?.length) {
      const typed = secRows as SectionRowForZip[];
      const names = typed
        .map((s) => (typeof s.name === "string" ? s.name.trim() : ""))
        .filter((n) => n.length > 0)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      if (names.length > 0) {
        sectionsDisplayForEmail = names.join(", ");
      }
    }
  }

  let bulkDownloadUrls: string[] | undefined;
  let bulkDownloadLinkLabels: string[] | undefined;
  let emailAttachments = attachments;
  /** Always prefer ZIP-folder links for print sends so any ticket count can be delivered in ZIP format. */
  const useZipPath = attachments.length >= 1;

  if (useZipPath) {
    const ticketImageUrls = ticketsWithImages
      .map((t) => t.ticket_image_url)
      .filter((u): u is string => typeof u === "string" && u.length > 0);
    const items = await resolveBestPrintDownloadLinks(eventId, ticketImageUrls);
    bulkDownloadUrls = items.map((x) => x.url);
    bulkDownloadLinkLabels = items.map((x) => x.label);
    if (bulkDownloadUrls.length === 0) {
      throw new Error("Could not resolve pre-generated folder links for selected tickets");
    }
    emailAttachments = [];
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

  const seatForEmail =
    bulkDownloadUrls?.length && bulkDownloadUrls.length > 0
      ? "Various seats or slots — see the ticket files in the download folder."
      : seatNumbersSummary;

  const bulkTicketCount = bulkDownloadUrls?.length ? ticketsWithImages.length : undefined;
  const subjectLine = buildPrintTicketsEmailSubject(
    sectionsDisplayForEmail,
    eventRow.title ?? "Event"
  );
  const commonMail = {
    eventTitle: eventRow.title ?? "Event",
    eventDate,
    venueName,
    sectionName: sectionsDisplayForEmail,
    seatNumbers: seatForEmail,
    attachments: emailAttachments,
    bulkDownloadUrls,
    bulkDownloadLinkLabels,
    bulkTicketCount,
    subjectLine,
  };

  for (const to of recipientEmails) {
    await sendPrintTicketEmail({
      to,
      ...commonMail,
    });
  }

  for (const to of recipientEmails) {
    const emailRows = ticketsWithImages.map((pt) => ({
      print_ticket_id: pt.id,
      recipient_email: to,
    }));
    for (let i = 0; i < emailRows.length; i += EMAIL_LOG_CHUNK) {
      const chunk = emailRows.slice(i, i + EMAIL_LOG_CHUNK);
      const { error: insErr } = await supabase.from("print_ticket_emails").insert(chunk);
      if (insErr) {
        console.error("[runPrintTicketsEmailFromRows] print_ticket_emails insert:", insErr);
      }
    }
  }

  return { sent: ticketsWithImages.length };
}
