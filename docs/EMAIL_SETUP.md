# Gmail SMTP Setup for Ticket Emails

This guide explains how to configure Gmail to send ticket emails to buyers.

## Prerequisites

- A Google account
- 2-Step Verification enabled on your Google account

## Step 1: Enable 2-Step Verification

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Under "Signing in to Google", click **2-Step Verification**
3. Follow the prompts to enable 2-Step Verification

## Step 2: Create an App Password

1. Return to [Google Account Security](https://myaccount.google.com/security)
2. Under "Signing in to Google", click **App passwords**
   - If you don't see this option, ensure 2-Step Verification is enabled
3. At the bottom, select **Mail** as the app
4. Select **Other (Custom name)** as the device and enter a name (e.g. "Wish Tickets Portal")
5. Click **Generate**
6. Copy the 16-character password (shown without spaces)

## Step 3: Configure Environment Variables

Add to your `.env.local`:

```env
SMTP_USER=your.email@gmail.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM=Wish Tickets Portal <your.email@gmail.com>
```

- `SMTP_USER`: Your Gmail address
- `SMTP_PASS`: The 16-character App Password (not your regular Google password)
- `SMTP_FROM`: Optional. Display name and email for the "From" field. **Gmail requirement:** The From email must match `SMTP_USER` or be a "Send mail as" alias in your Gmail account. If you use a different domain (e.g. `sales@wish1075.com` with `SMTP_USER=you@gmail.com`), the app will fall back to using `SMTP_USER` to avoid Gmail rejection.

## Step 4: Test SMTP

As an admin, send a POST request to `/api/test-email` while logged in. A test ticket email will be sent to your account email. Use this to verify SMTP works before testing a full purchase.

```bash
curl -X POST https://your-domain.com/api/test-email -b "your-session-cookies"
```

Or use a tool like Postman with your session cookies.

## PayMongo Webhook (Required for Ticket Emails)

Ticket emails are sent when PayMongo notifies your app that a payment succeeded. Configure your PayMongo webhook to:

1. **URL**: Your public webhook URL (e.g. `https://your-domain.com/api/webhooks/paymongo`)
2. **Events**: Subscribe to `link.payment.paid` (the checkout uses PayMongo Links)

If the webhook URL is not publicly reachable (e.g. localhost), PayMongo cannot deliver events and no emails will be sent. Use ngrok or similar for local testing.

## Notes

- **App Password vs regular password**: Use the App Password only. Your regular Google password will not work for SMTP.
- **Security**: Never commit `.env.local` or share your App Password. Keep it in environment variables only.
- **Production**: For high-volume production, consider using a transactional email service (e.g. SendGrid, Resend) instead of Gmail for better deliverability and rate limits.
