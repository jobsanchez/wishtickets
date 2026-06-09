-- Entrava-style ticket email template: branded header, info boxes, entry instructions
UPDATE public.app_config
SET value = to_jsonb($body$
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;font-family:sans-serif;">
  <tr><td style="background:#f97316;color:#fff;padding:24px;text-align:center;">
    <div style="font-size:20px;font-weight:bold;">Wish Tickets Portal</div>
    <div style="font-size:18px;margin-top:8px;">Ticket Confirmation</div>
    <div style="font-size:14px;opacity:0.9;">Your ticket is ready!</div>
  </td></tr>
  <tr><td style="padding:24px;background:#fff;">
    <p>Hi {{buyerName}},</p>
    <p>Thank you for securing your tickets to {{eventTitle}}.</p>
    <p><strong>Date:</strong> {{eventDate}} | <strong>Venue:</strong> {{venueName}}</p>
    <p>Your ticket images are attached to this email as PNG files. Please have them ready upon entry.</p>
    <div style="background:#f0f9ff;border-left:4px solid #f97316;padding:16px;margin:16px 0;">
      <p style="margin:0;">Your ticket images are attached as PNG files. No need to print — present the ticket image (with QR code) on your phone. If the QR code cannot be displayed or scanned, contact our Admissions Staff for assistance.</p>
    </div>
    <p><strong>To ensure smooth entry:</strong></p>
    <ul style="margin:8px 0;padding-left:20px;">
      <li>Keep your ticket image personal and unshared</li>
      <li>One ticket = One valid entry</li>
      <li>For temporary exit and return, approach the Admissions Desk for re-entry assistance</li>
    </ul>
    <div style="background:#f8fafc;padding:16px;margin:16px 0;border-radius:4px;">
      <p style="margin:0;">If you have any questions or need support, feel free to reach out.</p>
    </div>
    <p>Warm regards,<br><strong>Wish Tickets Portal Team</strong></p>
  </td></tr>
</table>
$body$::text)
WHERE key = 'email_ticket_body';
