import nodemailer from "nodemailer";
import { getSmtpCredentials } from "@/lib/smtp-config";

const PRINT_TICKET_SUBJECT = "Event Ticket – Ready for Printing";
const PRINT_TICKET_SUBJECT_BULK = "Event Tickets – Printing files (ZIP download, no attachments)";

const PRINT_TICKET_HTML = `<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;font-family:sans-serif;">
  <tr><td style="background:#f97316;color:#fff;padding:24px;text-align:center;">
    <div style="font-size:26px;font-weight:bold;">Wish Tickets Portal</div>
    <div style="font-size:22px;margin-top:8px;">Event Ticket – Ready for Printing</div>
  </td></tr>
  <tr><td style="padding:24px;background:#fff;font-size:18px;line-height:1.6;">
    <p style="margin:0 0 12px 0;font-size:18px;">Greetings!</p>
    <p style="margin:0 0 12px 0;font-size:18px;">Attached to this email is your official ticket for {{eventTitle}}.</p>
    <p style="margin:0 0 12px 0;font-size:18px;">Please review the details below:</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Event:</strong> {{eventTitle}}</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Date:</strong> {{eventDate}}</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Venue:</strong> {{venueName}}</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Section:</strong> {{sectionName}}</p>
    <p style="margin:0 0 12px 0;font-size:18px;"><strong>Seat:</strong> {{seatNumbers}}</p>
    <p style="margin:12px 0 0 0;font-size:18px;">Kindly present the attached ticket upon entry to the venue.</p>
    <p style="margin:12px 0 0 0;font-size:18px;">Warm regards,<br><strong>Wish Tickets Portal Team</strong></p>
  </td></tr>
</table>`;

const PRINT_TICKET_BULK_HTML = `<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;font-family:sans-serif;">
  <tr><td style="background:#f97316;color:#fff;padding:24px;text-align:center;">
    <div style="font-size:26px;font-weight:bold;">Wish Tickets Portal</div>
    <div style="font-size:22px;margin-top:8px;">Event Tickets – Printing files</div>
  </td></tr>
  <tr><td style="padding:24px;background:#fff;font-size:18px;line-height:1.6;">
    <p style="margin:0 0 12px 0;font-size:18px;">Greetings!</p>
    <p style="margin:0 0 12px 0;font-size:18px;">These ticket images are for <strong>printing and production use only</strong>. They are <strong>not valid for admission</strong> to the event. Official admission tickets follow your organizer&rsquo;s normal process.</p>
    <p style="margin:0 0 12px 0;font-size:18px;"><strong>{{bulkTicketCount}} ticket images</strong> for <strong>{{eventTitle}}</strong> are ready for you to download. <strong>This email has no attachments.</strong> {{bulkZipIntro}}</p>
    <p style="margin:0 0 12px 0;font-size:18px;">Please review the details below:</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Event:</strong> {{eventTitle}}</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Date:</strong> {{eventDate}}</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Venue:</strong> {{venueName}}</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Section(s) in this send:</strong> {{sectionName}}</p>
    <p style="margin:0 0 12px 0;font-size:18px;"><strong>Seats / slots:</strong> {{seatNumbers}}</p>
    {{bulkDownloadLinksHtml}}
    <p style="margin:0 0 12px 0;font-size:14px;color:#444;">Download link(s) expire after the time set by your organizer. Do not share the link(s) if these files should stay private.</p>
    <p style="margin:12px 0 0 0;font-size:18px;">Download the ZIP(s), extract the PNG files, and use them only for the printing or layout work your organizer requested.</p>
    <p style="margin:12px 0 0 0;font-size:18px;">Warm regards,<br><strong>Wish Tickets Portal Team</strong></p>
  </td></tr>
</table>`;

export interface SendPrintTicketEmailParams {
  to: string;
  eventTitle: string;
  eventDate: string;
  venueName: string;
  sectionName: string;
  seatNumbers: string;
  attachments: { filename: string; content: Buffer }[];
  /** When non-empty with `bulkTicketCount`, email is link-only (no PNG attachments). */
  bulkDownloadUrls?: string[];
  /** Optional labels matching `bulkDownloadUrls` order (e.g. `SILVER - Part 1`). */
  bulkDownloadLinkLabels?: string[];
  /** @deprecated use `bulkDownloadUrls: [url]` */
  bulkDownloadUrl?: string;
  bulkTicketCount?: number;
  /** When set, used as the email Subject (inbox); otherwise default print subjects apply. */
  subjectLine?: string;
}

