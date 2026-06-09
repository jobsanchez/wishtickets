import nodemailer from "nodemailer";
import { getSmtpCredentials } from "@/lib/smtp-config";

const MANUAL_DISTRIBUTION_SUBJECT = "Your Event Tickets Have Been Assigned";
const MANUAL_DISTRIBUTION_SUBJECT_BULK = "Your Event Tickets Have Been Assigned (ZIP download)";

const MANUAL_DISTRIBUTION_HTML = `<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;font-family:sans-serif;">
  <tr><td style="background:#FF6B00;color:#fff;padding:24px;text-align:center;">
    <div style="font-size:26px;font-weight:bold;">Wish Tickets Portal</div>
    <div style="font-size:22px;margin-top:8px;">Your Event Tickets Have Been Assigned</div>
  </td></tr>
  <tr><td style="padding:24px;background:#fff;font-size:18px;line-height:1.6;">
    <p style="margin:0 0 12px 0;font-size:18px;">Dear {{recipientName}},</p>
    <p style="margin:0 0 12px 0;font-size:18px;">Greetings!</p>
    <p style="margin:0 0 12px 0;font-size:18px;">You are receiving this email to inform you that tickets have been successfully assigned to you for the following event:</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Event:</strong> {{eventTitle}}</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Date:</strong> {{eventDate}}</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Venue:</strong> {{venueName}}</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Section:</strong> {{sectionName}}</p>
    <p style="margin:0 0 12px 0;font-size:18px;"><strong>Seat(s):</strong> {{seatNumbers}}</p>
    <p style="margin:0 0 12px 0;font-size:18px;">Please find your assigned ticket(s) attached to this email. Kindly present the attached ticket file(s) upon entry to the venue.</p>
    <p style="margin:0 0 12px 0;font-size:18px;">We recommend keeping a copy of your ticket accessible on your mobile device or printed for faster verification during admission.</p>
    <p style="margin:0 0 12px 0;font-size:18px;">If you have any questions or concerns regarding your tickets, please feel free to contact us.</p>
    <p style="margin:12px 0 0 0;font-size:18px;">Thank you, and we look forward to seeing you at the event!</p>
    <p style="margin:12px 0 0 0;font-size:18px;">Warm regards,<br><strong>Wish Tickets Portal Team</strong></p>
  </td></tr>
</table>`;

const MANUAL_DISTRIBUTION_BULK_HTML = `<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;font-family:sans-serif;">
  <tr><td style="background:#FF6B00;color:#fff;padding:24px;text-align:center;">
    <div style="font-size:26px;font-weight:bold;">Wish Tickets Portal</div>
    <div style="font-size:22px;margin-top:8px;">Your Event Tickets Have Been Assigned</div>
  </td></tr>
  <tr><td style="padding:24px;background:#fff;font-size:18px;line-height:1.6;">
    <p style="margin:0 0 12px 0;font-size:18px;">Dear {{recipientName}},</p>
    <p style="margin:0 0 12px 0;font-size:18px;">Greetings!</p>
    {{partIntro}}
    <p style="margin:0 0 12px 0;font-size:18px;"><strong>{{bulkTicketCount}} ticket image(s)</strong> for <strong>{{eventTitle}}</strong> are ready. <strong>This email has no PNG attachments.</strong> {{bulkZipIntro}}</p>
    <p style="margin:0 0 12px 0;font-size:18px;">Please review the details below:</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Event:</strong> {{eventTitle}}</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Date:</strong> {{eventDate}}</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Venue:</strong> {{venueName}}</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Section(s) in this message:</strong> {{sectionName}}</p>
    <p style="margin:0 0 12px 0;font-size:18px;"><strong>Seat(s) / slots:</strong> {{seatNumbers}}</p>
    {{bulkDownloadLinksHtml}}
    <p style="margin:0 0 12px 0;font-size:14px;color:#444;">Download link(s) expire after the time set by your organizer. Keep links private if these files should not be shared.</p>
    <p style="margin:0 0 12px 0;font-size:18px;">Download the ZIP, extract the PNG ticket image(s), and present them at the venue as instructed by your organizer.</p>
    <p style="margin:12px 0 0 0;font-size:18px;">Thank you, and we look forward to seeing you at the event!</p>
    <p style="margin:12px 0 0 0;font-size:18px;">Warm regards,<br><strong>Wish Tickets Portal Team</strong></p>
  </td></tr>
</table>`;

