import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSmtpCredentials } from "@/lib/smtp-config";

async function getTransporter(): Promise<Transporter | null> {
  const creds = await getSmtpCredentials();
  if (!creds) return null;
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: creds.user, pass: creds.pass },
  });
}

const DEFAULT_SUBJECT = "Your tickets: {{eventTitle}}";
const DEFAULT_HTML = `<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;font-family:sans-serif;">
  <tr><td style="background:#FF6B00;color:#fff;padding:24px;text-align:center;">
    <div style="font-size:26px;font-weight:bold;">Wish Tickets Portal</div>
    <div style="font-size:22px;margin-top:8px;">Order Confirmation</div>
  </td></tr>
  {{eventImageBlock}}
  <tr><td style="padding:24px;background:#fff;font-size:18px;line-height:1.6;">
    <p style="margin:0 0 12px 0;font-size:18px;">Hi {{buyerName}},</p>
    <p style="margin:0 0 12px 0;font-size:18px;">Thank you for securing your tickets to <strong>{{eventTitle}}</strong>.</p>
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Date:</strong> {{eventDate}}</p>
    <p style="margin:0 0 12px 0;font-size:18px;"><strong>Venue:</strong> {{venueName}}</p>
    <p style="margin:0 0 12px 0;font-size:18px;"><strong>Order summary:</strong></p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px 0;font-size:18px;">
      <thead><tr style="border-bottom:2px solid #e5e7eb;"><th style="text-align:left;padding:8px 0;">Section</th><th style="text-align:left;padding:8px 0;">Seat</th><th style="text-align:right;padding:8px 0;">Price</th></tr></thead>
      <tbody>{{ticketDetails}}</tbody>
    </table>
    {{addOnsBlock}}
    <p style="margin:0 0 4px 0;font-size:18px;">Subtotal: {{subtotal}}</p>
    <p style="margin:0 0 4px 0;font-size:18px;">Discount: {{discount}} {{discountDescription}}</p>
    {{processingFeeBlock}}
    <p style="margin:0 0 4px 0;font-size:18px;"><strong>Total: {{total}}</strong></p>
    <p style="margin:0 0 12px 0;font-size:18px;">Invoice #: {{invoiceNumber}}</p>
    <p style="margin:0 0 12px 0;font-size:18px;">Your ticket images are attached to this email as PNG files. Please have them ready upon entry.</p>
    <div style="background:#f0f9ff;border-left:4px solid #FF6B00;padding:16px;margin:16px 0;">
      <p style="margin:0;font-size:18px;">Your ticket images are attached as PNG files. No need to print — present the ticket image (with QR code) on your phone. If the QR code cannot be displayed or scanned, contact our Admissions Staff for assistance.</p>
    </div>
    <p style="margin:12px 0 8px 0;font-size:18px;"><strong>To ensure smooth entry:</strong></p>
    <ul style="margin:8px 0;padding-left:24px;font-size:18px;">
      <li style="margin-bottom:6px;">Keep your ticket image personal and unshared</li>
      <li style="margin-bottom:6px;">One ticket = One valid entry</li>
      <li style="margin-bottom:6px;">For temporary exit and return, approach the Admissions Desk for re-entry assistance</li>
    </ul>
    <div style="background:#f8fafc;padding:16px;margin:16px 0;border-radius:4px;">
      <p style="margin:0;font-size:18px;">If you have any questions or need support, feel free to reach out.</p>
    </div>
    <p style="margin:12px 0 0 0;font-size:18px;">Warm regards,<br><strong>Wish Tickets Portal Team</strong></p>
  </td></tr>
</table>`;

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

export interface SendTicketEmailParams {
  to: string;
  eventTitle: string;
  eventDate: string;
  venueName: string;
  attachments: { filename: string; content: Buffer }[];
  subject?: string;
  htmlBody?: string;
  buyerName?: string;
  ticketDetails?: string;
  addOnsDetails?: string;
  subtotalCents?: number;
  discountCents?: number;
  totalCents?: number;
  discountDescription?: string;
  invoiceNumber?: string;
  /** Shown between discount and total when buyer paid a PayMongo processing surcharge. */
  processingFeeCents?: number;
  /** Optional URL of the event poster/cover image for use in the email header. */
  eventImageUrl?: string;
}