export async function sendPrintTicketEmail({
  to,
  eventTitle,
  eventDate,
  venueName,
  sectionName,
  seatNumbers,
  attachments,
  bulkDownloadUrls: bulkDownloadUrlsParam,
  bulkDownloadLinkLabels: bulkDownloadLinkLabelsParam,
  bulkDownloadUrl: bulkDownloadUrlLegacy,
  bulkTicketCount,
  subjectLine: subjectLineParam,
}: SendPrintTicketEmailParams): Promise<void> {
  const creds = await getSmtpCredentials();
  if (!creds) {
    console.warn("SMTP not configured, skipping print ticket email");
    return;
  }

  const bulkUrls = (() => {
    const fromArr = bulkDownloadUrlsParam?.filter((u) => typeof u === "string" && u.length > 0);
    if (fromArr?.length) return fromArr;
    if (typeof bulkDownloadUrlLegacy === "string" && bulkDownloadUrlLegacy.length > 0) {
      return [bulkDownloadUrlLegacy];
    }
    return [];
  })();

  const useBulkLink =
    bulkUrls.length > 0 &&
    typeof bulkTicketCount === "number" &&
    bulkTicketCount > 0;

  const bulkZipIntro =
    bulkUrls.length <= 1
      ? "Use the button below to download one ZIP file containing all ticket images for this send."
      : `There are ${bulkUrls.length} ZIP downloads below (one per section or batch). Download each ZIP to receive all ${bulkTicketCount} ticket images.`;

  const bulkDownloadLinksHtml = buildBulkDownloadLinksHtml(bulkUrls, bulkDownloadLinkLabelsParam);

  const from = creds.from ?? `Wish Tickets Portal <${creds.user}>`;

  const htmlBody = useBulkLink
    ? PRINT_TICKET_BULK_HTML.replace(/\{\{eventTitle\}\}/g, escapeHtml(eventTitle))
        .replace(/\{\{eventDate\}\}/g, escapeHtml(eventDate))
        .replace(/\{\{venueName\}\}/g, escapeHtml(venueName))
        .replace(/\{\{sectionName\}\}/g, escapeHtml(sectionName))
        .replace(/\{\{seatNumbers\}\}/g, escapeHtml(seatNumbers))
        .replace(/\{\{bulkTicketCount\}\}/g, String(bulkTicketCount))
        .replace(/\{\{bulkZipIntro\}\}/g, escapeHtml(bulkZipIntro))
        .replace(/\{\{bulkDownloadLinksHtml\}\}/g, bulkDownloadLinksHtml)
    : PRINT_TICKET_HTML.replace(/\{\{eventTitle\}\}/g, eventTitle)
        .replace(/\{\{eventDate\}\}/g, eventDate)
        .replace(/\{\{venueName\}\}/g, venueName)
        .replace(/\{\{sectionName\}\}/g, sectionName)
        .replace(/\{\{seatNumbers\}\}/g, seatNumbers);

  const textBody = useBulkLink
    ? [
        "Greetings!",
        "",
        "These ticket images are for PRINTING AND PRODUCTION USE ONLY. They are NOT valid for admission to the event. Official admission tickets follow your organizer's normal process.",
        "",
        `${bulkTicketCount} ticket images for ${eventTitle} are ready for download.`,
        "This email has NO attachments — files are only available via the download link(s) below.",
        "",
        `Event: ${eventTitle}`,
        `Date: ${eventDate}`,
        `Venue: ${venueName}`,
        `Section(s) in this send: ${sectionName}`,
        `Seats / slots: ${seatNumbers}`,
        "",
        ...(bulkUrls.length === 1
          ? ["Download tickets ZIP (large downloads may take a few minutes):", bulkUrls[0]!]
          : [
              `Download ${bulkUrls.length} ZIP files (large downloads may take a few minutes):`,
              ...bulkUrls.map((u, i) => `${bulkDownloadLinkLabelsParam?.[i] ?? `Part ${i + 1}/${bulkUrls.length}`}: ${u}`),
            ]),
        "",
        "Extract the PNGs from the ZIP(s) and use them only for the printing or layout work your organizer requested.",
        "",
        "Wish Tickets Portal Team",
      ].join("\n")
    : htmlBody
        .replace(/<[^>]+>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: creds.user, pass: creds.pass },
  });
  try {
    const mailAttachments = useBulkLink ? [] : attachments;
    if (useBulkLink && attachments.length > 0) {
      console.warn(
        "[sendPrintTicketEmail] bulk link mode: ignoring",
        attachments.length,
        "attachment(s); email is link-only"
      );
    }
    const mailSubject =
      typeof subjectLineParam === "string" && subjectLineParam.trim().length > 0
        ? subjectLineParam.trim().slice(0, 250)
        : useBulkLink
          ? PRINT_TICKET_SUBJECT_BULK
          : PRINT_TICKET_SUBJECT;

    await transporter.sendMail({
      from,
      to,
      subject: mailSubject,
      text:
        textBody ||
        (useBulkLink
          ? `${bulkTicketCount} ticket images for ${eventTitle} — printing/production only, NOT for admission (no attachments).\n${bulkUrls.map((u, i) => (bulkUrls.length === 1 ? `Download: ${u}` : `Part ${i + 1}: ${u}`)).join("\n")}`
          : `Your ticket for ${eventTitle}\n\nDate: ${eventDate}\nVenue: ${venueName}\nSection: ${sectionName}\nSeat: ${seatNumbers}\n\nPlease find your ticket attached.`),
      html: htmlBody,
      attachments: mailAttachments,
    });
    console.log(
      "[sendPrintTicketEmail] sent to",
      to,
      useBulkLink ? `(bulk ZIP download${bulkUrls.length > 1 ? `s x${bulkUrls.length}` : ""})` : ""
    );
  } catch (err) {
    console.error("[sendPrintTicketEmail] SMTP send failed:", err);
    throw err;
  }
}

function buildBulkDownloadLinksHtml(urls: string[], labels?: string[]): string {
  const btn =
    "display:inline-block;background:#f97316;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;";
  if (urls.length === 0) return "";
  if (urls.length === 1) {
    const oneLabel = labels?.[0] ?? "Download tickets (ZIP)";
    return `<p style="margin:0 0 16px 0;font-size:18px;"><a href="${escapeHtmlAttr(urls[0]!)}" style="${btn}">${escapeHtml(oneLabel)}</a></p>`;
  }
  return urls
    .map(
      (u, i) =>
        `<p style="margin:0 0 10px 0;font-size:18px;"><a href="${escapeHtmlAttr(u)}" style="${btn}">${escapeHtml(labels?.[i] ?? `Download ZIP ${i + 1} of ${urls.length}`)}</a></p>`
    )
    .join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Safe for double-quoted HTML attribute. */
function escapeHtmlAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