export interface SendManualDistributionEmailParams {
  to: string;
  recipientName: string;
  eventTitle: string;
  eventDate: string;
  venueName: string;
  sectionName: string;
  seatNumbers: string;
  attachments: { filename: string; content: Buffer }[];
  /** When set with bulkTicketCount, email is link-only (server-generated ZIP download). */
  bulkDownloadUrls?: string[];
  /** Optional labels matching `bulkDownloadUrls` order (e.g. `SILVER - Part 1`). */
  bulkDownloadLinkLabels?: string[];
  bulkTicketCount?: number;
  /** 1-based; when both set with partsTotal &gt; 1, copy references multi-part send. */
  partIndex?: number;
  partsTotal?: number;
  /** When total part count is unknown (byte-sized batches), use with partIndex for subject/body. */
  multiPartUnknownTotal?: boolean;
  /** Full subject line (section + event). Part suffixes are still applied when `partIndex` / `partsTotal` are set. */
  subjectLine?: string;
}

export async function sendManualDistributionEmail({
  to,
  recipientName,
  eventTitle,
  eventDate,
  venueName,
  sectionName,
  seatNumbers,
  attachments,
  bulkDownloadUrls: bulkDownloadUrlsParam,
  bulkDownloadLinkLabels: bulkDownloadLinkLabelsParam,
  bulkTicketCount,
  partIndex,
  partsTotal,
  multiPartUnknownTotal,
  subjectLine: subjectLineParam,
}: SendManualDistributionEmailParams): Promise<void> {
  const creds = await getSmtpCredentials();
  if (!creds) {
    throw new Error(
      "SMTP is not configured (missing server email credentials). Cannot send ticket emails — set SMTP in your environment or admin email settings."
    );
  }

  const bulkUrls = (bulkDownloadUrlsParam ?? []).filter((u) => typeof u === "string" && u.length > 0);
  const useBulkLink =
    bulkUrls.length > 0 &&
    typeof bulkTicketCount === "number" &&
    bulkTicketCount > 0;

  const bulkZipIntro =
    bulkUrls.length <= 1
      ? "Use the button below to download one ZIP file with your ticket image(s)."
      : `There are ${bulkUrls.length} ZIP downloads below. Download each to receive all ${bulkTicketCount} ticket image(s) in this email.`;

  const partIntro =
    typeof partIndex === "number" &&
    typeof partsTotal === "number" &&
    partsTotal > 1
      ? `<p style="margin:0 0 12px 0;font-size:18px;">This is <strong>part ${partIndex} of ${partsTotal}</strong> of your ticket delivery (multiple emails for large assignments).</p>`
      : multiPartUnknownTotal === true && typeof partIndex === "number"
        ? `<p style="margin:0 0 12px 0;font-size:18px;">This is <strong>part ${partIndex}</strong> of your ticket delivery (large assignments may arrive in multiple emails).</p>`
        : "";

  const bulkDownloadLinksHtml = buildBulkDownloadLinksHtml(bulkUrls, bulkDownloadLinkLabelsParam);

  const from = creds.from ?? `Wish Tickets Portal <${creds.user}>`;

  const htmlBody = useBulkLink
    ? MANUAL_DISTRIBUTION_BULK_HTML.replace(/\{\{recipientName\}\}/g, escapeHtml(recipientName))
        .replace(/\{\{eventTitle\}\}/g, escapeHtml(eventTitle))
        .replace(/\{\{eventDate\}\}/g, escapeHtml(eventDate))
        .replace(/\{\{venueName\}\}/g, escapeHtml(venueName))
        .replace(/\{\{sectionName\}\}/g, escapeHtml(sectionName))
        .replace(/\{\{seatNumbers\}\}/g, escapeHtml(seatNumbers))
        .replace(/\{\{bulkTicketCount\}\}/g, String(bulkTicketCount))
        .replace(/\{\{bulkZipIntro\}\}/g, escapeHtml(bulkZipIntro))
        .replace(/\{\{partIntro\}\}/g, partIntro)
        .replace(/\{\{bulkDownloadLinksHtml\}\}/g, bulkDownloadLinksHtml)
    : MANUAL_DISTRIBUTION_HTML.replace(/\{\{recipientName\}\}/g, recipientName)
        .replace(/\{\{eventTitle\}\}/g, eventTitle)
        .replace(/\{\{eventDate\}\}/g, eventDate)
        .replace(/\{\{venueName\}\}/g, venueName)
        .replace(/\{\{sectionName\}\}/g, sectionName)
        .replace(/\{\{seatNumbers\}\}/g, seatNumbers);

  const textBody = useBulkLink
    ? [
        `Dear ${recipientName},`,
        "",
        typeof partIndex === "number" && typeof partsTotal === "number" && partsTotal > 1
          ? `Part ${partIndex} of ${partsTotal} of your ticket delivery.`
          : multiPartUnknownTotal === true && typeof partIndex === "number"
            ? `Part ${partIndex} of your ticket delivery (more emails may follow).`
            : "",
        "",
        `${bulkTicketCount} ticket image(s) for ${eventTitle} — download via link(s) below (no attachments).`,
        bulkZipIntro,
        "",
        `Event: ${eventTitle}`,
        `Date: ${eventDate}`,
        `Venue: ${venueName}`,
        `Section(s): ${sectionName}`,
        `Seat(s) / slots: ${seatNumbers}`,
        "",
        ...(bulkUrls.length === 1
          ? [`${bulkDownloadLinkLabelsParam?.[0] ?? "Download"}:`, bulkUrls[0]!]
          : bulkUrls.map((u, i) => `${bulkDownloadLinkLabelsParam?.[i] ?? `Part ${i + 1}/${bulkUrls.length}`}: ${u}`)),
        "",
        "Wish Tickets Portal Team",
      ]
        .filter((line) => line !== "")
        .join("\n")
    : htmlBody
        .replace(/<[^>]+>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

  const baseFromCaller =
    typeof subjectLineParam === "string" && subjectLineParam.trim().length > 0
      ? subjectLineParam.trim()
      : null;

  const subject =
    baseFromCaller != null
      ? useBulkLink && typeof partIndex === "number" && typeof partsTotal === "number" && partsTotal > 1
        ? `${baseFromCaller} (part ${partIndex}/${partsTotal})`
        : useBulkLink && multiPartUnknownTotal === true && typeof partIndex === "number"
          ? `${baseFromCaller} (part ${partIndex})`
          : baseFromCaller
      : useBulkLink && typeof partIndex === "number" && typeof partsTotal === "number" && partsTotal > 1
        ? `Your tickets assigned (${partIndex}/${partsTotal}) – ${eventTitle}`
        : useBulkLink && multiPartUnknownTotal === true && typeof partIndex === "number"
          ? `Your tickets assigned (part ${partIndex}) – ${eventTitle}`
          : useBulkLink
            ? MANUAL_DISTRIBUTION_SUBJECT_BULK
            : MANUAL_DISTRIBUTION_SUBJECT;

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: creds.user, pass: creds.pass },
  });
  try {
    const mailAttachments = useBulkLink ? [] : attachments;
    await transporter.sendMail({
      from,
      to,
      subject,
      text:
        textBody ||
        `Your tickets for ${eventTitle}\n\nDate: ${eventDate}\nVenue: ${venueName}\n\nSeat(s): ${seatNumbers}\n\nPlease find your ticket(s) attached.`,
      html: htmlBody,
      attachments: mailAttachments,
    });
    console.log("[sendManualDistributionEmail] sent to", to, useBulkLink ? "(ZIP download)" : "");
  } catch (err) {
    console.error("[sendManualDistributionEmail] SMTP send failed:", err);
    throw err;
  }
}

function buildBulkDownloadLinksHtml(urls: string[], labels?: string[]): string {
  const btn =
    "display:inline-block;background:#FF6B00;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;";
  if (urls.length === 0) return "";
  if (urls.length === 1) {
    return `<p style="margin:0 0 16px 0;font-size:18px;"><a href="${escapeHtmlAttr(urls[0]!)}" style="${btn}">${escapeHtml(labels?.[0] ?? "Download tickets (ZIP)")}</a></p>`;
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

function escapeHtmlAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
