# Netlify Deployment Guide

Deploy Wish Tickets Portal (Next.js 15) to Netlify.

## Prerequisites

- Git repository (GitHub, GitLab, or Bitbucket)
- Netlify account at [app.netlify.com](https://app.netlify.com)
- Supabase project configured
- PayMongo account (for checkout)

## 1. Connect Repository

1. Push the project to your Git provider.
2. Go to [app.netlify.com](https://app.netlify.com) and sign in.
3. Click **Add new site** → **Import an existing project**.
4. Connect your Git provider and select the Wish Tickets Portal repository.
5. Netlify will auto-detect Next.js.

## 2. Build Settings

If using `netlify.toml`, settings are pre-configured. Otherwise set:

- **Build command:** `npm run build` (or `npm run netlify:build` if Turbopack build fails)
- **Publish directory:** `.next`

## 3. Environment Variables

In Netlify: **Site settings** → **Environment variables** → **Add a variable** (or **Import from .env**).

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | For admin APIs, webhooks, admissions |
| `PAYMONGO_SECRET_KEY` | For checkout | Use test key first |
| `PAYMONGO_WEBHOOK_SECRET` | For PayMongo | Set after first deploy |
| `SMTP_USER` | For ticket emails | Gmail address |
| `SMTP_PASS` | For ticket emails | Gmail App Password |
| `SMTP_FROM` | Optional | e.g. `Wish Tickets Portal <you@gmail.com>` |
| `CRON_SECRET` | Recommended in production | Secret for HTTP crons such as `/api/cron/cleanup-pending-payments` and `/api/cron/storage-orphans-delete` (optional external scheduler or Supabase pg_net). |
| `PRINT_TICKET_GEN_CONCURRENCY` | Optional | Parallel Sharp pipelines in `POST /api/admin/print-tickets/generate` (default **10**, max **32**). Lower on Netlify if bulk generation hits memory or time limits. |
| `NEXT_PUBLIC_SITE_URL` | Recommended for production | Full site URL (e.g. `https://wishticketsportal.online`). Ensures PayMongo "Return to Merchant" and other redirects use the correct domain. |
| `NETLIFY_AVAILABILITY_RPC_TIMEOUT_MS` | Optional | Milliseconds to wait on `get_event_availability` in `GET /api/events/:id/availability`. **Do not set** unless tuning: on Netlify the default is ~7500 (stays under typical 10s Lambdas). |
| `NETLIFY` | Optional | Set to `1` to force “short Netlify RPC wait” if a runtime does not inject `SITE_ID` (rare). |

Scope: **All scopes**

**Note:** Netlify's `URL` is set automatically. `NEXT_PUBLIC_SITE_URL` is still recommended for custom domains and consistent behavior (e.g. when using `wishticketsportal.online` instead of a Netlify subdomain). (build, deploy previews, production).

**Important for ticket emails:** `SMTP_USER`, `SMTP_PASS`, and `PAYMONGO_WEBHOOK_SECRET` must be available at runtime. When adding variables, ensure **Functions** and **Runtime** are checked (not only Builds). Otherwise emails will not be sent after payment.

## 4. First Deploy

1. Trigger a deploy (**Deploy site** or push a commit).
2. If the build fails with Turbopack, change build command to `npm run netlify:build`.
3. Note your site URL (e.g. `https://your-site.netlify.app`).

## 5. Post-Deploy: PayMongo Webhook

1. PayMongo Dashboard → **Webhooks** → Create or edit.
2. **URL:** `https://YOUR-NETLIFY-SITE.netlify.app/api/webhooks/paymongo`
3. **Events:** `checkout_session.payment.paid`, `checkout_session.payment.failed`
4. Copy the **Webhook Signing Secret** and add as `PAYMONGO_WEBHOOK_SECRET` in Netlify.
5. Redeploy if you added the webhook secret after the first deploy.

## 6. Post-Deploy: Supabase Auth

1. Supabase Dashboard → **Authentication** → **URL Configuration**.
2. Add to **Redirect URLs:**
   - `https://YOUR-NETLIFY-SITE.netlify.app/**`
   - `https://YOUR-NETLIFY-SITE.netlify.app/auth/callback`
3. Set **Site URL** to `https://YOUR-NETLIFY-SITE.netlify.app` (or custom domain).

## 7. Custom Domain (Optional)

1. Netlify → **Domain settings** → **Add custom domain**.
2. Follow DNS instructions (CNAME or A record).
3. HTTPS is automatic.
4. Update PayMongo webhook URL and Supabase redirect URLs to the custom domain.
5. Set `NEXT_PUBLIC_SITE_URL` to your custom domain (e.g. `https://wishticketsportal.online`) so the "Return to Merchant" redirect works correctly after payment.

**Print tickets / bulk “send selected” email:** Admin → Print Tickets → **Send selected** creates a `print_ticket_email_jobs` row. While the progress dialog is open, the **browser** repeatedly `POST`s `/api/admin/print-tickets/send-selected-email/jobs/{jobId}/process`. Ticket images are generated into section part folders (`print-by-section/{event}/{section}/part-N/...`) using fixed-count batches that target about 50MB per part. Email links use the stream ZIP endpoint (`/api/print-ticket-folders/download-zip`) per part, with labels such as `Section-Part-1`. No ZIP artifact worker or `print-folder-zips/...` reuse is required. **Leave the tab open** until the job shows completed (closing it pauses sending until you open Print Tickets again and start a new send, or you add your own scheduler hitting `/api/cron/print-ticket-email-jobs` with `CRON_SECRET`). Apply migration [`00166_lock_print_ticket_email_job_by_id_for_creator.sql`](../supabase/migrations/00166_lock_print_ticket_email_job_by_id_for_creator.sql). If the job stays **pending**, confirm **`SUPABASE_SERVICE_ROLE_KEY`** is set for **Functions + Runtime** on Netlify (not build-only). Large sends may produce **several SMTP messages** (one per chunk). Ticket **image generation** stays synchronous in `POST /api/admin/print-tickets/generate`; tune `PRINT_TICKET_GEN_CONCURRENCY` if needed.

**Manual Ticket Distribution email:** Event → **Manual Ticket Distribution** → **Send** uses the same pattern: `POST /api/admin/assignments/{assignmentId}/send-email/jobs` then the browser ticks `POST …/jobs/{jobId}/process`. Batches use **signed ZIP links** when the send is large (same thresholds as print-ticket bulk). Apply migration [`00167_manual_assignment_email_jobs.sql`](../supabase/migrations/00167_manual_assignment_email_jobs.sql).

**Public book page / seat availability:** On Netlify, **sync** Lambdas sit around ~**10s** wall-clock (plan-dependent); DevTools sometimes shows cancelled requests when a function exceeds that budget. Mitigations baked into the repo: (**1**) `GET …/availability` detects Netlify (`SITE_ID`) and caps per-RPC wait (~**7.5s**) so callers get **`504`** `availability_timeout` instead of a silent platform kill; (**2**) the book UI loads **`mode=manifest`** (sections + canvases) **then `mode=seats`**, seating rows are fetched in **batches by section IDs** when there are many assigned sections (`AVAILABILITY_SEAT_SECTION_CHUNK`). The full single-payload RPC remains as **`get_event_availability`** when you omit `mode`. Tune **`NETLIFY_AVAILABILITY_RPC_TIMEOUT_MS`** only after raising Netlify/sync limits if needed.

**Admin → Print Tickets tab load (`GET /api/admin/events/[id]/print-tickets`):** Builds the full section/seat grid in one request. Large events can exceed the default Netlify function timeout → **502 Bad Gateway**; this route sets **`maxDuration = 120`** and batches `event_seats` in one query. If 502 persists, check Netlify plan limits and reduce section/seat count or add pagination later.

**Admin → Print Tickets → Generate ZIP / Generate all ZIPs:** In production, the app **enqueues** `print_folder_zip_jobs` and calls the Supabase Edge Function **`print-folder-zip-worker`** (it does **not** run the full ZIP inside the Netlify function by default). **Local** may appear to “just work” if you set `PRINT_SECTION_ZIP_INLINE=true` or run functions locally. On deploy you need: (1) `supabase functions deploy print-folder-zip-worker`, (2) Edge Function secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `PRINT_FOLDER_ZIP_WORKER_SECRET`, (3) **Netlify** env `PRINT_FOLDER_ZIP_WORKER_SECRET` **must match** the Edge secret when you use one (the site sends `x-worker-secret`; DB cron from [`00174`](../supabase/migrations/00174_print_folder_zip_jobs_edge_cron.sql) may use `Authorization: Bearer` — the worker accepts **both**). If jobs stay **Queued**, check Netlify function logs for `Worker returned …` and Supabase **Edge Functions → Logs**. Large sections (many files) may need several worker invocations or pg_cron.

## Quick Checklist

- [ ] Add `netlify.toml` (already in repo)
- [ ] Push to Git
- [ ] Connect repo in Netlify (prefer **Git builds** over drag-and-drop / drop deploy; see [Access Denied on drop deploy](#troubleshooting-access-denied-on-drop-deploy) if the drop zone fails)
- [ ] Set all environment variables
- [ ] Trigger first deploy
- [ ] Update PayMongo webhook URL to Netlify domain
- [ ] Add Netlify URL to Supabase Auth redirect URLs
- [ ] Apply Supabase migrations `00166` / `00167` (and `00165` if you ever ran `00164`) for browser-driven print-ticket and manual-distribution email jobs; set `SUPABASE_SERVICE_ROLE_KEY` for runtime (see § above)

## Troubleshooting: Access Denied on drop deploy

The dashed **drag-and-drop** area on **Site → Deploys** can show **Access Denied**. That message comes from **Netlify’s dashboard and APIs** (your Netlify login and site permissions). It is **not caused by Meta Pixel** or other code in this repository: tracking snippets only run on your **live site**, not inside `app.netlify.com`.

### 1. Confirm the failing request (DevTools)

1. Open your site in Netlify: **Deploys**.
2. Open browser **DevTools** (F12) → **Network** tab. Enable **Preserve log** if available.
3. **Reload** the page (Ctrl+R / Cmd+R).
4. Filter by **Fetch/XHR** or search for `api` / `deploy`.
5. Find requests with status **401** or **403** (often red). Note the **Request URL** and **Status**; use that when contacting Netlify Support or your team owner.

### 2. Restore access (account and permissions)

Try in order:

1. **Session:** Log out of Netlify, log back in. Try a **private/incognito** window with **extensions disabled** (ad blockers and privacy tools sometimes block dashboard API calls).
2. **Team role:** **Project configuration** → **Team** (or organization members). Confirm your user has permission to **deploy** this site. Ask the owner to adjust your role if needed.
3. **Account / product:** Check [Netlify Status](https://www.netlifystatus.com/), any billing or compliance banners on the dashboard, and **Help** / **Support** from Netlify if the error persists.

### 3. Prefer Git-based deploys (recommended)

**Do not rely on drop deploy** for this app. This repo includes [`netlify.toml`](../netlify.toml) with `npm run build`, `publish = ".next"`, and **`@netlify/plugin-nextjs`**, which is the supported path for Next.js with API routes and middleware.

- Connect your **Git** repository: **Add new site** → **Import an existing project** (or link Git under site settings), then push commits to trigger builds (see [§1 Connect Repository](#1-connect-repository)).
- After Git deploys work, you can ignore the drop zone; you do not need to upload build folders manually.

## Troubleshooting: Tickets and Email on Netlify

**Ticket template upload works on localhost but not on Netlify:** Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in Netlify with **Functions** and **Runtime** scope (not only Builds). The upload and ticket-template PATCH routes use the admin client, which requires this key at runtime. Redeploy after adding or changing env vars.

**Ticket shows "00000000" or placeholder text:** The default base is now a clean programmatic design (no baked-in text). If you have a custom ticket template (Admin → Settings → Email & Tickets, or per-event), ensure it has no placeholder text baked into the image; otherwise remove or replace it. Check Admin → Settings → Ticket Layout for correct overlay positions.

**Ticket emails not sent:**
1. Verify `SMTP_USER` and `SMTP_PASS` are set in Netlify env vars with **Functions** and **Runtime** scope.
2. Check Admin → Settings → Email & Tickets for the SMTP status banner.
3. Use "Send test email" to verify SMTP.
4. Ensure PayMongo webhook URL points to `https://YOUR-DOMAIN/api/webhooks/paymongo` and `checkout_session.payment.paid` is subscribed.
5. Redeploy after changing env vars.
