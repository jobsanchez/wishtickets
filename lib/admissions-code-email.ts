import { sendAdminDigestEmail } from "@/lib/email";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildPlainText(eventTitle: string, assigneeName: string, code: string): string {
  return [
    `Hi! ${assigneeName},`,
    "",
    `You have been assigned a unique admission code for the upcoming ${eventTitle}.`,
    "",
    "Your Admission Code:",
    code,
    "",
    "Please use this code to access the ticket scanning system during the event.",
    "",
    "Do not share this code with other Admission Officers, as it is personalized and recorded under your name only. Any activity using this code will be tracked accordingly.",
    "",
    "If you have any questions or encounter any issues, feel free to reach out.",
    "",
    "Thank you and see you at the event!",
    "",
    "Best regards,",
    "Wish Tickets Portal Team",
  ].join("\n");
}

function buildHtml(eventTitle: string, assigneeName: string, code: string): string {
  const eTitle = escapeHtml(eventTitle);
  const eName = escapeHtml(assigneeName);
  const eCode = escapeHtml(code);
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;font-family:sans-serif;font-size:18px;line-height:1.6;">
  <tr><td style="padding:24px;background:#fff;">
    <p style="margin:0 0 12px 0;">Hi! ${eName},</p>
    <p style="margin:0 0 12px 0;">You have been assigned a unique admission code for the upcoming <strong>${eTitle}</strong>.</p>
    <p style="margin:0 0 8px 0;"><strong>Your Admission Code:</strong></p>
    <p style="margin:0 0 16px 0;font-size:24px;font-family:ui-monospace,monospace;letter-spacing:0.05em;">${eCode}</p>
    <p style="margin:0 0 12px 0;">Please use this code to access the ticket scanning system during the event.</p>
    <p style="margin:0 0 12px 0;">Do not share this code with other Admission Officers, as it is personalized and recorded under your name only. Any activity using this code will be tracked accordingly.</p>
    <p style="margin:0 0 12px 0;">If you have any questions or encounter any issues, feel free to reach out.</p>
    <p style="margin:0 0 12px 0;">Thank you and see you at the event!</p>
    <p style="margin:12px 0 0 0;">Best regards,<br><strong>Wish Tickets Portal Team</strong></p>
  </td></tr>
</table>`.trim();
}

export function admissionsCodeEmailSubject(eventTitle: string): string {
  return `Your Admission Code for ${eventTitle}`;
}

export function buildAdmissionsCodeEmailContent(
  eventTitle: string,
  assigneeName: string,
  code: string
): { subject: string; html: string; text: string } {
  return {
    subject: admissionsCodeEmailSubject(eventTitle),
    html: buildHtml(eventTitle, assigneeName, code),
    text: buildPlainText(eventTitle, assigneeName, code),
  };
}

export async function sendAdmissionsCodeEmail(params: {
  to: string;
  eventTitle: string;
  assigneeName: string;
  code: string;
}): Promise<void> {
  const { subject, html, text } = buildAdmissionsCodeEmailContent(
    params.eventTitle,
    params.assigneeName,
    params.code
  );
  await sendAdminDigestEmail({ to: params.to, subject, text, html });
}
