# Wish Tickets Portal

A production-grade event discovery, booking, seat reservation, payment, and QR ticketing platform.

## Stack

- **Frontend:** Next.js 15 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4, Radix UI, Framer Motion, Zustand, TanStack Query, Sonner
- **Backend:** Supabase (Postgres, Auth, Storage, RLS), Next.js API routes
- **Payments:** PayMongo (card, GCash, PayMaya, GrabPay) with webhooks
- **Email:** Nodemailer (Gmail SMTP) for ticket delivery with QR attachments
- **Validation:** Zod on all forms and API payloads

## Features

- **Public:** Homepage with search, category pills, event grid (glassmorphism, teaser video hover), View Details modal
- **Booking:** Event → seat selection (assigned + free seating) → reserve (TTL cart, heartbeat, cross-tab sync) → checkout → payment → confirmation
- **Auth & RBAC:** Supabase Auth (email/password), roles: user, admin, admissions_staff, super_admin; protected routes for dashboard, admin, admissions
- **Admin:** Events CRUD, Venues CRUD, sales/reports
- **Admissions:** Staff login, scan QR tickets, admit and track entries
- **AI:** Optional chatbot (OpenAI) for event discovery and booking help

## Setup

1. **Clone and install**

   ```bash
   npm install
   ```

2. **Supabase**

   - Create a project at [supabase.com](https://supabase.com).
   - Run the SQL in `supabase/migrations/` in order (00001, 00002, 00003) in the SQL Editor.
   - Optionally run `supabase/seed.sql` in the SQL Editor to populate sample venues and events (8 events across categories).
   - Copy Project URL and anon key from Settings → API. For webhooks and admin actions, copy the service_role key.

3. **Environment**

   Copy `.env.example` to `.env.local` and fill in:

   | Variable | Description |
   |----------|-------------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service role key (required for events API, Settings visibility; webhooks, admissions scan) |
   | `PAYMONGO_SECRET_KEY` | PayMongo secret key (optional; if set, checkout uses PayMongo link) |
   | `PAYMONGO_WEBHOOK_SECRET` | PayMongo webhook signing secret |
   | `SMTP_USER` / `SMTP_PASS` | Gmail SMTP (optional; ticket emails) |
   | `SMTP_FROM` | From address for emails |
   | `CRON_SECRET` | Optional secret for HTTP cron routes (e.g. cleanup pending payments, storage orphan delete cron) |
   | `PRINT_TICKET_GEN_CONCURRENCY` | Optional; parallel Sharp pipelines in admin print-ticket `POST /generate` (default **10**, max **32**) |
   | `NEXT_PUBLIC_PRINT_CLIENT_GEN_CONCURRENCY` | Optional; parallel browser requests when generating many tickets (default **10**, max **16**) |

4. **Run**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

### Events and Settings setup checklist

**Important:** If events do not show or Settings does not appear for admin/super_admin, do the following:

1. **Add `SUPABASE_SERVICE_ROLE_KEY`** to `.env.local` (required for both):
   - Supabase Dashboard → Project → Settings → API → copy the **service_role** key (secret)
   - Add `SUPABASE_SERVICE_ROLE_KEY=<paste_key>` to `.env.local`
   - Restart the dev server

2. Run migrations: `npm run db:push` (if using remote DB)

3. Run seed: execute `supabase/seed.sql` in Supabase SQL Editor (or `npm run db:seed` if linked)

4. Set super_admin in SQL Editor:
   ```sql
   UPDATE profiles SET role = 'super_admin'
   WHERE id = (SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL');
   ```

## Cron: cleanup pending payments

A cron job cleans up **pending** or **failed** payments that are older than **3 minutes**: it releases their seats (`event_seats` → available), deletes any tickets, and marks the booking and payment as failed so the dashboard shows the failure and seats become available again.

- **Supabase pg_cron:** The migration `00079_cleanup_pending_payments_cron.sql` creates a `cleanup_stale_pending_payments()` function and schedules it every 2 minutes via `pg_cron`. Enable the `pg_cron` extension in Supabase Dashboard (Database → Extensions) if not already enabled, then run `npm run db:push` to apply the migration.
- **Alternative (API route):** `GET /api/cron/cleanup-pending-payments` — use `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret` header; schedule via cron-job.org or similar.

## Cron: storage orphan cleanup (daily)

Removes Storage objects in the same **allow-listed buckets** as Admin → Settings → Storage cleanup (`ticket-images`, `ticket-qr`, `event-images`, etc.) when nothing in the DB references them.

- **HTTP route:** `GET` or `POST /api/cron/storage-orphans-delete` — `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret`. Optional query `?bucket=ticket-images` to process one bucket (recommended if a full run might exceed your host timeout).
- **Supabase pg_cron:** Migration `00228_storage_orphans_daily_cron.sql` schedules **`invoke_storage_orphans_delete_cron()`** daily at **08:00 UTC** via **`pg_net`** → your deployed URL. Enable **pg_net** and **Vault**, then add secrets `storage_orphans_cron_url` and `storage_orphans_cron_bearer` (same value as `CRON_SECRET` on the app). Comments in the migration include example `vault.create_secret` calls.

## Print tickets: bulk “Send selected” email

Admin **Print Tickets → Send selected** queues `print_ticket_email_jobs`. With the progress UI open, the browser calls `POST /api/admin/print-tickets/send-selected-email/jobs/{jobId}/process` on an interval (each call sends at most one batch). Requires **`SUPABASE_SERVICE_ROLE_KEY`** on the server and migration **`00166_lock_print_ticket_email_job_by_id_for_creator.sql`**. Optional: schedule `POST /api/cron/print-ticket-email-jobs` with `CRON_SECRET` if you want sends to continue without the tab open.

**Manual Ticket Distribution** uses `manual_assignment_email_jobs` and `POST /api/admin/assignments/{id}/send-email/jobs/{jobId}/process` (migration **`00167_manual_assignment_email_jobs.sql`**) with the same ZIP rules as print-ticket bulk email.

## Scripts

- `npm run dev` — Dev server with Turbopack
- `npm run build` — Production build
- `npm run start` — Start production server
- `npm run lint` — ESLint

## Project structure

- `app/` — App Router pages and API routes
- `components/` — UI and feature components
- `lib/` — Supabase clients, PayMongo, QR, email, auth helpers
- `store/` — Zustand stores (reservation cart)
- `supabase/migrations/` — SQL schema and RLS

## Roles

- **user** — Browse events, book, view own dashboard (default for signups).
- **admin** — Full access to `/admin`: events, venues, reports.
- **admissions_staff** — Access admissions scan (code-based) to admit tickets.

Set roles in Supabase `profiles` (e.g. via SQL or a one-off script).

## Documentation

- [Admin Operating Instructions](docs/ADMIN_OPERATING_INSTRUCTIONS.md) — Step-by-step guide for admins: creating events, venues, seating, promo codes, admissions, reports, and day-of operations.
- [Email Setup](docs/EMAIL_SETUP.md)
- [PayMongo Setup](docs/PAYMONGO_SETUP.md)
- [Netlify Deploy](docs/NETLIFY_DEPLOY.md)