function replacePlaceholders(
  template: string,
  vars: {
    eventTitle: string;
    eventDate: string;
    venueName: string;
    buyerName: string;
    ticketDetails: string;
    addOnsDetails: string;
    subtotal: string;
    discount: string;
    total: string;
    discountDescription: string;
    invoiceNumber: string;
    eventImageBlock: string;
    eventImageUrl: string;
    processingFeeBlock: string;
    addOnsBlock: string;
  }
): string {
  return template
    .replace(/\{\{eventTitle\}\}/g, vars.eventTitle)
    .replace(/\{\{eventDate\}\}/g, vars.eventDate)
    .replace(/\{\{venueName\}\}/g, vars.venueName)
    .replace(/\{\{buyerName\}\}/g, vars.buyerName)
    .replace(/\{\{ticketDetails\}\}/g, vars.ticketDetails)
    .replace(/\{\{addOnsDetails\}\}/g, vars.addOnsDetails)
    .replace(/\{\{subtotal\}\}/g, vars.subtotal)
    .replace(/\{\{discount\}\}/g, vars.discount)
    .replace(/\{\{total\}\}/g, vars.total)
    .replace(/\{\{discountDescription\}\}/g, vars.discountDescription)
    .replace(/\{\{invoiceNumber\}\}/g, vars.invoiceNumber)
    .replace(/\{\{eventImageBlock\}\}/g, vars.eventImageBlock)
    .replace(/\{\{eventImageUrl\}\}/g, vars.eventImageUrl)
    .replace(/\{\{processingFeeBlock\}\}/g, vars.processingFeeBlock)
    .replace(/\{\{addOnsBlock\}\}/g, vars.addOnsBlock);
}

async function getEmailTemplate(): Promise<{ subject: string; htmlBody: string }> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("app_config")
      .select("key, value")
      .in("key", ["email_ticket_subject", "email_ticket_body"]);
    const map = new Map<string, string>();
    for (const row of data ?? []) {
      const v = row.value;
      map.set(row.key, typeof v === "string" ? v : v ?? "");
    }
    return {
      subject: map.get("email_ticket_subject") ?? DEFAULT_SUBJECT,
      htmlBody: map.get("email_ticket_body") ?? DEFAULT_HTML,
    };
  } catch {
    return { subject: DEFAULT_SUBJECT, htmlBody: DEFAULT_HTML };
  }
}

export async function sendTicketEmail({
  to,
  eventTitle,
  eventDate,
  venueName,
  attachments,
  subject: subjectOverride,
  htmlBody: htmlBodyOverride,
  buyerName = "",
  ticketDetails = "",
  addOnsDetails = "",
  subtotalCents,
  discountCents = 0,
  totalCents,
  processingFeeCents,
  discountDescription = "",
  invoiceNumber,
  eventImageUrl,
}: SendTicketEmailParams): Promise<void> {
  const creds = await getSmtpCredentials();
  if (!creds) {
    console.error(
      "[sendTicketEmail] SMTP not configured — ticket email skipped. Set credentials in Global Settings or SMTP_USER/SMTP_PASS env vars."
    );
    return;
  }

  let from = creds.from ?? `Wish Tickets Portal <${creds.user}>`;
  const smtpUser = creds.user;
  const fromMatch = from.match(/<([^>]+)>/);
  const fromEmail = (fromMatch?.[1] ?? from).trim().toLowerCase();
  const smtpDomain = smtpUser?.split("@")[1]?.toLowerCase();
  const fromDomain = fromEmail?.split("@")[1];
  if (fromEmail && smtpUser && smtpDomain && fromDomain !== smtpDomain) {
    from = `Wish Tickets Portal <${smtpUser}>`;
    console.warn("[sendTicketEmail] SMTP_FROM domain differs from SMTP_USER; using SMTP_USER to avoid Gmail rejection");
  }
  const subtotal = subtotalCents != null ? formatPrice(subtotalCents) : "—";
  const discount =
    discountCents != null && discountCents > 0
      ? `-${formatPrice(discountCents)}`
      : discountDescription
        ? `Promo code ${discountDescription}`
        : "None";
  const total = totalCents != null ? formatPrice(totalCents) : "—";
  const processingFeeBlock =
    processingFeeCents != null && processingFeeCents > 0
      ? `<p style="margin:0 0 4px 0;font-size:18px;">Processing fee (payment rails): ${formatPrice(processingFeeCents)}</p>`
      : "";
  const discountDesc =
    discountCents != null && discountCents > 0 && discountDescription
      ? ` (${discountDescription})`
      : "";
  const invoiceDisplay = invoiceNumber && invoiceNumber.trim() ? invoiceNumber.trim() : "N/A";
  const safeEventImageUrl = eventImageUrl?.trim() ?? "";
  const escapedEventImageUrl = safeEventImageUrl ? escapeHtml(safeEventImageUrl) : "";
  const escapedEventTitle = escapeHtml(eventTitle);
  const eventImageBlock =
    escapedEventImageUrl.length > 0
      ? `<tr><td style="background:#ffffff;padding:16px 24px 0 24px;text-align:center;">
    <img src="${escapedEventImageUrl}" alt="${escapedEventTitle}" style="max-width:100%;height:auto;border-radius:12px;display:block;margin:0 auto;" />
  </td></tr>`
      : "";
  const vars = {
    eventTitle,
    eventDate,
    venueName,
    buyerName,
    ticketDetails: ticketDetails || "<tr><td colspan=\"3\" style=\"padding:8px 0;\">—</td></tr>",
    addOnsDetails,
    subtotal,
    discount,
    total,
    discountDescription: discountDesc,
    invoiceNumber: invoiceDisplay,
    eventImageBlock,
    eventImageUrl: escapedEventImageUrl,
    processingFeeBlock,
    addOnsBlock:
      addOnsDetails && addOnsDetails.trim().length > 0
        ? `<p style="margin:0 0 12px 0;font-size:18px;"><strong>Add-ons:</strong></p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px 0;font-size:18px;">
      <thead><tr style="border-bottom:2px solid #e5e7eb;"><th style="text-align:left;padding:8px 0;">Item</th><th style="text-align:right;padding:8px 0;">Qty</th><th style="text-align:right;padding:8px 0;">Price</th></tr></thead>
      <tbody>${addOnsDetails}</tbody>
    </table>`
        : "",
  };

  let subject: string;
  let htmlBody: string;
  if (subjectOverride !== undefined && htmlBodyOverride !== undefined) {
    subject = subjectOverride;
    htmlBody = htmlBodyOverride;
  } else {
    const template = await getEmailTemplate();
    subject = replacePlaceholders(template.subject, vars);
    htmlBody = replacePlaceholders(template.htmlBody, vars);
  }

  // Backward compatibility: older saved templates may not include {{addOnsBlock}}.
  // If add-ons exist but block is still absent, inject before the "Subtotal:" line.
  if (vars.addOnsBlock && !htmlBody.includes("<strong>Add-ons:</strong>")) {
    const subtotalMatch = htmlBody.match(/subtotal\s*:/i);
    const idx = subtotalMatch?.index ?? -1;
    if (idx >= 0) {
      htmlBody = `${htmlBody.slice(0, idx)}${vars.addOnsBlock}${htmlBody.slice(idx)}`;
    } else {
      htmlBody = `${htmlBody}${vars.addOnsBlock}`;
    }
  }

  if (vars.buyerName.trim() === "" && htmlBody.includes("Hi ,")) {
    htmlBody = htmlBody.replace(/Hi ,/g, "Hi there,");
  }

  const textBody = htmlBody
    .replace(/<h[1-6][^>]*>.*?<\/h[1-6]>/gi, "")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const transporter = await getTransporter();
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      text: textBody || `Your tickets for ${eventTitle}\n\nDate: ${eventDate}\nVenue: ${venueName}\n\nPlease find your QR ticket(s) attached.`,
      html: htmlBody,
      attachments,
    });
    console.log("[sendTicketEmail] sent to", to);
  } catch (err) {
    console.error("[sendTicketEmail] SMTP send failed:", err);
    throw err;
  }
}

