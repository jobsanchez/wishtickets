# PayMongo Setup for Wish Tickets Portal

This guide explains how to enable PayMongo payments so buyers can pay via card, GCash, PayMaya, or GrabPay. The app already has the integration; you only need to configure PayMongo and environment variables.

## Prerequisites

- Wish Tickets Portal running (checkout flow works)
- SMTP configured for ticket emails (see [EMAIL_SETUP.md](./EMAIL_SETUP.md))

## Step 1: Create PayMongo Account

1. Go to [paymongo.com](https://paymongo.com) and sign up.
2. Complete account verification (required for live mode).
3. Use **Test mode** first for development.

## Step 2: Get API Keys

1. Log in to [PayMongo Dashboard](https://dashboard.paymongo.com).
2. Go to **Developers** → **Settings** (or **API Keys**).
3. Copy your **Secret Key**:
   - Test: `sk_test_...`
   - Live: `sk_live_...` (after account activation)

See [PayMongo API Keys docs](https://developers.paymongo.com/docs/api-keys) for details.

## Step 3: Create Webhook

1. In the Dashboard, go to **Webhooks**.
2. Click **Create Webhook**.
3. **URL**: Your public webhook endpoint.
   - Production: `https://your-domain.com/api/webhooks/paymongo`
   - Local dev: Use ngrok (see Step 5), e.g. `https://abc123.ngrok-free.app/api/webhooks/paymongo`
4. **Events** (required — subscribe to these for reliable status updates):
   - `checkout_session.payment.paid` — triggers booking confirmation and ticket email (Checkout Sessions API)
   - `checkout_session.payment.failed` — **required** — marks booking as failed when source expires
   - (Legacy) `link.payment.paid` and `link.payment.failed` — supported for older link-based payments
   - (Optional) `payment.paid` — also supported
5. Click **Create**.
6. Copy the **Webhook Signing Secret** (shown once; store it securely).

See [PayMongo Creating a Webhook](https://developers.paymongo.com/docs/creating-a-webhook).

## Step 4: Environment Variables

Add to `.env.local`:

```env
PAYMONGO_SECRET_KEY=sk_test_xxxxxxxx
PAYMONGO_WEBHOOK_SECRET=whsec_xxxxxxxx
```

- `PAYMONGO_SECRET_KEY`: From Step 2.
- `PAYMONGO_WEBHOOK_SECRET`: From Step 3 (webhook signing secret).

Restart the Next.js dev server after adding these.

## Step 5: Local Testing with ngrok

PayMongo cannot reach `localhost`. Use ngrok to expose your app:

1. Install ngrok: `brew install ngrok` (or [ngrok.com](https://ngrok.com)).
2. Start your app: `npm run dev`.
3. Run: `ngrok http 3000`.
4. Copy the HTTPS URL (e.g. `https://abc123.ngrok-free.app`).
5. In PayMongo Dashboard → Webhooks, create a webhook with URL:
   `https://abc123.ngrok-free.app/api/webhooks/paymongo`
6. Use the same webhook secret in `PAYMONGO_WEBHOOK_SECRET`.

**Note:** ngrok URLs change each time unless you use a paid plan. Update the webhook URL in PayMongo when the ngrok URL changes.

## Step 6: Verify Flow

1. Do a test checkout (select seats, apply promo if desired, proceed to checkout).
2. PayMongo opens in a new tab; you stay on the checkout page with instructions.
3. Complete payment in the PayMongo tab (use GCash, card, or test card).
4. Close the PayMongo tab after it says "You may now close this window."
5. Your tickets are sent by the webhook — check your email. You can also click "View confirmation page" or go to Dashboard.
6. Check terminal logs for `[PayMongo webhook] event type: checkout_session.payment.paid` and `ticket email sent to`.

### Test Cards

| Card Number       | Brand     | CVC  | Expiry   |
|-------------------|-----------|------|----------|
| 4343434343434345  | Visa      | Any 3 digits | Any future date |
| 5555444444444457  | Mastercard| Any 3 digits | Any future date |

See [PayMongo Testing](https://developers.paymongo.com/docs/testing) for more test cards and scenarios.

## Summary Checklist

| Step | Action |
|------|--------|
| 1 | Create PayMongo account |
| 2 | Copy Secret Key from Developers → Settings |
| 3 | Create webhook with URL and `checkout_session.payment.paid` event; copy signing secret |
| 4 | Add `PAYMONGO_SECRET_KEY` and `PAYMONGO_WEBHOOK_SECRET` to `.env.local` |
| 5 | For local dev: run ngrok, use ngrok URL as webhook URL |
| 6 | Test checkout with PayMongo test card |

## Troubleshooting

### 502 Bad Gateway on checkout

If you see "Payment could not be initialized" (502) when clicking Pay:

1. **Test PayMongo** — Open `http://localhost:3000/api/checkout/paymongo-test` in your browser. It returns the exact PayMongo error (401 = invalid key, 422 = bad request).
2. **Verify `PAYMONGO_SECRET_KEY`** — Must be your test secret key (`sk_test_...`). Copy from PayMongo Dashboard → Developers → API Keys. Restart the dev server after changing `.env.local`.
3. **Check the test response** — The `error` field shows PayMongo's message.

### 400 Bad Request on checkout

Usually means "Reservation expired or invalid" — your cart timed out. Go back to seat selection and choose seats again.

### Payment expired but app still shows "Checking payment status…"

When PayMongo shows "Source has expired" but the app doesn't transition to failed:

1. **Enable `checkout_session.payment.failed` webhook** — PayMongo notifies your server when the source expires. This is the fastest way to detect failure. In PayMongo Dashboard → Webhooks, ensure your webhook subscribes to `checkout_session.payment.failed`.
2. **Verify webhook URL** — For local dev, use ngrok. PayMongo cannot reach localhost. If the webhook URL is wrong or ngrok is down, you won't receive failure events.
3. **Time-based fallback** — After 3 minutes unpaid, the app treats the payment as failed (even if the webhook didn't fire).
4. **API fallback** — The app also fetches payments from PayMongo when the link response lacks payment details, to detect expired source status.
5. **Debug** — Visit `/api/debug/paymongo-link?bookingId=YOUR_BOOKING_ID` (while logged in) to see the raw PayMongo response. Set `DEBUG_PAYMONGO=1` in `.env.local` to log PayMongo responses in the server console.

### No email after payment / Confirmation page keeps looping

Tickets and email are sent by the webhook when PayMongo notifies your server — not when you return to the site. If the confirmation page keeps refreshing even after payment, the webhook is not confirming the booking.

1. **Keep ngrok running** — PayMongo must reach your webhook. If ngrok stops or the URL changes, update the webhook in PayMongo Dashboard.
2. **Check server logs** — Look for `[PayMongo webhook] event type: checkout_session.payment.paid` and `ticket email sent to`. If you see `signature verification failed`, the webhook secret is wrong. If you see `paid event but no booking ref extracted`, the app could not match the payment to your booking.
3. **Verify webhook URL** — Must be `https://your-ngrok-url/api/webhooks/paymongo` (HTTPS, no trailing slash). PayMongo cannot reach `localhost`.
4. **Verify `PAYMONGO_WEBHOOK_SECRET`** — Must match the webhook signing secret from PayMongo Dashboard (shown once when creating the webhook). Restart the dev server after changing.
5. **Check spam folder** — Ticket emails may be filtered.
6. **Escape the loop** — Use "Go to dashboard" or wait ~60 seconds; the page will stop refreshing and show a link to the dashboard.
7. **Fallback** — When you visit the confirmation page, the app also checks PayMongo directly. If the payment is paid, it confirms the booking and shows your tickets. Refresh the page after payment to trigger this check.

## How It Works

- **Checkout**: When `PAYMONGO_SECRET_KEY` is set, the app creates a PayMongo **Checkout Session** (not Links) with billing prefill (name, email, phone from your profile) and redirects the user to PayMongo checkout.
- **Billing prefill**: E-mail, Name, and Contact Number on the PayMongo billing page are prefilled from your account. Fill in **Dashboard → Settings** (full name, phone) for best results.
- **Webhook**: When PayMongo sends `checkout_session.payment.paid`, the app confirms the booking, updates the payment record, and sends the ticket email.
- **Fallback**: When `PAYMONGO_SECRET_KEY` is not set, checkout confirms immediately and sends the ticket email (no payment step).