const CONTACT_TEAM_EMAIL = "wishticketsportal@gmail.com";

export interface SendContactFormEmailParams {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export async function sendContactFormEmail({
  name,
  email,
  subject,
  message,
}: SendContactFormEmailParams): Promise<void> {
  const creds = await getSmtpCredentials();
  if (!creds) {
    console.warn("SMTP not configured, skipping contact form email");
    return;
  }

  const from = creds.from ?? `Wish Tickets Portal <${creds.user}>`;
  const htmlBody = `
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;font-family:sans-serif;">
  <tr><td style="background:#FF6B00;color:#fff;padding:24px;text-align:center;">
    <div style="font-size:26px;font-weight:bold;">Wish Tickets Portal</div>
    <div style="font-size:22px;margin-top:8px;">Contact Form Submission</div>
  </td></tr>
  <tr><td style="padding:24px;background:#fff;font-size:16px;line-height:1.6;">
    <p style="margin:0 0 8px 0;"><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
    <p style="margin:0 0 16px 0;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
    <p style="margin:0;white-space:pre-wrap;">${escapeHtml(message)}</p>
  </td></tr>
</table>`;

  const textBody = `From: ${name} <${email}>\nSubject: ${subject}\n\n${message}`;

  const transporter = await getTransporter();
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from,
      to: CONTACT_TEAM_EMAIL,
      subject: `[Contact] ${subject}`,
      text: textBody,
      html: htmlBody,
    });
    console.log("[sendContactFormEmail] sent to", CONTACT_TEAM_EMAIL);
  } catch (err) {
    console.error("[sendContactFormEmail] SMTP send failed:", err);
    throw err;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Notify event admins / creator when a paid booking is confirmed (one BCC blast; recipients do not see each other). */
export async function sendEventSaleNotificationToTeam(params: {
  bcc: string[];
  eventTitle: string;
  eventDate: string;
  venueName: string;
  buyerName: string;
  buyerEmail?: string;
  ticketCount: number;
  totalFormatted: string;
  bookingId: string;
}): Promise<void> {
  const deduped = [...new Set(params.bcc.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (deduped.length === 0) {
    console.warn("[sendEventSaleNotificationToTeam] no recipient emails; skip");
    return;
  }

  const creds = await getSmtpCredentials();
  if (!creds) {
    console.warn(
      "[sendEventSaleNotificationToTeam] SMTP not configured — sale notification skipped"
    );
    return;
  }

  const transporter = await getTransporter();
  if (!transporter) return;

  let from = creds.from ?? `Wish Tickets Portal <${creds.user}>`;
  const smtpUser = creds.user;
  const fromMatch = from.match(/<([^>]+)>/);
  const fromEmail = (fromMatch?.[1] ?? from).trim().toLowerCase();
  const smtpDomain = smtpUser?.split("@")[1]?.toLowerCase();
  const fromDomain = fromEmail?.split("@")[1];
  if (fromEmail && smtpUser && smtpDomain && fromDomain !== smtpDomain) {
    from = `Wish Tickets Portal <${smtpUser}>`;
  }

  const buyerLine =
    params.buyerEmail && params.buyerEmail.trim()
      ? `${escapeHtml(params.buyerName || "Buyer")} &lt;${escapeHtml(params.buyerEmail.trim())}&gt;`
      : escapeHtml(params.buyerName || "Buyer");

  const subject = `New sale: ${params.eventTitle}`;
  const html = `
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;font-family:sans-serif;">
  <tr><td style="background:#FF6B00;color:#fff;padding:24px;text-align:center;">
    <div style="font-size:22px;font-weight:bold;">Wish Tickets Portal</div>
    <div style="font-size:18px;margin-top:8px;">New ticket sale</div>
  </td></tr>
  <tr><td style="padding:24px;background:#fff;font-size:16px;line-height:1.6;">
    <p style="margin:0 0 12px 0;">A customer completed payment for <strong>${escapeHtml(params.eventTitle)}</strong>.</p>
    <p style="margin:0 0 4px 0;"><strong>When:</strong> ${escapeHtml(params.eventDate)}</p>
    <p style="margin:0 0 12px 0;"><strong>Venue:</strong> ${escapeHtml(params.venueName)}</p>
    <p style="margin:0 0 4px 0;"><strong>Buyer:</strong> ${buyerLine}</p>
    <p style="margin:0 0 4px 0;"><strong>Tickets:</strong> ${params.ticketCount}</p>
    <p style="margin:0 0 12px 0;"><strong>Amount paid:</strong> ${escapeHtml(params.totalFormatted)}</p>
    <p style="margin:0 0 12px 0;"><strong>Booking ID:</strong> <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${escapeHtml(params.bookingId)}</code></p>
    <p style="margin:0;color:#64748b;font-size:14px;">This is an automated message when a booking is confirmed after successful payment.</p>
  </td></tr>
</table>`;

  const text = [
    `New ticket sale — ${params.eventTitle}`,
    "",
    `Date/time: ${params.eventDate}`,
    `Venue: ${params.venueName}`,
    `Buyer: ${params.buyerName || "Buyer"}${params.buyerEmail ? ` <${params.buyerEmail}>` : ""}`,
    `Tickets: ${params.ticketCount}`,
    `Amount paid: ${params.totalFormatted}`,
    `Booking ID: ${params.bookingId}`,
  ].join("\n");

  try {
    await transporter.sendMail({
      from,
      to: smtpUser,
      bcc: deduped,
      subject,
      text,
      html,
    });
    console.log("[sendEventSaleNotificationToTeam] sent", { count: deduped.length, bookingId: params.bookingId });
  } catch (err) {
    console.error("[sendEventSaleNotificationToTeam] SMTP send failed:", err);
    throw err;
  }
}

/** Plain HTML/text message from admin tools (e.g. registered user export). Requires SMTP. */
export async function sendAdminDigestEmail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const creds = await getSmtpCredentials();
  if (!creds) {
    throw new Error(
      "SMTP is not configured. Add credentials under Global Settings → Email & Tickets, or set SMTP_USER / SMTP_PASS."
    );
  }
  const transporter = await getTransporter();
  if (!transporter) {
    throw new Error("SMTP is not configured.");
  }
  let from = creds.from ?? `Wish Tickets Portal <${creds.user}>`;
  const smtpUser = creds.user;
  const fromMatch = from.match(/<([^>]+)>/);
  const fromEmail = (fromMatch?.[1] ?? from).trim().toLowerCase();
  const smtpDomain = smtpUser?.split("@")[1]?.toLowerCase();
  const fromDomain = fromEmail?.split("@")[1];
  if (fromEmail && smtpUser && smtpDomain && fromDomain !== smtpDomain) {
    from = `Wish Tickets Portal <${smtpUser}>`;
  }
  await transporter.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
}

