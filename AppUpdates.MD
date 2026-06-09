# App Updates

Changelog of app updates and edited files. Update this file whenever you edit project files. Reference this file for history and future plans.

---

## 2026-05-30 – Admitted tickets drilldown: Group → Section → table

- `components/admin/reports/kpi-detail-modal.tsx` – remove admission-code accordion level; show admission code per row after Category; group row shows name only (no “GROUP” label).

**Updates:** Admitted Tickets KPI modal hierarchy is Group/Section/tickets; staff code is in the table, not a top-level group.

---

## 2026-05-30 – Event countdown in progress + public listing grace period

- `lib/event-public-visibility.ts` – Manila calendar helpers, countdown/in-progress/listing state.
- `lib/event-public-visibility.test.ts` – unit tests for grace-period logic.
- `components/event-card.tsx` – show **Event in progress** after showtime; countdown until start.
- `supabase/migrations/00248_event_public_list_grace_period.sql` – `event_is_publicly_listed`, `public_list_visible_until` column, updated RPCs/RLS.
- `lib/events/event-grid-server.ts` – list events through day after event date (Manila).
- `lib/events/categories-server.ts` – same grace filter for category chips.

**Updates:** Events stay on home grid/banners through the calendar day after the show (Asia/Manila); cards label in-progress after countdown hits zero. Direct event slug pages unchanged. Reports untouched.

---

## 2026-05-27 – Sales & Reports dashboard snapshot cache

- `supabase/migrations/00247_event_dashboard_report_cache.sql` – `event_dashboard_report_cache` table, invalidation function, triggers on bookings/tickets/assignments/admissions/sections/prices/events.
- `lib/reports/dashboard-cache.ts` – TTL helpers, sentinel dates for all-time filters, admin read/write.
- `lib/reports/dashboard-cache.test.ts` – unit tests for cache helpers.
- `app/api/admin/dashboard/route.ts` – cache-first serve path, in-flight dedupe, `X-Dashboard-Cache` headers.

**Updates:** Admin dashboard JSON is cached per event and date range (30s TTL on event day, 5m otherwise); invalidated when sales or admission data changes. Drill-down APIs stay live.

---

## 2026-05-23 – Session guard: restore visible-tab heartbeat

- `components/providers/session-guard-provider.tsx` – 60s heartbeat when tab is visible + immediate run on `visibilitychange` to visible; `hasActiveCart` true on `/book` and `/checkout` routes; shared `runSessionGuard` for nav debounce and timer.

**Updates:** Fixes auto-logout after 5+ minutes on one page (nav-only guard never refreshed `last_heartbeat_at`). Hidden tabs skip the interval; resume on focus still runs guard once.

---

## 2026-05-23 – Navigation-only session auth

- `components/providers/session-guard-provider.tsx` (new) – Auth resync, session state, and activity flags on mount and route change only (debounced).
- `lib/supabase/auth-resync.ts` – Replaced `attachSupabaseAuthResyncOnResume` with one-shot `resyncAuthWithServer`.
- `components/providers/theme-provider.tsx` – Removed heartbeats, interaction listeners, tab-resume, idle timer, and auth polling.
- `app/layout.tsx` – Wired `SessionGuardProvider`.
- `lib/inactivity-config.ts` – `shouldForceInactivityLogout` uses max of `last_activity_at` and `last_heartbeat_at`.
- `app/admin/settings/session-security-settings.tsx` – Updated inactivity helper copy.
- Removed per-component `attachSupabaseAuthResyncOnResume` from header, book page, event dialog, admin user settings, event administrators.

**Updates:** Session telemetry and auth reconciliation no longer poll or listen for mouse/keyboard/focus events; they run on full page load and client navigation only.

---

## 2026-05-23 – VSS buyer email resolution from database

- `lib/reports/revenue-buyer-vss.ts` – Resolve buyer email from assignment, `bookings.buyer_email_override`, `profiles.email`, then Auth user email (matches admissions/drilldown).

**Updates:** “Show buyers emails” and buyer rows now include Paymongo purchaser emails, not only manual distribution recipient emails.

---

## 2026-05-23 – VSS buyer emails copy dialog

- `components/admin/reports/vss-buyer-breakdown.tsx` – “Show buyers emails” opens a dialog with unique emails (one per line), copy-all and comma-separated actions.

**Updates:** Admins can copy the buyer email list from VSS Breakdown without expanding each row.

---

## 2026-05-23 – VSS buyer breakdown seat/row display

- `lib/reports/revenue-buyer-vss.ts` – Load seat labels by sold ticket `seat_id` (batched via `loadOfflinePackSeatMaps`) instead of a single `event_seats` query capped at 1000 rows.

**Updates:** VSS Breakdown (Buyer List View) now shows Section, Row, and Seat for all Paymongo buyers, not only seats that happened to fall in the first DB page.

---

## 2026-05-23 – API bandwidth and client performance

- `hooks/use-debounced-value.ts` (new) – Shared debounce hook for typeahead/search inputs.
- `components/admin/seat-configurator.tsx` – Debounced seat template search (350ms) to avoid per-keystroke API calls.
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` – 300ms pause between successful ticket image generation batches.
- `app/[eventSlug]/book/book-page-queries.ts` – Book flow React Query cache: manifest/prices 30s stale, seats 8s, 5min gc.
- `hooks/use-event-availability-realtime.ts` – Debounced (400ms) invalidation scoped to seat availability keys only.
- `components/event-card-details-dialog.tsx` – Dropped full-seat prefetch on dialog open (manifest, prices, add-ons only).
- `components/providers/query-provider.tsx` – Global defaults: 30s staleTime, 5min gcTime, refetchOnMount true (not always).
- `app/api/admin/bookings/search/route.ts` – Server-side RPC filters, min 3-char query, 100-result cap.
- `components/admin/ticket-resending.tsx` – Client validation aligned with 3-char minimum search.
- `lib/geography-fetch-cache.ts` (new) – In-memory cache for province/city geography fetches.
- `components/admin/venue-form.tsx`, `components/admin/create-new-venue-dialog.tsx`, `components/event-filter-dialog.tsx` – Use geography cache.

**Updates:** Reduced duplicate large JSON fetches on book flow, admin search, and geography dropdowns.

---

## Completed (from initial planning)

| Phase | Scope |
|-------|-------|
| 1 | Project bootstrap, design system, Wish orange, glassmorphism, blobs |
| 2 | Supabase, Auth, RBAC (user, admin, admissions_staff, usher) |
| 3 | Homepage, search, category pills, event grid, View Details modal |
| 4 | Booking flow, seat selection (assigned + free), reservation engine, TTL cart, heartbeat, cross-tab sync |
| 5 | PayMongo, webhooks, QR tickets, Nodemailer email delivery |
| 6 | Protected routes, user dashboard, admin CRUD (events, venues, reports), admissions scan |
| 7 | AI chatbot (OpenAI) |
| 8 | Polish: Zod validation, Sonner toasts, Sharp, SEO, env docs |

---

## Post-launch fixes

- **GET /api/events 500** – RLS recursion fix (00004), simplified events query, error handling
- **reservation_items quantity** – Set `quantity: 1` for seat items in reservation API
- **Supabase connect & deploy** – `supabase init`, `db:push`, `db:seed`, `db:setup` scripts in package.json

---

## Future plans

- Link project: `npx supabase link --project-ref <ref>`
- One-command deploy: `npm run db:setup`
- Admin UI for role assignment (currently via SQL/Studio)
- Optional: seed as migration (e.g. `00005_seed_data.sql`) instead of separate seed script

---

## Changelog (ongoing)

## 2026-05-27 – Admissions scan action buttons readable in light mode

- `app/admissions/scan/page.tsx`

**Updates:** “Select Scan Action” mode buttons and container use `[html[data-theme=light]_&]` darker amber/emerald/sky text and borders so labels stay readable on the light surface.

## 2026-05-22 – Daily online sales stacked chart by group

- `lib/reports/daily-online-sales-by-group.ts`
- `lib/reports/dashboard-metrics.ts`
- `lib/reports-section-grouping.ts`
- `components/admin/reports/daily-online-sales-stacked-bar.tsx`
- `components/admin/reports/reports-content.tsx`
- `hooks/use-dashboard-data.ts`

**Updates:** New collapsible stacked bar chart below “Sections with Highest Sales Online”: X-axis = date (Asia/Manila), Y-axis = online tickets sold, stacks = section groups (`section_group`).

## 2026-05-22 – VSS buyer list lazy ticket load

- `lib/reports/revenue-buyer-vss.ts`
- `app/api/admin/dashboard/vss-buyers/route.ts`
- `hooks/use-vss-buyer-data.ts`
- `components/admin/reports/vss-buyer-breakdown.tsx`

**Updates:** VSS Breakdown (Buyer List View) loads lightweight buyer summaries first; expanding a buyer fetches one row per ticket (quantity expanded) only for that buyer. Removed aggregated Qty column from the detail table.

## 2026-05-22 – Reduce Netlify function consumption

- `app/[eventSlug]/book/book-page-queries.ts`
- `hooks/use-event-availability-realtime.ts`
- `components/providers/theme-provider.tsx`
- `components/booking/floating-cart-timer.tsx`
- `components/admissions-connection-indicator.tsx`
- `lib/supabase/middleware.ts`
- `app/[eventSlug]/page.tsx`

**Updates:** Removed 15s book availability polling (realtime + visible-tab focus refetch). Slowed/paused session heartbeat (120s, hidden tab), floating cart poll (60s, only when cart active), admissions ping (60s). Middleware skips `getUser` for guests on public routes. Public event pages use `revalidate = 60` ISR; book/checkout stay dynamic.

## 2026-05-21 – Sections online sales chart: % of online total (incl. shared)

- `lib/reports/sections-online-sales-chart.ts` (new)
- `lib/reports/dashboard-metrics.ts`
- `components/admin/reports/sections-horizontal-bar.tsx`
- `components/admin/reports/kpi-detail-modal.tsx`

**Updates:** “Sections with Highest Sales Online” uses 100% = all online ticket sales, not section capacity. Shared report API (`buildDashboardMetricsReport`) now returns the same `sections_sales` shares; KPI “Online Sales” drilldown still shows % of capacity.

## 2026-05-18 – VSS breakdown: fix Unmapped online sales

- `lib/reports/resolve-ticket-event-section.ts` (new)
- `lib/reports/dashboard-metrics.ts`
- `lib/reports/priority-guests-report.ts`

**Updates:** VSS seat allocation now resolves ticket sections via event seats, section-only tickets, and venue seat fallbacks (same as admissions). Online sales should land in Patron/Gold/etc. instead of Unmapped; empty Unmapped rows are hidden.

## 2026-05-18 – Priority Guests card collapsed by default

- `components/admin/reports/priority-guests-card.tsx`

**Updates:** Priority Guests card loads collapsed; expand to view orders and sections.

## 2026-05-18 – Priority Guests drill-down: section only

- `lib/reports/priority-guests-report.ts`
- `hooks/use-dashboard-data.ts`
- `components/admin/reports/priority-guests-card.tsx`

**Updates:** Expanded order view shows section names only (seat and qty removed). Section resolution uses the same offline-pack seat/section maps as tickets so assigned, free, and standing sections display correctly.

## 2026-05-18 – Priority Guests: per-order counts and seat drill-down

- `lib/reports/priority-guests-report.ts` (new)
- `lib/reports/dashboard-metrics.ts`
- `lib/reports-section-grouping.ts`
- `hooks/use-dashboard-data.ts`
- `components/admin/reports/priority-guests-card.tsx`
- `components/admin/reports/reports-content.tsx`

**Updates:** Priority Guests is built in a dedicated query (always included on the dashboard). Counts are by order (one booking = one), not per ticket. The card lists orders; clicking an order expands section and seat lines.

## 2026-05-18 – Reports Priority Guests section restored

- `lib/reports/dashboard-metrics.ts`
- `components/admin/reports/priority-guests-card.tsx`

**Updates:** Dashboard metrics no longer overwrite RPC priority-guest counts with an empty ticket recompute; RPC data is used as fallback and unassigned tickets get an Unassigned row. Priority Guests card shows PWD/Senior/Pregnant/Others summary in the header when counts are present.

## 2026-05-14 – Meta Pixel from app config + Global Settings

- `supabase/migrations/00246_meta_pixel_app_config.sql`
- `lib/meta-pixel-config.ts`
- `lib/meta-pixel-config-server.ts`
- `app/api/admin/settings/route.ts`
- `app/admin/settings/meta-pixel-settings.tsx`
- `app/admin/settings/settings-tabs-shell.tsx`
- `app/layout.tsx`
- `next.config.ts`
- `AppUpdates.MD`

**Updates:** Super admins can set Pixel ID and toggle Meta Pixel on/off under Global Settings (tab saves toggle immediately; Pixel ID uses Save). Production root layout loads the official `fbevents` snippet when enabled. CSP allows `connect.facebook.net`.

## 2026-05-11 – Teaser direct-to-storage upload for Netlify

- `app/api/admin/upload/route.ts`
- `components/admin/event-form.tsx`
- `AppUpdates.MD`

**Updates:** Added signed-upload URL issuance for teaser videos and switched admin teaser upload to direct Supabase Storage upload from browser, bypassing Netlify function body limits that caused 500s on large multipart requests.

## 2026-05-11 – Teaser upload auto-save resilience for event PATCH

- `app/api/admin/events/[id]/route.ts`
- `components/admin/event-form.tsx`
- `AppUpdates.MD`

**Updates:** Wrapped event PATCH in try/catch with explicit invalid-date 400 response and made teaser upload keep success state even when follow-up auto-save fails (show actionable toast instead of hard failure).

## 2026-05-11 – Teaser upload catch-path HTTP status fix

- `app/api/admin/upload/route.ts`
- `AppUpdates.MD`

**Updates:** Reused storage error classification in the route catch block and added request-size/check-constraint detection so teaser upload failures no longer default to generic 500 responses.

## 2026-05-11 – Teaser upload error classification fix

- `app/api/admin/upload/route.ts`
- `AppUpdates.MD`

**Updates:** Reclassified Supabase storage upload failures so teaser video bucket MIME/size misconfigurations and policy denials return actionable 4xx errors instead of generic 500 responses.

## 2026-05-09 – Event countdown-only line (21D  19H  1M  20S)

- `components/event-card.tsx`
- `AppUpdates.MD`

**Updates:** Seconds read as tight `20S` (same as `D`/`H`/`M`). Removed trailing `To Go`; kept wide gaps (`gap-x-[2ch]`) between the four groups.

## 2026-05-09 – Event countdown spacing (21D  19H  1M  20 S  To Go)

- `components/event-card.tsx`
- `AppUpdates.MD`

**Updates:** Widened gaps between countdown segments (`gap-x-[2ch]`), spaced seconds value from the `S` suffix, renamed `Sec` → `S`.

## 2026-05-09 – Event countdown: emphasize digits vs labels

- `components/event-card.tsx`
- `AppUpdates.MD`

**Updates:** Countdown values use larger `text-base` + wish yellow digits; unit letters (`D`/`H`/`M`/`Sec`) and trailing `To Go` use smaller `text-xs` + muted foreground color.

## 2026-05-09 – Event card countdown compact format (21D 19H 5M 45Sec To Go)

- `components/event-card.tsx`
- `AppUpdates.MD`

**Updates:** Event countdown on cards is now unpadded (`21D 19H 5M 45Sec To Go` style) instead of zero-padded verbose labels.

## 2026-05-09 – Event card countdown: days + hours + minutes + seconds

- `components/event-card.tsx`
- `AppUpdates.MD`

**Updates:** Replaced the coarse “X Days to go” line with a live `DD Days HH Hours MM Minutes SS Seconds To go` countdown to `event_start`, updating every second until the event starts.

## 2026-05-09 – Fix event-card hover CTA build type error

- `components/event-card.tsx`

**Updates:** Removed an impossible tuple-length guard (`EVENT_CARD_HOVER_ACTIONS.length === 1`) that failed TypeScript during production build.

## 2026-05-09 – Allow poster cover overflow outside card on hover

- `components/event-card.tsx`

**Updates:** Removed clipping on event card wrappers (`overflow-visible`) so the rotating poster cover can extend beyond the card bounds during the book-open hover animation.

## 2026-05-09 – Event card idle poster render fix

- `app/globals.css`

**Updates:** Changed the poster cover layer from absolute inset to a normal in-flow `relative` block with explicit `height: 100%` so Next/Image `fill` consistently renders in idle state while preserving the hover-open transform.

## 2026-05-09 – Event card poster hidden-state fix

- `app/globals.css`

**Updates:** Ensured the inside CTA panel is hidden by default (`opacity: 0`) and only fades in on hover while the cover rotates; added explicit cover reset transform so poster image remains visible when not hovered.

## 2026-05-09 – Event card cover stays visible when not hovered

- `app/globals.css`

**Updates:** Book-cover reveal now triggers on hover only (not focus-within), and the cover layer is explicitly stacked above inside copy (`z-index: 2`) so poster image remains visible by default.

## 2026-05-09 – Event card book-cover hover reveal with randomized CTA

- `components/event-card.tsx`
- `app/globals.css`

**Updates:** Switched hover animation to a book-cover style (`transform-origin: left`, `rotateY(-80deg)`), revealing `Click Here To` + randomized CTA copy behind the poster on each hover/focus.

## 2026-05-09 – Light mode pulse ring switched to orange

- `app/globals.css`

**Updates:** `choose-seats-pulse` now uses an orange outward pulse in light theme (`[data-theme="light"]`) while preserving the existing pulse color in dark mode.

## 2026-05-09 – Choose seats outer pulse wave (keep default button shape)

- `components/event-card-details-dialog.tsx`
- `app/globals.css`

**Updates:** Added a scoped `choose-seats-pulse` animation to the modal `Choose seats` CTA that only emits an outward pulse ring; no circular button conversion, no scale-on-hover, and reduced-motion is respected.

## 2026-05-09 – Revert animated Choose seats CTA

- `components/event-card-details-dialog.tsx`
- `app/globals.css`

**Updates:** Reverted the Uiverse animation experiment and restored the original Wish orange `Choose seats` button styling in the event details modal.

## 2026-05-09 – Disable legacy manual ticket-gen cron worker

- `supabase/migrations/00245_disable_manual_assignment_ticket_gen_cron.sql`

**Updates:** Unschedules stale pg_cron job names for `invoke_manual_assignment_ticket_gen_worker` and drops the legacy DB function to stop recurring Vault-secret warning logs in environments that no longer use this worker path.

## 2026-05-09 – ESLint/build cleanup (prefer-const, unused vars, hook/img rules)

- `app/api/admin/events/[id]/assign-seats/route.ts`
- `app/[eventSlug]/book/book-page-client.tsx`
- `app/api/admin/print-tickets/section-zips/route.ts`
- `components/admin/event-admissions-codes.tsx`
- `components/admin/events-table.tsx`
- `components/event-card-details-dialog.tsx`
- `components/event-card.tsx`
- `components/footer.tsx`
- `components/home-event-banner-carousel.tsx`
- `lib/reports/dashboard-metrics.ts`
- `lib/manual-assignment-email/send-manual-assignment-ticket-batch.ts`

**Updates:** Unblocks strict `npm run build` ESLint/typecheck (fixed `prefer-const`, chunked-ticket-row `unknown` assertion, removals / small refactors elsewhere).

## 2026-05-09 – Manual distribution ZIP / status text contrast in light mode

- `app/admin/events/[id]/assign-seats/assign-seats-distribution-column.tsx`

**Updates:** ZIP in progress, amber warnings, emerald success, red errors, complimentary tag, and “Edit email” use `[html[data-theme=light]_&]` foreground classes so yellow/amber lines are readable on white cards while keeping dark-theme styling unchanged.

## 2026-05-09 – Improve disabled ZIP button readability

- `app/admin/events/[id]/assign-seats/assign-seats-distribution-column.tsx`

**Updates:** Updated `Create Zip` and `Delete ZIP` button disabled styles to enforce higher-contrast text/background, icon color, and full opacity with stronger utility overrides so labels remain readable while still indicating disabled state.

## 2026-05-09 – Manual distribution email: chunked ticket loads + SMTP + process timeout

- `lib/manual-assignment-email/send-manual-assignment-ticket-batch.ts`
- `lib/send-manual-distribution-email.ts`
- `app/api/admin/assignments/[id]/send-email/jobs/[jobId]/process/route.ts`

**Updates:** Large sends no longer use one oversized PostgREST `.in(...)` on `tickets` / seats / sections (avoids failed loads for hundreds of IDs). Missing SMTP now throws instead of skipping silently. Increased `…/send-email/jobs/.../process` `maxDuration` to 300s for large ZIP-link + SMTP sends.

## 2026-05-09 – Manual assign confirm: fast path for large seat counts

- `app/api/admin/assignments/[id]/confirm/route.ts`

**Updates:** Confirmation no longer calls `ensureSeatEncryptedQrForSale` once per seat (thousands of sequential DB round-trips that kept `POST …/confirm` pending and blocked image-generation loops). Seats load `encrypted_qr` in chunked reads; deterministic keys fill tickets in-memory; parallel waves backfill missing `event_seats.encrypted_qr`; ticket creation and marking seats sold use chunked inserts/updates (`maxDuration` 120).

## 2026-05-09 – Assign seats API: chunked queries and safer partial rollback

- `app/api/admin/events/[id]/assign-seats/route.ts`

**Updates:** Large manual assigns no longer blow PostgREST URL/query limits via oversized `.in(...)` batches; section flow reserve rollback on chunk failure releases only seats already marked reserved before retrying deletes on the assignment.

## 2026-05-09 – Fix bulk send selected print tickets (large `.in` + access)

- `lib/array-chunks.ts` (new)
- `lib/print-tickets/print-tickets-bulk-access.ts` (new)
- `lib/print-tickets/resolve-print-ticket-ids-for-send.ts`
- `app/api/admin/print-tickets/send-selected-email/jobs/route.ts`
- `app/api/admin/print-tickets/send-selected-email/jobs/[jobId]/process/route.ts`
- `app/api/admin/print-tickets/send-selected-email/jobs/[jobId]/cancel/route.ts`
- `app/api/admin/print-tickets/send-selected-email/route.ts`
- `app/api/admin/print-tickets/section-zips/route.ts`

**Updates:** Chunked Postgres `.in(...)` lookups when resolving many selected seats/slots so large sends no longer silently resolve to zero rows; enqueue/sync send routes use the service client after the same bulk scope check as ZIP routes; aligned job process/cancel and section ZIP auth helpers with shared `print-tickets-bulk-access`.

## 2026-05-09 – Re-enabled ZIP worker cron at 1-minute interval

- `supabase/migrations/00241_enable_print_folder_zip_worker_cron_minutely.sql`

**Updates:** Restored `invoke-print-folder-zip-worker` cron scheduling to run every minute and explicitly unscheduled the legacy 30-second delayed ZIP cron job.

## 2026-05-09 – Rescheduled inactivity and payment cleanup cron jobs

- `supabase/migrations/00240_reschedule_inactivity_and_payment_cleanup_cron.sql`

**Updates:** Changed `invoke-inactivity-sweeper` cron from every minute to every 30 minutes and `cleanup-pending-payments` cron to run hourly.

## 2026-05-09 – Removed ZIP worker cron and switched to client nudges

- `supabase/migrations/00239_disable_print_folder_zip_worker_cron.sql`
- `components/admin/print-tickets-tab.tsx`

**Updates:** Added a migration to unschedule `invoke-print-folder-zip-worker` cron jobs and added a once-per-minute client-side full ZIP status refresh while jobs are active so the worker is triggered from the app during zipping.

## 2026-05-09 – Removed back navigation from change payment method card

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Removed the `Back to seat selection` button from the change-payment-method state so only the primary continue action and `Cancel order` remain.

## 2026-05-09 – Tuned event card outline and glow for light mode

- `app/globals.css`

**Updates:** Added theme-specific event card frame gradient and hover glow tokens, then wired `.event-card-frame` to those variables so light mode uses a warmer, more legible orange outline/glow while dark mode keeps the original styling.

## 2026-05-09 – Lazy-loaded seat details on section/group expand

- `components/admin/seat-configurator.tsx`
- `app/api/admin/events/[id]/seating/route.ts`
- `lib/events/event-grid-server.ts`

**Updates:** Changed seat configurator to fetch section metadata without full seat payload on initial load and load seat details only when section/group cards are expanded, reducing initial response size and bandwidth. Added optional `includeSeats/sectionIds` support in seating API and included a small type-safety fix in event grid server search filtering.

## 2026-05-09 – Fixed collapse init race in Seat Configurator groups

- `components/admin/seat-configurator.tsx`

**Updates:** Prevented first-load collapse initialization from running during the empty prefetch state, so section groups now reliably render collapsed once group data arrives.

## 2026-05-09 – Improved print tickets light-mode text contrast

- `components/admin/print-tickets-tab.tsx`

**Updates:** Replaced low-contrast pastel text classes with light/dark-aware foreground colors across print-ticket action buttons, status chips, warning text, and send actions so labels remain readable in light mode while preserving dark-mode styling.

## 2026-05-09 – Seat configurator groups now default collapsed on load

- `components/admin/seat-configurator.tsx`

**Updates:** Added first-load group-collapse initialization in seat configurator so all section group cards start collapsed on page load, while preserving normal user-driven expand/collapse behavior afterward.

## 2026-05-09 – Fixed admin events title click requiring multiple attempts

- `components/admin/events-table.tsx`

**Updates:** Replaced row-level title navigation behavior with an explicit link on the event title cell, ensuring single-click navigation to event details and avoiding focus/double-click interaction issues.

## 2026-05-09 – Replaced event-grid skeletons with progress loader

- `components/event-grid.tsx`

**Updates:** Swapped the event cards skeleton loading state for a compact progress loader so category/search filtering now shows a loading indicator instead of placeholder event cards.

## 2026-05-09 – Made admissions login link public in header menus

- `components/header.tsx`

**Updates:** Removed role-gating for `Admissions Staff Login` navigation link so unauthenticated/public users can always access code-gated admissions routes from desktop and mobile header menus.

## 2026-05-09 – Added modal close button beside share action

- `components/event-card-details-dialog.tsx`

**Updates:** Added a `Close Window` button next to `Share` in event details dialog actions; it now closes the modal via `onOpenChange(false)` for a clear explicit close action.

## 2026-05-09 – Category dropdown now shows only published event categories

- `lib/events/categories-server.ts`
- `components/category-pills.tsx`

**Updates:** Reworked category source to query distinct categories from currently published upcoming events and trimmed the client fallback list to `ALL` only, so dropdown options now reflect only categories that actually have published events.

## 2026-05-09 – Differentiated dark select hover and removed sticky checked highlight

- `components/ui/select.tsx`

**Updates:** Updated select item states so dark mode uses a distinct darker hover (`white/12`) while light mode keeps amber-muted hover, and removed persistent checked-item background to prevent the selected option (e.g. `ALL`) from staying highlighted when hovering other items.

## 2026-05-09 – Fixed light-mode select item hover/readability

- `components/ui/select.tsx`

**Updates:** Updated select dropdown item highlight and checked-state styles to use theme-aware foreground text with amber-muted backgrounds, preventing unreadable text in light-mode hover/selection states.

## 2026-05-09 – Hide home banner when filters are active

- `app/home-client.tsx`

**Updates:** Added active-filter detection so the home banner carousel is shown only when category is `all` and search is empty; this prevents static banner slides from appearing as if category/search filtering is not working.

## 2026-05-09 – Expanded event search to venue and city like-matching

- `lib/events/event-grid-server.ts`

**Updates:** Updated split-mode event search to apply tokenized partial matching across event title, venue name, city, and province (case-insensitive), so queries like `wish`, `wishdate`, `rewrite`, and `dagupan` return matching events such as `Wishdate Rewrite Dagupan`.

## 2026-05-09 – Raised desktop landscape video holder to 68vh

- `components/event-card-details-dialog.tsx`

**Updates:** Increased desktop landscape-video holder height to `min(68vh,680px)` for a larger in-dialog playback area while keeping portrait and image holder sizing unchanged.

## 2026-05-09 – Raised desktop landscape video holder to 64vh

- `components/event-card-details-dialog.tsx`

**Updates:** Increased desktop landscape-video holder height to `min(64vh,640px)` for slightly larger 16:9 presentation while preserving all other dialog media sizing rules.

## 2026-05-09 – Increased landscape video holder height once more

- `components/event-card-details-dialog.tsx`

**Updates:** Nudged desktop landscape-video holder height up again to `min(60vh,600px)` for fuller 16:9 playback coverage while keeping all other media sizing behavior intact.

## 2026-05-09 – Further increased desktop landscape video holder

- `components/event-card-details-dialog.tsx`

**Updates:** Increased desktop landscape-video holder height again (`min(56vh,560px)`) to better accommodate 16:9 teaser playback while preserving existing portrait/video and image sizing behavior.

## 2026-05-09 – Increased desktop video holder height

- `components/event-card-details-dialog.tsx`

**Updates:** Increased desktop media holder height when active view is video (especially landscape videos) so video content fits more fully in the container while keeping image-view sizing behavior unchanged.

## 2026-05-09 – Added light/dark control on shared report page

- `app/reports/shared/[token]/shared-report-client.tsx`

**Updates:** Added a Light/Dark theme toggle to shared reports and set initial page theme to light on load, while restoring the previous app theme when leaving the shared report route.

## 2026-05-09 – Retuned dark background to deep blue range

- `app/globals.css`

**Updates:** Updated dark theme app background to use requested endpoints with `#183048` as the lightest center and `#060b14` as the darkest outer/base color, including intermediate blue stops for smoother falloff.

## 2026-05-09 – Applied Midnight Ember dark theme background

- `app/globals.css`

**Updates:** Updated dark theme app background variables to a centered Midnight Ember radial gradient (`#3d2914` to `#0d0806`) with matching dark base color for a warm low-light backdrop.

## 2026-05-09 – Disabled dark hero background image mount

- `components/app-chrome.tsx`

**Updates:** Removed `BackgroundImage` mounting from the shared app chrome so dark theme no longer shows the concert backdrop image and only uses configured theme background layers.

## 2026-05-09 – Removed dark theme background overlay image

- `app/globals.css`

**Updates:** Disabled the dark-theme app background overlay by setting `--app-bg-overlay` to `none`, leaving a clean solid dark base while keeping the light-theme background overlay unchanged.

## 2026-05-09 – Added theme-specific global background overlays

- `app/globals.css`
- `app/layout.tsx`

**Updates:** Added app background CSS variables for light and dark themes, applying the requested Copper Forge top glow (`black` base + orange radial) in dark mode while preserving the light amber radial style in light mode through a shared layout wrapper.

## 2026-05-09 – Tuned radial endpoint to warm gold

- `app/layout.tsx`

**Updates:** Adjusted the global radial gradient endpoint color to `#fec45f` for a brighter warm-gold finish while preserving the existing background composition.

## 2026-05-09 – Updated amber endpoint to coral tone

- `app/layout.tsx`

**Updates:** Changed the global radial gradient endpoint color from warm amber to `#f97e5f` for a softer coral finish while keeping the same background pattern.

## 2026-05-09 – Lightened amber background endpoint

- `app/layout.tsx`

**Updates:** Softened the global amber radial background by lightening the darkest yellow stop from `#f59e0b` to `#fbbf24` for a gentler top-surface glow.

## 2026-05-09 – Restored amber glow radial app background

- `app/layout.tsx`

**Updates:** Updated the global background overlay back to the amber radial glow style with bottom-centered light falloff and full-canvas background sizing.

## 2026-05-09 – Switched to center-lit radial app background

- `app/layout.tsx`

**Updates:** Replaced the Ivory + Slate Mist background with a single radial gradient centered on the viewport so the middle remains brightest and softly darkens toward the edges.

## 2026-05-09 – Applied Ivory + Slate Mist global background

- `app/layout.tsx`

**Updates:** Updated the global app background overlay to the Ivory + Slate Mist pattern with cool slate corner radials and a subtle white-to-slate vertical gradient for a cleaner neutral look.

## 2026-05-09 – Restored Morning Haze global background

- `app/layout.tsx`

**Updates:** Reverted the global app background overlay from Aurora Silk Fade back to the layered Morning Haze radial gradients anchored at the bottom-center.

## 2026-05-09 – Switched app background to Aurora Silk Fade

- `app/layout.tsx`

**Updates:** Replaced the centered orange soft glow with a full-screen Aurora Silk Fade linear gradient (purple to warm coral) in the global app background overlay layer.

## 2026-05-09 – Applied orange soft-glow blend app background

- `app/layout.tsx`

**Updates:** Updated the global background overlay to a centered orange radial glow with reduced opacity and `mix-blend-mode: multiply` for a softer blended ambient look across the app.

## 2026-05-09 – Updated global background to warm top orange glow

- `app/layout.tsx`

**Updates:** Replaced the Morning Haze gradients with a top-centered warm orange radial glow on white, including blur and non-repeating background behavior, while preserving the global layered app shell wrapper.

## 2026-05-09 – Switched global background to Morning Haze

- `app/layout.tsx`

**Updates:** Replaced the single amber radial app background with a layered “Morning Haze” gradient stack using yellow, amber, and pink glows from the bottom-center while keeping the existing global wrapper/foreground layering.

## 2026-05-09 – Applied global amber radial background pattern

- `app/layout.tsx`

**Updates:** Wrapped the app shell in a full-screen relative container with an absolute amber radial gradient background layer and moved app content into a `z-10` foreground wrapper so the new background pattern is applied app-wide.

## 2026-05-09 – Locked desktop media holder width across carousel slides

- `components/event-card-details-dialog.tsx`

**Updates:** Removed dynamic inline aspect-ratio sizing from modal media holders so carousel slides keep a constant desktop holder width; only holder height now changes by active media orientation.

## 2026-05-09 – Carousel orientation sizing now caches per media type

- `components/event-card-details-dialog.tsx`

**Updates:** Replaced shared modal media dimensions with separate cached image/video dimensions, preventing portrait values from being lost between carousel switches and ensuring desktop holder height reliably updates per active portrait or landscape item.

## 2026-05-09 – Desktop media holder now uses explicit orientation heights

- `components/event-card-details-dialog.tsx`

**Updates:** Replaced desktop max-height/aspect-ratio combination with explicit orientation-based holder heights and desktop aspect-ratio reset, so carousel transitions between portrait and landscape now visibly change media holder height while preserving mobile behavior.

## 2026-05-09 – Carousel holder now adapts per active slide

- `components/event-card-details-dialog.tsx`

**Updates:** Removed fixed embed-branch `aspect-video` behavior for image view and switched to orientation-aware aspect ratio when image dimensions are available, so carousel holder height changes correctly per active portrait/landscape media.

## 2026-05-09 – Active media orientation now drives holder height

- `components/event-card-details-dialog.tsx`

**Updates:** Holder height now resolves from the currently selected media type (image vs video) with per-switch dimension reset, so desktop height changes reliably when toggling between portrait and landscape content.

## 2026-05-09 – Option A media-ratio sizing tightened on desktop

- `components/event-card-details-dialog.tsx`

**Updates:** Applied strict frame-ratio sizing behavior in event details modal by keeping portrait media holders tall while reducing non-portrait holder max height further, making desktop transitions between portrait and landscape content visibly distinct.

## 2026-05-09 – Media holder now resizes on view switch

- `components/event-card-details-dialog.tsx`

**Updates:** Reset modal media dimensions when switching to video view so portrait sizing from a previous image does not persist; holder height now shrinks immediately for non-portrait content and then adapts once active media dimensions load.

## 2026-05-09 – Keep modal width fixed for portrait media

- `components/event-card-details-dialog.tsx`

**Updates:** Removed portrait-based dialog width reduction so the overall event details card no longer shrinks; portrait handling now affects only the media holder sizing.

## 2026-05-09 – Reliable portrait media sizing in event modal

- `components/event-card-details-dialog.tsx`

**Updates:** Improved portrait detection by applying dimensions from both image and video load callbacks, then increased portrait desktop media max height so poster-oriented assets render visibly taller while keeping landscape sizing unchanged.

## 2026-05-09 – Taller desktop media area for portrait assets

- `components/event-card-details-dialog.tsx`

**Updates:** Added orientation-aware desktop media sizing in the event details modal so portrait images/videos use a taller max height, improving poster prominence without changing landscape behavior or mobile layout.

## 2026-05-09 – Narrowed desktop description column

- `components/event-card-details-dialog.tsx`

**Updates:** Adjusted desktop modal grid column ratio to give slightly more width to the media/actions column and reduce the description column width for improved visual balance.

## 2026-05-09 – Centered desktop modal action buttons

- `components/event-card-details-dialog.tsx`

**Updates:** Center-aligned the desktop-only action button row beneath the event media in the details modal; mobile action alignment remains unchanged.

## 2026-05-09 – Desktop modal columns decoupled for tall description

- `components/event-card-details-dialog.tsx`

**Updates:** Refactored desktop event details modal into explicit left and right column wrappers so left actions stay directly under media, while the right column fills height with a growing description area and metadata anchored at the bottom.

## 2026-05-09 – Desktop modal buttons kept under media

- `components/event-card-details-dialog.tsx`

**Updates:** Adjusted desktop grid row sizing in the event details modal so action buttons stay directly below the teaser/video poster on the left, while keeping the right-side metadata area anchored at the bottom.

## 2026-05-09 – Fixed desktop right-column bottom anchoring

- `components/event-card-details-dialog.tsx`

**Updates:** Defined explicit desktop grid rows and full-height right column in the event details modal so date/time and address stay anchored at the bottom while description expands in the available space above.

## 2026-05-09 – Event details metadata pinned to bottom on desktop

- `components/event-card-details-dialog.tsx`

**Updates:** On desktop, the right column now spans the full modal content height with date/time and address pinned to the bottom, so the description area above can expand further. Mobile layout remains unchanged.

## 2026-05-09 – Event details modal desktop two-column layout

- `components/event-card-details-dialog.tsx`

**Updates:** From `lg` and up, modal body uses a two-column grid: poster/video and primary actions on the left (actions under media), description and date/venue on the right. Mobile keeps the previous stacked layout and bottom action bar.

## 2026-05-09 – Improved VSS table readability in light theme

- `components/admin/reports/vss-breakdown-table.tsx`
- `components/admin/reports/vss-buyer-breakdown.tsx`

**Updates:** Added light-theme-only row/header surface and hover contrast tweaks for VSS list/buyer tables, and strengthened value accent colors (complimentary/distributed/online sales) for readability in light mode. Dark mode remains unchanged.

## 2026-05-09 – Sales & Reports readability improved in light theme

- `app/admin/reports/reports-page-client.tsx`
- `components/admin/reports/kpi-cards.tsx`
- `components/admin/reports/priority-guests-card.tsx`
- `components/admin/reports/sections-horizontal-bar.tsx`

**Updates:** Added light-mode-only contrast improvements for filters and share panel surfaces, KPI/priority accent text, and chart axis/grid/tooltip styling. Dark mode styles remain unchanged.

## 2026-05-09 – Centered manual distribution loading panel

- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx`

**Updates:** Wrapped the loading-state container with flex centering (`min-h-[60vh]`, `items-center`, `justify-center`) so the panel loader is centered instead of pinned to the top-left on Manual Distribution.

## 2026-05-09 – Seat Hold groups are collapsible and default collapsed

- `components/admin/seat-hold.tsx`

**Updates:** Added per-group accordion behavior (`expandedGroupNames`) for Seat Hold group cards (Patron/Gold/Silver/etc.) with chevrons and `aria-expanded`. Groups now load collapsed by default and expand only when clicked.

## 2026-05-09 – Admin events list now opens event on first click

- `components/admin/events-table.tsx`

**Updates:** Replaced row navigation via `startTransition(router.push)` with a direct `router.push` helper and local `openingEventId` state to drive the progress overlay. This avoids first-click no-op behavior where loading showed but route didn’t always advance until a second click.

## 2026-05-09 – Scan action buttons always colorized (inactive + active)

- `app/admissions/scan/page.tsx`

**Updates:** Updated non-selected scan-action options to retain mode color identity (sky/emerald/yellow) with subtle tinted backgrounds and borders; selected state remains stronger for the active mode.

## 2026-05-09 – Scan action buttons now colorize by selected mode

- `app/admissions/scan/page.tsx`

**Updates:** Active scan-action options now apply matching tinted backgrounds and borders by mode: yellow for Admit, emerald for Re-entry, and sky for Validate, instead of neutral active fill.

## 2026-05-09 – Light mode tuning for outline buttons and input fields

- `components/ui/button.tsx`
- `components/ui/input.tsx`
- `app/admissions/scan/page.tsx`

**Updates:** Added light-theme-only overrides to `secondary`/`outline` button variants and shared `Input` border/background for better contrast while preserving dark mode. Admissions scan sidebar search/list fields now use softer light-theme backgrounds instead of dark overlays.

## 2026-05-09 – Loader dots now color-cycle through brand palette

- `app/globals.css`

**Updates:** Updated loading dots to animate shared color cycling (black → orange → yellow → purple → black) with eased timing and staggered per-dot delays, replacing fixed one-color-per-dot assignments.

## 2026-05-09 – Removed duplicated loader rows across screens

- `components/event-card.tsx`
- `components/ui/floating-progress.tsx`
- `app/home-stream-fallback.tsx`

**Updates:** Removed secondary `WishLoadingDots` rows and non-determinate loading tracks where the new dot-spinner is already shown, so each loading state renders a single loader row (no duplicated/doubled animation).

## 2026-05-09 – Loader deduplicated and no bottom loading line

- `components/ui/route-loading.tsx`
- `components/wish-boot-shell.tsx`
- `app/globals.css`

**Updates:** Removed duplicate secondary loader row (`WishLoadingDots`) from main loading body and boot shell, removed the bottom animated loading track from boot shell, and disabled loader-group rotation so only the dot jump animation remains.

## 2026-05-09 – Unified loading animation to rotating multi-dot style

- `components/ui/route-loading.tsx`
- `components/wish-boot-shell.tsx`
- `app/globals.css`

**Updates:** Replaced the old ring/dot loader with a Uiverse-inspired rotating 5-dot jump animation used by shared loading primitives (`WishLoadingSpinner`, `WishLoadingDots`) and the boot shell. Palette updated to black, orange, yellow, and purple variants.

## 2026-05-09 – Reserved Seating parent card is collapsible by default

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Added `isReservedSeatingExpanded` state (default `false`) and converted the new `Reserved Seating` wrapper into an accordion-style header button with chevrons and `aria-expanded`, showing child reserved seating cards only when expanded.

## 2026-05-09 – Grouped assigned seat carts under Reserved Seating

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Wrapped all assigned/reserved seating selection cards (map and grid section blocks) inside a new parent `glass-light` card with a `Reserved Seating` header, keeping existing section cards and behavior intact.

## 2026-05-09 – Choose-seats loading now respects light theme

- `components/ui/route-loading.tsx`

**Updates:** Replaced fullscreen hardcoded black gradient (`from-black via-[#0b0311] to-black`) with theme tokens (`from-[var(--background)] via-[var(--surface)] to-[var(--background)]`) so event/choose-seats loading screens follow light/dark mode.

## 2026-05-09 – Default app theme is light

- `app/layout.tsx`
- `components/providers/theme-provider.tsx`

**Updates:** SSR and no-flash script use `data-theme="light"`; `getInitialTheme` / `ThemeProvider` initial state / `useTheme` fallback default to light. Existing `localStorage` and `profiles.theme_preference` still override for returning users.

## 2026-05-09 – Event cards theme-aware details (light surface in light mode)

- `components/event-card.tsx`
- `components/event-card-skeleton.tsx`

**Updates:** Replaced fixed `#1a1a1a` / zinc text with `var(--surface)`, `text-foreground`, `text-foreground-muted`, and `var(--wish-yellow-text)` for the countdown. Poster area uses `var(--event-card-media-fade)`. Focus ring uses `var(--wish-yellow)` and `ring-offset-[var(--surface)]`. Skeleton pulses and labels follow the same tokens.

## 2026-05-09 – Thinner yellow liner on home event cards

- `app/globals.css`
- `components/event-card.tsx`
- `components/event-card-skeleton.tsx`

**Updates:** Reduced `.event-card-frame` padding from 2px to 1px and set inner radii to 19px (20px outer minus 1px) so the gradient rim stays even.

## 2026-05-09 – Home event cards: yellow gradient frame, no tilt/glow outline

- `components/event-card.tsx`
- `components/event-card-skeleton.tsx`
- `app/globals.css`

**Updates:** Replaced glass/orange multi-layer shadows and 3D tilt with a Uiverse-style yellow gradient border (`163deg`), dark `#1a1a1a` inner panel, outer yellow hover glow, and inner `scale(0.98)` on hover. Removed radial glow overlay and poster image hover zoom/outline.

## 2026-05-09 – Seat cards now default to collapsed

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Changed initial booking experience state so reserved-seat cards and Free Seating start collapsed by default instead of auto-expanding on first load.

## 2026-05-09 – Moved seat legend below canvas above zoom controls

- `app/[eventSlug]/book/book-page-client.tsx`
- `components/seat-picker/seat-selector.tsx`

**Updates:** Relocated the seat-status legend from the map card header to the bottom-left area below the canvas, with zoom controls remaining at the bottom-right on the same row.

## 2026-05-09 – Title now colors each group label independently

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Updated grouped card title rendering to color each group label (e.g., Patron, Gold) independently when sections inside that label share one color, while keeping only mixed-label entries neutral.

## 2026-05-09 – Restored grouped title color for uniform section colors

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Re-enabled grouped seat-card title coloring so titles use the section color when all sections in the group share the same valid color, with neutral fallback when colors are mixed.

## 2026-05-09 – Removed dynamic color from grouped card titles

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Disabled section-color-based styling for grouped seat card titles so labels always render in neutral foreground color.

## 2026-05-09 – Title color now requires matching explicit section colors

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Tightened title-color logic so grouped card headers use a section color only when every section has the same explicit valid hex color; otherwise the title falls back to white.

## 2026-05-09 – Group title infers Patron/Gold from section names

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Added a fallback title inference that groups sections by the first word of each section name/code (e.g., PATRON LEFT/RIGHT and GOLD LEFT/RIGHT now render as “Patron • Gold”) when explicit section-group fields are not present.

## 2026-05-09 – Group title fallback now uses real group labels

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Updated reserved card title fallback to derive and display actual section-group names (e.g., Patron, Gold, or Patron • Gold) instead of the literal “Section Group” label.

## 2026-05-09 – Group card titles now use section-group naming

- `app/[eventSlug]/book/book-page-client.tsx`
- `app/[eventSlug]/book/book-page-types.tsx`

**Updates:** Replaced multi-section title chips with a single section-group title, using group color only when all sections in the group share the same color; mixed-color groups now render the title in white.

## 2026-05-09 – Fixed mobile card title and quick-pick sizing

- `app/[eventSlug]/book/book-page-client.tsx`
- `components/seat-picker/seat-selector.tsx`

**Updates:** Prevented grouped section titles from overflowing on mobile by allowing wrap/shrink in the card header, and updated Quick Seat Selection to a mobile-first grid where the section dropdown is wider than quantity.

## 2026-05-09 – Grouped reserved titles now use per-section colors

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Changed grouped reserved seating headers to render each section label with its own section swatch color (instead of one shared color), so sections like Gold Left/Gold Right display in gold while other labels keep their respective colors.

## 2026-05-09 – Moved zoom controls below canvas at card bottom-right

- `components/seat-picker/seat-selector.tsx`

**Updates:** Repositioned seat-map zoom controls from the top toolbar area to the bottom-right under the canvas container so controls appear at the lower-right corner of the card.

## 2026-05-09 – Forced quick-pick controls into single row

- `components/seat-picker/seat-selector.tsx`

**Updates:** Updated quick seat selection layout to a no-wrap horizontal row with fixed quantity/button sizing and flexible section selector width so controls no longer stack.

## 2026-05-09 – Grouped quick-pick controls into one titled container

- `components/seat-picker/seat-selector.tsx`

**Updates:** Wrapped quick seat selection controls in a single titled container and aligned Select section, Quantity, and Add to Selection horizontally for cleaner layout under the zoom toolbar.

## 2026-05-09 – Auto-select dialog actions aligned in one row

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Updated the auto-select replace/append confirmation footer layout so Cancel, Select New Seats, and Append to Current render horizontally in a single right-aligned action row.

## 2026-05-08 – Added section quick-pick auto seat selection

- `components/seat-picker/seat-selector.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Added a new quick-pick panel below map zoom controls with section + quantity dropdowns and an “Add to Selection” action that auto-selects the closest available seats, including replace-or-append confirmation when seats are already selected in the same section.

## 2026-05-08 – Section card titles now follow section colors

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Colored reserved seating card titles using each section’s configured swatch color so card headers visually match section color coding in the legend.

## 2026-05-08 – Reserved seating cards now use section names

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Updated reserved seating card headers to display grouped section names joined by ` • ` (for example, `S1 • S2 • S3`) instead of a generic “Reserved Seating” label.

## 2026-05-08 – Kept Event Seat Plan stable across refetches

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Added a stable fallback to server-provided `seat_map_image_urls` when client event refetch temporarily omits image URLs, preventing the Event Seat Plan panel from disappearing in buyer view.

## 2026-05-08 – Enabled seat-plan image caching in buyer book view

- `app/[eventSlug]/book/components/BookSeatPlanPanel.tsx`

**Updates:** Removed forced cache-busting from buyer Event Seat Plan carousel so large seat-map images can reuse browser cache and load significantly faster on repeat opens/refreshes.

## 2026-05-08 – Centered buyer seat-map canvas in card

- `components/seat-picker/seat-selector.tsx`

**Updates:** Center-aligned the seat-map canvas container within the buyer seat card so the map stays visually centered when zoomed out or when content width is smaller than the card.

## 2026-05-08 – Clamped buyer canvas to image bounds

- `components/seat-picker/seat-selector.tsx`

**Updates:** Prevented buyer seat canvas dimensions from expanding beyond the uploaded seat-map image when image data exists, eliminating outlier-coordinate canvas inflation that made Fit width resolve to a tiny zoom.

## 2026-05-08 – Fit-width uses trimmed seat cluster span

- `components/seat-picker/seat-selector.tsx`

**Updates:** Changed buyer fit-width basis to the trimmed seat-cluster span (instead of full image width) and ignored extreme seat-coordinate outliers, so Fit width lands on the expected visible map scale and zoom-out floor follows that value.

## 2026-05-08 – Persisted buyer fit-width lock across layout recalcs

- `components/seat-picker/seat-selector.tsx`

**Updates:** Prevented automatic layout-key recalculations from clearing the buyer Fit width locked zoom floor, so wheel/pinch zoom-out cannot slip below the last explicit Fit width action.

## 2026-05-08 – Stabilized buyer fit-width baseline to image width

- `components/seat-picker/seat-selector.tsx`

**Updates:** Updated fit-width basis to use seat-map image width (when available) instead of seat-span width, preventing tiny buyer zoom baselines caused by sparse/outlier seat coordinates and keeping fit-width floor behavior user-expected.

## 2026-05-08 – Fixed buyer fit-width baseline source

- `components/seat-picker/seat-selector.tsx`

**Updates:** Removed DOM `scrollWidth`-based fit-width computation (which over-counted buyer canvas area) and restored fit-width/floor calculations to use layout fit basis so buyer zoom baseline matches visible seat content.

## 2026-05-08 – Locked fit-width floor to clicked value

- `components/seat-picker/seat-selector.tsx`

**Updates:** Added a persistent zoom floor captured from the exact Fit width action so wheel/pinch/button zoom-out cannot pass below the user-selected fit-width baseline until layout changes.

## 2026-05-08 – Corrected fit-width baseline using DOM width

- `components/seat-picker/seat-selector.tsx`

**Updates:** Reworked fit-width zoom computation to use rendered canvas width from the scroll container (`scrollWidth`) so fit-width lands at the true visual baseline and zoom-out floor matches what users see.

## 2026-05-08 – Live-clamped fit-width zoom floor

- `components/seat-picker/seat-selector.tsx`

**Updates:** Switched zoom-out clamping to compute the fit-width floor live from current container/canvas metrics during wheel, pinch, and button actions so users cannot scroll below fitted width.

## 2026-05-08 – Enforced fit-width zoom floor clamp

- `components/seat-picker/seat-selector.tsx`

**Updates:** Added a state-level clamp that keeps current zoom at or above the fit-width minimum at all times, ensuring wheel/pinch/button interactions cannot drift below the fitted zoom-out floor.

## 2026-05-08 – Locked zoom-out to fit-width floor

- `components/seat-picker/seat-selector.tsx`

**Updates:** Made fit-width the dynamic minimum zoom so mouse wheel, pinch, and zoom-out button cannot zoom farther out than the fitted canvas width, including resize-aware floor updates.

## 2026-05-08 – Hydrated book page with server event data

- `app/[eventSlug]/book/page.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`
- `app/[eventSlug]/book/book-page-queries.ts`

**Updates:** Passed the server-fetched event payload into the booking client as initial query data so event title and seat plan panel render immediately on first load while client refetch runs in the background.

## 2026-05-08 – Added already-registered signup dialog

- `app/signup/page.tsx`

**Updates:** Replaced the plain already-registered signup toast with a polished dialog that explains the account exists and provides clear one-click actions for Sign In and Reset Password.

## 2026-05-08 – Clarified signup 422 handling

- `app/signup/page.tsx`

**Updates:** Normalized email input before signup, added explicit guardrails for empty/mismatched email confirmation, and improved Supabase signup error handling so `already registered` and `422` failures show actionable guidance.

## 2026-05-08 – Reduced booking seat-plan first-load lag

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Removed a duplicate initial availability refetch and replaced repeated seat-list filtering with section-indexed seat maps so large seat plans render and expand faster on first load.

## 2026-05-08 – Added first-load seat plan image auto-retry

- `components/seat-map-image-carousel.tsx`

**Updates:** Added bounded automatic retry for cache-busted seat-map images when `disableImageCache` is enabled so transient first-load image failures recover without requiring a manual page refresh.

## 2026-05-08 – Fixed post-refactor booking build type regressions

- `app/[eventSlug]/book/book-page-cart-sync.ts`
- `app/[eventSlug]/book/book-page-actions.ts`
- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Corrected reservation payload typing for server `/me` responses, aligned refresh action callback signature with the typed payload handler, and restored a local `sleep` helper used by booking availability retry effects so `next build` succeeds again.

## 2026-05-08 – Fixed checkout Select controlled-state warning

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Kept the special-request `Select` controlled for its full lifecycle by binding `value` directly to `specialRequestType` instead of toggling between `undefined` and string values, removing uncontrolled-to-controlled warnings.

## 2026-05-08 – Restored runtime sanitizeStatusText import

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Added `sanitizeStatusText` as a runtime import from `book-page-types` after extraction so event-status normalization no longer throws `ReferenceError` on book page render.

## 2026-05-08 – Fixed runtime AvailabilityHttpError import

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Switched `AvailabilityHttpError` from a type-only import to a runtime import so `instanceof AvailabilityHttpError` checks in the booking page no-seating guard no longer throw a `ReferenceError`.

## 2026-05-08 – Finalized book page orchestration extraction

- `app/[eventSlug]/book/book-page-client.tsx`
- `app/[eventSlug]/book/book-page-cart-sync.ts`

**Updates:** Removed remaining in-file types/helpers/availability transport from the booking client and finished delegating server-item mapping and reservation merge logic to extracted modules so `book-page-client.tsx` now acts as an orchestration shell.

## 2026-05-08 – Chunked booking page client into modular files

- `app/[eventSlug]/book/book-page-client.tsx`
- `app/[eventSlug]/book/book-page-types.tsx`
- `app/[eventSlug]/book/book-page-availability.ts`
- `app/[eventSlug]/book/book-page-queries.ts`
- `app/[eventSlug]/book/book-page-derived.ts`
- `app/[eventSlug]/book/book-page-cart-sync.ts`
- `app/[eventSlug]/book/book-page-actions.ts`
- `app/[eventSlug]/book/components/BookProgressOverlay.tsx`
- `app/[eventSlug]/book/components/BookHeaderActions.tsx`
- `app/[eventSlug]/book/components/BookSeatPlanPanel.tsx`
- `app/[eventSlug]/book/components/BookSeatExperience.tsx`
- `app/[eventSlug]/book/components/BookEmptyState.tsx`

**Updates:** Split booking page logic into dedicated query, availability, derived-state, cart-sync, and UI modules; wired the client shell to use extracted hooks/components while preserving existing booking behavior and loading flows.

## 2026-05-08 – Fixed Refresh Seats initial-load guard init order

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Moved `isInitialBookDataLoading` below the `event-prices` query declaration so `pricesLoading` is initialized before use, resolving the runtime `ReferenceError` on book page render.

## 2026-05-08 – Refresh Seats waits for initial booking data load

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Added an initial-load guard for `Refresh Seats` so it stays disabled and no-ops while first-load booking queries are still loading (availability RPCs, pricing, add-ons), preventing refresh actions from competing with initial page hydration.

## 2026-05-08 – Refresh Seats now actively refetches prices

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Updated the `Refresh Seats` flow to cancel and immediately refetch `event-prices` for the current event id before refetching availability, so price changes are pulled right away instead of waiting on a later invalidation cycle.

## 2026-05-08 – Expanded pricing row controls for true right alignment

- `components/admin/seat-pricing.tsx`

**Updates:** Made the section control row container flex-grow (`flex-1`) with min-width handling so the sale controls group can use `ml-auto` against full row width and align to the card’s right edge.

## 2026-05-08 – Anchored sale controls to card right edge

- `components/admin/seat-pricing.tsx`

**Updates:** Refined the sale controls container to use `ml-auto` without full-width behavior so the toggle, label, percentage stepper, and computed sale price sit flush on the right side of each section card.

## 2026-05-08 – Renamed and right-aligned sale percentage controls

- `components/admin/seat-pricing.tsx`

**Updates:** Changed section pricing label from `Early bird (%)` to `Sale Amount (Percentage)` and right-aligned the sale control group so the label, percentage stepper, and computed sale price sit on the right side of each row.

## 2026-05-08 – Moved orange outline from Fit width to pricing dropdown

- `components/seat-picker/seat-selector.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Removed the orange-highlighted treatment from the `Fit width` control and applied the orange outline to the `Pricing & availability by section` dropdown card so emphasis now sits on section pricing visibility.

## 2026-05-08 – Parallelized all booking data warm-up by event id

- `app/[eventSlug]/book/book-page-client.tsx`
- `components/event-card-details-dialog.tsx`

**Updates:** Started add-ons query from the same early `eventIdForAvailability` path used by availability/pricing so buyer data fetches begin in parallel, and expanded `Choose seats` prefetch to include add-ons with prices + manifest + seats for synchronized hydration.

## 2026-05-08 – Aligned price loading timeline with seats availability

- `app/[eventSlug]/book/book-page-client.tsx`
- `components/event-card-details-dialog.tsx`

**Updates:** Price query now keys/enables by `eventIdForAvailability` (same early id path as manifest/seats) so pricing starts as soon as availability can start, and `Choose seats` prefetch now includes `/prices` alongside availability prefetch to reduce lag between seats rendering and price hydration.

## 2026-05-08 – Fixed second nullable price formatting compile path

- `components/booking/inline-cart.tsx`

**Updates:** Added a null-safe guard for section early-bird line totals so `itemTotalCents` is only formatted when present, resolving the remaining TypeScript build failure in the cart pricing rows.

## 2026-05-08 – Fixed build break from nullable seat price formatting

- `components/booking/inline-cart.tsx`

**Updates:** Tightened the early-bird seat price render guard to require both base and computed seat price values before formatting, resolving the production build TypeScript error (`number | null` passed to `formatPrice`).

## 2026-05-08 – Show draft seat-fetch notice only when seats are truly unresolved

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Scoped the “System is fetching seats…” draft banner to real unresolved loading states (loading/fetching/retrying/empty fallback with no seats) so it no longer persists after seats are already rendered, preventing false perception that seat loading failed.

## 2026-05-08 – Removed hardcoded fallback pricing while seat data warms

- `app/[eventSlug]/book/book-page-client.tsx`
- `components/booking/inline-cart.tsx`

**Updates:** Replaced misleading hardcoded `₱500.00` fallback pricing with “Updating price…” states when section prices are not loaded, and blocked checkout while ticket section prices are still unresolved to prevent incorrect totals during transient seat/data warm-up.

## 2026-05-08 – Added automatic DB self-heal for event seat linkage drift

- `app/api/events/[id]/availability/route.ts`

**Updates:** Availability API now performs a throttled repair pass that corrects `event_seats.event_id` rows drifting from their owning event when the seat’s `event_section_id` belongs to the current event, curing a common event-specific data anomaly that can cause seats to disappear despite valid section setup.

## 2026-05-08 – Removed temporary availability debug chip

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Removed the temporary on-page availability diagnostics chip from the booking header while keeping all underlying seat-loading stability and fallback logic intact.

## 2026-05-08 – Removed hard seat-count gates that hid rendered sections

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Replaced strict `mapSeats.length`/`gridSeats.length` render guards with visibility-group based guards and switched per-section seat sourcing to `assignedSeats` fallback, preventing seat UI from disappearing when seat buckets are temporarily empty while section groups are already renderable.

## 2026-05-08 – Relaxed seat rendering filters to avoid false empty fallback

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Adjusted visibility filtering so configured assigned layout groups/sections still render when seat rows are temporarily missing, and blocked the empty-seat fallback whenever assigned layout exists. This targets UI render-layer drops after successful availability fetches.

## 2026-05-08 – Added atomic full-availability recovery for split-response mismatch

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Added a consistency check for manifest/seat section-id mismatch (both calls can be `ok` but non-overlapping) and automatic fallback to a single full availability payload to restore coherent seat rendering. Extended debug chip with `mismatch=yes/no` for quick production verification.

## 2026-05-08 – Added on-page availability diagnostics for production tracing

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Added a temporary buyer-page debug chip that shows manifest/seats query states, API error codes, and response header traces (`x-availability-branch`, `x-availability-request-id`) so production-only seat loading issues can be diagnosed from one screenshot.

## 2026-05-08 – Disabled false no-seat fallback and added availability trace headers

- `app/[eventSlug]/book/book-page-client.tsx`
- `app/api/events/[id]/availability/route.ts`

**Updates:** Buyer page now shows “No seat map configured” only when API explicitly returns `code=no_seating`; otherwise bookable events stay on a transient seat-fetching message instead of false-empty fallback. Added temporary response headers (`x-availability-branch`, `x-availability-request-id`) on availability API responses to trace server branch decisions directly from DevTools.

## 2026-05-07 – Added adaptive batched seat loading on timeout risk

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Seat availability now starts in parallel as full-load (`all`) for fastest first response, then automatically switches to section-keyed batching when manifest section IDs are available, with timeout fallback that resolves assigned sections from manifest and retries seats in chunks to reduce gateway timeout risk on large events.

## 2026-05-07 – Marked header logo as LCP-priority image

- `components/header.tsx`

**Updates:** Added `priority` to the above-the-fold `/logo.webp` image in the main header to satisfy Next.js LCP guidance and avoid recurring dev warning noise.

## 2026-05-07 – Started availability fetch before full event payload

- `app/[eventSlug]/book/page.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Resolved event id by slug on the server and passed `initialEventId` into the booking client so availability (`manifest` + `seats`) can begin immediately and run asynchronously alongside full event detail loading (including Event Seat Plan media).

## 2026-05-07 – Switched home shell loader to progress-only

- `app/home-stream-fallback.tsx`

**Updates:** Removed the large multi-card skeleton grid from the home shell fallback and kept a centered progress-style loading state (`Loading events` + track) for a cleaner first-load experience.

## 2026-05-07 – Simplified section availability copy

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Removed the “seat(s) remaining” wording from section availability rows and now display only the numeric remaining count as requested.

## 2026-05-07 – Loaded manifest and seats in parallel

- `app/[eventSlug]/book/book-page-client.tsx`
- `components/event-card-details-dialog.tsx`

**Updates:** Updated booking and pre-navigation prefetch to fetch availability `manifest` and `seats` asynchronously in parallel (using full seats payload) so seat rows do not wait on manifest completion and initial seat rendering is less timing-sensitive.

## 2026-05-07 – Updated draft booking banner message

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Replaced the draft preview helper text on the booking page with “System is fetching seats. Come back in a few minutes.” per product copy preference.

## 2026-05-07 – Enforced non-empty manifest responses

- `app/api/events/[id]/availability/route.ts`

**Updates:** Tightened availability API behavior so `mode=manifest` never returns an empty payload; when sections are still empty after retries/fallback, it now returns retryable `503` to avoid false “No seat map configured” rendering on transient backend races.

## 2026-05-07 – Resolved long-time intermittent seat map disappearance

- `app/api/events/[id]/availability/route.ts`
- `app/[eventSlug]/book/book-page-client.tsx`
- `components/event-card-details-dialog.tsx`
- `components/ui/nav-button-with-progress.tsx`

**Updates:** Closed a long-standing intermittent booking issue where seats briefly appeared then disappeared (or showed as unconfigured) by combining pre-navigation availability prefetch, one-time initial fetch on book page, sticky last-known-good seat/section snapshots, and API-level rejection of transient empty `manifest`/`seats` payloads for configured events.

## 2026-05-07 – Rejected transient empty availability payloads

- `app/api/events/[id]/availability/route.ts`

**Updates:** Added guardrails so `manifest`/`seats` split endpoints return `503` (instead of empty payloads) when event sections/seats are already configured, preventing UI from clearing loaded seat maps due to intermittent empty RPC responses.

## 2026-05-07 – Prevented seat UI from clearing after transient refetch

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Reworked sticky availability to cache sections/canvases and seats independently per event so a later transient empty response can no longer wipe already-rendered seat data (the split-second visible then disappearing behavior).

## 2026-05-07 – Guaranteed seat prefetch before book navigation

- `components/ui/nav-button-with-progress.tsx`
- `components/event-card-details-dialog.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Added `onBeforeNavigate` support in nav progress buttons, wired `Choose seats` to prefetch event + availability before route push, and triggered a one-time initial availability refetch on the book page per event id so seat loading does not depend on manual refresh timing.

## 2026-05-07 – Hardened availability API against transient empty RPCs

- `app/api/events/[id]/availability/route.ts`

**Updates:** Added short retry loops when split availability RPCs (`manifest`/`seats`) return empty by re-querying full availability up to three times before responding, reducing intermittent false-empty seat states that can show “No seat map configured” despite valid event setup.

## 2026-05-07 – Prefetched seats from event details modal

- `components/event-card-details-dialog.tsx`

**Updates:** When the event details dialog opens, it now prefetches booking availability manifest and seat inventory in the background using the same React Query keys as the book page so clicking `Choose seats` lands on a warmed cache and faster seat rendering.

## 2026-05-07 – Stabilized intermittent empty seat-map fallback

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Added a short-lived sticky availability snapshot so transient empty manifest/seat responses during polling no longer drop buyers into the false “No seat map configured” state when the event was already loaded with valid seating data.

## 2026-05-07 – Forced logout to clear session lock via admin client

- `app/api/auth/logout/route.ts`
- `app/api/session/logout-mark/route.ts`

**Updates:** Updated logout/session-mark endpoints to write `user_session_activity.logged_in=false` using the service-role admin client (with error logging) so sign-out reliably releases the single-session lock even when RLS blocks user-scoped writes.

## 2026-05-07 – Fixed stale active-session lock after sign-out

- `lib/supabase/auth-hard-reset.ts`

**Updates:** Reordered hard sign-out cleanup to call `/api/auth/logout` before client-side `supabase.auth.signOut()`, ensuring `user_session_activity.logged_in` is cleared while the server still has user context and preventing false “already logged in on another device” errors.

## 2026-05-07 – Replaced browser sign-out prompt with styled dialog

- `components/header-desktop-account.tsx`
- `components/header-mobile-menu.tsx`

**Updates:** Replaced native `window.confirm` sign-out prompts with themed `ConfirmDialog` popups on both desktop and mobile account menus, including destructive styling and loading copy for a smoother sign-out experience.

## 2026-05-07 – Fixed reservation timer TTL jump on book page

- `app/[eventSlug]/book/page.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Passed the server-configured reservation TTL into the book-page timer so optimistic countdown starts at the configured value (e.g., 10) instead of briefly showing the hardcoded 15-minute default before `expires_at` is returned.

## 2026-05-07 – Fixed selected settings dropdown alignment

- `app/admin/settings/settings-tabs-shell.tsx`

**Updates:** Corrected selected-item icon/text alignment in the Global Settings section trigger by rendering the active label with a flex row container that avoids the trigger’s span line-clamp styling conflict.

## 2026-05-07 – Added settings icons and inactivity stepper

- `app/admin/settings/session-security-settings.tsx`
- `app/admin/settings/settings-tabs-shell.tsx`

**Updates:** Replaced inactivity timeout numeric input with the shared number stepper control and added section-specific icons to each settings dropdown item (and active selection label) in Global Settings.

## 2026-05-07 – Applied Maya logo in e-wallet payment badge

- `app/[eventSlug]/checkout/checkout-content.tsx`
- `public/brands/maya-logo.png`

**Updates:** Replaced the text-only Maya badge with the provided Maya logo image in the checkout payment option list.

## 2026-05-07 – Applied QR PH and Mastercard logos in checkout

- `app/[eventSlug]/checkout/checkout-content.tsx`
- `public/brands/qrph-logo.png`
- `public/brands/mastercard-logo.png`

**Updates:** Replaced text-only badges with the provided QR PH and Mastercard image logos in the checkout payment option selector while keeping existing badge styling for the other methods.

## 2026-05-07 – Increased desktop account-menu body blur strength

- `components/header-desktop-account.tsx`

**Updates:** Doubled the desktop account dropdown backdrop blur from `3px` to `6px` for stronger background defocus when the menu is open.

## 2026-05-07 – Fixed dropdown portal runtime error in desktop account menu

- `components/header-desktop-account.tsx`

**Updates:** Resolved `MenuPortal must be used within Menu` by moving the backdrop `DropdownMenuPortal` inside the `DropdownMenu` root while keeping desktop body-only blur/dim behavior.

## 2026-05-07 – Fixed desktop account-menu backdrop layering

- `components/header-desktop-account.tsx`

**Updates:** Moved the desktop username-menu blur/dim overlay into a dropdown portal with stronger z-layering so it reliably appears on desktop while still excluding the header area (`top-16`).

## 2026-05-07 – Scoped account-menu backdrop to app body only

- `components/header-desktop-account.tsx`

**Updates:** Adjusted the desktop account-menu blur/dim overlay to start below the sticky header (`top-16`) so only homepage/app body content is de-emphasized while the header ribbon remains clear.

## 2026-05-07 – Added blur/dim backdrop for desktop account menu

- `components/header-desktop-account.tsx`

**Updates:** Opening the username dropdown now shows a full-page darkened blur backdrop behind the menu so homepage content is visually de-emphasized while account actions are open.

## 2026-05-07 – Added sign-out confirmation prompt in header menus

- `components/header-desktop-account.tsx`
- `components/header-mobile-menu.tsx`

**Updates:** Sign Out now asks for confirmation ("Are you sure you want to sign out?") on both desktop dropdown and mobile side menu before executing session reset/logout.

## 2026-05-07 – Hardened sign-out session cleanup and homepage reload

- `lib/supabase/auth-hard-reset.ts`
- `components/header.tsx`

**Updates:** Sign-out now attempts a full Supabase sign-out first (with local-only fallback), then forces a homepage reload via `window.location.replace("/")` after clearing local header auth state so login session cookies/session state are reliably reset before returning to home.

## 2026-05-07 – Mobile side menu now greets signed-in user

- `components/header-mobile-menu.tsx`
- `components/header.tsx`

**Updates:** Removed the light/dark toggle from the mobile sheet header and replaced it with a greeting label (`Hi <name>`). Greeting now shows profile username/full name (from existing `user.name` resolution), with email prefix fallback.

## 2026-05-07 – Fixed mobile header account type mismatch

- `components/header-mobile-menu.tsx`

**Updates:** Added optional `name` to the mobile header `user` prop type so the account trigger label (`user.name || user.email`) compiles correctly in production builds.

## 2026-05-07 – Themed login active-session warning card

- `app/login/page.tsx`

**Updates:** Restyled the “already logged in on another device” banner to match the portal’s dark glass/orange theme, including updated card background/border and CTA link hover treatment.

## 2026-05-07 – Refined number stepper visual style

- `components/ui/number-stepper.tsx`

**Updates:** Polished the shared `NumberStepper` with a cleaner rounded shell, improved contrast, tighter input typography, and more balanced chevron controls for a more modern settings UI feel.

## 2026-05-07 – Added single-session conflict recovery flow on login

- `app/login/page.tsx`
- `app/clear-session/page.tsx`
- `app/api/auth/login/route.ts`
- `app/api/auth/clear-session/route.ts`

**Updates:** Login now detects active-session conflicts and shows an inline "Clear my session to log in here" banner. Added a dedicated `/clear-session` credentials page and a new API route to clear prior `user_session_activity` state before retrying login.

## 2026-05-07 – Renamed account-not-found dialog action to Retry

- `app/login/page.tsx`

**Updates:** Changed the account-not-found modal dismissal button label from "Close" to "Retry" to better match the sign-in recovery intent.

## 2026-05-07 – Made account-not-found signup CTA yellow

- `app/login/page.tsx`

**Updates:** Updated the "Sign up for free" CTA in the login account-not-found dialog to use a yellow button style for stronger visual emphasis.

## 2026-05-07 – Replaced header burger trigger with account name

- `components/header.tsx`
- `components/header-desktop-account.tsx`
- `components/header-mobile-menu.tsx`

**Updates:** Header account trigger now shows the user identifier text instead of the burger icon when signed in (desktop and mobile). Profile resolution now prefers `profiles.username`, then falls back to `profiles.full_name`.

## 2026-05-07 – Excluded admissions scan route from inactivity timeout

- `components/providers/theme-provider.tsx`

**Updates:** Added `/admissions/scan` as an inactivity-exempt route so idle timeout does not auto-logout ticket admissions users; exemption also propagates in activity payload so stale-session force-logout logic is skipped while scanning.

## 2026-05-07 – Enforced inactivity check before resume heartbeat

- `components/providers/theme-provider.tsx`

**Updates:** Fixed an inactivity auto-logout race where returning to a long-idle tab could send `/api/session/activity` before `/api/session/state`, refreshing `last_activity_at` and bypassing timeout enforcement. Resume and initial sync paths now check session state first, then post interaction only if still authenticated.

## 2026-05-07 – Floating cart timer no longer spams `/api/reservations/me/active` when signed out

- `components/booking/floating-cart-timer.tsx`

**Updates:** `FloatingCartTimer` now subscribes to Supabase auth (`getSession` + `onAuthStateChange`) and only hits `/api/reservations/me/active` when a session is present. Guests no longer generate the stream of 401 console errors visible on every visibility/focus/poll tick, and a 401 response also flips the local auth flag so subsequent ticks short-circuit until the user signs back in.

## 2026-05-07 – "No thanks" on stay-longer dialog now releases the cart immediately

- `components/booking/cart-stay-longer-dialog.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`
- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Added an optional `onDecline` callback to `CartStayLongerDialog`; "No thanks" (and dismissing the dialog via backdrop/escape) now invokes it instead of just closing. On the book page it routes to `handleExpired` so the cart-expired dialog opens, while checkout clears, toasts, calls `notifyReservationExpired`, and redirects back to `/book`. Both paths now release the server cart, flip `user_session_activity.has_active_cart` to false right away, and broadcast the `expire` message that hides the global floating timer in every open tab — without waiting for the countdown to reach zero. Also softened the dialog copy so the consequence of declining is explicit.

## 2026-05-07 – Stopped silent cart-timer auto-extend; clear cart and `has_active_cart` on expiry

- `app/[eventSlug]/book/book-page-client.tsx`
- `app/[eventSlug]/checkout/checkout-content.tsx`
- `components/booking/reservation-timer.tsx`
- `components/booking/floating-cart-timer.tsx`
- `lib/reservation-expire-client.ts`

**Updates:** Removed the half-TTL heartbeat that silently re-issued `extend: true` and made the visible cart countdown snap back to 15:00 every ~7.5 minutes. The “Stay longer?” prompt now fires at the **2-minute** mark on book and checkout (was 60s + 5s); declining lets the timer reach zero. New shared `notifyReservationExpired` helper deletes the server cart, posts `has_active_cart: false` to `/api/session/activity` immediately (no waiting for the next 60s heartbeat), and broadcasts an `expire` message so the global `FloatingCartTimer` and other tabs clear in sync. Wired into the book page's `handleExpired`, the checkout page's inline tick handler, and the floating timer's countdown.

## 2026-05-07 – Removed dismiss button from floating cart timer

- `components/booking/floating-cart-timer.tsx`

**Updates:** Dropped the `X` close affordance and related dismissal state from `FloatingCartTimer` so the entire card is a single tap target that always resumes the active reservation.

## 2026-05-07 – Added global floating cart timer

- `app/api/reservations/me/active/route.ts`
- `components/booking/floating-cart-timer.tsx`
- `components/app-chrome.tsx`

**Updates:** Added a new `/api/reservations/me/active` endpoint that returns the user's most recent still-active reservation cart with its event slug and title, and a `FloatingCartTimer` mounted via `AppChrome` so users browsing other events, the homepage, or other public pages see a clickable countdown that resumes booking on the active event's `/book` page (auto-hidden on book/cart/checkout/confirmation/payment-return for the same event and on admin/admissions/auth flows).

## 2026-05-07 - Fixed delayed post-login auth UI/state sync

- `app/login/page.tsx`
- `app/api/auth/login/route.ts`

**Updates:** Switched post-login navigation to full-page redirect so header auth state reflects immediately, and now upsert `user_session_activity` to `logged_in=true` right after successful server-side login.

## 2026-05-07 - Added confirm-password check on sign-up

- `app/signup/page.tsx`

**Updates:** Added a required Confirm password field and client-side mismatch validation so sign-up cannot submit when password entries differ.

## 2026-05-07 - Added username auth and profile editing

- `supabase/migrations/00244_profiles_username.sql`
- `lib/auth/username.ts`
- `app/api/auth/login/route.ts`
- `app/api/account/profile/route.ts`
- `app/login/page.tsx`
- `app/signup/page.tsx`
- `app/account/page.tsx`
- `app/account/account-page-client.tsx`

**Updates:** Added unique case-insensitive `profiles.username`, email-or-username password login, username capture at sign-up, and editable username in Personal Details via validated server profile updates.

## 2026-05-07 - Throttled activity heartbeat and stopped 401 flood

- `components/providers/theme-provider.tsx`

**Updates:** Added interaction heartbeat throttling and auth-failure guards so `/api/session/activity` no longer floods requests (especially repeated `401 Unauthorized` calls) on public/non-authenticated states.

## 2026-05-07 - Enforced force-logout precedence over heartbeat writes

- `app/api/session/activity/route.ts`
- `app/api/session/state/route.ts`
- `app/api/cron/inactivity-sweeper/route.ts`

**Updates:** Added a guard to block activity heartbeats from updating rows already flagged `force_logout`, and now both state-based and cron-based force-logout updates also set `logged_in=false` immediately so DB state cannot remain `TRUE` after inactivity enforcement.

## 2026-05-07 - Fixed inactivity logout heartbeat race on logged_in flag

- `components/providers/theme-provider.tsx`
- `app/api/session/activity/route.ts`

**Updates:** Prevented post-logout heartbeat/state checks from running during forced idle signout and stopped activity heartbeats from resetting `force_logout`, removing a race that could leave `logged_in=true` after the UI had already logged out.

## 2026-05-07 - Marked session row before hard auth reset

- `lib/supabase/auth-hard-reset.ts`

**Updates:** `hardAuthReset` now posts to `/api/session/logout-mark` before local/server signout so `user_session_activity.logged_in` flips to `false` more reliably across idle and manual reset flows.

## 2026-05-07 - Synced forced middleware logout with session activity state

- `lib/supabase/middleware.ts`

**Updates:** When `force_logout` is detected in middleware, the app now also writes `logged_in=false` (and clears related flags) in `user_session_activity` before signing out, so DB state stays consistent with actual auth logout.

## 2026-05-07 - Added configurable inactivity auto-logout with exceptions

- `app/admin/settings/page.tsx`
- `app/admin/settings/session-security-settings.tsx`
- `app/api/admin/settings/route.ts`
- `app/api/auth/logout/route.ts`
- `app/api/cron/inactivity-sweeper/route.ts`
- `app/api/session/activity/route.ts`
- `app/api/session/logout-mark/route.ts`
- `app/api/session/state/route.ts`
- `components/providers/theme-provider.tsx`
- `lib/inactivity-config.ts`
- `lib/inactivity-config-server.ts`
- `lib/paymongo-pending-booking.ts`
- `lib/supabase/middleware.ts`
- `supabase/migrations/00229_inactivity_session_tracking.sql`

**Updates:** Added admin-controlled inactivity settings (`app_config` toggle + minutes + save button), DB-backed user session activity heartbeat/flags, client auto-logout with cart/PayMongo exceptions, middleware force-logout enforcement, and a minutely cron sweeper that flags stale sessions.

## 2026-05-07 - Fixed mismatch-guard build regression and seat diagnostics warnings

- `app/[eventSlug]/checkout/checkout-content.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Fixed checkout compile error by avoiding early `eventId` reference in effect dependencies and cleaned booking page warnings by removing an unused seat-row variable and duplicate `useEffect` dependency entry.

## 2026-05-07 - Added cross-event mismatch guards for book and checkout

- `app/[eventSlug]/book/book-page-client.tsx`
- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Added client-side guards that detect stale reservation/cart event ID mismatches, clear local cart + pending PayMongo state, and redirect back to the correct book flow so cross-event stale state cannot proceed to checkout.

## 2026-05-07 - Normalized book-page event status fallback

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Added client-side status normalization (blank/unknown -> `draft`) aligned with `/api/events` so malformed event status values no longer incorrectly block seat selection with the unpublished-state message.

## 2026-05-07 - Prioritized confirmation ticket LCP image

- `app/[eventSlug]/confirmation/[bookingId]/confirmation-tickets.tsx`

**Updates:** Marked the first rendered confirmation ticket image with Next.js `priority` so the LCP ticket image is eagerly loaded and the runtime warning is resolved.

## 2026-05-07 - Cleared stale pending PayMongo booking after return

- `lib/paymongo-pending-booking.ts`
- `app/[eventSlug]/checkout/checkout-content.tsx`
- `app/[eventSlug]/payment-return/[bookingId]/page.tsx`

**Updates:** Centralized pending PayMongo booking session helpers and cleared matching stale `bookingId` state on payment-return so a fresh checkout cannot auto-resume and redirect to a previously confirmed booking.

## 2026-05-07 - Added payment-return redirect fallback for failed handoff paths

- `app/[eventSlug]/payment-return/[bookingId]/page.tsx`

**Updates:** Added a defensive timeout redirect to confirmation (`?fromPayment=1`) so payment-success handoff still reaches booking confirmation when popup close or `postMessage` integration fails in embedded/extension-affected browser contexts.

## 2026-05-06 - Bypassed SW caching for payment return/confirmation routes

- `app/sw.ts`

**Updates:** Added a payment-flow navigation matcher and forced `NetworkOnly` handling for `/{eventSlug}/payment-return/{bookingId}` and `/{eventSlug}/confirmation/{bookingId}` to avoid Serwist/Workbox `no-response` errors during fast payment redirect popup flows.

## 2026-05-06 - Aligned seat diagnostics logging with actual empty-state render

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Added a unified `shouldShowEmptySeatFallback` gate and reused it for both empty-state UI and diagnostic logging, preventing false `no_sections_configured` warnings when seats are already visible.

## 2026-05-06 - Added availability split-RPC fallback guard

- `app/api/events/[id]/availability/route.ts`

**Updates:** Added a server-side fallback so if split availability calls (`mode=manifest` / `mode=seats`) unexpectedly return empty arrays, the API automatically retries via full `get_event_availability` and returns non-empty sections/seats when available.

## 2026-05-06 - Reduced false no-sections diagnostics during async availability

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Hardened seat diagnostics/rendering against async race conditions by gating logs until event ID exists, distinguishing manifest-vs-seat mismatches (`manifest_sections_missing`), and replacing misleading no-seat-configured fallback copy when seat rows are present but section metadata has not loaded.

## 2026-05-06 - Corrected seat diagnostics for manifest/seat mismatch

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Updated booking diagnostics to treat seat rows with section IDs as configured seating (even when manifest sections are empty) and added a specific `manifest_sections_missing` diagnostic to avoid false `no_sections_configured` reports.

## 2026-05-06 - Made slug event lookup deterministic

- `supabase/migrations/00234_get_event_by_slug_deterministic.sql`

**Updates:** Replaced non-deterministic `get_event_by_slug` selection (`LIMIT 1` without ordering) with a deterministic priority order that prefers active/latest records, preventing duplicate-slug stale event rows from being selected and causing false empty-availability states.

## 2026-05-06 - Added social brand icons and richer share captions

- `components/event-card-details-dialog.tsx`

**Updates:** Added recognizable platform icons (Facebook, X, Instagram, TikTok) in the event share dropdown and ensured share payload text includes full event description for social post/caption flows (including Facebook quote and copied text for Instagram/TikTok).

## 2026-05-06 - Expanded guest dialog width and stabilized actions row

- `components/guest-signup-dialog.tsx`

**Updates:** Increased guest signup dialog max width and converted footer actions to a responsive grid (`sm:grid-cols-3`) so all three buttons fit without right-edge cropping on wider breakpoints.

## 2026-05-06 - Forced guest dialog padding override

- `components/guest-signup-dialog.tsx`

**Updates:** Applied explicit Tailwind padding overrides (`!p-6 sm:!p-7`) on dialog content and added footer inset padding (`px-1 pb-1`) to ensure consistent spacing around action buttons when shared dialog defaults or utility ordering conflict.

## 2026-05-06 - Added extra guest dialog inner padding

- `components/guest-signup-dialog.tsx`

**Updates:** Added explicit dialog content padding (`p-6 sm:p-7`) and extra spacing above action buttons so the footer row no longer sits too close to card edges.

## 2026-05-06 - Fixed guest signup dialog button clipping

- `components/guest-signup-dialog.tsx`

**Updates:** Adjusted dialog footer button layout so action buttons become equal-width flexible columns on larger screens (`sm:flex-1`, `sm:min-w-0`) instead of overflowing, preventing the right-side “I’ll Explore First” button from being cut off.

## 2026-05-06 - Fixed booking page seat-flow diagnostic init order

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Moved event-status derived flags (`shouldAllowSeatSelectionFlow`, related labels) earlier in the booking component so diagnostics no longer reference them before initialization, fixing runtime `ReferenceError`.

## 2026-05-06 - Fixed booking page guest diagnostic init order

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Resolved runtime `ReferenceError` by moving `isDefinitelyGuest` initialization above seat diagnostics memo usage, preserving the new diagnostic feature without early-access crashes.

## 2026-05-06 - Interleaved home carousel banners across events

- `lib/events/home-banner-server.ts`

**Updates:** Changed home banner slide ordering to round-robin by event slug, so carousel images are mixed across events (e.g., event A banner 1, event B banner 1, event A banner 2, event B banner 2) instead of being grouped event-by-event.

## 2026-05-06 - Added seat fallback diagnostics on booking page

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Added lightweight seat-state diagnostics that classify fallback causes (`availability_fetch_error`, `auth_guest`, `empty_inventory`, etc.) and surface them in both UI helper text and console warnings when seat selection is unavailable.

## 2026-05-06 - SMTP auth failures surfaced explicitly for resend emails

- `lib/confirm-booking.ts`
- `app/api/bookings/[bookingId]/send-email/route.ts`
- `app/api/admin/bookings/[id]/resend-tickets/route.ts`

**Updates:** Detects Gmail SMTP authentication failures (`EAUTH` / `535 BadCredentials`) in booking confirmation email sends and returns a dedicated `smtp_auth_failed` code with actionable settings guidance, instead of a generic delivery error.

## 2026-05-06 - Ticket resend now shows actionable failure reasons

- `app/api/bookings/[bookingId]/send-email/route.ts`
- `app/[eventSlug]/confirmation/[bookingId]/send-tickets-button.tsx`

**Updates:** Mapped `confirmBooking` failure codes to clearer API error messages/statuses and surfaced resend-email failures in the confirmation UI via toast/dialog, so users see why sending failed instead of only a console JSON error.

## 2026-05-06 - Fixed payment-success hydration mismatch overlay

- `components/ui/floating-progress.tsx`

**Updates:** Prevented SSR/client mismatch by delaying `FloatingProgressBar` portal render until after client mount, so payment return and confirmation overlays no longer trigger hydration warnings/errors.

## 2026-05-06 - Hard auth reset for stale mobile sessions

- `app/api/auth/logout/route.ts`
- `lib/supabase/auth-hard-reset.ts`
- `components/header.tsx`
- `app/account/account-page-client.tsx`
- `app/login/page.tsx`
- `app/signup/page.tsx`

**Updates:** Added a best-effort server cookie logout endpoint and a shared client hard-reset helper, then wired login/signup/signout paths to clear both local auth state and server cookies before proceeding so long-idle mobile tabs recover reliably.

## 2026-05-06 - Mobile stale-session auth resync and booking guardrails

- `lib/supabase/auth-resync.ts`
- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Strengthened auth recovery for long-backgrounded mobile tabs (focus/visibility/pageshow/online + periodic resync) and enforced server-truth login checks before seat and section selection to prevent stale client auth drift.

## 2026-05-06 - Resume flow back button switched from yellow to orange

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Changed `Back to seat selection` button color from `wish-yellow` to Tailwind orange (`bg-orange-500`, `hover:bg-orange-400`) per UI request.

## 2026-05-06 - Resume flow back button now uses orange style

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Updated `Back to seat selection` button styling in the Change payment method screen to orange (`wish-yellow`) with matching hover state.

## 2026-05-06 - Resume payment screen now includes cancel order

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Added a destructive `Cancel order` button with confirmation to the Change payment method flow, wired to booking cancellation endpoints and local pending-payment cleanup before returning to seat selection.

## 2026-05-06 - Selected payment badges right-aligned

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Adjusted selected payment value layout to push brand badges to the far right and keep payment label truncated on the left, preventing overlap.

## 2026-05-06 - Selected payment value now shows full logo badges

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Updated selected payment rendering to display full brand badges/icons (same as dropdown options) instead of compact summary chips.

## 2026-05-06 - Restored full brand badges in dropdown options

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Split payment rendering into selected-value vs option-row variants so compact summary chips appear only after selection, while dropdown options again show full branded badges/logos.

## 2026-05-06 - Selected payment value now uses compact badge

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Prevented select-trigger overlap by switching selected payment badges to a compact summary chip (e.g. `Visa/MC`, `BPI/UBP`) while preserving full brand badges in dropdown options.

## 2026-05-06 - Selected payment option badges aligned in one row

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Fixed selected payment option layout by preventing badge wrap and using single-line centered alignment so label and brand badges remain aligned inside the select trigger.

## 2026-05-06 - Payment dropdown now shows branded-style logo badges

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Replaced plain payment chips with branded-style mini logo badges (QRPh, GCash/Grab/Maya, Visa/Mastercard, BPI/UBP) and surfaced them in both selected values and option rows for checkout and resume-payment flows.

## 2026-05-06 - Payment option dropdown now includes method icons

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Added icons and brand chips to payment bucket options (QR PH, GCash/Maya/GrabPay/ShopeePay, Visa/Mastercard, BPI/UBP) in both checkout and resume-payment selectors, including iconized selected values.

## 2026-05-06 - Checkout back path supports payment method changes

- `app/[eventSlug]/checkout/checkout-content.tsx`
- `app/api/checkout/route.ts`
- `app/api/bookings/[bookingId]/paymongo-resession/route.ts`

**Updates:** Added a dedicated resume-payment checkout state so PayMongo cancel/back returns to a "Change payment method" screen, then reopens a fresh PayMongo session for the same pending booking with the newly chosen payment bucket.

## 2026-05-06 - Maya checkout opens via redirect

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Removed embedded PayMongo iframe checkout flow and now redirect to the hosted checkout page directly, fixing Maya/PayMaya refusal to load in-frame.

## 2026-05-06 - Event card hover poster lift 20px

- `components/event-card.tsx`

**Updates:** Set default hover poster lift to 20px translate (reduced-motion lift unchanged at 6px).

## 2026-05-06 - Event card hover poster: bit larger, bit higher

- `components/event-card.tsx`

**Updates:** Increased hover scale slightly (1.1 → 1.12, reduced-motion 1.04 → 1.045) and raised lift (11px → 13px, reduced-motion 5px → 6px).

## 2026-05-06 - Event card hover poster slightly larger

- `components/event-card.tsx`

**Updates:** Bumped hover poster scale a notch (1.08 → 1.1, reduced-motion 1.03 → 1.04) while keeping the current lift so the title stays clear.

## 2026-05-06 - Event card hover poster nudged upward

- `components/event-card.tsx`

**Updates:** Increased hover lift slightly so the poster sits a bit higher while keeping the reduced scale from overlapping the title.

## 2026-05-06 - Event card hover poster clears title overlap

- `components/event-card.tsx`

**Updates:** Reduced hover poster scale/lift and moderated media `translateZ` so enlarged posters no longer cover the title row.

## 2026-05-06 - Event card poster hover uses single smooth transform

- `components/event-card.tsx`

**Updates:** Replaced Tailwind scale/translate class toggles on the poster with one inline `transform` + shared easing, added matching `transition` on the card 3D transform, and animated a soft yellow edge via `box-shadow` to remove hover snap/jank.

## 2026-05-06 - Event details: dissolve for poster and video↔image

- `components/event-card-details-dialog.tsx`

**Updates:** Lengthened crossfade between embedded/direct video and poster image (`duration-500`), disabled pointer events on fully faded layers, and added `animate-in fade-in` on image-only modals so the poster dissolves in instead of popping.

## 2026-05-06 - Poster hover avoids snap until first mouse move

- `components/event-card.tsx`

**Updates:** On pointer enter we now initialize tilt/lift using the card center so the poster’s scale/lift aligns with hover immediately, and lengthened media wrapper transform timing to match the poster easing.

## 2026-05-06 - Smoother poster hover pop transition

- `components/event-card.tsx`

**Updates:** Softened event poster hover motion by switching to longer spring-like cubic-bezier timing for lift/zoom and using motion-aware duration classes, reducing abrupt pop-in/out behavior.

## 2026-05-06 - Hover line now follows overflowed poster

- `components/event-card.tsx`

**Updates:** Moved the light-yellow hover line from a fixed media-frame overlay to the poster image element itself, so the outline tracks the zoomed/overflowed image during hover.

## 2026-05-06 - Poster hover gets subtle yellow glow

- `components/event-card.tsx`

**Updates:** Added a very light yellow hover-only glow overlay around the poster image frame, keeping the effect soft and localized to the media area.

## 2026-05-06 - Balanced availability timeouts and retries

- `app/[eventSlug]/book/book-page-client.tsx`
- `app/api/events/[id]/availability/route.ts`

**Updates:** Raised client availability timeout to 12s, increased Netlify RPC timeout default to 9.5s, reduced retries to 3 attempts with shorter linear backoff, and limited retries to transient timeout/network/5xx/429 conditions to avoid compounded delay loops.

## 2026-05-06 - PayMongo description now uses event title only

- `app/api/checkout/route.ts`
- `app/api/bookings/[bookingId]/paymongo-resession/route.ts`
- `app/admin/refund-lookup/page.tsx`

**Updates:** Removed the `Wish Tickets Portal:` prefix from PayMongo checkout descriptions so hosted payment pages show just the event name; updated refund lookup guidance text to match.

## 2026-05-06 - Event card hover tilt is horizontal only

- `components/event-card.tsx`

**Updates:** Updated pointer tilt math so hover rotation only uses `rotateY` (left/right) and keeps `rotateX` fixed at zero, removing vertical tilt behavior.

## 2026-05-06 - Seat loading now shows blocking progress

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Added a booking-page floating progress state for initial seat availability load and manual seat refresh, with seat-specific message/subtitle/detail and blocking overlay while data is being hydrated.

## 2026-05-06 - Minute auth watchdog reloads on logout drift

- `components/providers/theme-provider.tsx`

**Updates:** Added a 60-second Supabase auth check in `ThemeProvider`; once the tab has observed an authenticated user, it now reloads the page if `getUser()` later returns no user, helping recover from stale client auth state.

## 2026-05-06 - PayMongo checkout modal now full screen

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Made the embedded PayMongo dialog occupy the full viewport and prevented outside-click/pointer-down interactions from dismissing it, so payment only closes via explicit controls.

## 2026-05-06 – Modal overlay blur + elevated glass chrome

- `app/globals.css`
- `components/ui/dialog.tsx`
- `components/ui/floating-progress.tsx`

**Updates:** Added `.wish-modal-backdrop` (viewport blur behind modals/progress), `.glass-elevated` with `--glass-elevated-bg`, and wired Radix dialog overlays plus `FloatingProgressBar` to use them; centered dialogs now use elevated glass instead of base `.glass`.

## 2026-05-06 - Event card hover poster shifted up

- `components/event-card.tsx`

**Updates:** Combined poster hover scale with a slight negative `translate-y` so enlarged art floats upward and clears the title row below.

## 2026-05-06 - Event card poster zoom no longer clipped

- `components/event-card.tsx`

**Updates:** Switched the card media wrapper from `overflow-hidden` back to `overflow-visible` so the hover scale on the poster is not cropped by the preview frame.

## 2026-05-06 - Event card: poster zoom on hover, no teaser video

- `components/event-card.tsx`

**Updates:** Removed embedded/direct teaser video playback on cards; cover art now scales up on pointer hover (subtler when reduced motion is on), with the media frame using `overflow-hidden` so the zoom stays inside rounded corners.

## 2026-05-06 - Fixed teaser playback in production (user-gesture + iframe)

- `components/event-card.tsx`

**Updates:** Removed an effect that called `play()`/unmute after render (outside the browser’s user-activation window, causing console warnings and failed playback), switched card interaction to Pointer Events (so `touchend` no longer pauses before `play()` resolves), dropped the JSX `muted` flag that could reset unmute on re-renders, set embed `iframe` `src` synchronously on pointer enter, and bumped direct-video `preload` to `metadata`.

## 2026-05-06 - Larger hover scale on event card text

- `components/event-card.tsx`

**Updates:** Increased hover `scale()` on floating title, meta, and price layers for a stronger size pop on interaction, with smaller scales when reduced motion is enabled.

## 2026-05-06 - Floating text layers on event card hover

- `components/event-card.tsx`

**Updates:** Added layered `translate3d` depths and soft drop shadows for title, meta, and price blocks so copy reads as floating above the card during hover/touch, with tilt-driven parallax for desktop and a simpler lift when reduced motion is preferred.

## 2026-05-06 - Show poster when teaser is muted or paused

- `components/event-card.tsx`

**Updates:** Direct teaser visibility now depends on the video being both playing and unmuted; when muted/paused/ended, the card keeps the poster-image layer visible instead of showing the teaser frame.

## 2026-05-06 - Prefer unmuted autoplay during card interaction

- `components/event-card.tsx`

**Updates:** Moved direct teaser `play()` attempts into mouse/touch entry handlers with `muted=false` so playback with sound is attempted during user interaction, while retaining muted fallback when browsers enforce autoplay restrictions.

## 2026-05-06 - Added mobile touch parallax on event cards

- `components/event-card.tsx`

**Updates:** Reused the card tilt/glow math for touch input and wired `onTouchMove` so 3D parallax now responds to finger movement on mobile while touch preview is active.

## 2026-05-06 - Enabled touch-triggered card teaser preview

- `components/event-card.tsx`

**Updates:** Added mobile touch handlers so touching a card triggers the same teaser-preview behavior as hover and releasing/canceling touch resets playback and tilt state.

## 2026-05-06 - Unmute event card teaser on hover

- `components/event-card.tsx`

**Updates:** Updated direct teaser hover playback to begin muted for autoplay compatibility, then immediately unmute while hovered so card videos play with sound when the browser allows it.

## 2026-05-06 - Immediate hover autoplay for event teaser videos

- `components/event-card.tsx`

**Updates:** Removed the hover delay before teaser playback and changed direct teaser previews to muted autoplay-on-hover for reliable browser playback, while still resetting to the poster when hover ends.

## 2026-05-06 - Fixed React warning for defaultMuted prop

- `components/event-card.tsx`

**Updates:** Removed unsupported `defaultMuted` attributes from card teaser videos and now explicitly unmute via the video ref before hover playback starts.

## 2026-05-06 - Added 1-second hover delay before teaser playback

- `components/event-card.tsx`

**Updates:** Teaser videos now wait 1 second after hover starts before swapping from poster/image to video playback, while card tilt and hover visuals remain immediate.

## 2026-05-06 - Enabled unmuted teaser playback on hover

- `components/event-card.tsx`

**Updates:** Removed muted teaser playback defaults for direct hover videos and changed embed autoplay params to request sound with visible controls when teaser videos load on hover.

## 2026-05-06 - Fit teaser videos to card width

- `components/event-card.tsx`

**Updates:** Updated teaser video/embed rendering to use contain-fit sizing so video content fits within the card width with less cropping during hover playback.

## 2026-05-06 - Hover now swaps poster to teaser video

- `components/event-card.tsx`

**Updates:** Event cards now switch from thumbnail/poster to teaser playback on hover when a teaser video exists (direct files and embeds), then revert back to the image when hover ends.

## 2026-05-06 - Removed event card media gradient overlay

- `components/event-card.tsx`

**Updates:** Deleted the color gradient/fade overlay on top of event thumbnails so images render with their original colors and no darkened bottom tint.

## 2026-05-06 - Restored rounded media edges while floating

- `components/event-card.tsx`

**Updates:** Reapplied rounded corners to the extruded media layer and its overlays so the thumbnail/video keeps smooth rounded edges even when floating beyond the card bounds.

## 2026-05-06 - Unclipped event media extrusion on hover

- `components/event-card.tsx`

**Updates:** Removed inner overflow clipping on the event card and media wrapper so the lifted thumbnail/video can extend beyond the card bounds during 3D hover instead of being capped.

## 2026-05-06 - Added thumbnail extrusion and softer pointer glow

- `components/event-card.tsx`

**Updates:** Made event media pop forward during card tilt by adding a stronger `translateZ` lift to the thumbnail/video layer, reduced content depth for better separation, and softened the pointer glow by shrinking radius and lowering brightness.

## 2026-05-06 - Reverted to pointer tilt-card with hover enlargement

- `components/event-card.tsx`
- `app/globals.css`

**Updates:** Replaced the 8-zone hover system with cursor-tracked tilt/glow behavior (`perspective` rotateX/rotateY), restored dynamic radial glow and 3D content lift, and added explicit hover enlargement via scale.

## 2026-05-06 - Switched event card to 8-zone hover 3D pattern

- `components/event-card.tsx`
- `app/globals.css`

**Updates:** Replaced pointer-tracked tilt with a `hover-3d` layout using 8 empty zone divs that drive card rotation, plus matching glow/depth styles and motion-safe fallbacks.

## 2026-05-06 - Added parallel 3D tilt effect on event cards

- `components/event-card.tsx`

**Updates:** Implemented desktop hover tilt with perspective rotation, cursor-follow glow, and subtle content lift while preserving existing click, keyboard, and media-loading behavior.

## 2026-05-06 - Added event share options in details dialog

- `components/event-card-details-dialog.tsx`

**Updates:** Added a new Share dropdown on event cards that supports native device sharing, Facebook, X, Email, and Instagram/TikTok handoff flows with copied event text and link.

## 2026-05-06 – Added tap feedback for mobile account/admin menu links

- `components/header-mobile-menu.tsx`

**Updates:** Switched logged-in mobile menu links (`Admin`, `Order History`, `My Account`) to route-with-progress actions so taps immediately show a floating loading indicator during navigation.

## 2026-05-06 – Fixed account bookings type mismatch for build

- `app/account/account-page-client.tsx`

**Updates:** Normalized account booking data before passing to `DashboardBookings` by converting nullable `event` values to an empty array, aligning with expected non-null component prop types and resolving the TypeScript build error.

## 2026-05-06 – Fixed nullable search params on account page

- `app/account/account-page-client.tsx`

**Updates:** Guarded `useSearchParams()` access with null-safe fallbacks for tab read/update logic and removed an unused React import, resolving the account page TypeScript build failure.

## 2026-05-06 – Fixed admin dashboard light-theme contrast

- `app/admin/page.tsx`
- `components/admin/danger-zone-clear-database.tsx`

**Updates:** Improved readability in light mode by switching dashboard card labels from low-contrast yellow to foreground text with dark-mode yellow fallback, and updated the danger-zone panel to use a light red background with stronger text contrast.

## 2026-05-06 – Removed duplicate cancel-account page header

- `app/account/account-page-client.tsx`

**Updates:** Removed the top black `Cancel account` title and subtitle block so the page now starts directly with the red warning card content.

## 2026-05-06 – Updated cancel-account contextual copy

- `app/account/account-page-client.tsx`

**Updates:** Replaced the cancel-account explanatory paragraph with new marketing-focused guidance about account benefits, presales access, and event updates.

## 2026-05-06 – Improved cancel-account readability in light mode

- `app/account/account-page-client.tsx`

**Updates:** Adjusted cancel-account warning card colors and text contrast for better readability in light mode and removed the “Prefer to stay? Go back to events.” helper line.

## 2026-05-05 – Wired secure self-service account cancellation flow

- `app/account/account-page-client.tsx`
- `app/api/account/cancel/route.ts`

**Updates:** Replaced placeholder cancel-account behavior with phrase + email validation (`DELETE MY ACCOUNT`), added a final irreversible confirmation dialog, and implemented a protected API flow that anonymizes preserved booking history, removes profile data, and deletes the auth account.

## 2026-05-05 – Updated communication opt-in checkbox copy

- `app/account/account-page-client.tsx`

**Updates:** Renamed the communication preference checkbox label by removing the leading “Yes,” so it now reads “I would like to receive promotional communications by email.”

## 2026-05-05 – Signup now captures marketing email opt-in

- `app/signup/page.tsx`

**Updates:** Added a new default-checked marketing communications checkbox above the privacy consent checkbox and wired sign-up to send `marketing_email_opt_in` in Supabase user metadata.

## 2026-05-05 – Communication tab now uses single DB-backed email opt-in

- `supabase/migrations/00243_profiles_marketing_email_opt_in.sql`
- `app/account/page.tsx`
- `app/account/account-page-client.tsx`

**Updates:** Simplified communication preferences to one email-promotions checkbox, added `profiles.marketing_email_opt_in` with default `true`, loaded it server-side into the account page, and wired updates to persist directly in `profiles` with inline success/error feedback.

## 2026-05-05 – Orders notes simplified and password tab fully wired

- `app/account/account-page-client.tsx`

**Updates:** Removed the refunded-orders bullet copy from the Orders tab and wired password updates with session re-authentication plus in-page success/error feedback so users can see password validation and update results even when toast notifications are disabled.

## 2026-05-05 – Redirected dashboard paths to My Orders account tab

- `app/[eventSlug]/confirmation/[bookingId]/page.tsx`
- `components/header-desktop-account.tsx`
- `components/header-mobile-menu.tsx`
- `app/dashboard/page.tsx`

**Updates:** Renamed confirmation CTA to `Go to My Orders` and routed it to `/account?tab=orders`, updated burger-menu Order History targets to the same URL, and retired the old `/dashboard` page by converting it into a redirect.

## 2026-05-05 – Orders tab now reuses dashboard bookings table component

- `app/account/account-page-client.tsx`

**Updates:** Replaced the custom orders table in the new account area with the same `DashboardBookings` component used on `/dashboard`, so grouping, statuses, row styling, and actions are consistent between both screens.

## 2026-05-05 – Forgot-password now handles missing account with dialog

- `app/forgot-password/page.tsx`

**Updates:** Added an account-not-found modal path for forgot-password responses that indicate missing users, including a direct `Sign up for free` CTA to guide first-time users.

## 2026-05-05 – Sign-in now shows account-not-found dialog

- `app/login/page.tsx`

**Updates:** Added a modal dialog on sign-in for Supabase invalid-credentials responses to clearly explain that the account may not exist and provide a direct `Sign up for free` path.

## 2026-05-05 – Added new My Account area with sidebar sections

- `app/account/page.tsx`
- `app/account/account-page-client.tsx`
- `components/header-desktop-account.tsx`
- `components/header-mobile-menu.tsx`
- `app/dashboard/page.tsx`

**Updates:** Implemented a dedicated `/account` experience with sidebar navigation and sections for Personal details, Order history, Communication preferences, Password, and Cancel account, then rewired header/dashboard account entry points to open this new area.

## 2026-05-05 – Desktop account trigger now uses burger icon button

- `components/header-desktop-account.tsx`

**Updates:** Replaced the desktop signed-in account dropdown trigger text button with a menu (burger) icon button to mirror the closed-state interaction style used on mobile.

## 2026-05-05 – Header greeting now reads profile full name

- `components/header.tsx`

**Updates:** Updated header user mapping to fetch `profiles.full_name` and use it as the primary greeting name in account dropdowns, with metadata/email as fallback only when profile name is unavailable.

## 2026-05-05 – Improved account dropdown visibility, naming, and icons

- `components/header-desktop-account.tsx`
- `components/header.tsx`
- `components/ui/dropdown-menu.tsx`

**Updates:** Updated desktop account dropdown items to include icons, made the greeting use profile username metadata (with safe fallback) instead of raw email, and improved dropdown highlighted-row contrast in light mode so selections are clearly visible.

## 2026-05-05 – Added Admin row to desktop account dropdown for admin roles

- `components/header-desktop-account.tsx`
- `components/header.tsx`

**Updates:** Extended the new simplified signed-in desktop account dropdown so `admin` and `super_admin` users now see an `Admin` row between `Order History` and `Sign Out`, with dividers matching the requested structure.

## 2026-05-05 – Simplified desktop account dropdown menu structure

- `components/header-desktop-account.tsx`
- `components/header.tsx`

**Updates:** Updated the signed-in desktop account dropdown to show a greeting header plus only `My Account`, `Order History`, and `Sign Out` separated by dividers, and aligned the header wiring with the new component props.

## 2026-05-05 – Checkout payment options now load without live PayMongo capability check

- `app/api/checkout/paymongo-options/route.ts`

**Updates:** Removed runtime PayMongo merchant capability fetch from checkout options API so payment option dropdown and bucket selection render immediately from saved app settings during checkout page load.

## 2026-05-05 – Added live PayMongo capability debug endpoint

- `app/api/debug/paymongo-capabilities/route.ts`

**Updates:** Added an authenticated debug API that calls PayMongo `GET /v1/merchants/capabilities/payment_methods` using the currently active configured key and returns raw response payload/status for quick live-vs-test capability verification.

## 2026-05-05 – Removed global idle auto-logout behavior

- `app/layout.tsx`
- `app/[eventSlug]/checkout/checkout-content.tsx`
- `app/[eventSlug]/confirmation/[bookingId]/confirmation-processing-client.tsx`
- `app/[eventSlug]/confirmation/[bookingId]/ticket-image-generation-overlay.tsx`
- `components/providers/auth-idle-provider.tsx` (deleted)
- `lib/idle-session.ts` (deleted)

**Updates:** Rolled back the previously added idle-timeout system and all related PayMongo/confirmation suppression markers, restoring the app to no automatic inactivity logout behavior.

## 2026-05-05 – Reverted card same-tab redirect fallback

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Reverted card-only same-tab redirect behavior and restored unified embedded PayMongo modal flow for all payment buckets, to keep focus on resolving the underlying “No payment methods are available” checkout issue.

## 2026-05-05 – Card checkout now redirects in same tab (no iframe)

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** For Card payment bucket, checkout now navigates to PayMongo in the same browser tab (instead of embedded modal iframe) to avoid card rail/provider iframe limitations while still avoiding new-window popups.

## 2026-05-05 – Added global idle auto-logout with cart/PayMongo safeguards

- `components/providers/auth-idle-provider.tsx`
- `lib/idle-session.ts`
- `app/layout.tsx`
- `app/[eventSlug]/checkout/checkout-content.tsx`
- `app/[eventSlug]/confirmation/[bookingId]/confirmation-processing-client.tsx`
- `app/[eventSlug]/confirmation/[bookingId]/ticket-image-generation-overlay.tsx`

**Updates:** Added a centralized 60-second authenticated idle sign-out that is suppressed on active reservation timers, PayMongo checkout/confirmation processing, and admissions auth/scan routes so operational flows are never interrupted.

## 2026-05-05 – Added ShopeePay alias normalization for PayMongo capability sync

- `lib/paymongo.ts`

**Updates:** PayMongo merchant capability parsing now normalizes method-id aliases (including `shopeepay` → `shopee_pay`, `grabpay` → `grab_pay`, `cards` → `card`) so newly enabled rails like ShopeePay map correctly into checkout availability and session method filtering.

## 2026-05-05 – Forced checkout option availability to follow saved settings

- `app/api/checkout/paymongo-options/route.ts`

**Updates:** Buyer payment-option availability now uses configured app methods directly (including Card) so options stay selectable immediately after admin save; merchant capability data is still returned for diagnostics.

## 2026-05-05 – Clarified disabled checkout method reason in payment picker

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Disabled payment options now show “Not enabled on current PayMongo account/mode” so buyers/admins can distinguish account capability mismatches from product roadmap messaging.

## 2026-05-05 – Checkout options now honor PayMongo merchant capabilities

- `app/api/checkout/paymongo-options/route.ts`
- `lib/paymongo.ts`

**Updates:** Checkout payment-option availability now intersects saved app-config methods with PayMongo account capability methods (including `card`/`cards` alias handling), so methods like Card are only shown as selectable when truly enabled on the active PayMongo account/mode.

## 2026-05-05 – Added card/cards checkout alias probe for PayMongo

- `lib/paymongo.ts`

**Updates:** When merchant capabilities and selected card method mismatch, checkout now performs a guarded fallback probe using `cards` after `card` fails, to support possible PayMongo method-id variance without affecting other payment rails.

## 2026-05-05 – Card checkout now always stays in embedded PayMongo modal

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Removed the card-specific full-page/new-tab fallback so card uses the same in-page PayMongo modal/iframe flow as other payment options during checkout and re-session.

## 2026-05-05 – PayMongo checkout now validates merchant-supported methods

- `lib/paymongo.ts`

**Updates:** Checkout session creation now queries PayMongo merchant payment capabilities and filters selected methods before creating a session, preventing blank "No payment methods are available" pages when a method (like card) is selected in app settings but not enabled on the PayMongo account.

## 2026-05-05 – Card checkout uses full page on localhost/non-HTTPS

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** When buyer selects Card and the app runs on localhost or non-HTTPS, PayMongo now opens in a full page/new tab (with same-tab fallback) instead of iframe embed to avoid “No payment methods available” compatibility failures.

## 2026-05-05 – PayMongo checkout errors now log structured details

- `lib/paymongo.ts`

**Updates:** Checkout session failures now log PayMongo status, parsed error codes/details, selected methods, amount, and reference number so card-specific rejections are immediately diagnosable from server logs.

## 2026-05-05 - Hardened PayMongo card/method checkout fallback

- `lib/paymongo-methods.ts` - Added legacy method-id alias normalization (`cards`, `maya`, `grabpay`, `shopeepay`, direct-debit aliases) so older stored values resolve to valid PayMongo checkout codes.
- `lib/paymongo.ts` - Restored a guarded fallback retry to safe checkout methods when PayMongo rejects strict selected method sets, preventing blank "No payment methods available" sessions.

**Updates:** Checkout now recovers from legacy or partially unsupported method configs and keeps card-capable sessions available for buyers.

## 2026-05-05 – Event loading screen: remove empty top placeholder block

- `app/[eventSlug]/loading.tsx`

**Updates:** Removed the `fullscreenLead` pulse block from the event fullscreen loading state so checkout/event transition no longer shows a large empty gray box above the loading card.

## 2026-05-04 – Sale-success admin email now works for zero-cost checkout

- `app/api/checkout/route.ts`

**Updates:** Non-PayMongo confirmed checkouts (including `total_cents = 0`) now also trigger `sendEventSaleNotificationToTeam` when `sale_success_email_enabled` is on, so admin sale alerts are not limited to the PayMongo `confirmBooking` flow.

## 2026-05-04 – Book page: don’t block seats on transient status mismatch

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Seat-selection flow now stays enabled unless status is explicitly non-bookable (`postponed`, `cancelled`, `archived`). This prevents transient status inconsistencies from hiding available seats and showing “publish first” messaging.

## 2026-05-04 – Book page status hardening for invisible/invalid values

- `app/api/events/route.ts`
- `app/[eventSlug]/book/book-page-client.tsx`
- `supabase/migrations/00242_events_backfill_blank_or_invalid_status.sql`

**Updates:** Added status sanitization that strips zero-width characters before normalization, preventing empty-looking quoted values (`“”`) from invisible text. Added migration to backfill `events.status` when null, blank, or outside known statuses.

## 2026-05-04 – Inline cart: “Tickets Total” vs add-ons label

- `components/booking/inline-cart.tsx`

**Updates:** Summary line uses **“Tickets Total:”** when the cart has no add-on units; **“Tickets and Add-ons Total:”** when **`addOnUnitCount > 0`**.

## 2026-05-04 – Book page: Free Seating expanded by default; pricing `<details>` collapsed

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** **Free Seating** accordion starts **`open`**. **“Pricing & availability by section”** is a plain **`<details>`** with no initial **`open`** (collapsed by default). Removed **`DetailsInitiallyOpen`**.

## 2026-05-04 – Book page: fix `<details>` default open (no `defaultOpen` prop)

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Replaced invalid **`defaultOpen`** on native **`<details>`** (React 15 warning) with **`DetailsInitiallyOpen`** — **`useLayoutEffect`** sets **`ref.current.open = true`** on mount so pricing stays open by default without unknown DOM props.

## 2026-05-04 – Book page: Reserved + pricing cards expanded by default

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** On first successful availability load, **map and grid** seat cards expand all relevant **section IDs**. Changing **event** resets the one-time expand bootstrap. *(Pricing `<details>` / Free Seating defaults were adjusted in a later changelog entry.)*

## 2026-05-04 – Large seat maps: faster chunk fetch + lighter SeatSelector

- `app/[eventSlug]/book/book-page-client.tsx`
- `components/seat-picker/seat-selector.tsx`

**Updates:** Availability **seat** requests still use **8 section IDs per chunk**, but up to **2 chunks load in parallel** (bounded concurrency). **SeatButton** is **memoized** with a prop equality check; **`onToggle`** is forwarded through a **ref-backed stable callback** so selection updates skip re-rendering unchanged seats. Map and row-grid seat wrappers use **`content-visibility: auto`** so off-screen tiles can skip work during scroll.

## 2026-05-04 – Book page: spacing under Free Seating header

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Expanded **Free Seating** body uses **`pt-6`** so the first **SectionPicker** row is not flush against the header border.

## 2026-05-04 – SeatSelector: remove canvas drag / double-tap hint

- `components/seat-picker/seat-selector.tsx`

**Updates:** Removed the **“Drag canvas…” / “Double-click…”** line next to zoom controls; pan and double-tap fit still work via existing handlers and **Fit width** button title.

## 2026-05-04 – Book UI: remove seat-picker / section-picker helper blurbs

- `components/seat-picker/seat-selector.tsx`
- `components/seat-picker/seat-map.tsx`
- `components/seat-picker/section-picker.tsx`

**Updates:** Removed **“Click seats to select…”** from the buyer **SeatSelector**. **SeatMap** no longer shows a default one-line hint when only simple click-to-toggle is used (admin marquee / multi-select / explicit `helperText` unchanged). Removed **“Choose section and number of tickets.”** from **SectionPicker**.

## 2026-05-04 – Reserved/sold seats: translucent dark gray + legend “Dark Gray”

- `app/[eventSlug]/book/book-page-client.tsx`
- `components/seat-picker/seat-selector.tsx`
- `components/seat-picker/seat-map.tsx`

**Updates:** **Reserved / sold** seat tiles use **semi-transparent** dark gray (`rgba(69,69,69,0.42)`) with light labels. Book page **legend** says **Dark Gray** instead of the hex code.

## 2026-05-04 – Book seating header cleanup + reserved/sold seat color #454545

- `app/[eventSlug]/book/book-page-client.tsx`
- `components/seat-picker/seat-selector.tsx`
- `components/seat-picker/seat-map.tsx`

**Updates:** Removed **color swatches and seat counts** from reserved/map card headers; **section grid** headers no longer show the **color dot** or **“(N left)”**. Legend text now says **#454545 = reserved / Sold**. **SeatSelector** and **seat-map** row grids render reserved and sold seats with fill **#454545** and contrast text. Extra map canvases use **joined section names** as the card title.

## 2026-05-04 – Book seat map: pricing & availability card instead of random-seat buttons

- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Removed **random seat** actions on the book page. **Reserved seating (map)** now uses a collapsible **Pricing & availability by section** card (color swatch, name, PHP price with early-bird styling when applicable, seats remaining). **Section grid** seating shows the same line in a compact card above the seat grid.

## 2026-05-04 – Book page: fix intermittent “unknown” / non-bookable state for published events

- `app/sw.ts`
- `app/api/events/route.ts`
- `app/[eventSlug]/book/book-page-client.tsx`
- `supabase/migrations/00241_events_backfill_null_status.sql`

**Updates:** **`NetworkOnly`** in the service worker for **`GET /api/events?slug=…`** so slug payloads are not replayed from **NetworkFirst** API cache. Slug API responses **normalize** `status` (trim, lowercase known values, null/blank/unknown → `draft`). Book page uses **trim + lowercase** for **`isBookableEvent`** / draft banner and a single **`eventStatusLabel`** for quoted copy. DB migration **backfills `status`** where it was **NULL**.

## 2026-05-04 – Service worker: cache admissions scan UI for offline refresh

- `app/sw.ts`

**Updates:** Added a dedicated **NetworkFirst** runtime cache (`admissions-pages-offline`) for **GET** document navigations and **RSC** requests under `/admissions/*`, so after a successful online visit the scan page can **reload while offline** without losing the shell. **`GET /api/admissions/*` stays `NetworkOnly`** (unchanged).

## 2026-05-04 – Seat map: double-click / double-tap runs Fit width

- `components/seat-picker/seat-selector.tsx`

**Updates:** **Double-click** (mouse) on the scrollable seat canvas calls **`handleFitWidth`**. **Double-tap** (touch) uses a **420ms / 48px** window, skipped after canvas drag, while another touch is down, or during pinch. Hint text updated.

## 2026-05-04 – Seat map Fit width: dial back zoom-out (less aggressive)

- `components/seat-picker/seat-selector.tsx`

**Updates:** **`ZOOM_FIT_WIDTH_HORIZONTAL_INSET`** set to **40** (was 56); removed **`ZOOM_FIT_WIDTH_MULTIPLIER`** (no extra 0.94 shrink) so **Fit width** is slightly larger again—between the original tight fit and the last “too much” setting.

## 2026-05-04 – Seat map Fit width: zoom out a bit more

- `components/seat-picker/seat-selector.tsx`

**Updates:** **`ZOOM_FIT_WIDTH_HORIZONTAL_INSET`** increased **32 → 56**; **`ZOOM_FIT_WIDTH_MULTIPLIER`** **0.94** applied to the computed fit-width scale so the chart sits slightly smaller in the frame.

## 2026-05-04 – Seat map Fit width: slightly smaller zoom (horizontal inset)

- `components/seat-picker/seat-selector.tsx`

**Updates:** Fit-width zoom now subtracts **32px** from the scroll container width before computing scale so the plan sits **a bit smaller** with clearer margins from the frame/scrollbars.

## 2026-05-04 – Seat map: Fit width centers horizontal scroll; zoom anchors to pointer / pinch center

- `components/seat-picker/seat-selector.tsx`

**Updates:** **Fit width** recenters **horizontal** scroll (`scrollLeft = max/2`) after zoom applies (double `requestAnimationFrame` so layout uses the new scale). **Wheel zoom** and **+/-** buttons adjust **`scrollLeft` / `scrollTop`** so the zoom focus stays under the **cursor** (buttons use **viewport center**). **Pinch** uses the **midpoint between the two touches** as the anchor with the same ratio math.

## 2026-05-04 – Seat map “Fit width”: edge-to-edge for seat cluster

- `components/seat-picker/seat-selector.tsx`

**Updates:** **Fit width** now scales from **`fitBasisW`** (seat bounding width + padding), not the full **background image** width, so wide images no longer leave a large empty margin next to the scrollbar. Removed the **zoom ≤ 1** cap so smaller layouts can scale up to fill the frame. **Fit-width padding** set to **0**, and after fit the canvas **scrolls to the left** instead of centering (avoids a cropped “gutter” beside the scrollbar).

## 2026-05-04 – Free seating quantity: fix bounce-back + stronger debounce

- `app/[eventSlug]/book/book-page-client.tsx`
- `components/seat-picker/section-quantity-stepper.tsx`
- `components/seat-picker/section-picker.tsx`
- `components/booking/inline-cart.tsx`

**Updates:** **`suppressStaleReservationMergeRef`** ignores stale **`/me`** / **BroadcastChannel** merges after a local cart edit until **`POST /api/reservations`** succeeds (or explicit recovery paths clear the flag), stopping the dropdown from reverting to the old count. Sync debounce **400→520ms**, broadcast **`/me` coalesce 220→400ms**, cap-over-max delay **280→450ms**. **SectionQuantityStepper** no longer uses **`key={max}`** (remounted on every availability flicker); uses stable **`instanceKey`** per section instead.

## 2026-05-04 – Optional hardening: GET /api/auth/me + server–client reconciliation

- `app/api/auth/me/route.ts` (new)
- `lib/supabase/auth-resync.ts`

**Updates:** **`GET /api/auth/me`** returns the current user from **server** `getUser()` (cookie truth). Tab resume resync now **fetches that in parallel** with the browser client (coalesced in-flight) and, on mismatch, **`signOut({ scope: "local" })`**, **`refreshSession()`**, or **`getUser()`** so UI matches the server session. **Middleware** already includes the broad matcher from the earlier change (public route cookie refresh).

## 2026-05-04 – Auth resync on tab resume (stale session UI)

- `lib/supabase/auth-resync.ts` (new)
- `components/header.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`
- `components/providers/theme-provider.tsx`
- `app/dashboard/settings/user-settings-form.tsx`
- `app/admin/settings/user-settings.tsx`
- `app/admin/settings/user-roles-settings.tsx`
- `components/event-card-details-dialog.tsx`
- `components/admin/event-administrators.tsx`
- `middleware.ts`

**Updates:** Debounced **visibility + window focus** handlers re-run **`getUser()`** on the same Supabase client used for **`onAuthStateChange`** (with optional **`startAutoRefresh`** when available) so the header and book flow match real session state after Chrome backgrounds the tab. The book page keeps **`isGuest`** in sync via **`onAuthStateChange`** plus the same resume hook. **Theme** and **profile settings** (dashboard + admin) subscribe to auth + resume resync; **event details dialog** (admin actions visibility), **event administrators**, and **user roles** settings sync **`currentUserId`** / admin UI when the session changes. **Middleware** matcher adds a catch-all (excluding API/static/assets) so **`updateSession`** refreshes cookies on public navigations too.

## 2026-05-03 – Checkout: disable pay until request + payment chosen

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** **Proceed to payment** / **Complete Checkout** stays disabled until a **special request** type is selected and, when **total due &gt; 0**, until **payment options** are loaded and a valid **PayMongo bucket** is chosen (`checkoutBlockedPaymongo`). **On-Site Payment** (admin) matches the same gates.

## 2026-05-03 – Checkout special request + book page always-fresh queries

- `app/[eventSlug]/checkout/checkout-content.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** **Special request** on checkout starts unset so the buyer must open the dropdown and choose a type (including “No special request”). **Book / seat selection** drops `keepPreviousData` on availability queries so refetches don’t keep showing a stale manifest or seat list; **event add-ons** query now matches (`staleTime`/`gcTime` 0, refetch on mount/focus/reconnect) so merch inventory isn’t held for 30s.

## 2026-05-03 – Book page Refresh Seats + Supabase session cookies

- `app/[eventSlug]/book/book-page-client.tsx`
- `lib/supabase/auth-cookie-options.ts` (new)
- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `lib/supabase/middleware.ts`
- `lib/supabase/pages-api.ts`
- `lib/events/event-grid-server.ts`

**Updates:** **Refresh Seats** stays usable on the book page (enabled whenever the slug is known; refetches **event by slug** first, then availability / cart when an id exists) so a bad or empty event id no longer disables the control. Empty **event status** in the “not bookable” message shows a clearer hint instead of quotes around a blank value. **Supabase SSR clients** now share explicit **`path: /`**, **`SameSite=Lax`**, and **`Secure` in production** cookie defaults for more reliable OAuth/PKCE session persistence. **`isEventLike`** rejects empty/whitespace event ids so slug API does not return broken rows.

## 2026-05-03 – Section quantity select: debounce over-max correction

- `components/seat-picker/section-quantity-stepper.tsx`

**Updates:** Stopped immediately calling `onChange` whenever props capped quantity (fought transient `maxQuantity` dips while availability refetches / cart sync debounces). Over-max corrections now wait **280ms** and re-read latest caps before applying; Radix `Select` gets **`key={safeMax}`** so the option list remounts cleanly when the upper bound changes.

## 2026-05-03 – Section quantity dropdown (free seating)

- `components/seat-picker/section-quantity-stepper.tsx`

**Updates:** Replaced the minus/plus stepper with a Radix **select** styled to match each section’s accent border (compact + default sizes unchanged for `SectionPicker` and `InlineCart`). Quantities still run **0…max** with the same caps; out-of-range values sync down to `maxQuantity`.

## 2026-05-02 – Homepage LCP image priority + GA preconnect hint

- `components/home-event-banner-carousel.tsx`
- `app/layout.tsx`

**Updates:** Carousel images that are visible on initial loop render (active + edge neighbor slides) now use eager/high fetch priority to prevent Lighthouse from selecting a lazy-loaded visible banner as LCP. Added conditional `preconnect` to `https://www.google-analytics.com` when GA is enabled to reduce third-party connection setup delay.

## 2026-05-02 – Show add-ons to guests on book page

- `app/api/events/[id]/add-ons/route.ts`

**Updates:** Public add-ons catalog now resolves via service-role (while still filtering `is_hidden = false`) so **guests / not-logged-in users** can see event merchandise on the booking page.

## 2026-05-02 – Modal / progress overlays use theme navy scrim

- `components/ui/floating-progress.tsx`
- `components/ui/dialog.tsx`

**Updates:** Full-screen blocking overlays (e.g. **Proceeding to checkout…**) and **dialog** backdrops now use **`bg-background/*`** instead of black, matching the midnight-navy theme.

## 2026-05-02 – Hero backdrop scrim uses theme navy

- `components/background-image.tsx`

**Updates:** Replaced the hero background **black overlay** with a **theme-aware midnight navy scrim** (`bg-background/*`) to match the app’s dark night blue look.

## 2026-05-02 – Fix boot shell DOM removal crash

- `app/layout.tsx`
- `components/wish-boot-shell.tsx`
- `components/wish-boot-shell-dismiss.tsx` (deleted)

**Updates:** Boot shell dismissal now happens via **React state** (fade → unmount) instead of manually removing the DOM node, preventing Next.js runtime `insertBefore` / `removeChild` NotFoundErrors.

## 2026-05-02 – First load: HTML boot shell + faster root layout

- `app/layout.tsx`
- `components/wish-boot-shell.tsx` (new)
- `components/wish-boot-shell-dismiss.tsx` (new)
- `app/globals.css`

**Updates:** Server-rendered **`WishBootShell`** (gradient backdrop + spinner + indeterminate bar + copy) shows in the initial HTML so first paint isn’t an empty screen while JS loads. **`WishBootShellDismiss`** removes it after a **minimum ~480ms** and **initial `auth.getUser()`** (or **5.5s** cap); skipped for **`/admissions/*`** and **`/reports/shared/*`**. Removed root **`force-dynamic` / `revalidate: 0`** so the document shell can stream/cache more like route-specific settings.

## 2026-05-02 – Admin add-ons: per-item collapse + drag reorder

- `components/admin/event-add-ons-tab.tsx`

**Updates:** Each add-on row is now **collapsible** (default collapsed) showing only **image, title, and Hidden switch** in the header. Rows support **drag-and-drop reordering**; the saved order persists as `sort_order` and is the same order shown to buyers.

## 2026-05-02 – Event add-ons: max per cart, hidden toggle, “Free” price on book page

- `supabase/migrations/00240_event_add_ons_max_qty_hidden.sql` (new)
- `app/api/events/[id]/add-ons/route.ts`
- `app/api/admin/events/[id]/add-ons/route.ts`
- `app/api/reservations/route.ts`
- `app/api/reservations/[cartId]/route.ts`
- `app/api/checkout/route.ts`
- `components/admin/event-add-ons-tab.tsx`
- `components/booking/add-ons-carousel.tsx`
- `components/booking/inline-cart.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** **`event_add_ons`** gains **`max_qty_per_cart`** (default 10, 1–9999) and **`is_hidden`** (default false). Public **`GET /api/events/[id]/add-ons`** returns only visible rows and includes **`max_qty_per_cart`**; book UI caps quantity with **`min(stock, max_qty_per_cart)`**. **`POST/PATCH /api/reservations`** and checkout enforce stock, per-cart cap, and reject hidden lines. Buyers see **“Free”** when **`price_cents === 0`** (carousel + cart line). Admin tab: **Max per cart** stepper and **Hidden from buyers** switch. **Apply migration `00240`** in deployed environments.

## 2026-05-02 – Admin events table: published status in light neon green

- `components/admin/events-table.tsx`

**Updates:** Rows with status **published** use light neon green text (**`#9dffbf`**, slightly brighter on row hover). Other statuses keep muted / yellow hover styling.

## 2026-05-02 – PayMongo modal: minimal chrome (no helper strip / popup)

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Removed the instructional **`DialogDescription`**, the embed status row (**Payment form loaded** / booking reference), and **Open secure payment window** (and the unused auxiliary-window helpers). Slow-load toast copy now points to **Change payment option** or refresh. Pre-PayMongo **`ConfirmDialog`** text no longer references the removed button.

## 2026-05-02 – Checkout: single PayMongo progress overlay (no stacked FloatingProgressBar)

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** **Continue to PayMongo** confirmation runs **`handlePayment({ pageProgress: false })`** so the page **`FloatingProgressBar`** stays off while **`ConfirmDialog`** owns the overlay. **`ConfirmDialog`** now uses **`loadingMessage` / `loadingSubtitle` / `loadingDetail`** for PayMongo so buyers see one full-screen progress treatment instead of **Starting secure payment…** behind **Working…**.

## 2026-05-02 – Checkout: align totals with PayMongo after `/api/checkout` / resession

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Added **`paymentPricingOverride`** from **`ticket_net_cents`** / **`charged_cents`** when checkout or **`paymongo-resession`** returns a **`redirect_url`**, and render **Tickets total**, **fee**, and **Total due** from **`displayTicketNetCents`** / **`displayQuotedChargeCents`** so the inline summary matches the PayMongo-hosted amount when the server priced cart differs from the client summary. Clears override when **`activeCartId`**, **`finalCents`**, or **`payment_bucket`** changes.

## 2026-05-02 – Checkout: fix Proceed navigation (cart/event id resolution + await push)

- `app/[eventSlug]/checkout/checkout-content.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`

**Updates:** Checkout now derives **`eventId`** and **`activeCartId`** with **URL/searchParams → SSR `initial*` props → Zustand**, so a brief empty `useSearchParams()` render no longer falls through to **store-only** ids or the **“No reservation found”** dead-end while the server already had `cartId`/`eventId`. Book **Proceed to Checkout** **`await`s `router.push`** (encoded query) and shows a toast if navigation throws.

## 2026-05-02 – Reservations: atomic cart line replace (fixes duplicated free-section quantities)

- `supabase/migrations/00239_replace_reservation_cart_items_atomic_rpc.sql`
- `lib/reservation-cart-replace-items.ts`
- `app/api/reservations/route.ts`
- `app/api/reservations/[cartId]/route.ts`

**Updates:** Replaced separate `DELETE reservation_items` + `INSERT` with Postgres RPC `replace_reservation_cart_items` so each sync runs **DELETE + INSERT in one transaction**. Concurrent overlapping replaces could previously interleave (both DELETE, then both INSERT), stacking duplicate seat rows; `/api/reservations/me` aggregates free/standing seats into section quantities (+1 per row), so duplicates appeared as **replicated quantities**. Removed the eager DELETE before allocation—allocation already excludes other carts while existing cart rows remain. **Apply migration** (`00239`) before relying on the RPC in deployed environments.

## 2026-05-02 – Book page: fingerprint skip for silent sync; checkout Select always controlled

- `app/[eventSlug]/book/book-page-client.tsx`
- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Silent `syncCartToServer` short-circuits when cart id and `reservationItemsFingerprint` match the last successful hydrate/sync (fewer redundant `/api/reservations` POSTs). Fingerprint is updated on equivalence-path `/me` applies and after successful POSTs. Merged cart-clear effects; moved event fingerprint reset below `event` query for valid hook order. Checkout **special request** defaults to `"none"`; **payment option** uses a sentinel `SelectItem` so Radix stays controlled before a bucket is chosen (removes uncontrolled→controlled warnings).

## 2026-05-02 – PayMongo checkout: modal iframe + centered popup (no full-tab takeover)

- `app/[eventSlug]/checkout/checkout-content.tsx`
- `app/[eventSlug]/payment-return/[bookingId]/page.tsx`

**Updates:** Restored large checkout **modal** with embedded PayMongo `iframe`; checkout stays on the same page (no `window.location.assign` to PayMongo). Slow-load hint after ~18s (toast only — no automatic extra tab). **Open secure payment window** opens a centered auxiliary browser window (~540×880) when iframe is blocked; popup keeps `window.opener` so `/payment-return` can `postMessage` the opener and close the popup while checkout navigates to confirmation. Session restore + iframe/polling/`message` listeners reinstated.

## 2026-05-02 – Checkout: payment option as required dropdown

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Replaced payment tiles with a **Select** (placeholder “Select a payment option”); nothing selected by default; removed auto-selection of the first available bucket. Unavailable buckets stay visible but **disabled** (“Card payments coming soon”). Label `htmlFor` matches trigger id; clears selection if the chosen bucket disappears or becomes unavailable.

## 2026-05-02 – Checkout: required asterisk on Payment option label

- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Payment option label shows a red asterisk (same pattern as Special request → Request type) to indicate a selection is required.

## 2026-05-02 – Book page: reservation sync loop, duplicate payloads, quantity flicker

- `lib/reservation-sync-payload.ts`
- `app/[eventSlug]/book/book-page-client.tsx`
- `components/seat-picker/section-picker.tsx`

**Updates:** Consolidated duplicate section/seat/add-on lines before POST/PATCH payloads (each duplicate row allocated separately server-side). Stabilized `syncCartToServer` with refs so BroadcastChannel/`/me` hydration does not recreate the callback every render and re-trigger the debounced sync effect. Skip `setItems` in `applyServerReservationPayload` when the cart id and canonical items already match (stops feedback loops). `mapApiItemsToReservationItems` merges repeats from API arrays. **Quantity flicker:** open-seating `SectionPicker` stepper max now uses `available + in-cart qty` (manifest `available` excludes your holds); sold-out hides only when there is nothing left to hold. Broadcast `/me` refresh is debounced (~220ms) and skips availability invalidation when `/me` did not change cart lines (`applyServerReservationPayload` returns boolean).

## 2026-05-02 – Sign up CTA copy: "Sign up for free"

- `components/header.tsx`
- `components/header-desktop-account.tsx`
- `components/header-mobile-menu.tsx`
- `components/guest-signup-dialog.tsx`
- `app/login/page.tsx`
- `app/signup/page.tsx`

**Updates:** Replaced public "Sign Up" labels with **Sign up for free** (nav, guest modal, login link, signup page title/submit, loading subtitle where relevant).

## 2026-05-01 – Chunked duplicate event: phase1 + seat batches + duplicate API wiring

- `supabase/migrations/00238_duplicate_admin_event_chunked_seats.sql`
- `app/api/admin/events/[id]/duplicate/route.ts`
- **Updates:** Replaced monolithic `duplicate_admin_event` with `duplicate_admin_event_phase1` plus repeated `duplicate_admin_event_seats_chunk`; seat chunk completes in one RPC when last batch fills `batch_size` and no rows remain (`EXISTS` after cursor).

## 2026-05-01 – duplicate_admin_event: digest/encode + pgcrypto search_path

- `supabase/migrations/00234_duplicate_admin_event.sql`
- `supabase/migrations/00235_duplicate_admin_event_fix_ambiguous_es.sql`
- `supabase/migrations/00236_duplicate_admin_event_fix_src_seat_alias.sql`
- `supabase/migrations/00237_duplicate_admin_event_pgcrypto_digest.sql`
- `AppUpdates.MD`

**Updates:** SECURITY DEFINER had `search_path = public` only, so `digest`/`encode` from **pgcrypto** (in schema `extensions` on Supabase) were not resolved; also cast `'sha256'::text` / `'hex'::text` so Postgres does not pick `digest(text, unknown)`. **00237** reapplies the function for DBs already migrated.

## 2026-05-01 – Fix duplicate_admin_event ambiguous `s.*` (DECLARE `s` vs seat alias)

- `supabase/migrations/00234_duplicate_admin_event.sql`
- `supabase/migrations/00235_duplicate_admin_event_fix_ambiguous_es.sql`
- `supabase/migrations/00236_duplicate_admin_event_fix_src_seat_alias.sql`
- `AppUpdates.MD`

**Updates:** `s record` in the function block conflicted with `FROM event_seats s`, so `s.*` was ambiguous. Seat subquery now uses alias **`src_seat`**. **00236** reapplies the function for DBs that already ran the older 00235.

## 2026-05-01 – Fix duplicate_admin_event ambiguous `es.*` (seat loop query)

- `supabase/migrations/00234_duplicate_admin_event.sql`
- `supabase/migrations/00235_duplicate_admin_event_fix_ambiguous_es.sql`
- `AppUpdates.MD`

**Updates:** `FOR es IN SELECT es.* FROM event_seats es` made `es.*` ambiguous in PL/pgSQL; query now uses alias `s` (`SELECT s.* FROM event_seats s`). Added **00235** so databases that already applied 00234 get `CREATE OR REPLACE` without resetting.

## 2026-05-01 – Admin events table: Dup column separate from Featured

- `components/admin/events-table.tsx`
- `AppUpdates.MD`

**Updates:** Duplicate control is always in its own **Dup** column whenever the user can duplicate; **Featured** is checkbox-only for super admins.

## 2026-05-01 – Admin: duplicate event as configuration template

- `supabase/migrations/00234_duplicate_admin_event.sql`
- `app/api/admin/events/[id]/duplicate/route.ts`
- `components/admin/events-table.tsx`
- `app/admin/events/page.tsx`
- `AppUpdates.MD`

**Updates:** Duplicate control next to Featured (or a Dup column); dialog for new title; RPC clones seating, canvases, prices, early bird, promos (new codes / zero usage), add-ons, banners, admissions gate codes (new secrets), event admins → new draft with new slug, `event_code`, and seat scan/encrypted QR hashes. Bookings/tickets/etc. omitted.

## 2026-05-01 – Revert: cart/checkout muted yellow & red (restore saturation)

- `app/globals.css`
- `components/ui/button.tsx`
- `components/booking/inline-cart.tsx`
- `components/booking/reservation-timer.tsx`
- `app/[eventSlug]/checkout/checkout-content.tsx`
- `components/ui/confirm-dialog.tsx`
- `AppUpdates.MD`

**Updates:** Removed **`--muted-*`** tokens and restored **bright yellow** timers/totals/CTAs and **`red-600`** destructive buttons (and **red-400** accents) after feedback that the muted palette was too dull.

## 2026-05-01 – Cart/checkout dark: toned yellow & red (same hue)

- `app/globals.css`
- `components/ui/button.tsx`
- `components/booking/inline-cart.tsx`
- `components/booking/reservation-timer.tsx`
- `app/[eventSlug]/checkout/checkout-content.tsx`
- `components/ui/confirm-dialog.tsx`
- `AppUpdates.MD`

**Updates:** New **`--muted-cta-yellow`**, **`--muted-yellow-*`**, **`--muted-danger-foreground`** tokens for **dark** cart/checkout/timer copy and yellow CTAs. **Destructive** buttons use **lower-chroma reds** under **`data-theme="dark"`**; light theme keeps standard Tailwind reds.

## 2026-05-01 – Home dark backdrop: stronger dim on hero image

- `components/background-image.tsx`
- `AppUpdates.MD`

**Updates:** Concert backdrop **brightness** lowered (`0.6` → `0.42`) and **scrim** strengthened (`bg-black/70` → `bg-black/80`) so spotlights read less loud and foreground UI contrasts better.

## 2026-05-01 – Strada-inspired dark neutrals (surfaces only)

- `app/globals.css`
- `app/manifest.ts`
- `app/layout.tsx`
- `AppUpdates.MD`

**Updates:** Dark mode uses a **midnight-navy SaaS** base (`#0a101f` background, `#131b2e` surface, cool **slate** glass and borders, `#94a3b8` muted text). Wish **orange** and other brand accent tokens unchanged. PWA and viewport `theme_color` / `background_color` aligned with the new background.

## 2026-05-01 – Confirmation: booking copy refresh

- `app/[eventSlug]/confirmation/[bookingId]/page.tsx`
- `AppUpdates.MD`

**Updates:** Replaced the “Booking confirmed” blurb with thank-you + tap-to-view + registered email / resend wording.

## 2026-05-01 – Add-ons carousel: reliable wrap + auto-scroll when scrollable

- `components/booking/add-ons-carousel.tsx`
- `AppUpdates.MD`

**Updates:** **Loop** wrap uses tighter **start/end** detection (`scrollLeft` within **2px** of bounds) so last→first / first→last jumps fire reliably. Auto-advance runs whenever the section is **expanded** and **motion is allowed** (not only when `addOns.length >= 2`); non-scrollable strips no-op inside `scrollLoopBy`.

## 2026-05-01 – Add-ons carousel: auto-advance

- `components/booking/add-ons-carousel.tsx`
- `AppUpdates.MD`

**Updates:** When the merch strip is expanded and has **2+** items, it **auto-scrolls** every **4.5s** (same loop behavior as the arrows). **Disabled** when **`prefers-reduced-motion: reduce`**, while **hovering** the track, or briefly after **drag / arrow** use so manual control is not fighting the timer.

## 2026-05-01 – Event card: ~10% bottom image fade

- `components/event-card.tsx`
- `AppUpdates.MD`

**Updates:** Cover overlay stays clear through **~90%** height; only the **bottom ~10%** fades to `--event-card-media-fade` (tighter than the earlier ~18% band).

## 2026-05-01 – Checkout: label “PayMongo Transaction Fee”

- `app/[eventSlug]/checkout/checkout-content.tsx`
- `AppUpdates.MD`

**Updates:** Order summary line **Payment Processing Charge** renamed to **PayMongo Transaction Fee**.

## 2026-05-01 – Checkout: disabled PayMongo tiles readable in light mode

- `app/[eventSlug]/checkout/checkout-content.tsx`
- `AppUpdates.MD`

**Updates:** Removed whole-tile **`opacity-40`** on unavailable buckets (it washed out copy on white). Disabled tiles now use a light neutral surface, softer lime border, and explicit **`text-neutral-700` / `text-neutral-600`** (with dark-mode variants) for title and “coming soon” line.

## 2026-05-01 – Checkout: neon-adjacent lime borders on payment buckets

- `app/[eventSlug]/checkout/checkout-content.tsx`
- `AppUpdates.MD`

**Updates:** PayMongo bucket tiles use **light lime / near-neon** borders, brighter on hover/selected, with a soft green glow on the active option.

## 2026-05-01 – Checkout: remove PayMongo “continue on this page” blurb

- `app/[eventSlug]/checkout/checkout-content.tsx`
- `AppUpdates.MD`

**Updates:** Dropped the muted paragraph above **Proceed to payment** about staying on-page for PayMongo and switching rails.

## 2026-05-01 – Checkout: green payment bucket borders, drop PayMongo helper blurb

- `app/[eventSlug]/checkout/checkout-content.tsx`
- `AppUpdates.MD`

**Updates:** Payment option tiles use **emerald/green** borders and hovers; removed the muted paragraph about PayMongo rails.

## 2026-05-01 – Inline cart: yellow checkout CTA, red Clear Cart button

- `components/booking/inline-cart.tsx`
- `AppUpdates.MD`

**Updates:** Proceed to Checkout uses **`--wish-yellow`** with dark label text (aligned with checkout). Clear Cart uses the shared **`destructive`** button (solid red background, white label).

## 2026-05-01 – Void sale: rotate seat encrypted QR after void

- `lib/admin/void-sale.ts`
- `AppUpdates.MD`

**Updates:** After deleting voided seat tickets, `voidSoldTickets` calls `rotateEncryptedQrForSeatOnRelease` for each affected `event_seats` id (deduped), matching invalidate behavior so stale prints / prior buyer QR payloads cannot match the next sale.

## 2026-05-01 – Image-proxy: fix JSON parse type (build)

- `app/api/image-proxy/route.ts`
- `AppUpdates.MD`

**Updates:** Replaced `as typeof parsed` on the assignment RHS with a named `SupabaseStorageErrorBody` type so TypeScript no longer narrows `parsed` to `never` and `next build` typecheck passes.

## 2026-05-01 – Image-proxy + seat map bg: Supabase not_found + hide broken overlay

- `app/api/image-proxy/route.ts`
- `components/seat-picker/seat-selector.tsx`
- `AppUpdates.MD`

**Updates:** When Storage returns **`400`** with JSON **`statusCode:"404"` / `error:"not_found"`**, the proxy now responds **`404`** with **`Storage object not found`** and attaches **`upstream`** in development. **`SetupStyleCanvas`** hides the floor-plan `<img>` on **`onError`** so stale DB URLs do not flash the broken-icon tile (seats still render).

## 2026-05-01 – Book page: parentheses for `||` + `??` on canvas `bgImage`

- `app/[eventSlug]/book/book-page-client.tsx`
- `AppUpdates.MD`

**Updates:** SWC forbids mixing `||` and `??` without explicit grouping; **`bgImage`** is now **`(group.bgImage?.trim() || event?.seat_layout_image_url) ?? null`**.

## 2026-05-01 – Seat map `/api/image-proxy?url=` empty + canvas background fallbacks

- `lib/image-remote.ts`
- `components/seat-picker/seat-selector.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`
- `AppUpdates.MD`

**Updates:** `supabaseStorageDisplaySrc` only wraps real Storage **`/storage/v1/object/public/`** or **`sign/`** URLs (not every `*.supabase.co` href), avoiding nested/malresolved targets that yielded **`encodeURIComponent("")`** → broken **`?url=`** requests. `SeatSelector` rejects proxy `src`s whose `url` query is blank. Book page treats whitespace/empty **`image_url`** / **`background_image_url`** as absent so **`??`/`||`** falls back to **`event.seat_layout_image_url`**.

## 2026-05-01 – Image-proxy: Supabase host allow-list + shared URL resolution

- `app/api/image-proxy/route.ts`
- `lib/image-remote.ts`
- `AppUpdates.MD`

**Updates:** The proxy compared storage hosts with a `split(".")` rule that required four labels, so valid `ref.supabase.co` URLs never matched the configured project (403 or wrong behavior). The route now uses `resolveSupabaseAssetAbsoluteUrl`, `supabaseApiOriginsMatchStorageUrl`, and a single ref extractor; adds one-step URL decode fallback and normalizes `http`→`https` for `.supabase.co` / `.supabase.in`. Unused `safeDecodeUrlParamMaybe` removed from `lib/image-remote.ts`.

## 2026-05-01 – Seat map canvas: Supabase backgrounds via buffered image-proxy

- `components/seat-picker/seat-selector.tsx`
- `app/api/image-proxy/route.ts`
- `AppUpdates.MD`

**Updates:** Setup-style canvases loaded raw Supabase URLs in `<img>`, which can show a broken-icon tile when chunked CDN responses truncate. Canvas backgrounds now use `supabaseStorageDisplaySrc()` (same as ticket assets). Proxy allows **`/storage/v1/object/sign/`** in addition to `public/` so signed layout images work.

## 2026-05-01 – Book availability: manifest + chunked seat loads (RPC split)

- `supabase/migrations/00233_availability_manifest_and_seats_split.sql`
- `app/api/events/[id]/availability/route.ts`
- `app/[eventSlug]/book/book-page-client.tsx`
- `netlify.toml`
- `docs/NETLIFY_DEPLOY.md`
- `AppUpdates.MD`

**Updates:** Added `get_event_availability_manifest` and `get_event_availability_seats(p_event_id, p_section_ids)` (optional section filter); API supports `mode=manifest` / `mode=seats[&sectionIds=…]`; full `get_event_availability` remains when `mode` is omitted. Book page loads sections/canvases first, then seats, batching assigned section IDs (chunk size **8**) to keep Netlify payloads and RPC serialization smaller while preserving `invalidateQueries(["availability", id])`.

## 2026-05-01 – Netlify: cap seat availability RPC under Lambda wall-clock

- `app/api/events/[id]/availability/route.ts`
- `netlify.toml`
- `docs/NETLIFY_DEPLOY.md`
- `AppUpdates.MD`

**Updates:** On Netlify, sync Lambdas default to ~10s; the availability route waited up to 18s on `get_event_availability`, so invocations could be killed mid-request (aborted / provisional headers in DevTools). The handler now detects Netlify runtimes via `SITE_ID` (and optional `NETLIFY=1`) and uses ~7.5s RPC wait unless `NETLIFY_AVAILABILITY_RPC_TIMEOUT_MS` overrides—returning JSON `504 availability_timeout` instead of an opaque platform failure. Docs + `netlify.toml` comments updated.

## 2026-05-01 – Book page: availability loading uses `isLoading` (not stuck on `isPending`)

- `app/[eventSlug]/book/book-page-client.tsx`
- `AppUpdates.MD`

**Updates:** TanStack Query v5 keeps `isPending` true whenever the availability query has no data, including when `enabled` is false (`fetchStatus: paused`). The book page treated that as “Loading seat availability…” and hid the seat UI even though no fetch was running. Switched gated UI / empty-data retry timing to **`isLoading`** (`isPending && isFetching`) so the banner and blocks only reflect an actual in-flight availability request after the slug-resolved event id enables the query.

## 2026-05-01 – Sale promo ribbon center-aligned

- `components/event-card.tsx`
- `components/event-card-details-dialog.tsx`
- `AppUpdates.MD`

**Updates:** Sale promo banners center the lightning icon + title row and countdown (`justify-center`, `text-center`, full-width rows). Desktop modal footer aligns the badge stack with `items-center`.

## 2026-05-01 – Seat Pricing Sale Label input uppercase

- `components/admin/seat-pricing.tsx`
- `AppUpdates.MD`

**Updates:** **Sale Label** field uppercases input as you type, loads existing labels uppercase, and uses `uppercase` styling for the control.

## 2026-05-01 – Sale label + yellow promo glow on event cards

- `supabase/migrations/00232_events_sale_label.sql`
- `app/api/admin/events/[id]/pricing/route.ts`
- `lib/types.ts`
- `lib/events/event-grid-server.ts`
- `components/admin/seat-pricing.tsx`
- `components/event-card.tsx`
- `components/event-card-details-dialog.tsx`
- `AppUpdates.MD`

**Updates:** Seat Pricing uses **Enable Sale** and a **Sale Label** field (stored on `events.sale_label`, max 100 chars). During an active sale window, event cards use a **bright yellow** glow and the ribbon text comes from **Sale Label** (fallback **EARLY BIRD PROMO**).

## 2026-05-01 – Admin add-on cards: per-item, row total, and grand total

- `components/admin/event-add-ons-tab.tsx`
- `AppUpdates.MD`

**Updates:** Each add-on card shows **Price per item** and **Total (price × stock)**. The **All add-on items** header and a list footer show **Total all items (price × stock)** — sum of every row’s inventory value at list price.

## 2026-05-01 – Admin Sold add-ons: light theme contrast

- `components/admin/event-add-ons-tab.tsx`
- `AppUpdates.MD`

**Updates:** Sold add-ons panels use **theme-aware** surfaces (`bg-muted`, `bg-background`) instead of `bg-black/*` overlays; status badges use **dark text on tinted fills** in light mode; order lines and totals use **foreground** weights for readability.

## 2026-05-01 – Book page merch carousel: title + nav layout

- `components/booking/add-ons-carousel.tsx`
- `AppUpdates.MD`

**Updates:** Public booking **add-ons** block title is now **Limited event merch, made to be remembered** (responsive `text-base` / `sm:text-lg`). Carousel **previous/next** controls sit in a horizontal flex row **beside** the scroll strip so they no longer overlay product cards.

## 2026-05-01 – First-load perceived shell (home skeleton + event fullscreen loading)

- `lib/events/event-grid-constants.ts`
- `components/event-grid-loading-skeleton.tsx`
- `components/event-grid.tsx`
- `app/home-stream-fallback.tsx`
- `components/ui/route-loading.tsx`
- `app/[eventSlug]/loading.tsx`
- `lib/events/get-public-event-by-slug.ts`
- `AppUpdates.MD`

**Updates:** Shared **`EventGridLoadingSkeleton`** drives **`EventGrid`** loading state and the home **`Suspense`** fallback so streamed HTML matches final grids. Event routes use fullscreen **`RouteLoading`** with an optional hero-shaped pulse plus **`fullscreenLead`**. **`getPublicEventBySlug`** is wrapped with **`React.cache`** so metadata and page share one fetch per request.

## 2026-05-01 – Admin Add-Ons: full-row click to expand/collapse

- `components/admin/event-add-ons-tab.tsx`
- `AppUpdates.MD`

**Updates:** “All add-on items” (title + chevron), “Sold add-ons” section header, and each buyer row are now single toggle buttons so the full row expands/collapses; “Add item” stays a separate control to avoid nested buttons.

## 2026-05-01 – Book page add-ons card: full header toggles expand/collapse

- `components/booking/add-ons-carousel.tsx`
- `AppUpdates.MD`

**Updates:** The add-ons card header (title, subtitle, chevron) is now a single button so the whole strip toggles expand/collapse without nested buttons.

## 2026-05-01 – Sold add-ons admin: grand total price

- `components/admin/event-add-ons-tab.tsx`
- `AppUpdates.MD`

**Updates:** Sold add-ons card header shows **Total add-on sales** across all buyers; collapsed buyer rows also append that buyer’s order total next to the waiting-to-receive line.

## 2026-05-01 – Sold add-ons admin: group by order + pickup status

- `app/api/admin/events/[id]/add-ons/route.ts`
- `components/admin/event-add-ons-tab.tsx`
- `AppUpdates.MD`

**Updates:** Sold add-ons API now returns `sold_by_buyer` with nested orders (bookings), line-level `released_quantity`, and pending counts. Admin UI shows collapsible buyers (default collapsed) with “units waiting to receive” in the summary; expanded view lists orders and each line with Received / Pending / Partial badges aligned with admissions release.

## 2026-05-01 – Fix nested button hydration issue in Add-Ons admin card

- `components/admin/event-add-ons-tab.tsx`
- `AppUpdates.MD`

**Updates:** Reworked the Add-Ons card header to avoid a `button` inside another `button` (which caused hydration errors). The “Add item” action and collapse toggle are now separate sibling controls.

## 2026-05-01 – Admissions add-on stepper now updates live in dialog

- `components/ui/alert-dialog.tsx`
- `app/admissions/scan/page.tsx`
- `AppUpdates.MD`

**Updates:** Moved purchased add-ons rendering into a dynamic alert-dialog slot (`extraContent`) instead of embedding a stale snapshot in each scan result message, so add-on quantity `+/-` changes reflect immediately while the dialog is open.

## 2026-05-01 – Admissions add-on release control switched to strict stepper

- `app/admissions/scan/page.tsx`
- `AppUpdates.MD`

**Updates:** Replaced the editable numeric field in admissions add-on release rows with a deterministic `- / value / +` control to avoid browser spinner/input quirks; quantity changes now rely only on explicit step buttons.

## 2026-05-01 – Admissions add-on release quantity stepper fixed

- `app/admissions/scan/page.tsx`
- `AppUpdates.MD`

**Updates:** Replaced the fragile native number stepper behavior in the admissions add-on release block with explicit `- / +` controls plus clamped manual input, so staff can reliably set release quantity to `2+` when remaining units allow it.

## 2026-05-01 – Checkout requires explicit special request selection

- `app/[eventSlug]/checkout/checkout-content.tsx`
- `AppUpdates.MD`

**Updates:** The checkout special-request select no longer auto-defaults to “No special request”; buyers must choose a request type explicitly before proceeding. Also removed the “X tickets reserved.” subtitle under the Checkout heading.

## 2026-05-01 – Admissions scan now supports add-on release (online + offline queue)

- `supabase/migrations/00231_booking_add_ons_release_tracking.sql`
- `lib/admissions/admission-scan-server.ts`
- `lib/admissions/release-booking-add-on.ts`
- `app/api/admissions/add-ons/release/route.ts`
- `lib/admissions/offline-pack-types.ts`
- `lib/admissions/build-offline-pack.ts`
- `lib/admissions/offline-client.ts`
- `app/api/admissions/sync/route.ts`
- `app/admissions/scan/page.tsx`
- `AppUpdates.MD`

**Updates:** Admissions scan dialogs now show purchased add-ons with released status and per-item release actions. Release works online via a new admissions API and offline via outbox queue + sync replay, backed by `booking_add_ons.released_quantity` tracking.

## 2026-05-01 – Add-Ons admin: collapsible items card + sold-by-email card

- `components/admin/event-add-ons-tab.tsx`
- `app/api/admin/events/[id]/add-ons/route.ts`
- `AppUpdates.MD`

**Updates:** The Add-Ons editor is now wrapped in a collapsible **All add-on items** card (default collapsed). Added a second collapsible **Sold add-ons** card below Save, grouped by buyer email with per-buyer totals and line-item breakdowns from confirmed bookings.

## 2026-05-01 – Checkout email includes add-ons immediately after purchase

- `app/api/checkout/route.ts`
- `AppUpdates.MD`

**Updates:** The direct checkout email path (used when PayMongo is disabled / on-site flow) now passes `addOnsDetails` to `sendTicketEmail` and includes add-on subtotal in displayed subtotal math, so add-ons appear in first-send buyer emails.

## 2026-05-01 – Email template editor now includes add-ons placeholder

- `app/admin/settings/email-ticket-settings.tsx`
- `lib/email.ts`
- `app/api/checkout/route.ts`
- `AppUpdates.MD`

**Updates:** Added `{{addOnsBlock}}` to Email & Tickets placeholders and default HTML body, with auto-insert on save if missing. Email renderer now injects add-ons block with case-insensitive subtotal fallback. Checkout writes `booking_add_ons` via admin client for more reliable persistence.

## 2026-05-01 – Email template fallback for add-ons block

- `lib/email.ts`
- `AppUpdates.MD`

**Updates:** If a saved email template does not include `{{addOnsBlock}}`, ticket emails now auto-inject the Add-ons section before `Subtotal:` (or append at end), so add-ons still appear without requiring template edits.

## 2026-05-01 – Buyer ticket email now includes purchased add-ons

- `lib/confirm-booking.ts`
- `lib/email.ts`
- `AppUpdates.MD`

**Updates:** Checkout already persisted `booking_add_ons`; confirmation email now reads those rows, renders an **Add-ons** table (item / qty / line price), and includes add-on subtotal in the displayed subtotal math.

## 2026-05-01 – Admin Add-Ons: manual save button (no autosave)

- `components/admin/event-add-ons-tab.tsx`
- `AppUpdates.MD`

**Updates:** Disabled auto-save on blur/stepper/remove/upload edits in Add-Ons admin. Added unsaved-change tracking and a single **Save changes** action at the bottom; save runs in-place without page refresh.

## 2026-04-30 – DB fix: allow add-on rows in reservation_items

- `supabase/migrations/00230_reservation_items_add_on_constraint_fix.sql`
- `AppUpdates.MD`

**Updates:** Drops legacy `reservation_item_seat_or_section` (and prior line-kind check) then re-adds the add-on-aware `reservation_items_line_kind_chk`, so `{ add_on_id, quantity }` rows no longer fail with check-constraint errors.

## 2026-04-30 – Add-ons require ticket selection (prevent cart wipe + 500 noise)

- `app/[eventSlug]/book/book-page-client.tsx`
- `components/booking/add-ons-carousel.tsx`
- `AppUpdates.MD`

**Updates:** Add-on `+` is blocked until at least one ticket is selected, with a clear toast. Debounced reservation sync now only POSTs when ticket count > 0, so add-on-only transient states no longer fire `/api/reservations` and clear the cart.

## 2026-04-30 – Book cart sync: prevent checkout block on add-ons

- `app/[eventSlug]/book/book-page-client.tsx`
- `AppUpdates.MD`

**Updates:** Heartbeat now sends **`extend: true`** (TTL refresh only, no line-item rewrite). On transient `POST /api/reservations` 5xx, book sync rehydrates from `/api/reservations/me` and proceeds when the server still has ticket lines, reducing false checkout blocks with add-ons.

## 2026-04-30 – Add-ons carousel: restore swipe/drag + keep buttons clickable

- `components/booking/add-ons-carousel.tsx`
- `AppUpdates.MD`

**Updates:** Restored horizontal overflow so touch swipe works again, and added pointer drag-to-scroll for mouse/touch. Drag start ignores interactive controls (`button`, inputs, links) so `+`/`−` clicks are not hijacked.

## 2026-04-30 – Add-ons card: collapsible (default expanded)

- `components/booking/add-ons-carousel.tsx`
- `AppUpdates.MD`

**Updates:** Book-page Add-Ons card now has a header toggle to collapse/expand the carousel body; initial state is **expanded**.

## 2026-04-30 – Add-ons carousel: no auto-scroll or drag scrollbar

- `components/booking/add-ons-carousel.tsx`
- `AppUpdates.MD`

**Updates:** Removed continuous auto-tick scrolling and **overflow/drag scrollbar**; track uses **`overflow-x-hidden`** and **`touch-pan-y`** so only the **arrow buttons** move the strip (still looping).

## 2026-04-30 – Add-ons carousel: looping arrow scroll

- `components/booking/add-ons-carousel.tsx`
- `AppUpdates.MD`

**Updates:** Left/right arrows **wrap** from the last slide to the first (and reverse). Auto-tick scroll already reset to the start; helper copies now share one step size.

## 2026-04-30 – Admin Add-Ons: remove photo without deleting row

- `components/admin/event-add-ons-tab.tsx`
- `AppUpdates.MD`

**Updates:** **Remove photo** clears `image_url` and saves; closes fullscreen preview if it was showing that image. Storage object is not deleted (same as other replace flows).

## 2026-04-30 – Add-on fullscreen: single close control (fix double X)

- `components/booking/add-ons-carousel.tsx`
- `components/admin/event-add-ons-tab.tsx`
- `AppUpdates.MD`

**Updates:** Image preview dialogs pass **`hideClose`** on `DialogContent` so Radix’s default X is not stacked on the custom overlay close button.

## 2026-04-30 – Add-on upload images: max 1000px, stretch to square (no crop)

- `app/api/admin/upload/route.ts`
- `AppUpdates.MD`

**Updates:** Add-on pipeline scales down so the **longer side ≤ 1000px** (no upscale), then **`fit: fill`** to a **square** (non-uniform stretch, no crop). Still **WebP ~80**.

## 2026-04-30 – Admin Add-Ons: click thumbnail for fullscreen preview

- `components/admin/event-add-ons-tab.tsx`
- `AppUpdates.MD`

**Updates:** Add-on image thumbnails open a **dialog** with large **object-contain** preview and close control (same pattern as the book-page carousel).

## 2026-04-30 – Add-on images: 500×500 WebP on upload

- `app/api/admin/upload/route.ts`
- `components/admin/event-add-ons-tab.tsx`
- `AppUpdates.MD`

**Updates:** Admin add-on uploads set **`assetKind: add-on`**. The upload API **crops to a centered 500×500 cover**, **auto-orients** from EXIF, and encodes **WebP ~quality 80** so files stay small; other `event-images` paths unchanged.

## 2026-04-30 – Admin Add-Ons: narrower price & stock controls

- `components/admin/event-add-ons-tab.tsx`
- `AppUpdates.MD`

**Updates:** Price and stock steppers use **fixed-width inputs** and **max-width** wrappers so they no longer stretch to half the row.

## 2026-04-30 – Admin Add-Ons: silent auto-save + stepper fields (stock & price)

- `components/admin/event-add-ons-tab.tsx`
- `AppUpdates.MD`

**Updates:** Saving no longer shows the full-screen progress overlay (only initial load and image upload). Success toasts on save were removed; errors still toast. Stock and **price (PHP)** use **− / +** controls (price steps **₱1** per click; typing still allows centavos), centered fields, hidden native spinners.

## 2026-04-30 – Event add-ons (admin CRUD, book carousel, cart, checkout)

- `supabase/migrations/00229_event_add_ons.sql`
- `lib/event-admin-sections.ts`
- `components/admin/edit-event-tabs.tsx`
- `app/admin/events/[id]/page.tsx`
- `components/admin/event-add-ons-tab.tsx`
- `app/api/admin/events/[id]/add-ons/route.ts`
- `app/api/events/[id]/add-ons/route.ts`
- `app/api/reservations/route.ts`
- `app/api/reservations/[cartId]/route.ts`
- `app/api/reservations/me/route.ts`
- `lib/cart-summary.ts`
- `lib/reservation-sync-payload.ts`
- `app/api/checkout/route.ts`
- `store/reservation-store.ts`
- `components/booking/add-ons-carousel.tsx`
- `components/booking/inline-cart.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`
- `app/[eventSlug]/checkout/checkout-content.tsx`
- `AppUpdates.MD`

**Updates:** Event-scoped merchandise: `event_add_ons` + admin tab (upload, price PHP, stock), public catalog API, `reservation_items.add_on_id` with validation, cart summary and checkout add **add-on subtotal after ticket promos**, atomic stock decrement and `booking_add_ons` snapshots. Book page glass card with carousel (auto-scroll, lazy images, fullscreen, sold-out); sync/clear add-ons when ticket lines empty.

## 2026-04-30 – Cleanup orphan seats: chunk large `.in()` filters (fix PostgREST 400)

- `lib/cleanup-orphan-reserved-seats.ts`
- `AppUpdates.MD`

**Updates:** PostgREST encodes `.in("id", …)` on the query string; hundreds of UUIDs caused **400 Bad Request** (“Failed to release stale sold seats: Bad Request”). All large `in` filters and bulk updates in this routine now run in **chunks of 100**.

## 2026-04-30 – Fix 500 on cancel order (`cancel-pending` / booking cancel)

- `app/api/bookings/cancel-pending/route.ts`
- `app/api/bookings/[bookingId]/cancel/route.ts`
- `AppUpdates.MD`

**Updates:** Payment rows are marked **`failed`** (same as cleanup cron / PayMongo expiry) instead of **`cancelled`**, which often violates `payments` check constraints. **Orphan seat cleanup** is wrapped so it cannot fail the whole cancel response; **booking** update falls back to **`failed`** if **`cancelled`** is rejected. Top-level **try/catch** returns a JSON error message for unexpected failures.

## 2026-04-30 – Book page: stop accidental cart wipe + cross-tab cart hydrate

- `app/[eventSlug]/book/book-page-client.tsx`
- `components/booking/inline-cart.tsx`
- `AppUpdates.MD`

**Updates:** Debounced “empty cart” sync no longer **DELETE**s the reservation when **`cartId` is set but line items were never hydrated** for that id (fixes BroadcastChannel / timing races). It **GETs `/api/reservations/:cartId`** first, **rehydrates** if the server still has seats, and ignores carts for the wrong event. **BroadcastChannel** now **refetches `/api/reservations/me`** and applies the full payload. **`serverHydratedCartIdRef`** tracks server-aligned carts; **heartbeat / extend / POST sync** keep it updated. **Proceed to Checkout** uses clearer **disabled** styling.

## 2026-04-30 – Harden cart summary (checkout totals)

- `lib/cart-summary.ts`
- `app/api/events/[id]/cart-summary/route.ts`
- `app/[eventSlug]/checkout/checkout-content.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`
- `AppUpdates.MD`

**Updates:** Cart summary now **requires auth**, loads the cart only when **`profile_id` matches the session**, reads **`reservation_items` with the service role** after that check (consistent line items vs. cart row), and resolves **`event_seats` by `event_id` + seat ids** server-side. The **cart-summary API** sends **`Cache-Control: no-store`**. Checkout **invalidates cart-summary after reservation hydrate**, **retries refetch** when the server reports an empty cart while local selections still have tickets, and uses **exponential backoff on query failures**. The book page **awaits cart-summary prefetch** (with a short deadline) **before** navigating to checkout so totals are less likely to lag the reservation write.

## 2026-04-30 – Checkout total sometimes ₱0 with items in cart

- `app/[eventSlug]/checkout/checkout-content.tsx`
- `AppUpdates.MD`

**Updates:** Cart summary from React Query could override a good prefetched/SSR summary when the API briefly reported **zero line items** while local cart state still had tickets. Checkout now **keeps previous query data** while keys shift and **prefers SSR/store subtotals** when the server reports an empty cart, the client still has selections, and a non-zero fallback subtotal exists.


- `app/api/cron/storage-orphans-delete/route.ts` (new)
- `supabase/migrations/00228_storage_orphans_daily_cron.sql` (new)
- `README.md`
- `docs/NETLIFY_DEPLOY.md`
- `AppUpdates.MD`

**Updates:** New **`GET`/`POST /api/cron/storage-orphans-delete`** ( **`CRON_SECRET`** ) runs the same orphan purge as admin Settings; optional **`?bucket=`**. Migration schedules **`pg_cron`** daily (**08:00 UTC**) + **`pg_net`** using Vault secrets **`storage_orphans_cron_url`** / **`storage_orphans_cron_bearer`**.

## 2026-04-30 – Storage orphan cleanup: paginated listing + delete batches

- `lib/storage/storage-orphan-scan.ts`
- `AppUpdates.MD`

**Updates:** Orphan scan/delete now **pages through Storage `list()`** (only the first 1000 rows per prefix were fetched before), detects **files vs folder placeholders** without relying only on `id`, and uses **`remove()` batches up to 1000**. This addresses deletes returning 200 while orphaned counts stayed the same after refresh.

## 2026-04-30 – Fix typo: Ticket Scanning Source (settings label + file)

- `app/admin/settings/ticket-scanning-source-settings.tsx` (renamed from `ticket-scanning-srouce-settings.tsx`; component `TicketScanningSourceSettings`)
- `app/admin/settings/page.tsx`
- `AppUpdates.MD`

**Updates:** Settings dropdown and panel copy now say **Ticket Scanning Source**; tab value is `ticket-scanning-source`.

## 2026-04-30 – Admin Settings: storage orphan scan & delete (all buckets)

- `lib/storage/storage-orphan-buckets.ts` (new — client-safe bucket allow-list)
- `lib/storage/storage-orphan-scan.ts`
- `app/api/admin/storage/orphans/stats/route.ts` (new)
- `app/api/admin/storage/orphans/delete/route.ts` (new)
- `app/admin/settings/storage-orphan-settings.tsx` (new)
- `app/admin/settings/page.tsx`
- `AppUpdates.MD`

**Updates:** New **Storage cleanup** tab for super admins: pick any public bucket (`ticket-images`, `ticket-qr`, `event-images`, `event-banners`, `ticket-templates`, `seat-map-images`), see **files in use** vs **orphaned** after a DB cross-check, refresh, and delete orphans with confirmation (`DELETE_ORPHANS`). API routes use extended `maxDuration` for large buckets. Bucket IDs live in **`storage-orphan-buckets.ts`** so the client UI never imports scan logic that pulls `node:crypto` via `folder-links` → `bulk-zip-email`.

## 2026-04-30 – PayMongo surcharge: additive on net (matches base × rate)

- `lib/paymongo-processing-fees.ts`
- `lib/paymongo-processing-fees.test.ts` (new)
- `lib/paymongo-config.ts`
- `lib/email.ts`
- `app/admin/settings/paymongo-settings.tsx`
- `AppUpdates.MD`

**Updates:** Buyer charge is **net ticket total + surcharge** where percent applies to **net** (e.g. ₱3,000 × 0.8% = ₱24 → **₱3,024**), not fee-on-gross iteration. Admin PayMongo copy updated accordingly.

## 2026-04-30 – Free checkout (₱0): skip PayMongo dialog, complete inline

- `app/[eventSlug]/checkout/checkout-content.tsx`
- `AppUpdates.MD`

**Updates:** When **Total** is ₱0, **Complete Checkout** calls checkout immediately (no **Continue to PayMongo?** dialog). PayMongo blurb replaced with copy about confirming the order and emailing tickets. Floating progress text matches free vs paid flow. **On-Site Payment** is hidden when total is ₱0. Server `/api/checkout` already confirms the booking, generates ticket assets, and sends email when PayMongo is not used.

## 2026-04-30 – Checkout: Proceed to payment button yellow styling

- `app/[eventSlug]/checkout/checkout-content.tsx`
- `AppUpdates.MD`

**Updates:** Primary CTA uses `--wish-yellow` with a light yellow hover (`#FFF9B8`) and dark label text for contrast.

## 2026-04-30 – PayMongo modal: Change Payment Option button

- `app/[eventSlug]/checkout/checkout-content.tsx`
- `AppUpdates.MD`

**Updates:** PayMongo checkout dialog header includes **Change Payment Option** beside the close control; it dismisses the iframe so the buyer can choose another rail bucket and proceed again.

## 2026-04-30 – Checkout copy: processing charge label and card payment message

- `app/[eventSlug]/checkout/checkout-content.tsx`
- `AppUpdates.MD`

**Updates:** Order summary line renamed to **Payment Processing Charge**; unavailable card option helper text set to **Card payments coming soon**.

## 2026-04-30 – PayMongo resession after closing checkout (switch payment bucket)

- `app/api/bookings/[bookingId]/paymongo-resession/route.ts` (new)
- `app/[eventSlug]/checkout/checkout-content.tsx`
- `AppUpdates.MD`

**Updates:** Persist unpaid PayMongo `booking_id` per event in sessionStorage; on Proceed, call **`paymongo-resession`** first to open a new PayMongo session for another bucket without rebuilding the consumed reservation cart (fixes 409/400 after closing PayMongo). Cleared when payment confirms or order cancels. Default special request to **none** to fix Radix Select controlled/uncontrolled warning. Copy clarifies switching rails on Wish Checkout vs within PayMongo for one bucket.

## 2026-04-30 – PayMongo payment buckets and configurable processing gross-up

- `lib/paymongo-processing-fees.ts` (new)
- `lib/paymongo-config.ts`
- `app/api/admin/settings/route.ts`
- `app/admin/settings/paymongo-settings.tsx`
- `app/api/checkout/route.ts`
- `app/api/checkout/paymongo-options/route.ts` (new)
- `app/[eventSlug]/checkout/checkout-content.tsx`
- `supabase/migrations/00227_payments_paymongo_bucket.sql` (new)
- `lib/email.ts`
- `lib/confirm-booking.ts`
- `AppUpdates.MD`

**Updates:** Buyers choose a payment bucket (QR PH, E-Wallet, Cards, Banks); checkout creates a PayMongo session with only those rails and grosses up the charge from admin-configured fee rules. `bookings.total_cents` stays ticket net after promos; `payments.amount_cents` is what PayMongo charges. Pending-session reuse matches bucket + ticket net. Ticket emails include an optional processing fee line and template placeholder `{{processingFeeBlock}}`.

## 2026-04-30 – Occupancy dialog sold label clarified

- `components/admin/reports/kpi-detail-modal.tsx`
- `AppUpdates.MD`

**Updates:** In the **Overall Occupancy %** drilldown dialog, renamed the column header from **Sold** to **Sold Online**.

## 2026-04-30 – KPI labels for complimentary/admitted tickets

- `components/admin/reports/kpi-cards.tsx`
- `AppUpdates.MD`

**Updates:** Renamed KPI labels from **Complimentary** to **Complimentary Tickets** and from **Admitted** to **Admitted Tickets**.

## 2026-04-30 – VSS list label Total Sales to Online Sales

- `components/admin/reports/vss-breakdown-table.tsx`
- `AppUpdates.MD`

**Updates:** Updated the VSS Breakdown (List View) header label from **Total Sales** to **Online Sales**.

## 2026-04-30 – Rename Sold Online to Total Sales

- `components/admin/reports/kpi-cards.tsx`
- `components/admin/reports/section-revenue-table.tsx`
- `components/admin/reports/vss-breakdown-table.tsx`
- `components/admin/reports/vss-stacked-bar.tsx`
- `AppUpdates.MD`

**Updates:** Replaced report copy from **Sold Online** to **Total Sales** across KPI, section revenue, and VSS labels to match the new wording.

## 2026-04-30 – Reports: clarify online vs distributed ticket labels

- `components/admin/reports/kpi-cards.tsx`
- `components/admin/reports/section-revenue-table.tsx`
- `components/admin/reports/sections-horizontal-bar.tsx`
- `components/admin/reports/vss-breakdown-table.tsx`
- `components/admin/reports/vss-stacked-bar.tsx`
- `components/admin/reports/payment-donut.tsx`
- `AppUpdates.MD`

**Updates:** KPI and report copy now say **Sold Online**, **Online Sales**, **Distributed Tickets**, **Sections with Highest Sales Online**, and matching VSS / payment-donut labels where relevant; revenue drilldown modal title uses **Revenue**.

## 2026-04-30 – Payment method donut includes distributed seat value

- `supabase/migrations/00221_dashboard_payment_method_distributed.sql`
- `components/admin/reports/payment-donut.tsx`
- `hooks/use-dashboard-data.ts`
- `lib/reports/dashboard-metrics.ts`
- `AppUpdates.MD`

**Updates:** Payment Method Distribution now adds a **Distributed (seat value)** slice using the same face-value total as section “Distributed value”, and online/onsite booking totals exclude manual sales–distribution bookings so slices do not double-count. Apply migration `00221` so `get_admin_dashboard_metrics` returns `distributed_revenue_cents` and updated splits.

## 2026-04-30 – Duplicate edit revert now reloads persisted section

- `components/admin/seat-configurator.tsx`
- `AppUpdates.MD`

**Updates:** Fixed section edit duplicate handling so blur-time conflicts now reliably revert by reloading persisted seating data from the server, preventing cases where the duplicate value remained visible locally.

## 2026-04-30 – Revert duplicate section edits on blur

- `components/admin/seat-configurator.tsx`
- `AppUpdates.MD`

**Updates:** When editing section name/code, blur-time duplicate checks now open a dialog and immediately revert the field back to its previous value; API `409` conflicts during edit now follow the same dialog-and-revert behavior.

## 2026-04-30 – Seat configurator duplicate add uses dialog

- `components/admin/seat-configurator.tsx`
- `AppUpdates.MD`

**Updates:** Replaced duplicate section add feedback from toast to an in-page dialog so users still see duplicate-name/code errors when toast notifications are disabled.

## 2026-04-30 – Enforce unique section name/code per event

- `components/admin/seat-configurator.tsx`
- `app/api/admin/events/[id]/seating/sections/route.ts`
- `app/api/admin/events/[id]/seating/sections/[sectionId]/route.ts`
- `supabase/migrations/00226_event_sections_unique_name_code_per_event.sql`
- `AppUpdates.MD`

**Updates:** Added client and API duplicate checks so section names and section codes must be unique within an event (case-insensitive, trimmed), while section groups remain allowed to duplicate; added DB unique indexes to enforce this under concurrent writes.

## 2026-04-30 – Event cards: yellow hover glow in light theme

- `components/event-card.tsx`
- `AppUpdates.MD`

**Updates:** Event cards keep orange default glow but now switch to yellow glow on hover in light theme; dark theme keeps white hover glow.

## 2026-04-30 – Restore glass blur and event-card glow behavior

- `app/globals.css`
- `components/ui/input.tsx`
- `components/ui/card.tsx`
- `components/ui/select.tsx`
- `components/ui/dropdown-menu.tsx`
- `components/ui/dialog.tsx`
- `components/event-card.tsx`
- `AppUpdates.MD`

**Updates:** Brought back glass blur/saturation effects across core surfaces while keeping panel shadows disabled. Restored event-card glow styling with orange default glow and white hover glow.

## 2026-04-30 – Hard-flat theme rollout (app-wide)

- `app/globals.css`
- `components/ui/input.tsx`
- `components/ui/card.tsx`
- `components/ui/select.tsx`
- `components/ui/dropdown-menu.tsx`
- `components/ui/dialog.tsx`
- `components/ui/floating-progress.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`
- `app/[eventSlug]/checkout/checkout-content.tsx`
- `app/[eventSlug]/event-page-content.tsx`
- `components/event-card.tsx`
- `components/home-event-banner-carousel.tsx`
- `AppUpdates.MD`

**Updates:** Applied a hard-flat look across the app: removed global glass/light shadows and blur, removed accent glow, flattened core UI primitives (input/card/select/dropdown/dialog/progress overlay), and cleaned prominent per-page shadow hotspots in booking/checkout/event surfaces while preserving borders, spacing, and focus rings.

## 2026-04-30 – Seat configurator: flatten section input fields

- `components/admin/seat-configurator.tsx`
- `AppUpdates.MD`

**Updates:** Removed glassy drop-shadows/backdrop blur from section name/code/group inputs in the seat configurator (create row + per-section rows) to match a cleaner flat admin form style.

## 2026-04-30 – Admissions offline pack: verified on mobile + regression guard

- `lib/admissions/build-offline-pack.ts`
- `lib/admissions/offline-pack-seat-maps.ts`
- `AppUpdates.MD`

**Updates:** Production mobile test: “Save for offline scanning” completes at full ticket volume (e.g. **~2,304 rows** for “WishDate Rewrite Dagupan”). **Do not revert** to per-ticket `getSeatInfo()` or per-print-row ticket queries in `buildAdmissionsOfflinePack`—that caused **HTTP 502** on Netlify for large events. Keep `loadOfflinePackSeatMaps` / `seatInfoFromOfflineMaps`, batched print-alias resolution, and `NetworkOnly` for `GET /api/admissions/*` in `app/sw.ts`. In-code **REGRESSION GUARD** comments added on the builder and seat-maps module.

## 2026-04-30 – Admissions offline pack: batch seat and print lookups (fix HTTP 502)

- `lib/admissions/build-offline-pack.ts`
- `lib/admissions/offline-pack-seat-maps.ts` (new)
- `AppUpdates.MD`

**Updates:** Offline pack no longer runs `getSeatInfo` per ticket or one tickets query per print row. Batched `.in()` loads for `event_seats`, `event_sections`, legacy `seats`/`sections`, plus chunked print-alias resolution, mirror prior seat/alias behavior while avoiding serverless timeouts and gateway 502 on large events.

## 2026-04-30 – Admissions offline pack: bypass SW cache on mobile

- `app/sw.ts`
- `app/admissions/scan/page.tsx`
- `AppUpdates.MD`

**Updates:** Service worker now uses `NetworkOnly` for all same-origin `GET /api/admissions/*` routes before `defaultCache`, avoiding stale or broken cached API responses that often showed up as generic “Failed to build offline data” on phones. Scan page surfaces HTTP status when the JSON body has no `error` field.

## 2026-04-29 – Fix `fetch-tickets-for-booking-ids` build typing

- `lib/reports/fetch-tickets-for-booking-ids.ts`
- `AppUpdates.MD`

**Updates:** Cast paged Supabase ticket rows to `Record<string, unknown>[]` so production build type-check passes; no query or pagination behavior change.

## 2026-04-29 – Seat map group header: theme-aware label contrast

- `components/seat-picker/seat-map.tsx`
- `AppUpdates.MD`

**Updates:** Colored section-group chips now pick label/chevron color from luminance of the 14% section tint blended with theme `--background` (light/dark), fixing white-on-pink in light mode and dark-on-dark in dark mode.

## 2026-04-29 – Seat map: tint group header when section colors match

- `components/seat-picker/seat-map.tsx`
- `AppUpdates.MD`

**Updates:** Collapsible section-group rows (e.g. PATRON, GOLD) use the shared section card tint/border when every nested section has the same configured hex color; mixed or missing colors keep the default muted header.

## 2026-04-29 – Assign-seats: clarify image batch `failed` logging

- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx`
- `AppUpdates.MD`

**Updates:** `failed` from generate-images is per batch only while polling continues; mid-run warnings were misread as missing tickets. Log as `info` during polling, `warn` only if the job is `complete` but the batch still reports failures.

## 2026-04-29 – Migration: `bookings.buyer_email_override`

- `supabase/migrations/00225_bookings_buyer_email_override.sql`
- `AppUpdates.MD`

**Updates:** Adds missing `buyer_email_override` column expected by checkout, admin resend, and admissions offline pack (`GET /api/admissions/offline-pack` was failing with 500 when the column was absent).

## 2026-04-29 – Admissions offline pack: full ticket pagination

- `lib/admissions/build-offline-pack.ts`
- `lib/admissions/offline-pack-types.ts`
- `app/admissions/scan/page.tsx`
- `AppUpdates.MD`

**Updates:** Offline pack builder now pages through all `tickets` (and `print_tickets`) past PostgREST’s row cap and chunks large `bookings` / `admin_seat_assignments` queries. Pack includes optional `ticket_quantity_total`; save banner clarifies counts reflect DB ticket rows for the event, not venue capacity.

## 2026-04-29 – Admissions offline save: visible progress and messaging

- `app/admissions/scan/page.tsx`
- `AppUpdates.MD`

**Updates:** Global `toast` is a no-op, so offline pack save gave no feedback. Scan page now uses `FloatingProgressBar` during offline save/sync, inline success/error banners, fetch timeout, clearer copy (browser IndexedDB, not a Downloads file), and button label “Save for offline scanning”.

## 2026-04-29 – VSS: load all tickets (pagination + chunked booking filter)

- `lib/reports/fetch-tickets-for-booking-ids.ts`
- `lib/reports/dashboard-metrics.ts`
- `app/api/admin/dashboard/drilldown/route.ts`
- `AppUpdates.MD`

**Updates:** Dashboard VSS and drilldown ticket aggregation now page through `tickets` beyond PostgREST’s default row cap (~1000) and chunk large `booking_id` `in()` filters, fixing truncated distributed counts when many tickets exist.

## 2026-04-29 – VSS distributed: prefer ticket rows over assignment items

- `lib/reports/dashboard-metrics.ts`
- `app/api/admin/dashboard/drilldown/route.ts`
- `AppUpdates.MD`

**Updates:** Manual-assignment VSS and buyer quantity no longer trust `admin_assignment_items` when the booking already has ticket rows; per-section distributed/complimentary counts come from tickets (avoids undercount when items omit seats or lag confirm). Revenue drilldown row `quantity` is `max(ticket sum, assignment item sum)`.

## 2026-04-29 – Assignment image counters now use exact ticket counts

- `app/api/admin/events/[id]/assignments/route.ts`
- `AppUpdates.MD`

**Updates:** Replaced row-derived `Ticket images X/Y` counters with per-booking exact `count` queries (`head: true, count: exact`) for total and generated tickets, eliminating partial-row counter drift (e.g. `6/6`, `9/9`) while generation continues.

## 2026-04-29 – Assignment ticket counters now use admin reads

- `app/api/admin/events/[id]/assignments/route.ts`
- `AppUpdates.MD`

**Updates:** Manual Distribution card counters (`Ticket images X/Y`) now read booking tickets/event seats via service-role queries after authorization, preventing RLS-limited undercount displays like `9/9` while hundreds of images are actually generating.

## 2026-04-29 – Confirm uses service-role reads to avoid seat undercount

- `app/api/admin/assignments/[id]/confirm/route.ts`
- `AppUpdates.MD`

**Updates:** After permission checks, manual confirm now runs seat/item/ticket writes with service-role DB access to avoid RLS-scoped partial seat visibility that could confirm only a subset of assigned seats (e.g., 9 of 512).

## 2026-04-29 – Confirm hardening: prevent zero-ticket confirmation

- `app/api/admin/assignments/[id]/confirm/route.ts`
- `AppUpdates.MD`

**Updates:** Manual confirm now fetches `event_seats` in chunked ID batches and aborts with rollback if assigned seat metadata cannot be loaded, preventing accidental confirmed bookings with 0 tickets.

## 2026-04-29 – Distributed ticket counts use assignment quantities fallback

- `lib/reports/dashboard-metrics.ts`
- `app/api/admin/dashboard/drilldown/route.ts`
- `AppUpdates.MD`

**Updates:** Fixed analytics count mismatch where distributed amount paid was correct but ticket counts were low; dashboard and revenue drilldown now fallback to `admin_assignment_items` quantities for manual-distribution bookings when assignment totals exceed ticket-row totals.

## 2026-04-29 – Manual confirm counts all assigned seats (items + seat status)

- `app/api/admin/assignments/[id]/confirm/route.ts`
- `AppUpdates.MD`

**Updates:** Fixed manual distribution confirm to include seat-based `admin_assignment_items` rows (not just `event_seats.assignment_id`) when generating booking tickets and totals, preventing under-ticketing that caused VSS section undercounts.

## 2026-04-29 – VSS section accuracy: isolate unmapped ticket deltas

- `lib/reports/dashboard-metrics.ts`
- `AppUpdates.MD`

**Updates:** Fixed dashboard VSS reconciliation so section-mapping gaps no longer inflate a real section (e.g. Patron/Gold/Silver); missing per-section counts now go into an explicit `Unmapped` row, preserving accurate section breakdowns.

## 2026-04-29 – Manual distribution confirm: chunk seat/section lookups

- `lib/manual-assignment-confirm/generate-manual-assignment-ticket-images-batch.ts`
- `AppUpdates.MD`

**Updates:** Replaced large single `.in("id", [...])` metadata queries with chunked fetches for `event_seats` and `event_sections` to avoid PostgREST URL-size/network fetch failures during Confirm on bigger manual distributions.

## 2026-04-29 – Admissions offline: sessionStorage last-resort fallback

- `lib/admissions/offline-idb.ts`
- `lib/admissions/offline-pack-types.ts`
- `app/admissions/scan/page.tsx`
- `AppUpdates.MD`

**Updates:** Added a second fallback tier using `sessionStorage` when both IndexedDB and localStorage are unavailable/blocked; pack and outbox reads now check local+session stores, and storage error copy now reflects IndexedDB/local/session fallback behavior.

## 2026-04-29 – Admissions offline: localStorage fallback when IndexedDB missing or fails

- `lib/admissions/offline-idb.ts`
- `lib/admissions/offline-pack-types.ts`
- `app/admissions/scan/page.tsx`
- `AppUpdates.MD`

**Updates:** Pack and outbox now persist via **localStorage** when IndexedDB is unavailable or put/clear fails (e.g. quota), with size guards; successful IndexedDB writes clear the pack mirror in localStorage to avoid stale duplicates. Scan error toast copy covers localStorage fallback limits.

## 2026-04-29 – Admissions mobile: offline pack download + Last Downloaded indicator

- `app/admissions/scan/page.tsx`
- `lib/admissions/offline-idb.ts`
- `app/api/admissions/offline-pack/route.ts`
- `AppUpdates.MD`

**Updates:** Offline pack download now always reads the response with `res.text()` (avoids stream/`Content-Length` truncation on mobile), normalizes `generated_at` before saving to IndexedDB, shows Last Downloaded Data whenever a pack exists for the current event (with fallback copy if the timestamp is invalid), surfaces clearer toasts for storage/IndexedDB failures, guards `idbSetPack` when IndexedDB is unavailable, and adds `force-dynamic` plus no-store cache headers on the offline-pack API.

## 2026-04-29 – Book page: auto-expand Event Seat Plan after event loads

- `app/[eventSlug]/book/book-page-client.tsx`
- `AppUpdates.MD`

**Updates:** When the event finishes loading and has seat map images, the Event Seat Plan accordion opens automatically so users see the map without an extra click.

## 2026-04-29 – Seat loading unblock: Refresh never stuck + RPC ceiling + seat plan defer

- `app/[eventSlug]/book/book-page-client.tsx`
- `app/api/events/[id]/availability/route.ts`
- `AppUpdates.MD`

**Updates:** Decoupled Refresh Seats from awaiting `invalidateQueries` (cancel + fire `refetchAvailability`), enabled the button whenever an event id exists, show spinner from `availabilityFetching`, bumped availability client retries to 5, defaulted Event Seat Plan accordion collapsed to reduce image/JSON contention, added 18s server timeout on `get_event_availability` with 504 `availability_timeout`, and dev-only timing log on successful availability responses.

## 2026-04-29 – Seat map image cache bypass on booking

- `components/seat-map-image-carousel.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`
- `AppUpdates.MD`

**Updates:** Added booking-only seat map image cache bypass (unoptimized + cache-busting query) and set checkout cart-summary prefetch to `cache: "no-store"` to eliminate remaining client-side cache reuse in the booking flow.

## 2026-04-29 – Seat availability fetch timeout + retry hardening

- `app/[eventSlug]/book/book-page-client.tsx`
- `AppUpdates.MD`

**Updates:** Added timeout-driven retries for booking availability fetches (with stronger cache-busting query params) so seat loading no longer hangs indefinitely when initial requests stall.

## 2026-04-29 – Booking flow no-cache sweep (API + client fetches)

- `app/api/reservations/route.ts`
- `app/api/reservations/me/route.ts`
- `app/api/reservations/[cartId]/route.ts`
- `app/api/events/route.ts`
- `app/[eventSlug]/book/book-page-client.tsx`
- `AppUpdates.MD`

**Updates:** Added `force-dynamic` and explicit `Cache-Control: private, no-store` headers across reservation and slug-event APIs, and set reservation GET calls on the booking page to `cache: "no-store"` to avoid stale seat/cart state from cached responses.

## 2026-04-29 – Seat selection freshness hardening (no cache/stale/dynamic chunks)

- `app/[eventSlug]/book/page.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`
- `app/api/events/[id]/prices/route.ts`
- `AppUpdates.MD`

**Updates:** Forced no-store rendering for the seat page, removed lazy-loaded chunks in booking UI, and enforced no-store/fresh refetch behavior for event, availability, and pricing queries plus API response headers to reduce stale/empty seat states.

## 2026-04-29 – Guest signup CTA text: I’m a Member

- `components/guest-signup-dialog.tsx`
- `AppUpdates.MD`

**Updates:** Renamed the middle login CTA from `Sign In` to `I’m a Member` while keeping the same login redirect behavior.

## 2026-04-29 – Guest signup logo: no circle, larger size

- `components/guest-signup-dialog.tsx`
- `AppUpdates.MD`

**Updates:** Removed the circular icon background behind the modal logo and increased logo size for stronger visual prominence.

## 2026-04-29 – Guest signup dialog icon uses brand logo

- `components/guest-signup-dialog.tsx`
- `AppUpdates.MD`

**Updates:** Replaced the ticket glyph in the guest signup modal with the existing `/logo.webp` brand mark to align the prompt with app identity.

## 2026-04-29 – Guest signup dialog title copy update

- `components/guest-signup-dialog.tsx`
- `AppUpdates.MD`

**Updates:** Changed the guest modal title from `You’re almost there!` to `Be part of the experience!` to match the updated onboarding message tone.

## 2026-04-29 – Guest signup dialog Sign In button set to yellow

- `components/guest-signup-dialog.tsx`
- `AppUpdates.MD`

**Updates:** Updated the modal `Sign In` CTA to a yellow fill with dark text for higher contrast and clearer visual distinction from the other actions.

## 2026-04-29 – Guest signup dialog colored action buttons

- `components/guest-signup-dialog.tsx`
- `AppUpdates.MD`

**Updates:** Applied distinct filled button colors for `Sign Up`, `Sign In`, and `I’ll Explore First` so all three actions read as clearly interactive in the modal.

## 2026-04-29 – Guest signup dialog hydration fix

- `components/guest-signup-dialog.tsx`
- `AppUpdates.MD`

**Updates:** Replaced nested paragraph tags inside `DialogDescription` with block spans to avoid invalid `<p>` nesting and prevent hydration errors in the signup prompt modal.

## 2026-04-29 – Guest signup dialog copy + action buttons refresh

- `components/guest-signup-dialog.tsx`
- `AppUpdates.MD`

**Updates:** Replaced the guest prompt body copy with the new two-line sign-up/sign-in message, added a dedicated `Sign In` action, relabeled the defer action to `I’ll Explore First`, and styled it as a clear button.

## 2026-04-29 – Home/API first-load performance caching pass

- `app/page.tsx`
- `app/api/events/route.ts`
- `components/event-grid.tsx`
- `lib/events/event-grid-server.ts`

**Updates:** Enabled short ISR on home, added edge cache headers for list/split events API responses, and removed immediate hydration refetch so first-load requests avoid duplicate backend work and return faster.

## 2026-04-28 – User Roles search field: remove floating look

- `app/admin/settings/user-roles-settings.tsx`
- `AppUpdates.MD`

**Updates:** Per-role search inputs now use no drop shadow plus a subtle card-matching ring/background so they visually sit within each role panel instead of appearing detached.

## 2026-04-28 – User Roles cards: light-mode readability

- `app/admin/settings/user-roles-settings.tsx`
- `AppUpdates.MD`

**Updates:** Role card backgrounds, header separators, and row fills now use light/dark-aware tint classes so content remains readable in light mode while preserving per-role color coding.

## 2026-04-28 – Global settings users: collapsible lists + per-role search

- `app/admin/settings/users-settings.tsx`
- `app/admin/settings/user-roles-settings.tsx`
- `AppUpdates.MD`

**Updates:** Registered Users now starts collapsed with a visible account count and expand/collapse toggle. User Roles cards keep collapsed behavior and now include per-role search inputs with filtered-result counts.

## 2026-04-28 – Home banner carousel: slower auto-scroll, no pause/play control

- `components/home-event-banner-carousel.tsx`
- `AppUpdates.MD`

**Updates:** `embla-carousel-auto-scroll` speed set to `0.9`; removed visible Pause/Play button (dots only).

## 2026-04-28 – Home banner carousel: embla-carousel-auto-scroll + parallax + lazy neighbors

- `components/home-event-banner-carousel.tsx`
- `package.json`
- `AppUpdates.MD`

**Updates:** Replaced snap-based `embla-carousel-autoplay` with **`embla-carousel-auto-scroll@8.6.0`** (smooth continuous drift; `loop: true` for infinite motion). Pause/Play pill toggles `plugins().autoScroll.stop()` / `play()`. Parallax and circular neighbor lazy `next/image` unchanged. `prefers-reduced-motion` still disables the auto-scroll plugin.

## 2026-04-28 – Header Sign In/Up: navigation progress + prefetch + loading fallback

- `components/header.tsx`
- `components/header-desktop-account.tsx`
- `components/header-mobile-menu.tsx`
- `components/ui/nav-button-with-progress.tsx`
- `AppUpdates.MD`

**Updates:** Sign In/Sign Up use `NavButtonWithProgress` (floating overlay + `startTransition` + `router.push`) with copy tailored to auth routes. Prefetch `/login` and `/signup` when logged out. Dynamic import loading state now renders real `Link` buttons instead of a non-interactive skeleton so early clicks still navigate.

## 2026-04-28 – Seat Configurator: show seat grid for single ungrouped section

- `components/seat-picker/seat-map.tsx`
- `AppUpdates.MD`

**Updates:** `SeatMap` was initializing the sole `__ungrouped__` group as collapsed even when no group heading is rendered, so the admin seat workspace looked empty while counts and controls still appeared. Single ungrouped groups now start expanded.

## 2026-04-28 – Seat Configurator: row/column control order

- `components/admin/seat-configurator.tsx`
- `AppUpdates.MD`

**Updates:** Add/remove controls now read left-to-right as Add Rows, Add Columns, Remove Rows, Remove Columns.

## 2026-04-28 – Refund lookup: modal for API-blocked refunds (e.g. QR Ph)

- `app/admin/refund-lookup/page.tsx`
- `AppUpdates.MD`

**Updates:** When lookup detects PayMongo API refund blocking, opens an informational dialog (amber styling, dashboard link, server reason text), inline banner with “Why, and what to do”, and does not auto-reopen after dismiss until the next lookup.

## 2026-04-28 – QR Ph (qrph): API refund blocked + source type on lookup

- `lib/paymongo.ts`
- `app/api/admin/refund-lookup/route.ts`
- `app/admin/refund-lookup/page.tsx`
- `AppUpdates.MD`

**Updates:** PayMongo returns 400 for API refunds on QR Ph (`qrph`). Added `resolvePaymongoPaymentSourceType`, blocked list for API refunds, GET shows `payment_source_type` and disables Issue refund when blocked; POST returns 422 with a clear message instead of calling PayMongo.

## 2026-04-28 – Refund POST body normalization (null / camelCase)

- `app/api/admin/refund-lookup/route.ts`
- `AppUpdates.MD`

**Updates:** Normalize JSON before Zod (accept `bookingId` / `paymentId` / `amountCents`, strip `null`), allow `notes: null`, and return `requested_payment_id` + `allowed_payment_ids` when the pay_ whitelist fails so 400s are diagnosable.

## 2026-04-28 – PayMongo refund POST body + clearer refund API errors

- `lib/paymongo.ts`
- `app/api/admin/refund-lookup/route.ts`
- `app/admin/refund-lookup/page.tsx`
- `AppUpdates.MD`

**Updates:** `POST /v1/refunds` now sends JSON:API `{ data: { type: "refund", attributes } }` (was missing `type`, which can cause PayMongo 400). Validation accepts coerced `amount_cents` and trimmed IDs; empty PayMongo resolution returns 503 instead of a misleading not-allowed 400. Refund failure toasts include `detail`, `paymongo_status`, and stringify Zod errors when present.

## 2026-04-28 – ConfirmDialog `return false` + refund errors without throw

- `components/ui/confirm-dialog.tsx`
- `app/admin/refund-lookup/page.tsx`
- `AppUpdates.MD`

**Updates:** `ConfirmDialog` keeps the dialog open when `onConfirm` resolves `false`. Refund submission uses that instead of throwing on API/validation errors so Next.js does not surface a runtime overlay; added try/catch around the refund fetch.

## 2026-04-28 – Refund percent UI and PayMongo webhook 200

- `app/admin/refund-lookup/page.tsx`
- `app/api/webhooks/paymongo/route.ts`
- `AppUpdates.MD`

**Updates:** Replaced the native number stepper with +/- controls and a text field (`inputMode="decimal"`); PayMongo webhook replies now use an explicit `ack200()` helper returning HTTP 200 consistently.

## 2026-04-28 – Refund lookup Issue refund uses percentage

- `app/admin/refund-lookup/page.tsx`
- `AppUpdates.MD`

**Updates:** Issue refund amount input is now a percentage of the original payment (default 100%); centavos sent to PayMongo are derived from that percentage with helper text showing ₱ equivalent.

## 2026-04-28 – PayMongo refund API and admin Issue refund UI

- `lib/paymongo.ts`
- `app/api/admin/refund-lookup/route.ts`
- `app/admin/refund-lookup/page.tsx`
- `AppUpdates.MD`

**Updates:** Added `createPaymongoRefund` (`POST /v1/refunds`), extended refund-lookup with a authenticated POST that whitelists `pay_` IDs via `resolvePaymongoRefundPaymentIds` and caps amount to the booking payment, and added an Issue refund section on Refund lookup (payment select, amount, reason, notes, destructive `ConfirmDialog` with progress overlay).

## 2026-04-28 – SeatMap section groups are collapsible and default collapsed

- `components/seat-picker/seat-map.tsx`

**Updates:** Added collapsible group headers for section groups in SeatMap and initialized all groups in collapsed state on first render, so manual distribution now starts with compact grouped lists that can be expanded per group.

## 2026-04-28 – Manual distribution grouping fixed by enriching section_group

- `app/api/admin/events/[id]/assign-seats-bootstrap/route.ts`

**Updates:** Added an `event_sections` lookup in assign-seats bootstrap to merge `section_group` per section before returning payload, ensuring Manual Distribution can render group headers even when the availability RPC omits `section_group`.

## 2026-04-28 – Manual distribution seat list grouped by section group

- `app/api/admin/events/[id]/assign-seats-bootstrap/route.ts`
- `app/admin/events/[id]/assign-seats/assign-seats-types.ts`
- `components/seat-picker/seat-map.tsx`

**Updates:** Added `section_group` to assign-seats availability payload/types and grouped the SeatMap section cards by group label in the manual distribution picker, with automatic group headers when multiple or named groups are present.

## 2026-04-28 – Seat action controls centered

- `components/admin/seat-configurator.tsx`

**Updates:** Center-aligned the bulk add/remove rows/columns action cards by adding `justify-center` to the wrapping controls row while preserving existing card sizing and colors.

## 2026-04-28 – Seat action cards fitted to content with add/remove color coding

- `components/admin/seat-configurator.tsx`

**Updates:** Changed bulk rows/columns action cards to content-fit width (`w-fit`) so each card ends near `Rows/Columns`, switched layout to wrapping flex for cleaner spacing, and applied light green card styling for Add actions and light red styling for Remove actions.

## 2026-04-28 – Seat controls: mirrored Remove button before stepper

- `components/admin/seat-configurator.tsx`

**Updates:** Mirrored remove controls to match add controls: `Remove` button now appears before the number stepper for both rows and columns. Also corrected control-to-state wiring in the bulk action grid to keep rows/columns actions mapped correctly.

## 2026-04-28 – Seat controls: Add button moved before stepper

- `components/admin/seat-configurator.tsx`

**Updates:** Reordered `Add Rows` and `Add Columns` controls so the Add action button appears before the numeric stepper, matching the requested visual flow.

## 2026-04-28 – Seat controls: removed leading Add/Remove labels

- `components/admin/seat-configurator.tsx`

**Updates:** Removed the redundant leading `Add`/`Remove` text labels from bulk controls so the action is represented by the existing Add/Remove button and the layout appears cleaner.

## 2026-04-28 – Seat controls text flow updated to Add/Remove + stepper + Rows/Columns

- `components/admin/seat-configurator.tsx`

**Updates:** Reordered bulk seat-control labels to read naturally as `Add [stepper] Rows`, `Remove [stepper] Rows`, `Add [stepper] Columns`, and `Remove [stepper] Columns` for quicker comprehension.

## 2026-04-28 – Seat configurator controls reorganized for clarity

- `components/admin/seat-configurator.tsx`

**Updates:** Rearranged the bulk seat action controls into a cleaner structure: delete action on its own row, and row/column add-remove controls grouped into bordered cards in a responsive grid for easier scanning and less visual confusion.

## 2026-04-28 – Admissions offline sync keeps failed Grant Re-entry ops for retry

- `app/admissions/scan/page.tsx`

**Updates:** Sync now removes only successful outbox operations (including deduped ones) and keeps failed ones queued, so offline `Grant Re-entry`/`Admit` actions are not lost and can retry later. Added pending-count update and partial-failure toast.

## 2026-04-28 – Admissions offline download: mobile-compatible response parsing

- `app/admissions/scan/page.tsx`

**Updates:** Hardened `handlePrepareOffline` for mobile browsers by adding explicit same-origin credentials, no-store fetch, stream-reader capability checks, and a robust `res.text()` JSON fallback when streamed readers are unavailable/inconsistent.

## 2026-04-28 – Checkout special request label renamed to Others

- `lib/special-request.ts`
- `app/[eventSlug]/checkout/checkout-content.tsx`

**Updates:** Renamed the request option label from `Others (with notes)` to `Others` and updated checkout helper/error text to match while keeping notes required for the `Others` option.

## 2026-04-28 – Event cards: clip media to rounded corners (no square bleed past glow)

- `components/event-card.tsx`
- `components/event-card-skeleton.tsx`

**Updates:** Wrapped card body in `overflow-hidden rounded-xl` while keeping the outer `Card` `overflow-visible` for orange glow shadows so poster/media stays inside the rounded frame.

## 2026-04-28 – Event grid cards: restore orange edge glow + hover

- `app/globals.css`
- `components/event-card.tsx`
- `components/event-card-skeleton.tsx`
- `components/ui/dialog.tsx`
- `components/home-event-banner-carousel.tsx`

**Updates:** Moved `.glass` / `.glass-light` into `@layer components` so utility `shadow-*` beats default glass shadow; event cards use `overflow-visible` (replacing card `overflow-hidden` via merge) so outer glow isn’t clipped; slightly stronger Wish-orange shadow tiers; skeleton matches idle glow; removed redundant `shadow-lg` where layered `.glass` already defines depth.

## 2026-04-28 – Homepage carousel banners: 1280 × 543 upload size

- `app/api/admin/upload/route.ts`
- `components/admin/event-banners-section.tsx`
- `components/home-event-banner-carousel.tsx`

**Updates:** Event banner uploads are cropped/resized to **1280 × 543** WebP (replacing 725 × 310); admin copy and thumbnails use the same aspect ratio as the public carousel.

## 2026-04-28 – Homepage carousel: taller on mobile, shorter on desktop

- `components/home-event-banner-carousel.tsx`

**Updates:** Adjusted slide flex widths (`92%` → `82%` → `66%` → `60%` by breakpoint) so the fixed-aspect banner is taller on phones and shorter on large viewports; aligned `sizes` on the hero image for decoding.

## 2026-04-28 – Restore glassmorphism (blur + frost) on shared `.glass` and overlays

- `app/globals.css`
- `components/ui/dropdown-menu.tsx`
- `components/ui/select.tsx`
- `components/header-desktop-account.tsx`
- `components/home-event-banner-carousel.tsx`
- `app/about/about-content.tsx`

**Updates:** Re-added frosted-glass behavior (`backdrop-filter` blur/saturation, edge highlight shadow) on `.glass` / `.glass-light`, swapped dropdown and select panels to real glass instead of solid `--background`, removed an account-menu override that forced opaque fills, and applied `glass` to the homepage banner chrome and About feature cards.

## 2026-04-28 – Homepage banner further height reduction (shared width)

- `components/home-event-banner-carousel.tsx`

**Updates:** Decreased the uniform slide width from `84/80/76` to `80/76/72` to reduce overall carousel height while preserving `1270:543` aspect ratio and existing loop/autoplay behavior.

## 2026-04-28 – Homepage banner lower overall height via shared width

- `components/home-event-banner-carousel.tsx`

**Updates:** Reduced the uniform slide width from `88/84/80` to `84/80/76` (responsive) so the carousel appears shorter overall while preserving the exact `1270:543` image ratio and loop/autoplay behavior.

## 2026-04-28 – Homepage banner uniform slide width for consistent height

- `components/home-event-banner-carousel.tsx`

**Updates:** Removed variable per-slide widths and set one shared responsive width (`88/84/80`) for all slides so banners render at the same on-screen height while retaining the `1270:543` aspect ratio and looping behavior.

## 2026-04-28 – Homepage banner ratio aligned to upload dimensions

- `components/home-event-banner-carousel.tsx`

**Updates:** Updated the banner slide ratio from `2.34:1` shorthand to the exact upload ratio `1270:543` so uploaded artwork displays at the same native proportion in the homepage carousel.

## 2026-04-28 – Homepage banner images set to 2.34:1

- `components/home-event-banner-carousel.tsx`

**Updates:** Set banner image ratio to exact `2.34:1` (`aspect-[234/100]`) while keeping the current variable slide widths and loop/autoplay behavior.

## 2026-04-28 – Homepage banner trial: slight additional width reduction

- `components/home-event-banner-carousel.tsx`

**Updates:** Reduced banner slide widths a little further to 88/80/74 (with responsive variants) for a subtler narrower look while preserving the same height ratio and looping behavior.

## 2026-04-28 – Homepage banner trial: reduced image width

- `components/home-event-banner-carousel.tsx`

**Updates:** Narrowed carousel image widths by lowering variable slide width percentages (now 92/84/78 base pattern) while preserving the flattened height ratio and loop/autoplay behavior.

## 2026-04-28 – Homepage banner trial: further height reduction

- `components/home-event-banner-carousel.tsx`

**Updates:** Reduced banner height again by flattening slide ratio from `26/10` to `30/10`, keeping full-viewport width behavior and looping carousel settings unchanged.

## 2026-04-28 – Homepage banner trial: viewport-width and lower height

- `components/home-event-banner-carousel.tsx`

**Updates:** Expanded the banner wrapper to full viewport width (`w-screen` breakout), tightened slide gaps, increased variable-width coverage for a wider feel, and reduced carousel height with a flatter `26/10` aspect ratio while preserving loop/autoplay behavior.

## 2026-04-28 – Homepage banner ratio set to 2.34

- `components/home-event-banner-carousel.tsx`

**Updates:** Updated the homepage banner slide aspect ratio to an exact `2.34` (`aspect-[234/100]`) to match the requested width-to-height proportion while preserving loop and variable-width behavior.

## 2026-04-28 – Homepage banner trial tuning: wider and shorter

- `components/home-event-banner-carousel.tsx`

**Updates:** Adjusted variable slide widths upward so the banner fills more horizontal space (100/92/86 pattern) and reduced visible height by changing the hero aspect ratio to `21/8` for a wider, flatter strip.

## 2026-04-28 – Homepage banner trial: full-width variable slide sizes

- `components/home-event-banner-carousel.tsx`

**Updates:** Replaced the fixed `725px` banner container with a full-width layout and added rotating variable Embla slide widths (96/88/80 pattern across slides) to preview a wider, peeking carousel style while keeping autoplay + loop behavior.

## 2026-04-28 – Duplicate section: fix seats not copying (seat_type removed from schema)

- `app/api/admin/events/[id]/seating/sections/[sectionId]/duplicate/route.ts`

**Updates:** Source-seat `select` no longer references dropped column `seat_type` (PostgREST rejected the query silently and returned no rows), so duplicate now loads and inserts all seats. Reads check `error` and rollback the new section on failure.

## 2026-04-28 – Duplicate section preserves Rows/Columns and seating fetch

- `components/admin/seat-configurator.tsx`
- `app/api/admin/events/[id]/seating/sections/[sectionId]/duplicate/route.ts`

**Updates:** Derived Rows/Columns for assigned layouts now use widest row × row count (staggered/triangular sections). Duplicate merges source section generator settings in the same `fetchSeating` pass (`mergeGenerateForSectionIds`). Seating GET uses `cache: "no-store"`. Duplicate seat inserts include `status: 'available'`; API returns `seats_copied`.

## 2026-04-28 – Seat Configurator: per-row Remove column

- `components/admin/seat-configurator.tsx`
- `app/api/admin/events/[id]/seating/seats/remove-column-row/route.ts` (new)

**Updates:** Each assigned-seating row’s actions beside “Add column” include “Remove column” (removes the outermost seat in that row via `POST .../remove-column-row`; disabled when the row has only one seat).

## 2026-04-28 – Seat configurator: silent saves and duplicate section

- `components/admin/seat-configurator.tsx`
- `app/api/admin/events/[id]/seating/sections/[sectionId]/duplicate/route.ts` (new)

**Updates:** Mutation refetches use `fetchSeating({ silent: true })` so the configurator does not swap to full-screen loading; generate seats preserves expanded sections. New POST duplicates a section (metadata, seats with new scan/QR codes, seat layout image copy when present, event_prices / early_bird_prices). Copy button beside delete on each section row.

## 2026-04-28 – Admissions transfer percent now visible even without byte totals

- `app/admissions/scan/page.tsx` – Added computable-total detection for download/upload progress and fallback advancing percentages when `Content-Length` or upload length is unavailable, so button progress remains visible instead of showing only “Downloading…”/“Uploading…”.

## 2026-04-28 – Admissions offline transfer: actual byte-based percentages

- `app/admissions/scan/page.tsx` – Switched download progress to response-stream byte tracking (`Content-Length` + `ReadableStream`) and upload progress to `XMLHttpRequest.upload.onprogress` for real transfer percentages; falls back to “Downloading…” / “Uploading…” text when browser/server cannot provide computable totals.

## 2026-04-28 – Admissions offline buttons: live-progress percentages

- `app/admissions/scan/page.tsx` – Replaced fixed 15/70 jump percentages with smooth in-flight progress updates for both download and upload actions, so button percentages now visibly advance while requests are running and complete at 100% when done.

## 2026-04-28 – Admissions offline action buttons renamed and color-coded

- `app/admissions/scan/page.tsx` – Renamed top actions to **Download Offline Data** and **Upload Offline Data**, added download/upload icons, changed busy labels to **Downloading** and **Uploading**, updated timestamp label to **Last Downloaded Data**, applied light green/red button styling, and added in-button progress percentages during active download/upload.

## 2026-04-28 – Dialog readability: stronger backdrop dim and blur

- `components/ui/dialog.tsx` – Increased the shared dialog overlay from `bg-black/70` to `bg-black/82` and added a subtle backdrop blur so background content is less distracting behind popups like checkout confirmation/cancel dialogs.

## 2026-04-28 – Checkout: remove duplicate PayMongo loading dialog

- `app/[eventSlug]/checkout/checkout-content.tsx` – Removed `ConfirmDialog` loading props for “Continue to PayMongo” so the page shows only the existing `FloatingProgressBar` while checkout starts, preventing a second stacked “Starting secure payment...” dialog behind the first.

## 2026-04-28 – Image proxy: fix Netlify CDN reusing wrong image for `/api/image-proxy`

- `app/api/image-proxy/route.ts` – Removed **`public, max-age=31536000, immutable`** for UUID-named storage paths and invalid **`Vary: url`**; proxy responses now use **`private`** + short TTL so **edge caches cannot serve one fetched blob for all `?url=` variants** (dev unaffected; manifests on Netlify/deploy only).

## 2026-04-28 – Admin homepage banners: distinct thumbnails per row

- `components/admin/event-banners-section.tsx` – Replaced **`<Image fill />`** preview thumbs with **plain `<img>`** (avoids Next/Image reusing decoded bitmaps across sibling rows), added **`bannerId`** query on `/api/image-proxy` requests for cache isolation, and shallow-clone banner row on insert.

## 2026-04-28 – Public event page: mobile-centered copy + aspect-fit hero

- `app/[eventSlug]/page.tsx` – Event title **centered on small screens**, left from `md` up.
- `app/[eventSlug]/event-page-content.tsx` – Portrait hero uses **native aspect ratio** (and 3:4 placeholder before load) instead of a fixed `55vh` box; portrait direct video / Shorts wrappers match; **`text-center md:text-left`**, centered metadata and actions on mobile.
- **Updates:** Portrait poster no longer letterboxed in a tall rectangle on phones; wider landscape hero layout unchanged (`flex-col` defaults to full-width media).

## 2026-04-28 – Homepage banner carousel: multi-slide Embla layout (Netlify / production)

- `components/home-event-banner-carousel.tsx` – Slides use `flex-[0_0_100%]` (explicit Embla slide width), **`reInit()` when slide set changes**, and distinct **Image keys** so each slide resolves its own asset; fixes a case where all slides appeared as one image with autoplay looping in place.

## 2026-04-28 – Admin carousel banners: collapsible rows (default collapsed)

- `components/admin/event-banners-section.tsx` – Each banner card can expand/collapse; **default collapsed**. Collapsed row shows drag handle, small preview, **Active**, and **Expand**; expanded shows full preview, **Collapse**, and **Remove**.
- `components/admin/event-banners-section.tsx` – The whole **Homepage carousel banners** panel is collapsible (**default collapsed**); header shows count or “expand to add…”; chevron toggles; **Add banner** stays visible when collapsed.

## 2026-04-28 – Homepage banner carousel: hide prev/next arrows

- `components/home-event-banner-carousel.tsx` – Removed overlaid left/right arrow buttons; dots, swipe, and autoplay unchanged.

## 2026-04-28 – Homepage event banner carousel + admin multi-banner storage

- `supabase/migrations/00224_event_banners.sql` – Table `event_banners`, RLS, Storage bucket `event-banners`, RPC `get_home_banner_carousel_rows` for public carousel data.
- `app/api/admin/upload/route.ts` – `event-banners` bucket uploads: Sharp crop 1280×543 WebP, paths `events/{eventId}/…`.
- `app/api/admin/events/[id]/banners/route.ts`, `app/api/admin/events/[id]/banners/[bannerId]/route.ts` – CRUD/reorder/toggle for carousel rows.
- `components/admin/event-banners-section.tsx`, `components/admin/event-form.tsx`, `app/admin/events/[id]/page.tsx` – Admin Details: manage banners (upload, reorder, active, delete) with parent `FloatingProgressBar` coordination.
- `lib/events/home-banner-server.ts`, `lib/events/event-grid-types.ts`, `app/home-split-loader.tsx`, `app/home-client.tsx` – SSR fetch slides; `components/home-event-banner-carousel.tsx` – Embla carousel (autoplay, prev/next, dots, link to `/{eventSlug}`).
- `lib/ticket-image.ts` – ESLint `prefer-const` (`yLabel`).
- **Updates:** Multiple homepage carousel images per published upcoming event; dedicated storage bucket.

## 2026-04-28 – Event Ticket Template: add global template reference card

- `components/admin/ticket-template-upload.tsx` – Added a **Global template (reference)** card in the event Ticket Template tab showing the global/default ticket background with click-to-fullscreen preview and a download action (`ticket_template.jpg` when configured, default PNG otherwise).
- `components/admin/ticket-template-upload.tsx` – Reused `/api/admin/settings` fetch to load `global_ticket_template_url` and render expected dimensions in the card.

## 2026-04-28 – Global Settings Ticket layout: global template card (preview, fullscreen, download)

- `components/admin/global-ticket-template-card.tsx` – New card: global/default ticket background, **react-photo-view** fullscreen on preview click, download with sensible filename, dimension hints tied to current output size.
- `app/admin/ticket-layout/ticket-layout-client.tsx` – Live template URL state + card above output settings; layout editor preview follows template changes.
- `app/admin/settings/ticket-layout-settings.tsx` – Pass `canManageGlobalTemplate` when `get_my_role` is `super_admin` for Replace/Remove (matches `/api/admin/settings` PATCH).
- `app/api/admin/upload/route.ts` – `isGlobalTemplate` ticket-template uploads require **super_admin**; per-event uploads still use `manage_ticket_templates`.

## 2026-04-28 – Ticket image: larger encrypted QR caption (~1.3×)

- `lib/ticket-image.ts` – Encrypted QR text box uses `wrapText` initial size 26 and min 13 (was 20 / 10) so the code under the QR renders ~30% larger while still shrinking if the layout box is narrow.

## 2026-04-28 – Cart-scoped summary and aborted prefetch

- `store/reservation-store.ts` – `cartSummary` is scoped with `for_cart_id`; `setCartSummary(cartId, data)`; `setCart` drops summary when cart UUID changes; `release()` clears summary.
- `app/[eventSlug]/book/book-page-client.tsx` – Abort cart-summary prefetch on repeat proceed/unmount; gated `setCartSummary` after fetch.
- `app/[eventSlug]/checkout/checkout-content.tsx` – SSR-first `initialData`, `cartSummaryForActiveCart` for fallbacks, `AbortSignal` on cart-summary / verify fetches.

**Updates:** Checkout totals no longer mix stale client prefetch with a different reservation cart; inflight summary fetches abort on navigation.

## 2026-04-28 – Checkout page: vertically center main column on load

- `app/[eventSlug]/checkout/checkout-content.tsx` – Outer wrapper uses `flex flex-1 flex-col` with inner `container max-w-lg my-auto` so the checkout column sits vertically centered when shorter than the main area; tall pages scroll normally (`my-auto` margins collapse instead of clipping).

## 2026-04-28 – FloatingProgressBar: viewport-centered overlay

- `components/ui/floating-progress.tsx` – Outer overlay uses `fixed inset-0` instead of `absolute` so the dimmer and modal stay centered in the visible viewport when the page is scrolled (especially on mobile).

**Updates:** Loading overlays portaled to `document.body` no longer drift toward the bottom or off-screen due to document-height flex layout.

## 2026-04-28 – Ticket image: blank-line gap before Seat:

- `lib/ticket-image.ts` – `gapSectionValuesToSeatHeading` ≈ one value line height + padding between last Section line and **Seat:**.

## 2026-04-28 – Ticket image: more space before Seat: label

- `lib/ticket-image.ts` – Added vertical gap between the last Section value line and the **Seat:** heading in `buildSectionPanelPaths`.

## 2026-04-28 – Ticket image section panel: Section + Seat (group stacked under Section)

- `lib/ticket-image.ts` – Section box: **Section:** with spacing below the heading, then section group (if any) and section name on separate lines, then **Seat:** with spacing below, then seat text. No “Group” heading.

**Updates:** Ticket JPEGs use Section:/Seat: labels with grouped section lines and clearer vertical spacing.

## 2026-04-28 – Section ZIP API: allow per-event admins (`assign` / `printTickets`)

- `app/api/admin/print-tickets/section-zips/route.ts` – After `eventId` is known, if global `canManagePrintTickets()` fails, authorize with `is_authorized_for_event_section` for **Manual Distribution** or **Print Tickets** (same pattern as `/api/admin/events/[id]/*`). Fixes 403s for event-scoped admins polling ZIP status on Assign Seats / Print Tickets.

## 2026-04-28 – SEO: expanded `/sitemap.xml` (static pages + upcoming published events)

- `app/sitemap.ts` – Async sitemap: home, About, Contact, Privacy, Terms; plus each **published** event with `event_start >= now()` from `get_upcoming_events` (paginated, cap 4000). Uses `NEXT_PUBLIC_SITE_URL` as base. `app/robots.ts` already references `${base}/sitemap.xml`.

## 2026-04-28 – SEO: default title & meta description (QR ticketing, Philippines)

- `app/layout.tsx` – Root `metadata` / Open Graph / Twitter use the keyword-focused default title and description (smart QR ticketing, Philippines; secure platform, QR validation, admission control).
- `app/page.tsx` – Explicit home `metadata` with the same strings; hero subtitle aligned with the positioning copy.

## 2026-04-28 – ESLint: `prefer-const` on event PATCH destructuring

- `app/api/admin/events/[id]/route.ts` – Use `const { data, error } = res` after RPC retries (fixes `next build` failure).

## 2026-04-28 – Migration `00223` + `00222` fix: `events.venue_id` nullable (TBA / error 23502)

- `supabase/migrations/00222_events_venue_schedule_tba.sql` – After adding TBA columns, `ALTER COLUMN venue_id DROP NOT NULL` so new installs don’t hit `23502` when venue is TBA.
- `supabase/migrations/00223_events_venue_id_nullable.sql` – Same `DROP NOT NULL` for databases that already applied an older `00222` without it (idempotent if run twice).

## 2026-04-27 – Event save 500: `update_admin_event` RPC fallback (TBA params + ticket limit)

- `app/api/admin/events/[id]/route.ts` – On PostgREST `PGRST202` (no matching RPC overload), retry without `p_venue_to_be_announced` / `p_schedule_to_be_announced`, then without `p_ticket_purchase_per_user`, so saves work before migration `00222` is applied. After a legacy RPC success, best-effort `.update()` on `events` for the two TBA flags when those columns exist.

## 2026-04-27 – Fix theme toggle hydration mismatch (Header Sun/Moon)

- `components/providers/theme-provider.tsx` – Initial React theme is always `"dark"` to match SSR (`html data-theme="dark"`); real preference is applied in `useLayoutEffect` via `getInitialTheme()` so the first client paint matches the server and the header icon/aria-label no longer flip during hydrate.

## 2026-04-27 – Event form: schedule TBA keeps date/time editable (sorting uses saved `event_start`)

- `components/admin/event-form.tsx` – Date and time inputs stay enabled when “To be announced” is checked so admins can set the value used for sorting/listings; helper text clarifies that `event_start` is always saved for order while the public card shows TBA only.
- `lib/types.ts` – Comment on `schedule_to_be_announced` aligned with that behavior.

## 2026-04-27 – Events: venue & schedule “To be announced” (admin + public cards)

- `supabase/migrations/00222_events_venue_schedule_tba.sql` – Added `events.venue_to_be_announced` and `events.schedule_to_be_announced`; extended `update_admin_event` to persist flags and clear `venue_id` when venue is TBA.
- `app/api/admin/events/route.ts`, `app/api/admin/events/[id]/route.ts` – Zod allows `venue_id: null` when `venue_to_be_announced`; create/updates write the new columns.
- `components/admin/event-form.tsx` – Venue dropdown option “To be announced”; checkbox for schedule TBA (disables date/time inputs; keeps internal `event_start` for sorting).
- `lib/event-public-display.ts` – Shared copy and helpers for schedule/venue display lines.
- `lib/types.ts`, `lib/events/event-grid-server.ts` – Types and grid list columns include the new flags.
- `components/event-card.tsx`, `components/event-card-details-dialog.tsx`, `app/[eventSlug]/event-page-content.tsx` – Public UI shows “To be announced” and skips maps link when TBA.

**Updates:** Run the new migration; events can advertise undisclosed venue or date/time while retaining a sortable `event_start`.

## 2026-04-27 – Google Analytics: production-only + optional `NEXT_PUBLIC_GA_MEASUREMENT_ID`

- `app/layout.tsx` – gtag scripts render only when `NODE_ENV === "production"`. Measurement ID: env `NEXT_PUBLIC_GA_MEASUREMENT_ID` if set, otherwise default `G-DK0XXET3ZJ`; empty / `0` / `false` disables GA in production.

## 2026-04-27 – Google tag (gtag.js) for analytics

- `app/layout.tsx` – Load GA4 `G-DK0XXET3ZJ` via `next/script` (`afterInteractive`): external `gtag/js` + inline init (`dataLayer`, `gtag('config', …)`).
- `next.config.ts` – CSP `script-src` / `script-src-elem` allow `https://www.googletagmanager.com` and `https://www.google-analytics.com` so the tag is not blocked.

**Updates:** Site-wide Google Analytics 4 measurement ID wired in the root layout with CSP-compatible script origins.

## 2026-04-27 – Build fix: reports page `pathname` null guard

- `app/admin/reports/reports-page-client.tsx` – Added `if (!pathname) return;` before composing `router.replace(...)` URL to satisfy strict nullability in Next App Router hooks.

## 2026-04-27 – Build unblock: nullable App Router hooks (`useSearchParams` / `usePathname` / `useParams`)

- `app/[eventSlug]/checkout/checkout-content.tsx` – Guarded `searchParams` before `.get(...)`.
- `app/[eventSlug]/payment-return/[bookingId]/page.tsx` – Guarded `useParams()` values for `eventSlug`/`bookingId`.
- `app/admissions/scan/page.tsx`, `app/login/page.tsx`, `app/signup/page.tsx` – Guarded `searchParams` before `.get(...)`.
- `components/app-chrome.tsx` – Guarded `pathname` before `startsWith(...)`.

## 2026-04-27 – Ticket Scanning Srouce mode wired to online + offline admissions

- `lib/admissions/ticket-scan-source.ts` – Added scan source modes, parser/default, and matching helpers (`qr_data`, `encrypted_qr`, `encrypted_then_qr_fallback`).
- `app/api/admin/settings/route.ts` – Added persisted `app_config` key `ticket_scanning_source_mode` in GET/PATCH with validation + defaults.
- `app/admin/settings/ticket-scanning-srouce-settings.tsx` – Implemented selector UI with load/save flow for scan source mode.
- `lib/admissions/admission-scan-server.ts` – Live scan resolution now follows configured mode for ticket lookup, fallback lookup, print alias lookup, and bridge consistency checks.
- `lib/admissions/offline-pack-types.ts`, `lib/admissions/build-offline-pack.ts`, `lib/admissions/offline-client.ts` – Offline pack now carries `scan_source_mode`, and offline resolver matches according to that mode (defaulting safely when missing).

## 2026-04-27 – Added settings section: Ticket Scanning Srouce

- `app/admin/settings/page.tsx` – Added a new tab option and panel entry labeled `Ticket Scanning Srouce`.
- `app/admin/settings/ticket-scanning-srouce-settings.tsx` – New section content block for scanner source configuration.

## 2026-04-27 – Invalidate: service-role release + fast print `qr_data` (fix hang / no QR rotate)

- `lib/admin/tickets-invalidate-post.ts` – `releaseConfirmedTicket` uses the same **service-role** `admin` client as the rest of the flow so ticket/booking deletes and seat updates are not blocked by RLS (symptom: “Invalidating…” forever, `encrypted_qr` unchanged).
- `lib/event-seats/seat-encrypted-qr.ts` – After rotating `event_seats.encrypted_qr`, set print `qr_data` with a random suffix instead of up to 100 sequential uniqueness checks.

## 2026-04-27 – `getSeatInfo`: reliable `event_sections` load (fix empty Section / Seat group on verify)

- `lib/admissions/admission-scan-server.ts` – `fetchEventSectionRow` uses `maybeSingle`, retries select without `section_group` when that column is missing (older DB), and avoids `.single()` so a failed section fetch no longer leaves row/seat filled but section fields empty.

## 2026-04-27 – Invalidate Ticket verify details: seat group + section (replace buyer)

- `lib/admin/tickets-verify-post.ts` – Verify payload exposes `seatGroup` (`event_sections.section_group`) and `sectionDisplay` (name or code); removed buyer fields from this payload.
- `components/admin/ticket-invalidation.tsx` – Verified details show **Seat group** and **Section** instead of buyer.

## 2026-04-27 – Invalidate: rotate seat QR when `tickets.seat_id` is null + verify DB update

- `lib/admin/tickets-invalidate-post.ts` – If the ticket row has no `seat_id`, resolve the seat by `event_seats.encrypted_qr` ilike the payload (single match) so rotation still runs after legacy / inconsistent rows.
- `lib/event-seats/seat-encrypted-qr.ts` – `update … select("id")` and throw if no row was updated (avoids silent no-op).

## 2026-04-27 – Invalidate ticket: explicit `event_seats.encrypted_qr` rotation

- `lib/admin/tickets-invalidate-post.ts` – After `releaseConfirmedTicket`, seat-linked tickets call `rotateEncryptedQrForSeatOnRelease` so `event_seats.encrypted_qr` (and seat `print_tickets`) always update in the invalidate flow.
- `lib/admin/release-ticket.ts` – Removed `rotateSeatEncryptedQr`; rotation is owned by invalidation (admin “release ticket” API unchanged).
- `lib/event-seats/seat-encrypted-qr.ts` – `rotateEncryptedQrForSeatOnRelease` throws if the seat cannot be loaded (no silent skip).

## 2026-04-27 – Verify/invalidate: `runAdmin*Plain` (no `NextResponse.json` in Server Actions)

- `lib/admin/tickets-verify-post.ts` – `runAdminTicketsVerifyPlain` returns serializable `{ httpStatus, ok, ticket, error? }`; `runAdminTicketsVerifyFromBody` maps to `NextResponse` for HTTP routes.
- `lib/admin/tickets-invalidate-post.ts` – Same pattern with `runAdminTicketsInvalidatePlain`.
- `app/admin/ticket-invalidation/actions.ts` – Actions call the `*Plain` helpers directly (avoids `await res.json()` on `NextResponse`, which could yield empty/wrong payloads on the client).

## 2026-04-27 – Ticket invalidation Server Actions: flat return shape (fix verify UI not updating)

- `app/admin/ticket-invalidation/actions.ts` – Return `{ httpStatus, ok, ticket, error }` / invalidate equivalent instead of `{ status, data }` so the client reliably receives the payload after Server Action serialization.
- `components/admin/ticket-invalidation.tsx` – Read the flat result shape.

**Updates:** Verify can return HTTP 200 while the UI stayed empty when nested `data` did not deserialize on the client.

## 2026-04-27 – Ticket invalidation: Server Actions instead of `/api` fetch (fix verify 404)

- `app/admin/ticket-invalidation/actions.ts` – `adminVerifyTicketAction` / `adminInvalidateTicketAction` call shared `runAdmin*` helpers with `createClient()` (no HTTP route dependency).
- `components/admin/ticket-invalidation.tsx` – Verify/invalidate use those actions; removed multi-path `fetch` fallbacks.

**Updates:** Invalidate Ticket works even when dev/proxy returns 404 for `POST /api/admin/tickets/verify` (and similar paths).

## 2026-04-27 – Pages API ticket verify: Supabase client from `req` cookies (fix 500)

- `lib/supabase/pages-api.ts` – `createSupabasePagesApiClient` for `pages/api` (no `next/headers` `cookies()`).
- `lib/auth.ts` – `canAccessTicketResendAdminToolsWithClient` for cookie-backed Supabase clients.
- `lib/admin/tickets-verify-post.ts`, `lib/admin/tickets-invalidate-post.ts` – Optional `authSupabase` for Pages handlers; invalidate uses it for `releaseConfirmedTicket` too.
- `pages/api/admin/tickets-verify.ts`, `pages/api/admin/tickets-invalidate.ts` – Pass Pages Supabase client into shared runners.

**Updates:** `POST /api/admin/tickets-verify` no longer throws when auth used `createClient()` (App Router only).

## 2026-04-27 – Pages Router fallback for ticket verify/invalidate (fix persistent 404)

- `lib/admin/tickets-verify-post.ts`, `lib/admin/tickets-invalidate-post.ts` – Exported `runAdminTicketsVerifyFromBody` / `runAdminTicketsInvalidateFromBody` for non–App Router callers.
- `pages/api/admin/tickets-verify.ts`, `pages/api/admin/tickets-invalidate.ts` – Pages API handlers that run the same logic when `app/api/.../verify` 404s in dev.
- `components/admin/ticket-invalidation.tsx` – Tries `/api/admin/tickets-verify` and `/api/admin/tickets-invalidate` first.

**Updates:** Verify/invalidate POSTs should resolve even when App Router route modules are not matched.

## 2026-04-27 – Verify/invalidate handlers: shared lib + `event_seats` ilike

- `lib/admin/tickets-verify-post.ts`, `lib/admin/tickets-invalidate-post.ts` – Shared POST handlers (explicit `POST` in route files instead of re-export-only modules).
- `app/api/admin/tickets/verify/route.ts`, `app/api/admin/tickets/invalidate/route.ts`, `app/api/admin/ticket-invalidation/verify/route.ts`, `app/api/admin/ticket-invalidation/invalidate/route.ts` – Thin wrappers calling shared handlers.
- Verify: primary lookup uses `event_seats.encrypted_qr` with **case-insensitive** `ilike`; ticket fallbacks use `ilike` on `tickets.encrypted_qr` / `qr_data`.

**Updates:** Dev bundlers register routes reliably; seat master lookup tolerates casing and stays table-first.

## 2026-04-27 – Ticket invalidation API aliases (fix verify 404)

- `app/api/admin/ticket-invalidation/verify/route.ts`, `app/api/admin/ticket-invalidation/invalidate/route.ts` – Re-export the same handlers as `tickets/verify` and `tickets/invalidate`.
- `components/admin/ticket-invalidation.tsx` – Client tries `/api/admin/ticket-invalidation/*` first, then `/api/admin/tickets/*` (with existing `/ui` prefix fallback).

**Updates:** Verify/invalidate POSTs resolve even when the `tickets/verify` path 404s in some dev setups.

## 2026-04-27 – Invalidate Ticket verify uses seat master `encrypted_qr`

- `app/api/admin/tickets/verify/route.ts` – Resolves assigned seats by `event_seats.encrypted_qr` first, then loads the confirmed ticket for that seat; falls back to `tickets` lookup for section-only / legacy rows.
- `app/api/admin/tickets/invalidate/route.ts` – Pre-check accepts QR when it matches the ticket or the seat row’s `encrypted_qr`; still runs `releaseConfirmedTicket` with `rotateSeatEncryptedQr` to mint a new seat code.
- `components/admin/ticket-invalidation.tsx` – Normalizes QR to uppercase on verify/invalidate; intro copy describes seat master verification and rotation.

**Updates:** Admin verify aligns with seat master source; invalidate continues to rotate `event_seats.encrypted_qr` after delete.

## 2026-04-27 – Set `encrypted_qr` when creating event seats

- `lib/event-seats/seat-encrypted-qr.ts` – Added `deterministicEncryptedQrForNewSeat` for inserts (same hash as checkout seed).
- `app/api/admin/events/[id]/seating/seats/route.ts`, `seats/add-row`, `seats/add-column`, `seats/add-column-row`, `apply-template`, `copy-from-venue` – New `event_seats` rows include `encrypted_qr` from event/section/row/seat labels.
- `supabase/migrations/00221_event_seats_encrypted_qr_fill_nulls.sql` – Backfills any seats still missing `encrypted_qr`.

**Updates:** Newly generated seats no longer leave `encrypted_qr` null; run migration `00221` to repair existing rows.

## 2026-04-27 – Seat master `encrypted_qr` on `event_seats` (rotate on invalidation)

- `supabase/migrations/00220_event_seats_encrypted_qr.sql` – Added `event_seats.encrypted_qr`, backfilled from latest confirmed ticket per seat or deterministic SHA-256 (pgcrypto) from event/section/seat labels.
- `lib/qr-data.ts` – Added `rotateSeatEncryptedQr` for non-deterministic rotation after invalidation.
- `lib/event-seats/seat-encrypted-qr.ts` – `ensureSeatEncryptedQrForSale`, `rotateEncryptedQrForSeatOnRelease` (syncs seat-scoped `print_tickets`, clears images).
- `lib/print-tickets/allocate-print-qr-data.ts` – Extracted `allocateUniquePrintQrData` for reuse.
- `app/api/checkout/route.ts`, `app/api/admin/assignments/[id]/confirm/route.ts` – Assigned-seat tickets use seat-stored encrypted QR via ensure helper.
- `lib/print-tickets/generate.ts` – Seat-based print tickets use `event_seats.encrypted_qr`; resync stale print rows when seat code changes.
- `lib/admin/release-ticket.ts`, `app/api/admin/tickets/invalidate/route.ts` – Invalidate rotates seat encrypted QR and refreshes linked print rows (`rotateSeatEncryptedQr: true`).
- `lib/admissions/admission-scan-server.ts` – Print-bridge scans must match the resolved ticket’s `encrypted_qr` or `qr_data` (blocks stale pre-print codes).

**Updates:** Assigned seats now keep a single current scan code on `event_seats`; invalidation rotates it and updates seat `print_tickets` so old prints cannot admit the wrong holder.

## 2026-04-27 – Canonical ticket code mapping across all image generation flows

- `lib/ticket-image.ts` – Added a canonical ticket-code resolver that normalizes and deterministically maps image fields (`qrPayload`, `CTRL`, encrypted text), removed ambiguous encrypted fallback to `ticketNumber`, and reused the resolver in both buyer and print image generation wrappers.
- `app/api/checkout/route.ts` – Kept checkout callsites explicit and semantically aligned (`qrData: encryptedQr`, `ticketNumber: qrData`, `encryptedQr`).
- `lib/print-tickets/load-print-ticket-email-png.ts`, `lib/print-tickets/run-print-tickets-email-from-rows.ts`, `app/api/admin/print-tickets/[id]/send-email/route.ts` – Normalized print/email callsites to pass encrypted payload only from `encrypted_qr` and pass CTRL text from `qr_data`.

**Updates:** Ticket image generation is now consistent in all paths: QR image uses encrypted payload, `CTRL:` uses raw `qr_data`, and the code below QR uses encrypted value.

## 2026-04-27 – Split ticket code display: CTRL uses qr_data, box below QR uses encrypted_qr

- `app/api/checkout/route.ts` – Updated checkout ticket image generation to pass `ticketNumber: qrData` while keeping `qrData`/`encryptedQr` on encrypted value for QR payload + encrypted box.
- `lib/ticket-image.ts` – Restored default mapping so CTRL ticket number uses `qr_data`, while encrypted box remains `encrypted_qr`.
- `lib/print-tickets/load-print-ticket-email-png.ts`, `lib/print-tickets/run-print-tickets-email-from-rows.ts`, `app/api/admin/print-tickets/[id]/send-email/route.ts` – Restored print ticket `ticketNumberData` to `qr_data` (encrypted value still used for QR payload/encrypted box).

**Updates:** Ticket image now consistently shows two different values as intended: `CTRL:<qr_data>` and encrypted code below the QR image.

## 2026-04-27 – Explicit encrypted QR passed to checkout ticket image renderer

- `app/api/checkout/route.ts` – Added explicit `encryptedQr` param when generating assigned-seat and section/free ticket images, ensuring renderer does not fall back to non-encrypted ticket number text.

**Updates:** New checkout ticket images now consistently render encrypted value for both QR payload and ticket-number text under the QR.

## 2026-04-27 – Checkout-generated ticket image now uses encrypted ticket number

- `app/api/checkout/route.ts` – Updated both assigned-seat and section/free ticket image generation callsites so `ticketNumber` uses `encryptedQr` (instead of raw `qrData`).

**Updates:** Newly generated checkout ticket images now display encrypted QR value in the ticket number box under the QR image.

## 2026-04-27 – Ticket number under QR now uses encrypted QR

- `lib/ticket-image.ts` – Updated ticket image generation defaults so the ticket number block (`CTRL: ...`) prefers `encrypted_qr` over `qr_data`.
- `lib/print-tickets/load-print-ticket-email-png.ts`, `lib/print-tickets/run-print-tickets-email-from-rows.ts`, `app/api/admin/print-tickets/[id]/send-email/route.ts` – Updated print-ticket image generation callsites to pass `ticketNumberData` from `encrypted_qr` first (fallback to `qr_data` only when encrypted value is unavailable).

**Updates:** The ticket number shown below the QR image now matches encrypted QR values instead of raw QR data in normal print/email generation flows.

## 2026-04-27 – Invalidate ticket now frees seat and clears manual distribution seat data

- `lib/admin/release-ticket.ts` – Added release options to support invalidation behavior: force seat to `available`, clear `assignment_id`, remove matching `admin_assignment_items` rows for the invalidated seat, and auto-delete empty `admin_seat_assignments`.
- `app/api/admin/tickets/invalidate/route.ts` – Updated invalidation to call shared release logic with `forceSeatAvailable` and `clearManualDistributionSeat` enabled.

**Updates:** Confirmed ticket invalidation now removes the ticket, returns the seat to available booking state, and clears related manual distribution seat entries.

## 2026-04-27 – Seat label format for ticket invalidation details

- `app/api/admin/tickets/verify/route.ts` – Added `seatingType` in verify response payload using `getSeatInfo().seating_type`.
- `components/admin/ticket-invalidation.tsx` – Added `formatSeatLabel()` so seat text now renders as `Row <row> Seat <seat>` for assigned seats, `Free Seating` for free sections, and `Standing` for standing sections.

**Updates:** Verified ticket details now show seat text in a human-friendly format based on seating type.

## 2026-04-27 – Format ticket invalidation event start for readability

- `components/admin/ticket-invalidation.tsx` – Added `formatEventStart()` to render verified ticket event start as `Mon DD, YYYY | HH:mm` (24-hour), with safe fallback for unknown/invalid values.

**Updates:** `Event start` in Invalidate Ticket now displays in a user-friendly format (example: `May 25, 2026 | 03:54`).

## 2026-04-27 – Resolve event info fallback in ticket verification

- `app/api/admin/tickets/verify/route.ts` – Added event resolution fallback when booking linkage is incomplete: derive event via `event_seats -> event_sections -> event_id` (or direct `section_id -> event_sections`) before loading event title/start.

**Updates:** Verified ticket details now show event title/start more reliably instead of `Unknown` for tickets whose booking event reference is missing/incomplete.

## 2026-04-27 – Verify/invalidate now query tickets table directly first

- `app/api/admin/tickets/verify/route.ts` – Reworked verification lookup to query `tickets.encrypted_qr` directly first, then `tickets.qr_data` fallback, with clearer not-found messaging and optional (non-blocking) booking/event enrichment.
- `app/api/admin/tickets/invalidate/route.ts` – Reworked QR+ticket validation to exact-match `encrypted_qr` first, then `qr_data` fallback, instead of combined OR filtering.

**Updates:** Invalidate Ticket verification now prioritizes exact `tickets` table matching for entered encrypted QR values, matching the Supabase table editor expectation.

## 2026-04-27 – Add /api and /ui/api fallback for ticket invalidation calls

- `components/admin/ticket-invalidation.tsx` – Added `fetchWithApiFallback` so verify/invalidate requests automatically retry against the alternate route prefix (`/api/...` and `/ui/api/...`) when the first returns 404.

**Updates:** Ticket invalidation tools now work in both root and `/ui` mounted app paths without manual URL switching.

## 2026-04-27 – Normalize encrypted QR lookup in invalidation APIs

- `app/api/admin/tickets/verify/route.ts` – Normalized incoming `encryptedQr` to uppercase and changed ticket lookup to a bounded row query with explicit error handling before selecting the first match.
- `app/api/admin/tickets/invalidate/route.ts` – Normalized incoming `encryptedQr` to uppercase and aligned QR+ticket match verification to a bounded query with explicit query error handling.

**Updates:** Admin ticket verification/invalidation now matches `tickets.encrypted_qr` values more reliably when casing/input variations or lookup edge cases occur.

## 2026-04-27 – Ticket invalidation API calls support /ui prefix

- `components/admin/ticket-invalidation.tsx` – Updated verify/invalidate fetch URLs to use `/ui/api/...` automatically when current pathname is under `/ui/*`, while keeping standard `/api/...` behavior for root deployments.

**Updates:** Fixes 404 API calls on deployments/proxies where the app is mounted under `/ui`.

## 2026-04-27 – Add admin ticket invalidation flow

- `app/admin/page.tsx` – Added new Admin Dashboard card `Invalidate Ticket` (with icon) routed to `/admin/ticket-invalidation`, gated by the same `resend_tickets` capability path.
- `app/admin/ticket-invalidation/page.tsx`, `components/admin/ticket-invalidation.tsx` – Added guarded admin page and client UI to verify encrypted QR, enable invalidate action only after verification, show irreversible confirmation dialog, and display blocking `FloatingProgressBar` during verify/invalidate operations.
- `app/api/admin/tickets/verify/route.ts` – Added admin verify endpoint to resolve ticket by encrypted QR/QR value and return event, buyer, admission, and seat details.
- `app/api/admin/tickets/invalidate/route.ts` – Added admin invalidate endpoint that re-verifies QR+ticket pairing and invalidates by deleting the ticket and restoring seat availability semantics.
- `lib/admin/release-ticket.ts`, `app/api/admin/tickets/[id]/release/route.ts` – Extracted and reused shared release logic so invalidation and existing release route use consistent booking cleanup, seat status restoration, and total recalculation behavior.

**Updates:** Admins with ticket-resending access can now verify and irreversibly invalidate tickets from a dedicated dashboard tool while keeping seat restoration behavior consistent with existing release flows.

## 2026-04-27 – Restore auditTrail section ID for event guard typing

- `lib/event-admin-sections.ts` – Added `auditTrail` back to `EVENT_ADMIN_SECTION_IDS` and `EVENT_ADMIN_SECTION_LABELS` so `forbiddenUnlessEventSection(eventId, "auditTrail")` type-checks in the audit route.

**Updates:** Resolved Netlify build failure caused by `"auditTrail"` not being assignable to `EventAdminSectionId`.

## 2026-04-27 – Fix manual-assignment job processor build errors

- `lib/manual-assignment-email/run-manual-assignment-email-chunk-for-job.ts` – Updated call into `processManualAssignmentEmailJobChunk` to match current two-argument signature and removed stale optional actor options parameter.
- `app/api/admin/assignments/[id]/send-email/jobs/[jobId]/process/route.ts` – Updated worker invocation to the new `runManualAssignmentEmailChunkForJob(admin, jobId, userId)` signature.
- `lib/ticket-image.ts` – Added explicit null guard for missing ticket rows in `generateTicketImageForTicketId` before accessing `booking_id`, resolving strict null type error during build.

**Updates:** `npm run build` now succeeds; remaining messages are lint warnings only.

## 2026-04-27 – Reserved seating legend uses color chips only

- `app/[eventSlug]/book/book-page-client.tsx` – Removed color-name words from Reserved Seating legend counts; now each color chip shows its availability count directly (chip + number only).

**Updates:** Reserved seating legend now displays availability with color squares and counts, without color names.

## 2026-04-27 – Reserved seating legend shows available count by color

- `app/[eventSlug]/book/book-page-client.tsx` – Updated Reserved Seating card legend to aggregate available seats by section color and display inline labels like `Red - 30 | Yellow - 15` beside the color swatches.

**Updates:** Buyers can now see availability totals per legend color directly in the Reserved Seating header.

## 2026-04-27 – Centered home loading state without skeleton cards

- `app/home-stream-fallback.tsx` – Removed search/header/card skeleton placeholders and simplified the fallback to a single centered `Loading events` block with the existing progress track.

**Updates:** Home loading now shows only the centered loading message/progress instead of full-page skeleton placeholders.

## 2026-04-27 – Remove Audit Trail end-to-end

- `app/admin/events/[id]/page.tsx`, `components/admin/edit-event-tabs.tsx`, `components/admin/event-audit-trail.tsx` – Removed Audit Trail tab wiring and deleted the client component.
- `app/api/admin/events/[id]/audit-trail/route.ts`, `lib/event-admin-sections.ts` – Deleted the audit API endpoint and removed `auditTrail` from event admin section IDs/labels.
- `app/api/admin/**`, `lib/manual-assignment-email/manual-assignment-email-job-worker.ts`, `lib/print-tickets/run-print-ticket-email-job-one-email.ts`, `lib/print-tickets/run-print-tickets-email-from-rows.ts`, `lib/event-audit.ts` – Removed all audit logging callsites/helpers and deleted the shared audit helper module.
- `supabase/migrations/00219_remove_audit_trail_artifacts.sql` – Added forward migration to unschedule audit retention cron, drop cleanup function/table/policy, and remove `auditTrail` entries from `event_administrators.allowed_sections`.

**Updates:** Audit Trail has been fully removed from UI, API, server-side writes, and database/cron cleanup paths.

## 2026-04-27 – Increased website text size on ticket output

- `lib/ticket-image.ts` – Increased website overlay text size from 14 to 18 for better readability on generated tickets.

**Updates:** Website text is now visibly larger in ticket images.

## 2026-04-27 – Ticket Number prefix uses CTRL label

- `lib/ticket-image.ts` – Updated Ticket Number rendering text to prepend `CTRL: ` before the ticket number value.

**Updates:** Generated tickets now display ticket number as `CTRL: <value>` in the Ticket Number field.

## 2026-04-27 – Ticket text styling + ticket number source adjustments

- `lib/ticket-canvas-spec.ts`, `components/admin/ticket-layout-editor.tsx` – Updated default `encryptedQr` region dimensions to match the `ticketNumber` box size.
- `lib/ticket-image.ts` – Made encrypted QR text bolder, removed bold styling from ticket number text, and increased website text size for better visibility.
- `lib/ticket-image.ts`, `app/api/checkout/route.ts` – Ticket Number display now uses legacy `qr_data` value (while QR image payload still uses encrypted code where available).
- `lib/ticket-image.ts`, `lib/print-tickets/generate.ts`, `lib/print-tickets/load-print-ticket-email-png.ts`, `lib/print-tickets/run-print-tickets-email-from-rows.ts`, `app/api/admin/print-tickets/[id]/send-email/route.ts` – Added explicit print-ticket number mapping so printed ticket number text comes from `qr_data` and encrypted QR stays in the dedicated encrypted field.

**Updates:** Encrypted QR and Ticket Number now have distinct visual weight/data sources: encrypted text is bold, ticket number is regular weight, website text is larger, and ticket number consistently shows `qr_data`.

## 2026-04-27 – Ticket layout: add encrypted QR overlay element

- `lib/ticket-canvas-spec.ts` – Added new `encryptedQr` region to ticket layout schema and defaults, including legacy-to-current coordinate migration support.
- `components/admin/ticket-layout-editor.tsx` – Added draggable/resizable `Encrypted QR` overlay box in the layout editor and scaling logic.
- `lib/ticket-image.ts` – Added rendering for the new encrypted QR text box and wired ticket generation params to source encrypted code (with legacy fallback when missing).

**Updates:** Admins can now place a dedicated encrypted-QR text element in ticket layouts, and generated ticket images render it from encrypted QR data first.

## 2026-04-27 – Offline admissions scan supports encrypted QR fallback

- `lib/admissions/offline-pack-types.ts` – Extended offline ticket and print alias types with optional `encrypted_qr` fields.
- `lib/admissions/build-offline-pack.ts` – Offline pack generation now includes `encrypted_qr` from `tickets` and `print_tickets`, while still retaining legacy `qr_data`.
- `lib/admissions/offline-client.ts` – Offline resolver now matches scanned code using encrypted-first lookup with `qr_data` fallback for both direct tickets and print aliases.

**Updates:** “Prepare for offline” packs now mirror live scan behavior by resolving encrypted codes first while staying backward compatible with legacy QR data.

## 2026-04-27 – Seat Pricing cards use section outline colors

- `app/api/admin/events/[id]/pricing/route.ts` – Added `color` to `event_sections` pricing payload so UI can style each section row consistently.
- `components/admin/seat-pricing.tsx` – Applied per-section border color (`sec.color`) to each section pricing card with fallback to the default glass border.

**Updates:** Seat Pricing section cards now inherit the same outline colors configured in Seat Configurator.

## 2026-04-27 – Print Tickets group cards with default collapsed state

- `components/admin/print-tickets-tab.tsx` – Converted section-group headings into collapsible group cards, defaulted all groups to collapsed on initial event load, and kept group collapse state in sync with group changes.
- `components/admin/print-tickets-tab.tsx` – Updated “Expand/Collapse all sections” behavior to also expand/collapse all group cards so bulk expansion still reveals and loads all rows.

**Updates:** Each section group is now a single collapsible card, initially collapsed, while bulk expand/collapse continues to work across both groups and section rows.

## 2026-04-27 – Print Tickets card borders follow section colors

- `app/api/admin/events/[id]/print-tickets/route.ts` – Added `color` to print-ticket section payloads for both summary and full-detail responses.
- `components/admin/print-tickets-tab.tsx` – Applied section card border color from `sec.color` so each row outline matches the configured section color.

**Updates:** Print Tickets section cards now visually match Seat Configurator colors, making large grouped lists easier to scan.

## 2026-04-27 – Print Tickets grouped by section group

- `app/api/admin/events/[id]/print-tickets/route.ts` – Added `section_group` to section payloads for both summary and full-detail print ticket responses.
- `components/admin/print-tickets-tab.tsx` – Grouped section rows under section-group headers (with `Ungrouped` fallback) so Print Tickets mirrors Seat Configurator grouping.

**Updates:** Print Tickets now displays sections grouped by their configured section group, improving scanability for large events.

## 2026-04-27 – Expand-all now preloads seat rows in Print Tickets

- `components/admin/print-tickets-tab.tsx` – Updated the global expand/collapse handler so `Expand all sections` also fetches section detail for every summary-only section, loading seat rows in parallel.

**Updates:** Expand-all now matches the intended behavior: it opens all sections and triggers seat loading for all of them at once.

## 2026-04-27 – Print Tickets: expand/collapse all sections button

- `components/admin/print-tickets-tab.tsx` – Added a global section toggle button that switches between “Collapse all sections” and “Expand all sections”, wired to the existing `collapsedSections` state for all rows with seats.

**Updates:** Admins can now collapse or expand all Print Tickets sections in one click instead of toggling each section individually.

## 2026-04-27 – Keep section group input focused while typing

- `components/admin/seat-configurator.tsx` – Changed section-group editing to local draft state and deferred section/group updates until input blur, preventing regroup/remount on every keystroke.

**Updates:** Typing in the section group field no longer defocuses mid-entry; group reassignment now happens once editing finishes.

## 2026-04-27 – Keep seat group cards open while editing

- `components/admin/seat-configurator.tsx` – Updated collapsed-group state sync to keep only still-existing collapsed groups instead of auto-collapsing newly seen/renamed group names during typing.

**Updates:** Editing a section group label no longer collapses that group card mid-typing; collapse state is preserved cleanly when groups are renamed or removed.

## 2026-04-27 – Encrypted QR rollout with dual-scan compatibility

- `supabase/migrations/00218_encrypted_qr_tickets_print_tickets.sql` – Added nullable `encrypted_qr` columns to `tickets` and `print_tickets` plus lookup indexes.
- `lib/qr-data.ts` – Added deterministic `buildEncryptedQrFromQrData()` helper (10-char uppercase alphanumeric hash output).
- `app/api/checkout/route.ts` – New ticket inserts now write `encrypted_qr`; generated QR image payload + ticket image ticket number now prefer encrypted code for newly generated assets.
- `app/api/admin/assignments/[id]/confirm/route.ts` – Manual assignment ticket inserts now write both `qr_data` and `encrypted_qr`.
- `lib/print-tickets/generate.ts` – Print ticket inserts now write `encrypted_qr`; print image generation now prefers encrypted payload for QR/ticket code.
- `lib/ticket-image.ts` – On-demand ticket image generation now uses `encrypted_qr ?? qr_data` for QR payload and printed ticket number.
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx`, `app/[eventSlug]/confirmation/[bookingId]/confirmation-tickets.tsx` – Confirmation UI now carries and displays encrypted ticket code with fallback.
- `lib/confirm-booking.ts`, `app/api/admin/tickets/[id]/send-email/route.ts`, `app/api/admin/tickets/send-email-bulk/route.ts` – Email/fallback QR generation now prefers `encrypted_qr` while preserving legacy fallback.
- `lib/manual-assignment-email/load-booking-ticket-png.ts`, `lib/manual-assignment-email/collect-next-booking-tickets-for-zip-budget.ts`, `lib/manual-assignment-email/send-manual-assignment-ticket-batch.ts` – Manual assignment email pipeline now loads/prefers encrypted code.
- `lib/print-tickets/load-print-ticket-email-png.ts`, `lib/print-tickets/run-print-tickets-email-from-rows.ts`, `lib/print-tickets/load-section-print-tickets-for-email.ts`, `lib/print-tickets/fetch-print-tickets-for-email-by-ids.ts`, `app/api/admin/print-tickets/[id]/send-email/route.ts` – Print-ticket email/select pipelines now include and prefer encrypted payload.
- `lib/admissions/admission-scan-server.ts` – Admissions scan now dual-resolves by `encrypted_qr` first with `qr_data` fallback for sold and print tickets.

**Updates:** New rows store both legacy and encrypted codes, ticket/print QR payloads now use encrypted codes, and scanners remain backward compatible via dual lookup.

## 2026-04-27 – Tailwind `dark:` matches `data-theme` (fix brown text in app dark mode)

- `app/globals.css` – Override default `dark` variant with `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));` so `dark:` utilities follow `ThemeProvider` / `<html data-theme>`, not only `prefers-color-scheme`.

**Updates:** Default Tailwind v4 `dark:` used OS color scheme; the app toggles `data-theme` on `<html>`, so in dark mode many `dark:` rules never applied and light-base colors (e.g. `text-amber-800`) stayed, hurting contrast (timer, draft banners, etc.).

## 2026-04-27 – ReservationTimer: theme-split countdown color

- `components/booking/reservation-timer.tsx`, `app/[eventSlug]/checkout/checkout-content.tsx` – Countdown digits: `text-amber-800` in light (contrast on glass/white), `dark:text-[rgba(255,220,0,1)]` in dark (bright gold).

**Updates:** Single global yellow was hard to read in light mode; dark keeps the preview gold.

## 2026-04-27 – Dark mode: yellow for cart total, timers, draft banners

- `components/booking/inline-cart.tsx` – **Total** line `dark:text-yellow-400`.
- `components/booking/reservation-timer.tsx`, `app/[eventSlug]/checkout/checkout-content.tsx` – Countdown + body copy `dark:text-yellow-400` (light unchanged: amber-800 digits, `text-foreground` body).
- `app/[eventSlug]/book/book-page-client.tsx`, `app/[eventSlug]/event-page-content.tsx` – Draft callouts: body `dark:text-yellow-400`, label `dark:text-yellow-300`.

## 2026-04-27 – Draft banner & timer: split light / dark styles for contrast

- `app/[eventSlug]/book/book-page-client.tsx`, `app/[eventSlug]/event-page-content.tsx` – Draft callouts: light keeps pale wash + `text-amber-950`; **dark** uses `dark:bg-amber-950/75`, `dark:text-amber-50`, `dark:border-amber-400/50`, label `dark:text-white`.
- `components/booking/reservation-timer.tsx`, `app/[eventSlug]/checkout/checkout-content.tsx` – Countdown digits `text-amber-800` in light, **`dark:text-amber-200`** in dark (clearer on glass). Checkout **Special request** card: light unchanged; dark uses deep amber gradient + `dark:text-amber-100` icon tile.

**Updates:** Dark mode was muddy after light-mode-only amber fixes; explicit `dark:` surfaces and text restore legibility in both themes.

## 2026-04-27 – Light mode: readable timer, totals, draft banners, checkout special request

- `components/booking/reservation-timer.tsx` – Timer digits `text-amber-800` / `dark:text-amber-300`; body copy `text-foreground` (replaces `text-yellow-400` on light backgrounds).
- `components/booking/inline-cart.tsx` – Cart **Total** uses `text-foreground`.
- `app/[eventSlug]/book/book-page-client.tsx` – Draft preview banner: `text-amber-950` / `dark:text-amber-100`, strong `text-amber-900` / `dark:text-amber-50`.
- `app/[eventSlug]/event-page-content.tsx` – Same draft banner text pattern.
- `app/[eventSlug]/checkout/checkout-content.tsx` – Timer matches reservation timer; special-request callout border/gradient and icon use light-mode–friendly ambers, dark: preserves prior yellow styling; applied promo line `text-emerald-800` / `dark:text-green-400`.

**Updates:** Yellow/amber-50 copy designed for dark glass was nearly invisible in light mode; theme splits fix contrast.

## 2026-04-27 – Checkout cancel: always delete reservation cart on server

- `app/[eventSlug]/checkout/checkout-content.tsx` – On “Cancel order”, always `DELETE /api/reservations/{cartId}` when `activeCartId` is set, not only when booking-cancel paths had not already marked success. `cancel-pending` clears pending **bookings** but does not remove `reservation_carts`, so the previous condition skipped the delete and the cart could reappear on the book page.

**Updates:** Cancel order now reliably clears the server reservation cart in addition to local store state.

## 2026-04-27 – Book page: reservation timer above cart

- `app/[eventSlug]/book/book-page-client.tsx` – `ReservationTimer` moved from under the page intro to sit directly above `InlineCart` (with `space-y-6` spacing).

**Updates:** Countdown appears next to the cart so the flow reads top-to-bottom: pick seats, then time limit + cart.

## 2026-04-27 – Promo validate: reliable cart read + clearer errors (400 in prod)

- `lib/promo-cart-units.ts` – Optional `admin` + `userId`: load `reservation_carts` / `reservation_items` with the service client scoped by `profile_id` (avoids RLS/cookie issues on `/api/promo/validate`).
- `app/api/promo/validate/route.ts` – Uses that path; trim UUID fields in Zod; 400 responses include a `message` for the first Zod issue.
- `app/[eventSlug]/checkout/checkout-content.tsx` – Toasts `message` or `error` from the API when a promo is rejected.

**Updates:** “Apply” on checkout should not fail with opaque 400 when the cart exists for the signed-in user.

## 2026-04-27 – cancel-pending API: 200 when no pending booking (not 404)

- `app/api/bookings/cancel-pending/route.ts` – **No pending** PayMongo booking for the user/event now returns **200** with `ok`, `cancelled_count: 0`, `no_pending: true` (cleanup still runs). **404** was mistaken for a missing route in the browser console. Real query errors return **500**.

**Updates:** Cancelling when there is nothing to cancel no longer shows a red 404 in DevTools.

## 2026-04-27 – Cart: no quantity stepper for free / standing section lines

- `components/booking/inline-cart.tsx` – For section rows with `seating_type` free or standing, the cart no longer shows `SectionQuantityStepper`; quantity is adjusted only in the Free Seating / standing section card. Remove (trash) still clears the line.

**Updates:** Avoids duplicating the stepper in the cart for open sections.

## 2026-04-27 – user_capabilities: extend valid_capability for refund / resend

- `supabase/migrations/00217_user_capabilities_valid_refund_resend.sql` – `CHECK (valid_capability)` on `user_capabilities` now includes `refund_lookup` and `resend_tickets` (table constraint had not been updated in 00216).

**Updates:** Fixes 23514 when inserting dashboard capabilities.

## 2026-04-27 – Per-admin Admin Dashboard card access (User Roles)

- `lib/capabilities.ts` – `refund_lookup`, `resend_tickets`; `DASHBOARD_BOX_CAPABILITIES` + labels.
- `supabase/migrations/00216_dashboard_box_capabilities.sql` – RPC whitelist; backfill dashboard caps for `profiles.role = 'admin'`; add `resend_tickets` for users with `view_sales_analytics`.
- `app/api/admin/users/[userId]/capabilities/route.ts` – Zod allows new capabilities.
- `app/admin/page.tsx`, `app/admin/layout.tsx` – Dashboard visibility and `/admin` gate from new capabilities.
- `app/api/admin/refund-lookup/route.ts` – `super_admin` or `refund_lookup`.
- `lib/auth.ts` – `canAccessTicketResendAdminTools()`; used by ticket resend routes and page.
- `app/api/admin/bookings/search/route.ts`, `app/api/admin/bookings/[id]/resend-tickets/route.ts`, `app/admin/ticket-resending/page.tsx` – use that helper.
- `app/admin/settings/user-roles-settings.tsx` – Dashboard column with Configure/View dialog; checkboxes merge into `PATCH` capabilities.

**Updates:** Super admins choose which home-page cards each staff account sees; Global Settings and Danger Zone unchanged.

## 2026-04-27 – User Roles cards: solid backgrounds (no gradients)

- `app/admin/settings/user-roles-settings.tsx` – Role group cards use solid amber/sky/emerald/slate fills instead of vertical gradients.

## 2026-04-27 – Parallel ticket image generation (buyer flow)

- `lib/ticket-image.ts` – `getResolvedTicketTemplate` coalesces per event key so concurrent renders share one `app_config` resolution.
- `lib/confirm-booking.ts` – Pre-batch `generateTicketImageForTicketId` for rows missing `ticket_image_url` (up to 10 at a time) before email attachments, so work is not only parallel inside the attachment step; safer ticket-generated counts.
- `app/api/checkout/route.ts` – Non–Pay-Mongo on-site and immediate checkout emails build ticket attachments in batched `Promise.all` (10-wide) instead of a sequential per-ticket loop.

**Updates:** Faster post-payment and checkout ticket PNG generation and fewer redundant global template config reads.

## 2026-04-27 – Global Settings: User Roles as separate cards by role

- `app/admin/settings/user-roles-settings.tsx` – One **card** per role (Super Admins → Admins → Admissions Staff → Users), with counts and the same per-row role dropdown; **all cards start collapsed** (header row with chevron toggles); when expanded, empty groups show “No accounts in this role” in the body. Each group has a **distinct full-card** solid tint (amber / sky / emerald / slate; no `glass`). Table rows use dark washes on the same fill.

## 2026-04-27 – Global Settings: User Roles tab (super admin role assignment)

- `app/admin/settings/user-roles-settings.tsx` – Lists all profiles; role dropdown saves via `PATCH /api/admin/users/[id]/role` (`set_user_role`); current user row is read-only.
- `app/admin/settings/page.tsx` – New **User Roles** tab (before **Users**).

## 2026-04-27 – Replace User Roles with per–event administrator page access

- `supabase/migrations/00215_event_administrator_allowed_sections.sql` – `event_administrators.allowed_sections`, `is_authorized_for_event_section`, tighter `is_authorized_event_admin_manager` (needs **Event Administrators** page or super_admin).
- `lib/event-admin-sections.ts`, `lib/require-event-section.ts` – Section ids/labels/defaults; `forbiddenUnlessEventSection` / `forbiddenUnlessAnyEventSection`.
- `components/admin/edit-event-tabs.tsx`, `app/admin/events/[id]/page.tsx` – Tabs and content gated by `allowed_sections` (super_admin: all).
- `components/admin/event-administrators.tsx`, `app/api/admin/events/[id]/administrators/route.ts`, `app/api/admin/events/[id]/administrators/[userId]/route.ts` – Assign admins with default full page set; expand row to edit checkboxes; `PATCH` updates sections.
- `app/api/admin/events/[id]/**` – Event APIs enforce section access (details, seating/selector tree, pricing, promos, admissions, assign/print/reserved, audit, ticket template, etc.); void sale & featured stay super_admin-only.
- `app/admin/settings/page.tsx` – Removed **User Roles** tab; deleted `app/admin/settings/capability-matrix.tsx`.
- `app/admin/events/page.tsx` – Event list allowed for `admin` role (not only `manage_events` capability); **New event** still requires super or `manage_events`.

**Updates:** Run `supabase db push` (or apply migration 00215). Super admins configure each event administrator’s pages under **Event → Event Administrators**. Global capability matrix UI is removed; `user_capabilities` rows may remain for legacy checks outside event APIs.

## 2026-04-27 – Post-payment: fullscreen “Payment received / Generating tickets”

- `components/ui/floating-progress.tsx` – Added `postPaymentSuccess` and `postPaymentPending` presets.
- `app/[eventSlug]/confirmation/[bookingId]/confirmation-processing-client.tsx` – Fullscreen `FloatingProgressBar` while booking is `pending` (with optional PayMongo-confirmed copy); `ConfirmationRefresh` still mounted for polling.
- `app/[eventSlug]/confirmation/[bookingId]/ticket-image-generation-overlay.tsx` – Fullscreen while `fromPayment` and ticket images are still generating; polls `GET /api/bookings/.../ticket-generation-status` then `router.refresh()`.
- `app/api/bookings/[bookingId]/ticket-generation-status/route.ts` – Reports when all ticket rows have `ticket_image_url`.
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – Wires the new overlays; removed the old in-flow processing shell.
- `app/[eventSlug]/payment-return/[bookingId]/page.tsx` – Fullscreen during redirect to confirmation; `postMessage` uses `window.location.origin`.

**Updates:** After a successful charge, users see a blocking full-screen state while payment confirmation and ticket image generation run.

## 2026-04-27 – Admin Event Details: Copy Event Link

- `components/admin/event-form.tsx` – Secondary **Copy Event Link** button (editing only) copies `${origin}/${slug}` to the clipboard with success/error toasts; disabled when slug is empty.

## 2026-04-27 – Buy-pay-get (e.g. “4+1”) promos: clarify bundles + validate messaging

- `lib/promo-structured-messages.ts` – When a structured promo yields **₱0** (wrong cart size, wrong sections, etc.), the validate API can **reject** apply (no matching seats) or return a **hint** (e.g. add more tickets to complete a set).
- `app/api/promo/validate/route.ts` – Uses those outcomes; `promo_no_discount_hint` for checkout toast copy.
- `app/[eventSlug]/checkout/checkout-content.tsx` – `toast.info` for zero-discount promos with a long message.
- `components/admin/event-promo-codes.tsx` – “Buy X get Y” uses **tickets per set (paid+free)** and **free in each set** (derives `pay` = `bundle − free`) with helper text; avoids confusing “4+1” with pay=4 when the intent is 4-ticket groups with 1 free (**pay=3, free=1**).
- `lib/promo-rule-summary.ts` – Clearer one-line rule summary for buy-pay-get.

**Updates:** A “4+1” rule stored as 4 **paid** + 1 free needs **5** eligible tickets for the first free seat. For **4** tickets and **1** free, set **4 tickets per set, 1 free** (3 paid + 1 free). Re-save the event promo in admin or add a 5th ticket to match a 4+1-of-5 rule.

## 2026-04-27 – Footer PayMongo logo: Next/Image aspect-ratio warning

- `components/footer.tsx` – PayMongo mark uses a plain `<img>` (static SVG in `/public`) with `width`/`height` + `h-6 w-auto` instead of `next/image`, removing the framework’s aspect-ratio console warning for this asset.

## 2026-04-27 – PostCSS: fix “Malformed PostCSS Configuration” on Next build

- `postcss.config.mjs` – Use `plugins: { "@tailwindcss/postcss": {} }` (object form) instead of importing the plugin into an array, matching Tailwind v4 + Next’s loader validation.

**Updates:** `next build` / Webpack CSS pipeline no longer throws malformed PostCSS errors.

## 2026-04-27 – Admin promo 500: fallback when DB missing display_name/rule (migration 00214)

- `lib/promo-admin-fallback.ts` – Detects PostgREST/Postgres “missing column” errors for new promo fields.
- `app/api/admin/events/[id]/promo-codes/route.ts` – GET: retry `select` without `display_name` / `rule`, normalize to `null`.
- `app/api/admin/promo-codes/create/route.ts` – POST: legacy “simple” promos insert without new columns; structured (rule) promos return **503** with a hint; optional `notice` in JSON when legacy path used.
- `app/api/admin/promo-codes/[id]/route.ts` – PATCH: strip `display_name`/`rule` and retry, or 503 if rule column required; `notice` when only designer fields would change.
- `components/admin/event-promo-codes.tsx` – Toast `data.notice` / prefer `data.hint` in error message on create/update.

**Updates:** Unblocks saving when `00214_promo_codes_rule_and_display_name` is not applied; `npm run db:push` still required for `display_name`, rule engine promos, and `get_promo_by_code` extras.

## 2026-04-27 – Dynamic Promo Designer: Vitest, PostCSS, promo-discount tests

- `package.json` – Added `vitest` dev dependency and `test` script (`vitest run`).
- `vitest.config.ts` – Vitest config for `lib/**/*.test.ts` and `@` alias.
- `lib/promo-discount.test.ts` – Unit tests for legacy discount, scope filter, and rule types (buy-pay-get, threshold, tiered %, flat bundle).
- `postcss.config.mjs` – Replaced string plugin with `@tailwindcss/postcss` import so tooling (e.g. Vitest/Vite) loads PostCSS plugins correctly.

**Updates:** `npm test` runs promo engine edge-case tests; PostCSS is compatible with Vite-based test runner.

## 2026-04-27 – Promo CTA widened and relabeled

- `components/admin/event-promo-codes.tsx` – Updated promo action button label to `Create New Promo Code` and set a wider minimum width for stronger CTA emphasis.

**Updates:** Promo creation call-to-action is now easier to scan and click.

## 2026-04-27 – Promo card header text cleanup

- `components/admin/event-promo-codes.tsx` – Renamed collapsible card title from `Promos` to `Promo Codes` and removed the descriptive subtitle under the title.

**Updates:** Promo section header now matches requested naming and uses a cleaner single-line title.

## 2026-04-27 – Promos section wrapped in collapsible card

- `components/admin/event-promo-codes.tsx` – Encapsulated promo management content inside one `Promos` card with expand/collapse toggle and default collapsed state.

**Updates:** The event promo management area is now cleaner by default and expands on demand for editing/viewing promo codes.

## 2026-04-27 – Event tab selector label changed to Promos

- `components/admin/edit-event-tabs.tsx` – Renamed the promo section dropdown/tab label from `Promo Codes` to `Promos`.

**Updates:** The section selector now shows a shorter promo title while preserving existing promo page content.

## 2026-04-27 – Persist top-level pricing toggles across refresh

- `components/admin/seat-pricing.tsx` – Early-bird master toggle now reads/writes a dedicated persisted flag instead of inferring state only from early-bird rows.
- `app/api/admin/events/[id]/pricing/route.ts` – Added `early_bird_enabled` to pricing GET/PATCH payload and event update mapping.
- `supabase/migrations/00213_events_early_bird_enabled.sql` – Added `events.early_bird_enabled boolean not null default false`.

**Updates:** Top-level Seat Pricing switches now persist their exact state after refresh (when saved), including `Enable early bird pricing`.

## 2026-04-27 – Optional sale-success admin email switch in Seat Pricing

- `components/admin/seat-pricing.tsx` – Added `Email admins when sale succeeds` switch beside `Save pricing` and included the value in pricing save payload.
- `app/api/admin/events/[id]/pricing/route.ts` – Added `sale_success_email_enabled` to pricing GET/PATCH so the switch persists per event.
- `lib/confirm-booking.ts` – Sale-success admin notification email now sends only when `events.sale_success_email_enabled` is true.
- `supabase/migrations/00212_events_sale_success_email_enabled.sql` – Added `events.sale_success_email_enabled boolean not null default false`.

**Updates:** Admin sale notification emails are now opt-in per event; when the switch is off, no sale-success admin email is sent.

## 2026-04-27 – Pricing API now returns section_group

- `app/api/admin/events/[id]/pricing/route.ts` – Included `section_group` in `event_sections` select and response mapping so Seat Pricing can correctly group sections by their assigned group.

**Updates:** Seat Pricing group cards now receive real section-group data from the backend instead of treating grouped sections as ungrouped.

## 2026-04-27 – Seat pricing grouped collapsible cards

- `components/admin/seat-pricing.tsx` – Grouped pricing rows by `section_group`, moved blank groups into a shared `Ungrouped` card, and added per-group collapse/expand UI defaulted to collapsed.

**Updates:** Seat Pricing now mirrors Seat Configurator grouping so admins can manage large section lists in collapsed group cards and expand only the needed groups.

## 2026-04-27 – Grouping summary card now collapsible

- `components/admin/seat-configurator.tsx` – Added collapsible behavior to the Grouping Summary card with an expand/collapse header toggle; default state is expanded.

**Updates:** Admins can now collapse the summary table when focusing on section editing while still seeing total seats in the header.

## 2026-04-27 – Seat groups: shared Ungrouped + default collapsed

- `components/admin/seat-configurator.tsx` – Blank section groups now map to one shared `Ungrouped` group card; group cards are now initialized as collapsed by default.

**Updates:** Seat Configurator starts with collapsed group cards and keeps ungrouped sections together under a single collapsible container.

## 2026-04-27 – Seat configurator groups in collapsible cards

- `components/admin/seat-configurator.tsx` – Grouped sections by `section_group` (fallback: section name), added one collapsible container per group, and kept existing per-section controls inside each group card.

**Updates:** Sections that share the same group now appear together under a single expandable/collapsible group card for faster scanning.

## 2026-04-27 – Email event team on successful paid booking

- `supabase/migrations/00211_events_created_by.sql` – `events.created_by` (nullable FK to `auth.users`) for creator tracking.
- `app/api/admin/events/route.ts` – Set `created_by` when creating an event.
- `lib/email.ts` – `sendEventSaleNotificationToTeam` (BCC to admins + creator).
- `lib/confirm-booking.ts` – After the buyer ticket email succeeds, notify assigned event administrators and the event creator.

**Updates:** Confirmed PayMongo bookings trigger one admin-facing message with event, buyer summary, ticket count, amount paid, and booking ID.

## 2026-04-26 – Footer: PayMongo logo and payments trust line

- `components/footer.tsx` – PayMongo wordmark (`next/image`) linking to paymongo.com beside the secure-payments copy above the copyright row.
- `public/brands/paymongo-logo.svg` – Wordmark asset (swap for PayMongo’s official partner kit if they require it).

## 2026-04-26 – BackgroundImage: fix rules-of-hooks (useEffect after light-theme return)

- `components/background-image.tsx` – Run `useEffect` on every render before any `return`; guard with `isLight` and reset image state when switching to light theme.

## 2026-04-26 – First-load perceived performance (deferred backdrop + home Suspense)

- `components/background-image.tsx` – Instant `bg-background` layer; concert WebP mounts after first paint (double `requestAnimationFrame`), `fetchPriority="low"`, fade-in on `load` with the dark scrim; respects `prefers-reduced-motion` for transitions.
- `app/home-stream-fallback.tsx` – Richer home Suspense UI: `Loading events` + `WishLoadingTrack`, Featured/Upcoming section header skeletons, and `EventCardSkeleton` grids (no extra category fetch).

**Updates:** First paint no longer competes with the hero WebP; the streamed home segment mirrors the event grid layout while data loads.

## 2026-04-25 - PayMongo refund ID: where to get **`pay_xxx`** (documented)

**Where operators get the correct Payment ID for PayMongo refunds**

1. **In-app (preferred):** **Admin → Refund lookup** (`/admin/refund-lookup`). Enter the **Booking ID** (UUID = Invoice # on the ticket / confirmation email). The result shows:
   - **Stored PayMongo ID** — checkout session `cs_…` or link `link_…` (what we persist on `payments.paymongo_id`).
   - **Payment ID(s) for refund** — **`pay_…`** — this must match the **Payment ID** on the PayMongo dashboard payment detail page (green `pay_` in **Payments** list). Use this for refunds in PayMongo, **not** `cs_`, **`pi_`**, or **Provider ID** (QR network reference like `653884`).

2. **PayMongo dashboard:** **Payments** → open the row → copy **Payment ID** (`pay_…`). Search by description (“Wish Tickets Portal: …”), amount, or date if needed.

**Why lookup matters:** One checkout session can have multiple `pay_` records (failed/abandoned attempts + successful capture). Refund lookup resolves candidates via the PayMongo API and **prefers paid/succeeded payments**, newest first, so the ID matches the live dashboard.

**Code:** `app/admin/refund-lookup/page.tsx`, `app/api/admin/refund-lookup/route.ts`, `lib/paymongo.ts` (`resolvePaymongoRefundPaymentIds`, `preferPaidRefundPaymentIds`, `extractPaymentIdsFromPaymongoResourceJson`).

## 2026-04-25 - Admin print-tickets GET: maxDuration + batched event_seats (Netlify 502)

- `app/api/admin/events/[id]/print-tickets/route.ts` - `export const maxDuration = 120`; load all assigned `event_seats` for the event in one `.in("event_section_id", …)` query, group/sort per section (replaces N per-section round trips that could time out on Netlify).
- `docs/NETLIFY_DEPLOY.md` - Note on 502 for Print Tickets tab load and what was done.

**Updates:** Mitigates `ERR_ABORTED 502` when opening Print Tickets on large events in production.

## 2026-04-25 - print-folder-zip-worker: accept Bearer or x-worker-secret (deploy / pg_cron)

- `supabase/functions/print-folder-zip-worker/index.ts` - When `PRINT_FOLDER_ZIP_WORKER_SECRET` is set, allow either `x-worker-secret` (Netlify kick) or `Authorization: Bearer …` (matches Vault/pg_net cron in `00174`) so production cron and app triggers agree.
- `docs/NETLIFY_DEPLOY.md` - Document that section ZIPs need deployed Edge Function + matching secrets; inline ZIP is opt-in via `PRINT_SECTION_ZIP_INLINE`.

**Updates:** Fixes 401 from pg_cron when only Bearer was sent; clarifies why ZIP works locally but not on Netlify until worker + env are aligned.

## 2026-04-25 - Print Tickets section ZIP: 409 fix, non-blocking POST, clearer UI

- `lib/print-tickets/section-zip-jobs.ts` - `enqueueSectionZipJob`: treat Print Tickets flow (no `bookingId`) as superseding a manual-scoped row (`source_booking_id`, `-manual-` in `folder_prefix`, or folder prefix mismatch vs computed target) so POST no longer returns 409 after Manual Distribution; reset ZIP artifact fields when superseding; `normalizeFolderPrefixForCompare` for stable comparisons.
- `app/api/admin/print-tickets/section-zips/route.ts` - Default **off** synchronous `processSectionZipJobsInline` on POST (large sections no longer block the HTTP response for minutes). Set `PRINT_SECTION_ZIP_INLINE=true` only for small/local runs without the worker. Response includes `inlineSkipped` when jobs are queued for background/worker processing; still kicks `print-folder-zip-worker` when applicable.
- `components/admin/print-tickets-tab.tsx` - Replaced string `zippingScope` with `zipBusy` (`build` vs `delete`, section scope) so `FloatingProgressBar` shows **Building section ZIP…** / **Removing ZIP…** instead of a generic “Working…”; `busy` includes ZIP in-flight; success toast when `inlineSkipped` explains background completion; `AbortSignal.timeout(180_000)` on ZIP POST.
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - Same ZIP POST timeout; toast when `inlineSkipped` notes background processing; keeps Manual Distribution `overwrite: true` behavior unchanged.

**Updates:** Print Tickets ZIP generation works after manual ZIPs on the same section; admin UI no longer hangs while the server zips huge folders; jobs enqueue and finish via worker/polling as intended.

## 2026-04-24 - Reverted Netlify/404 experimental changes

- `netlify.toml` - Restored `publish = ".next"` and `[functions]`; removed extra `NODE_VERSION` / `NODE_OPTIONS` and comments about omitting `publish` (reverts plugin “publish = base” confusion from empty publish in some sites).
- `app/not-found.tsx` - Removed `export const dynamic` (back to default).
- `app/layout.tsx` - Restored single-line `SITE_URL` for metadata.
- `package.json` - Removed `engines` and devDependency `@netlify/plugin-nextjs` (use Netlify’s bundled plugin or install per project as needed).
- `package-lock.json` - Regenerated via `npm install` after removing `@netlify/plugin-nextjs` from devDependencies.
- Removed `.nvmrc` and `netlify/functions/.gitkeep`.
- `docs/NETLIFY_DEPLOY.md` - Removed the added `/_not-found` troubleshooting block; publish directory note back to `.next`.

**Updates:** Unwind Netlify config experiments so other projects’ copies and standard `publish = .next` + plugin works predictably.

## 2026-04-24 - Assign-seats: visible ZIP in-progress (spinner + fast poll)

- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - While Create Zip/Delete ZIP runs, show spinner and “Creating section ZIPs…” before DB shows jobs; when jobs are `pending`/`processing`, keep spinner and show `ZIP in progress… · N% · stage` from polling. Poll every 1.5s while an assignment is zipping (in addition to the 4s poll when any section ZIP is active).

## 2026-04-24 - Assign-seats: drop ZIP path debug, single status + progress line

- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - Removed "ZIP debug" storage-prefix lines; folded progress (`%` + stage) into the same line as status when a ZIP is active; removed `zipInlineDebugBySection` state and folder/file toast suffix on Create Zip.

## 2026-04-24 - Remove invalid `tickets.event_id` from ZIP / folder resolution queries

- `lib/print-tickets/section-zip-jobs.ts` - `tickets` has no `event_id`; use `bookings` for event checks and filter sold tickets by `booking_id` + `bookings.event_id` where needed. Fixes Postgres error `column tickets.event_id does not exist` during Create Zip and related paths.
- `app/api/admin/print-tickets/section-zips/route.ts` - Validate `booking` belongs to `event` once, then query `tickets` by `booking_id` only.
- `supabase/functions/print-folder-zip-worker/index.ts` - Same booking-scoped ticket listing fix as the shared lib (already using `bookings` pre-check from prior change).

**Updates:** Create Zip and folder-prefix resolution now match the real `tickets` schema (event via `bookings`).

## 2026-04-24 - Booking-scoped section ZIP file counts (`source_booking_id`)

- `supabase/migrations/00203_print_folder_zip_jobs_source_booking_id.sql` - Add nullable `source_booking_id` on `print_folder_zip_jobs`.
- `lib/print-tickets/section-zip-jobs.ts` - Persist `source_booking_id` when enqueuing with `bookingId`; export `listTicketObjectPathsForBookingSection` (paths from `tickets` for that booking + section only).
- `app/api/admin/print-tickets/section-zips/route.ts` - Inline ZIP processor uses booking-scoped paths when `source_booking_id` is set.
- `supabase/functions/print-folder-zip-worker/index.ts` - Worker uses the same booking-scoped listing so `total_files` matches the order (e.g. 13), not all objects under the folder prefix.

**Updates:** Create Zip for a manual/booking context no longer lists thousands of files from the whole section storage tree or `print_tickets` pool; it zips only images attached to that booking’s tickets for each section.

## 2026-04-24 - Fix ESLint failures blocking `next build`

- `app/api/admin/events/[id]/route.ts` - Legacy `update_admin_event` fallback: destructure to omit `p_ticket_purchase_per_user` and `void` the stripped value so the binding is not flagged unused.
- `app/api/admin/print-tickets/section-zips/route.ts` - Use `const` for `bookingFolderPrefixBySection` (map is only mutated, not reassigned).

**Updates:** Resolves `no-unused-vars` and `prefer-const` so production build lint passes.

## 2026-04-24 - Manual Distribution ZIP uses assignment `-manual-` storage segment

- `lib/print-tickets/section-zip-jobs.ts` - Exported `slugifyPathSegment` and added `getManualDistributionEventStorageSlug` (admin assignment + ticket URL fallback) matching `generate-manual-assignment-ticket-images-batch` path layout.
- `app/api/admin/print-tickets/section-zips/route.ts` - After existing prefix resolution, fills missing per-section `folderPrefixOverride` with `print-by-section/{manualEventSlug}/{sectionSlug}` so ZIP scans the real ticket image folders (multi-section bookings get one prefix per section).

**Updates:** Create Zip no longer lists only `print-by-section/<bare-event-slug>/...` while images live under `print-by-section/<event>-manual-<assignment8>/...`, fixing persistent 0-file ZIP jobs for manual distributions.

## 2026-04-24 - Fixed sectionId path skipping booking folder override

- `app/api/admin/print-tickets/section-zips/route.ts` - Applied booking-ticket folder-prefix resolution for target sections even when `sectionId` is explicitly passed, so enqueue no longer skips manual booking path derivation in section-scoped ZIP requests.

**Updates:** `print_folder_zip_jobs.folder_path` now follows booking-generated ticket folders for Manual Distribution Create Zip calls that include `sectionId`, avoiding stale generic prefixes.

## 2026-04-24 - Persisted total_files during ZIP listing stage

- `app/api/admin/print-tickets/section-zips/route.ts` - Updated inline ZIP processor to write `total_files` immediately after folder scan, set stage to `zipping`, and wrap per-job execution in `try/catch` so listing/download failures transition jobs to `failed` with an explicit error instead of getting stuck at `listing`.

**Updates:** `print_folder_zip_jobs.total_files` now reflects discovered files as soon as scan completes, and stuck `listing` rows now surface concrete failure errors.

## 2026-04-24 - Added print_tickets fallback for manual ZIP prefix resolution

- `app/api/admin/print-tickets/section-zips/route.ts` - Added fallback prefix resolution from recent `print_tickets.ticket_image_url` for unresolved booking sections, preferring `-manual-` folder paths to avoid generic section prefix drift.

**Updates:** Manual Distribution ZIP jobs can now pick the correct manual ticket-image folder even when booking ticket URL mappings are incomplete, preventing persistent `.../wishdate-rewrite-dagupan/genad · 0 files` debug paths.

## 2026-04-24 - Forced booking-derived folder prefix in section ZIP enqueue

- `app/api/admin/print-tickets/section-zips/route.ts` - Added booking-ticket URL parsing to build a per-section `folderPrefixOverride` map from actual booking ticket image paths, including seat-based section resolution, and passed that prefix into ZIP enqueue for manual distributions.
- `lib/print-tickets/section-zip-jobs.ts` - Extended `enqueueSectionZipJob` to accept `folderPrefixOverride` and use it as authoritative ZIP source prefix when provided.

**Updates:** Section ZIP jobs now follow the booking’s real generated ticket folder path (including `...-manual-...`) instead of reverting to generic section prefixes that returned zero files.

## 2026-04-24 - Fixed booking seat-based ZIP folder resolution

- `lib/print-tickets/section-zip-jobs.ts` - Extended booking-priority prefix lookup to handle bookings where `tickets.section_id` is null by resolving `tickets.seat_id -> event_seats.event_section_id` and selecting the matching ticket image URL for the target section.

**Updates:** Manual Distribution ZIP prefix resolution now finds the correct booking image folder even when tickets are seat-mapped (section inferred via event_seats), avoiding fallback to generic zero-file prefixes.

## 2026-04-24 - Corrected ZIP folder source to booking ticket images

- `lib/print-tickets/section-zip-jobs.ts` - Updated section ZIP folder-prefix resolution to prioritize booking-scoped `tickets.ticket_image_url` (manual-distribution images) before falling back to `print_tickets`/generic section tickets, ensuring ZIP uses the same folder where the confirmed booking images were generated.
- `app/api/admin/print-tickets/section-zips/route.ts` - Passed `bookingId` through to ZIP enqueue/folder-prefix resolution so manual distribution jobs derive prefixes from the correct booking ticket files.

**Updates:** Manual Distribution ZIP debug now resolves against the booking’s real image folder (e.g. manual assignment path) instead of drifting to a generic section prefix with zero files.

## 2026-04-24 - Stabilized Manual Distribution ZIP status progression

- `app/api/admin/print-tickets/section-zips/route.ts` - Added stale-pending inline ZIP recovery threshold, per-section inline debug output (`folderPrefixUsed`, `resolvedImageCount`, outcome), and richer POST response diagnostics (`sectionResults`, `inlineDebug`) for assignment ZIP actions.
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - Added ZIP diagnostics parsing/toasts, immediate plus delayed status refresh after Create Zip, no-section-mapping status guard, and temporary inline debug rendering for non-ready ZIP states.
- `app/api/admin/events/[id]/assignments/route.ts` - Enriched assignments with booking-derived `section_ids` to keep card ZIP status/actions aligned with authoritative section mapping.

**Updates:** Manual Distribution ZIP actions now provide actionable feedback, recover stale pending jobs, and keep the `ZIP ready` state synchronized with actual booking section ZIP results.

## 2026-04-24 - Fixed assignment ZIP status section mapping

- `app/api/admin/events/[id]/assignments/route.ts` - Enriched assignment payload with authoritative `section_ids` derived from booking `tickets` (`section_id` and seat->section fallback via `event_seats`) alongside expected/generated ticket counts.
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - Updated assignment section-id resolver to prefer server-provided `section_ids` before inferring from local assignment items.

**Updates:** Manual Distribution ZIP status/action logic now tracks the correct booking sections, preventing stale `ZIP not generated (0/1 ready)` states caused by incomplete item-level section mapping.

## 2026-04-24 - Added booking-based section resolution for Create Zip

- `app/api/admin/print-tickets/section-zips/route.ts` - Extended ZIP enqueue API to accept `bookingId` and derive target section IDs from booking `tickets` + `event_seats` when `sectionId` is missing.
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - Updated assignment Create Zip flow to pass `bookingId` and continue ZIP enqueue even when local assignment section IDs are empty.

**Updates:** Manual Distribution Create Zip now works for assignments whose client-side item payload lacks section mapping, by resolving sections server-side from the booking.

## 2026-04-24 - Unblocked Manual Distribution ZIP action buttons

- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - Removed `sendingEmailId` from Create Zip/Delete ZIP button disable conditions so ZIP actions remain clickable for confirmed assignments even when email-send state is present.

**Updates:** Manual Distribution users can trigger ZIP creation/deletion directly without the buttons being unintentionally locked by email-send UI state.

## 2026-04-24 - Added inline ZIP job repair fallback

- `app/api/admin/print-tickets/section-zips/route.ts` - Added a server-side repair path that detects failed section ZIP jobs with `"No ticket image files found in folder prefix"`, recursively scans storage under `folder_prefix`, builds/uploads ZIP directly, and marks the job completed.
- `app/api/admin/print-tickets/section-zips/route.ts` - Expanded inline processing to also handle `pending`/`processing` section ZIP jobs directly in the API (not only failed jobs), so Create Zip no longer waits indefinitely on external worker/cron triggers.

**Updates:** Even when edge worker lookup fails, section ZIPs can now be recovered and completed directly from the app API using storage folder contents.

## 2026-04-24 - Hardened ZIP worker image-path discovery

- `supabase/functions/print-folder-zip-worker/index.ts` - Relaxed public URL object-path extraction to not require exact `SUPABASE_URL` host matching and added fallback recursive storage listing for section jobs when DB URL-derived paths return empty.
- `lib/print-tickets/folder-links.ts` - Relaxed storage path extraction from public URLs to parse by marker path (`/storage/v1/object/public/`) regardless of host/domain variation.

**Updates:** ZIP generation now finds ticket image files even when stored URL hostnames differ from configured Supabase URL, preventing false "No ticket image files found in folder prefix" failures.

## 2026-04-24 - Added direct ZIP worker kick fallback

- `app/api/admin/print-tickets/section-zips/route.ts` - Added best-effort edge worker trigger (`print-folder-zip-worker`) after enqueue and during pending-status polling so ZIP jobs still process when pg_cron/Vault worker scheduling is not configured.
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - Added inline ZIP failure-detail rendering for confirmed assignments so worker error messages are visible directly under the ZIP status line.

**Updates:** Section ZIP processing can now advance immediately from the app API itself instead of waiting solely on external cron triggers.

## 2026-04-24 - Fixed section ZIP prefix matching for generated tickets

- `lib/print-tickets/section-zip-jobs.ts` - Relaxed URL-derived section slug validation to treat equivalent slugs (e.g. `genad` and `gen-ad`) as the same section when resolving `folder_prefix` for ZIP jobs.

**Updates:** Section ZIP jobs now use the actual generated ticket folder prefix even when slug separators differ, preventing false "ZIP failed" states where files existed.

## 2026-04-24 - Removed print ticket ZIP minimum threshold

- `lib/print-tickets/run-print-tickets-email-from-rows.ts` - Removed the 50-ticket bulk ZIP threshold gate and switched print-ticket email sends to always resolve ZIP/folder download links regardless of ticket count.

**Updates:** Any number of selected print tickets can now be delivered via ZIP links instead of relying on a minimum ticket-count condition.

## 2026-04-24 - Fixed complementary reverse booking cleanup

- `app/api/admin/assignments/[id]/reverse/route.ts` - Reordered reverse flow to unlink `admin_seat_assignments.booking_id` before deleting the booking, and added cleanup of admission records and booking promo rows.
- `lib/admin/void-sale.ts` - Reordered empty-booking cleanup in assignment allocation adjustments to reset assignment linkage before booking deletion.

**Updates:** Reversing/deleting confirmed complementary manual distributions now properly removes now-empty confirmed bookings instead of leaving orphaned booking rows.

## 2026-04-24 - Updated shareable report link copy

- `app/admin/reports/reports-page-client.tsx` - Changed the share link helper text to "Shareable report link (copied to clipboard; does not expire)" for clearer wording in Sales & Reports.

**Updates:** Sales & Reports now uses clearer copy for the generated shareable report URL banner.

## 2026-04-24 - Sorted Adjust Allocation seats chronologically

- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - Added natural/chronological seat sorting for Adjust Allocation seat rows so labels render in numeric order (e.g., Seat 1, 2, 3...).

**Updates:** Seats in each Adjust Allocation section now display in chronological numeric order instead of mixed sequence.

## 2026-04-24 - Made Adjust Allocation groups and sections collapsible

- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - Added collapsible controls for `Adjust Allocation` group rows and section rows with chevron toggles while preserving group/section/seat checkbox selection behavior.

**Updates:** Admins can now collapse and expand group/section blocks in the Adjust Allocation popup for easier navigation with larger ticket sets.

## 2026-04-24 - Added Adjust Allocation flow for manual distribution

- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - Replaced confirmed-row `View booking` action with `Adjust Allocation` and added a new assignment-scoped dialog to release sold tickets by group, section, or seat using checkbox controls.
- `app/api/admin/assignments/[id]/allocation-adjustments/route.ts` - Added GET/POST endpoints to fetch assignment-scoped sold ticket hierarchy and release selected tickets with event-admin/super-admin authorization.
- `lib/admin/void-sale.ts` - Added reusable booking-scoped helpers to list sold ticket groups for a booking and release selected tickets while recomputing `bookings.total_cents` and handling empty-booking cleanup.

**Updates:** Manual Distribution now supports granular post-confirmation seat release for a single assignment and keeps booking totals synchronized after allocation changes.

## 2026-04-24 - Fixed missing complimentary value in section revenue card

- `lib/reports/dashboard-metrics.ts` - Recomputed `section_revenue` from normalized per-section VSS counts plus section prices so distributed/complimentary/projected values stay aligned with the same classification logic used by dashboard KPIs and VSS breakdown

**Updates:** Amount Paid & Value by Section now correctly reflects complimentary value instead of dropping it when RPC/base aggregates drift from runtime-normalized counts.

## 2026-04-24 - Adjusted event audit trail retention to 1 week

- `supabase/migrations/00199_event_audit_logs_retention_cron.sql` - Changed cleanup threshold from 14 days to 7 days while keeping the same daily cron schedule

**Updates:** Daily audit trail cleanup now keeps only the most recent 1 week of logs.

## 2026-04-24 - Added daily 2-week retention cleanup for event audit trail logs

- `supabase/migrations/00199_event_audit_logs_retention_cron.sql` - Added `cleanup_old_event_audit_logs()` plus idempotent pg_cron scheduling (`cleanup-old-event-audit-logs-daily`) to delete `event_audit_logs` rows older than 14 days every day at 03:00

**Updates:** Event audit trail now auto-prunes old records daily, keeping only the most recent two weeks.

## 2026-04-24 - Added collapsible buyer/email VSS breakdown in reports

- `components/admin/reports/vss-buyer-breakdown.tsx` - Added new buyer-focused VSS card grouped by buyer name/email with default-collapsed card and per-buyer collapsible rows
- `components/admin/reports/vss-buyer-breakdown.tsx` - Grouped revenue drilldown rows by buyer, showed total tickets per buyer, listed how they bought (payment method summary), and added per-ticket purchase details table
- `components/admin/reports/reports-content.tsx` - Integrated the new buyer VSS breakdown card into admin reports view

**Updates:** Reports now include a collapsible VSS view showing each buyer/email, ticket totals, payment method used, and ticket-level purchase breakdown.

## 2026-04-23 - Event teaser controls now allow fullscreen and start with sound

- `components/event-card.tsx` - Made modal media overlays pointer-events transparent so native video/iframe controls (including fullscreen) are clickable
- `components/event-card.tsx` - Updated direct teaser playback to open with sound (`muted=false`, volume restored) while still auto-attempting play on modal open
- `components/event-card.tsx` - Updated embed autoplay params to request unmuted autoplay (`mute=0`, `muted=0`)

**Updates:** Event teaser playback now tries to start unmuted and no longer blocks fullscreen control interaction in the details modal.

## 2026-04-23 - Event modal now autoplays teaser on open

- `components/event-card.tsx` - Added modal direct-video autoplay trigger on dialog open with muted fallback handling for browser autoplay policies
- `components/event-card.tsx` - Updated embed teaser URL to request autoplay with muted/playsinline params for smoother immediate playback
- `components/event-card.tsx` - Enabled muted autoplay + controls on modal direct teaser videos so playback starts automatically and users can unmute

**Updates:** Clicking an event now opens details with teaser video playback starting automatically when a teaser exists.

## 2026-04-23 - Added RPC signature fallback for event save compatibility

- `app/api/admin/events/[id]/route.ts` - Added backward-compatible retry when calling `update_admin_event`: if the DB exposes the older function signature (without `p_ticket_purchase_per_user`), API now retries with legacy args instead of failing with `PGRST202`

**Updates:** `Save changes` no longer hard-fails on environments that haven’t applied the latest RPC migration yet.

## 2026-04-23 - Fixed event save 500 after teaser upload

- `components/admin/event-form.tsx` - Normalized teaser values to public Supabase storage URLs before auto-save/manual save payloads to avoid persistence failures
- `app/api/admin/events/[id]/route.ts` - Added server-side teaser URL normalization (`storage://...` and `/storage/v1/object/public/...` to full public URL) before RPC update call, plus debug logging on update errors
- `app/api/admin/events/route.ts` - Added same teaser URL normalization and debug logging on create errors for consistency

**Updates:** Saving event changes now accepts teaser uploads reliably and avoids PATCH 500 errors caused by non-public teaser URL formats.

## 2026-04-23 - Teaser upload now auto-saves on existing events

- `components/admin/event-form.tsx` - After teaser upload completes, existing event pages now immediately PATCH-save `teaser_video_url` so refresh does not lose the uploaded teaser
- `components/admin/event-form.tsx` - Added dedicated upload overlay state/copy for teaser auto-save step (`Saving teaser video...`)

**Updates:** Uploading a teaser video on an existing event now persists instantly without requiring an extra manual save click.

## 2026-04-23 - Event media uploads now show nicer contextual progress

- `components/admin/event-form.tsx` - Added contextual floating progress messages for media upload types (thumbnail, full image, teaser video) and improved save/delete overlay copy

**Updates:** Uploading media now shows clearer, more polished progress text instead of generic “Saving...”.

## 2026-04-23 - Fixed teaser video upload 500 by updating bucket MIME/size policy

- `supabase/migrations/00198_event_images_bucket_allow_teaser_videos.sql` - Expanded `event-images` bucket to allow `video/mp4` and `video/webm`, and raised file size limit to 200MB for teaser uploads
- `app/api/admin/upload/route.ts` - Improved storage upload error handling to return `400` for MIME/size validation failures and added server-side error logging for easier diagnosis

**Updates:** Teaser video uploads no longer fail due to storage bucket restrictions; invalid upload constraints now return clearer validation responses.

## 2026-04-23 - Teaser video now supports Supabase upload (phase 1)

- `components/admin/event-form.tsx` - Replaced primary teaser input with upload/replace/remove controls for MP4/WebM and added preview for direct-hosted videos
- `components/admin/event-form.tsx` - Kept legacy URL entry in collapsible fallback to preserve existing YouTube/direct-link workflows
- `app/api/admin/upload/route.ts` - Added teaser video upload handling (`assetKind=teaser-video`) with video MIME validation, 200MB limit, and canonical storage path convention `teaser-videos/original/<slug>/...`
- `app/api/admin/upload/route.ts` - Upload response now includes `storageRef` (`storage://bucket/path`) for transcode-ready persistence
- `app/api/admin/events/route.ts` - Expanded URL validation to accept canonical Supabase `storage://...` and `/storage/v1/object/public/...` teaser references
- `app/api/admin/events/[id]/route.ts` - Expanded URL validation to accept canonical Supabase `storage://...` and `/storage/v1/object/public/...` teaser references
- `lib/utils.ts` - Added Supabase storage teaser URL resolver so playback supports canonical storage refs while keeping existing YouTube/Vimeo/direct URL compatibility

**Updates:** Admins can now upload teaser videos directly to Supabase Storage and persist a transcode-ready storage reference, while frontend playback remains backward-compatible with existing teaser URLs.

## 2026-04-23 - Unused print_generate_jobs removal reconciled with rollback safety

- `supabase/migrations/00196_mark_print_generate_jobs_already_removed.sql` - Added reconciliation migration that safely drops `public.print_generate_jobs` only if it still exists in diverged environments
- `supabase/migrations/00197_restore_print_generate_jobs_rollback.sql` - Added rollback helper migration to recreate legacy `public.print_generate_jobs` table (indexes, RLS, policy, cancelled status support)

**Updates:** Standardized environments around the already-removed legacy async print job table while preserving a fast rollback path.

## 2026-04-23 - Manual distribution shows live ZIP progress detail

- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - Added assignment-level ZIP progress detail showing average percentage and current stage while ZIP jobs are pending/processing

**Updates:** Confirmed manual distributions now display clearer ZIP progress (`%` + stage) before email send is enabled.

## 2026-04-23 - Manual distribution now tracks ZIP readiness before email send

- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - Added per-assignment ZIP status tracking (ready, in progress, failed, not generated) using section ZIP jobs
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - Disabled `Send email` for confirmed assignments until all related section ZIPs are completed and ready
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - Added per-assignment `Re-zip` and `Delete ZIP` actions and background ZIP status polling

**Updates:** Manual distribution email sending is now gated by ZIP readiness, with visible ZIP progress and quick re-zip/delete controls per assignment.

## 2026-04-23 - Book page now retries transient empty availability before no-map state

- `app/[eventSlug]/book/book-page-client.tsx` - Added automatic short retry loop (3 attempts with backoff) when availability returns empty seats and empty sections without an API error
- `app/[eventSlug]/book/book-page-client.tsx` - Shows temporary “Checking latest seat availability...” state while retries run and suppresses immediate “No seat map configured” fallback

**Updates:** Reduced false “No seat map configured” flashes caused by transient empty availability payloads.

## 2026-04-23 - PayMongo confirm dialog loading copy improved

- `components/ui/confirm-dialog.tsx` - Added optional `loadingMessage` and `loadingSubMessage` props for context-specific progress overlay text
- `app/[eventSlug]/checkout/checkout-content.tsx` - Set PayMongo confirmation loading copy to payment-specific text instead of generic save messaging

**Updates:** Clicking “Continue to PayMongo” now shows “Starting secure payment...” with a checkout-specific standby message.

## 2026-04-23 - Book page availability now ignores stale store event id

- `app/[eventSlug]/book/book-page-client.tsx` - Availability query now keys only off slug-resolved `event.id` (removed fallback to reservation-store `eventId` to prevent wrong-event seat payload races)
- `app/[eventSlug]/book/book-page-client.tsx` - Added `cache: "no-store"` to slug event fetch and cache-busting timestamp on availability requests
- `app/[eventSlug]/book/book-page-client.tsx` - Forced fresh mount/focus revalidation (`staleTime: 0`, `refetchOnMount: "always"`) for event and availability queries

**Updates:** Reduced intermittent “No seat map configured” false states caused by stale/racy event id selection and cached availability responses.

## 2026-04-23 - Global OG/Twitter image wired to public og-image.jpg

- `app/layout.tsx` - Added global Open Graph and Twitter metadata using `/og-image.jpg` for rich link previews
- `app/layout.tsx` - Added `metadataBase` from `NEXT_PUBLIC_SITE_URL` (fallback `https://wishtickets.net`) to ensure absolute preview URLs

**Updates:** Shared links now use your uploaded `public/og-image.jpg` preview image across messaging/social platforms.

## 2026-04-23 - Removed PayMongo modal header action buttons

- `app/[eventSlug]/checkout/checkout-content.tsx` - Removed the PayMongo header buttons (`Open in new tab`, `Close payment card`) from the checkout modal top bar

**Updates:** The PayMongo card header is now cleaner and no longer shows those two action buttons.

## 2026-04-23 - Manual ticket-image generation now auto-retries until complete

- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - Reworked confirm and missing-image generation loops to retry on temporary API failures and idle batches with backoff, instead of failing immediately
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - Added bounded safety guards (`max attempts`, `max consecutive idle`, `max consecutive errors`) to avoid infinite loops while still pushing retries until completion

**Updates:** If generation briefly stalls or errors, the UI now keeps retrying automatically and only stops after sustained failure thresholds.

## 2026-04-23 - Increased events header inset again

- `components/event-grid.tsx` - Increased header row horizontal inset to `px-5 sm:px-8` for Featured/Upcoming heading rows

**Updates:** Upcoming header content is nudged a bit more inward for better visual centering.

## 2026-04-23 - Increased center inset for events header row

- `components/event-grid.tsx` - Increased horizontal header padding from small inset to `px-4 sm:px-6` for Featured and Upcoming header rows

**Updates:** “Upcoming Events”, count text, and Filter button are pushed further inward for a more centered visual alignment.

## 2026-04-23 - Event section headers no longer stick to page edges

- `components/event-grid.tsx` - Added horizontal padding to Featured and Upcoming section header rows, including the “Showing X of Y events” copy and Filter button container

**Updates:** Upcoming Events header text and Filter button now sit with better side spacing instead of hugging the viewport edges.

## 2026-04-23 - Void-sale group/section lists now collapsible by default

- `components/admin/void-sale-release-tab.tsx` - Added collapsible group headers with chevron toggles and default-collapsed state
- `components/admin/void-sale-release-tab.tsx` - Added collapsible section headers inside each group with default-collapsed ticket lists

**Updates:** Void Sale & Release Seat now opens with groups and sections collapsed, reducing initial visual clutter while preserving per-group/per-section actions.

## 2026-04-23 - CSP updated to allow Google tag script loading

- `next.config.ts` - Updated global `Content-Security-Policy` to allow `https://www.googletagmanager.com` in `script-src` and `script-src-elem`

**Updates:** Browser CSP now permits loading `gtag.js`, resolving the Google tag script-blocked console errors.

## 2026-04-23 - Added Google tag sitewide in root layout

- `app/layout.tsx` - Added global Google tag (`G-DK0XXET3ZJ`) using `next/script` with `gtag.js` loader and initialization script so analytics runs across all pages

**Updates:** Google Analytics tag is now installed app-wide immediately after hydration.

## 2026-04-23 - Auto-refresh assignment status when generation errors/stalls

- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - Added automatic `fetchData()` refresh before showing errors when manual ticket image generation fails, stalls, times out, or throws during confirm/missing-image loops

**Updates:** When batch generation encounters an error or stall, the page now refreshes assignment status automatically so admins immediately see current generated-ticket progress.

## 2026-04-23 - Manual distribution confirm image batches no longer fail-fast

- `lib/manual-assignment-confirm/generate-manual-assignment-ticket-images-batch.ts` - Added per-batch `failed` count and changed per-ticket image generation errors to be logged-and-skipped instead of aborting the whole request
- `app/api/admin/assignments/[id]/confirm/generate-images/route.ts` - Returned batch `failed` count to clients and changed unexpected generator failures to HTTP 500 (server error) instead of 400
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` - Read `failed` batch metric and avoided premature “stalled” aborts when failures occur in a loop, allowing subsequent retries/progress

**Updates:** Confirming large manual distributions is now resilient to individual ticket image generation failures, preventing immediate `400` stop on first bad ticket.

## 2026-04-23 - Ticket email subtotal now uses pre-discount line items

- `lib/confirm-booking.ts` - Changed ticket email subtotal derivation to prioritize computed ticket line-item total before applying discount math fallbacks
- `app/api/checkout/route.ts` - Computed email subtotal directly from ticket detail row prices in both on-site and non-PayMongo confirmation email paths

**Updates:** Order summary emails now display subtotal before discount (e.g. `₱5.00` subtotal then discounted total) instead of mirroring final total when discount metadata is incomplete.

## 2026-04-23 - Added event-level Void Sale & Release Seat admin section

- `lib/admin/void-sale.ts` - Added shared sold-seat voiding service for inventory grouping and destructive cleanup (tickets, admissions, booking promos, payments, seat reset, booking recompute/delete)
- `app/api/admin/events/[id]/void-sale/route.ts` - Added super-admin-only GET/POST API for grouped sold-seat inventory and per-ticket/per-section/per-group void-sale operations with audit logging
- `app/api/admin/reports/clear-sold-section/route.ts` - Refactored reports clear-sold flow to reuse shared void-sale service logic
- `components/admin/void-sale-release-tab.tsx` - Added new admin UI panel with grouped sold seats and destructive actions (`Void seat`, `Void section`, `Void group`) plus confirm dialog and blocking progress overlay
- `app/admin/events/[id]/page.tsx` - Wired new `Void Sale & Release Seat` panel into event admin page for super admins
- `components/admin/edit-event-tabs.tsx` - Added new event tab option and tab content rendering for `voidSaleRelease`

**Updates:** Super admins can now void sold records and release affected seats at ticket, section, or group level directly inside each event page, using a shared destructive workflow consistent with reports clear-sold behavior.

## 2026-04-23 - Quantity selector border now follows section color

- `components/seat-picker/section-quantity-stepper.tsx` - Added optional `accentColor` prop and switched outer control border to dynamic inline border color with fallback to `var(--wish-orange)`
- `components/seat-picker/section-picker.tsx` - Passed resolved section accent color into open-seating quantity steppers
- `components/booking/inline-cart.tsx` - Passed resolved section accent color into cart quantity steppers for section rows

**Updates:** The +/- quantity selector outline now uses each section’s color instead of a fixed red/orange border.

## 2026-04-23 - Ticket email total now uses paid PayMongo amount

- `lib/confirm-booking.ts` - Updated booking confirmation email amount selection to prefer `payments.amount_cents` when available, before falling back to `bookings.total_cents`

**Updates:** Email `Total` now reflects the actual charged PayMongo amount, preventing mismatch when booking totals drift from payment records.

## 2026-04-23 - Added Mark sold action for pending booking holds

- `components/admin/reserved-seats-tab.tsx` - Added a `Mark sold` button per pending booking hold and wired it to admin API flow with loading state + success/error toasts
- `app/api/admin/events/[id]/reserved-seats/release/route.ts` - Added `mark_sold_booking_id` action path to confirm pending bookings as sold (sets booking/payment status and sold seats via `confirmBookingStatusOnly`) with audit logging

**Updates:** Admins can now finalize pending booking holds as sold directly from the Reserved Seats panel without releasing and rebooking.

## 2026-04-23 - Pending booking hold reference aligned with PayMongo

- `app/api/admin/events/[id]/reserved-seats/route.ts` - Included `paymongo_id` in pending payment lookup and exposed `paymongo_reference` (mapped to booking ID used as PayMongo checkout `reference_number`) in pending booking hold payload
- `components/admin/reserved-seats-tab.tsx` - Replaced truncated 8-char hold ref with full PayMongo-linked reference, and added `PayMongo ID` + full `Booking ID` display for easier cross-checking with payment receipts

**Updates:** Admin pending-hold references now match the full PayMongo checkout reference instead of a shortened internal snippet.

## 2026-04-23 - Zero-value promo discounts now show explicit label in email

- `lib/email.ts` - Updated ticket email discount text to display `Promo code <code>` when discount amount is zero but a promo description exists

**Updates:** Ticket emails now use explicit promo labeling instead of ambiguous discount text for non-monetary promo applications.

## 2026-04-23 - Ticket email discount line now reflects promo-only cases

- `lib/email.ts` - Updated discount placeholder formatting so when discount amount is zero but a promo description/code exists, the email displays the promo description instead of `None`; parenthetical code suffix now appears only when there is a numeric discount amount

**Updates:** Prevents `Discount: None (PROMOCODE)` output and shows the actual promo descriptor cleanly.

## 2026-04-23 - Promo calculator switched to manual bottom save

- `components/admin/promo-calculator-tab.tsx` - Removed debounced auto-save and snapshot timer logic so editing rows no longer triggers repeated blocking save overlays
- `components/admin/promo-calculator-tab.tsx` - Removed the top save control and added a single `Save All Changes` button at the bottom of the promo calculator

**Updates:** Promo calculator now saves only when users click the bottom button, preventing interruptive auto-save while typing.

## 2026-04-23 - Promo calculator now auto-saves edits

- `components/admin/promo-calculator-tab.tsx` - Added debounced auto-save for config edits so giveaway/discount/expense changes persist without requiring a manual Save click before refresh
- `components/admin/promo-calculator-tab.tsx` - Added saved-snapshot tracking to avoid redundant PATCH requests and keep manual Save behavior intact

**Updates:** Promo calculator rows and values now persist reliably across page refreshes, even when users forget to click Save first.

## 2026-04-23 - Fixed clear-sold-section 400 for grouped section rows

- `components/admin/reports/kpi-detail-modal.tsx` - Updated `Clear Sold` payload to send `section_id` only when it is a valid UUID, with automatic fallback to `section_name`
- `app/api/admin/reports/clear-sold-section/route.ts` - Relaxed `section_id` payload validation and added UUID normalization before lookup

**Updates:** Reports `Clear Sold` now works for grouped/derived section rows that previously triggered `400 Bad Request`.

## 2026-04-23 - Google OAuth provider enabled in Supabase config

- `supabase/config.toml` - Added `[auth.external.google]` block with env-based client ID/secret wiring and set `enabled = true` so local/self-hosted Supabase can process Google OAuth for both login and signup flows

**Updates:** Google auth is now explicitly enabled at config level for local Supabase environments.

## 2026-04-23 - Google signup no longer blocked by privacy checkbox

- `app/signup/page.tsx` - Updated Google OAuth button disabled state to depend only on loading; privacy agreement is still required for email/password signup submission

**Updates:** Google signup stays available even when the Privacy Notice checkbox is unchecked.

## 2026-04-23 - Super-admin clear sold by section in reports

- `app/admin/reports/page.tsx` - Added super-admin-only `canClearSoldSection` permission flag for reports actions and passed it into client props
- `app/admin/reports/reports-page-client.tsx` - Threaded `canClearSoldSection` through report page state into `ReportsContent`
- `components/admin/reports/reports-content.tsx` - Passed `canClearSoldSection` down into KPI drilldown cards
- `components/admin/reports/kpi-cards.tsx` - Added `canClearSoldSection` prop plumbing into `KpiDetailModal`
- `components/admin/reports/kpi-detail-modal.tsx` - Added per-section `Clear Sold` action buttons in the Total Sold modal (super-admin only), destructive confirm dialog, loading overlay, and dashboard query invalidation after reset
- `components/admin/reports/kpi-detail-modal.tsx` - Included `section_id` in sold drilldown row payload to support precise section targeting
- `app/api/admin/reports/clear-sold-section/route.ts` - Added new super-admin API endpoint to clear sold records per section: deletes tickets/admissions/booking promo links/payments, resets seats to `available`, deletes empty bookings, recalculates totals for remaining bookings, and writes event audit logs

**Updates:** Reports now supports a super-admin-only per-section sold reset workflow that fully clears sold state and related booking/payment artifacts for the selected section.

## 2026-04-23 - Auto-close PayMongo tab after payment resolution

- `app/[eventSlug]/checkout/checkout-content.tsx` - Added tracked PayMongo popup window handling (`window.open` reference) and automatic close attempts when booking status resolves to `confirmed` or `failed`
- `app/[eventSlug]/checkout/checkout-content.tsx` - Unified "Open in new tab", iframe fallback, and iframe error paths to use tracked popup opener so auto-close can work consistently

**Updates:** When payment status resolves, the app now attempts to close the PayMongo tab/window opened from checkout and continues user flow in-app.

## 2026-04-23 - Dashboard pending bookings now auto-recheck payment status

- `app/dashboard/dashboard-bookings.tsx` - Added client-side polling for pending bookings via `/api/bookings/[bookingId]/status`; triggers `router.refresh()` when any pending booking transitions to `confirmed` or `failed`

**Updates:** Paid bookings that were stuck as pending on Dashboard now auto-refresh to their latest status without manual reload.

## 2026-04-23 - Checkout now auto-detects paid PayMongo returns

- `app/[eventSlug]/checkout/checkout-content.tsx` - Restored `PAYMONGO_RETURN` message listener so the checkout page reacts when the payment-return page posts back from embedded/new-tab PayMongo completion
- `app/[eventSlug]/checkout/checkout-content.tsx` - Added booking status polling (`/api/bookings/[bookingId]/status`) while a PayMongo booking is active; auto-redirects to confirmation on `confirmed` and exits payment card on `failed`

**Updates:** Buyers who close the PayMongo window after successful payment now get pulled to confirmation once payment is detected, even when webhook delivery is delayed.

## 2026-04-23 - Fixed build break from missing archiver and payload typing

- `package.json` - Added `archiver` dependency required by print-ticket ZIP API route imports
- `package-lock.json` - Updated lockfile after installing `archiver`
- `app/admin/settings/paymongo-settings.tsx` - Widened settings PATCH payload type from `Record<string, string>` to `Record<string, unknown>` so `paymongo_enabled_methods` (array) compiles correctly

**Updates:** `next build` now passes again after resolving missing module and TypeScript payload typing errors.

## 2026-04-23 - Patched BPI Checkout method code

- `lib/paymongo-methods.ts` - Replaced invalid `dob_bpi` checkout method code with PayMongo Checkout-supported `dob` for BPI direct online banking
- `lib/paymongo-methods.ts` - Added backward-compatibility migration in sanitizer so previously saved `dob_bpi` selections are automatically normalized to `dob`

**Updates:** BPI selection now maps to a valid PayMongo Checkout Session code, preventing the `dob_bpi is an invalid payment_method` error.

## 2026-04-23 - Re-enabled full PayMongo method selection in settings

- `app/api/admin/settings/route.ts` - Removed strict-method save rejection so admin-selected PayMongo method lists persist as chosen
- `app/admin/settings/paymongo-settings.tsx` - Restored all method checkboxes as selectable (including QRPh, BPI Direct Debit, and UBP Direct Debit)
- `lib/paymongo-methods.ts` - Restored default enabled list to include QRPh and direct-debit options

**Updates:** Admins can now save any available method combination from the PayMongo settings checklist.

## 2026-04-23 - PayMongo settings now strict-mode aware

- `app/admin/settings/paymongo-settings.tsx` - Disabled unsupported strict-checkout methods in the checkbox list and added clear inline guidance for which codes are saveable
- `app/api/admin/settings/route.ts` - Normalized loaded `paymongo_enabled_methods` to strict-supported values so stale unsupported selections no longer reappear as active
- `lib/paymongo-methods.ts` - Updated default enabled methods to strict-supported checkout methods only

**Updates:** PayMongo method selections now save predictably in strict mode and no longer appear “stuck” due to unsupported method codes.

## 2026-04-23 - Strict PayMongo method validation in settings

- `app/api/admin/settings/route.ts` - Added strict validation for `paymongo_enabled_methods`; now rejects unsupported checkout method codes with a clear 400 error
- `app/admin/settings/paymongo-settings.tsx` - Improved save error handling to surface backend validation messages directly in toast notifications
- `lib/paymongo-methods.ts` - Added strict checkout allowlist utilities used by settings validation

**Updates:** Admin settings now prevents saving unsupported buyer checkout methods in strict mode and shows exact corrective guidance.

## 2026-04-23 - Enforce strict PayMongo method selection

- `lib/paymongo.ts` - Removed fallback retry behavior for checkout session creation; checkout now uses only admin-selected `payment_method_types` and fails fast if PayMongo rejects unsupported selections

**Updates:** Buyer checkout now honors only the exact methods selected in PayMongo settings, with no automatic fallback to default card/e-wallet methods.

## 2026-04-23 - Shared report link metrics now stay in sync

- `app/api/reports/shared/[token]/route.ts` - Added dynamic/no-store response behavior and aligned shared-report computed fields with admin dashboard logic (`promo_budget` and `tech_hold` KPI derivations) so shared links reflect current report values
- `app/reports/shared/[token]/shared-report-client.tsx` - Updated shared report fetch to request fresh API data with `cache: "no-store"`

**Updates:** Shared report links now return refreshed metric data (including promo budget usage) instead of showing stale or incomplete values.

## 2026-04-23 - PayMongo method toggles for buyer checkout

- `app/admin/settings/paymongo-settings.tsx` - Added a payment method checklist with checkboxes so super admins can choose which PayMongo methods are exposed to buyers
- `app/api/admin/settings/route.ts` - Added persisted `paymongo_enabled_methods` config handling with sanitization and default fallback values
- `lib/paymongo-methods.ts` - Added shared PayMongo method catalog, defaults, safe fallback list, and sanitizer utility
- `lib/paymongo-config.ts` - Added helper to read enabled PayMongo methods from app config with default fallback
- `app/api/checkout/route.ts` - Updated checkout session creation to use admin-configured payment methods
- `lib/paymongo.ts` - Updated checkout session API call to accept configured method list and retry with a safe fallback method subset when unsupported methods are rejected

**Updates:** Admins can now control buyer-facing payment options from settings without redeploying, while checkout remains resilient if PayMongo rejects a selected method code.

## 2026-04-23 - Handle stale Supabase refresh tokens on client

- `components/header.tsx` - Added defensive handling for Supabase `Invalid Refresh Token` responses during initial auth bootstrap; now clears only local auth state to avoid repeated console auth errors from stale browser sessions
- `components/providers/theme-provider.tsx` - Added the same stale-token guard before profile theme fetch/save auth checks so theme initialization and updates do not trigger noisy refresh-token errors
- `app/reset-password/page.tsx` - Hardened reset-link session check to clear local auth state when Supabase reports an invalid refresh token

**Updates:** Prevents repeated browser console `AuthApiError: Invalid Refresh Token: Refresh Token Not Found` noise when a stale client session is present.

## 2026-04-23 – Cancel + PayMongo seat-state flow stabilized

- `app/api/checkout/route.ts` – Fixed seat status transition for online checkout: PayMongo-created bookings now mark seats as `reserved` (not `sold`) until payment is confirmed; non-PayMongo immediate confirmations still mark seats `sold`
- `lib/release-failed-booking.ts` – Hardened failed/cancel release path to be schema-safe in environments without `event_seats.booking_id`; removed hard dependency on that column in the main seat release update and kept cancellation idempotent
- `lib/cleanup-orphan-reserved-seats.ts` – Added event-level reconciliation utility to (1) release orphan `reserved` seats and (2) repair stale `sold` seats by downgrading to `reserved` (if still pending/active) or `available` (if orphaned)
- `app/api/bookings/cancel-pending/route.ts` – Expanded cancel-pending to process multiple pending bookings per user/event and run reconciliation cleanup after cancellation
- `app/api/bookings/[bookingId]/cancel/route.ts` – Added event-level reconciliation cleanup after booking cancel so seat map state stays aligned with real booking/payment state
- `app/[eventSlug]/checkout/checkout-content.tsx` – Restored pre-PayMongo confirmation window before proceeding to payment

**Updates:** This setup now reliably releases seats on cancel, prevents pending payments from being incorrectly shown as sold, and auto-repairs stale seat states that previously caused “hidden reserved/sold” seats in the buyer selector.

## 2026-04-17 – Open Seating card made collapsible (default expanded)

- `app/[eventSlug]/book/book-page-client.tsx` – Added collapsible toggle behavior for the **Open Seating** card with chevron affordance; defaults to expanded and can be collapsed/expanded by the buyer

**Updates:** Keeps the booking page more scannable while preserving quick access to open-seating quantity controls.

## 2026-04-17 – Seat action layout refresh (grid + grouped controls)

- `app/[eventSlug]/book/book-page-client.tsx` – Switched random-seat actions to a fixed responsive grid (`2` columns on mobile, `4` on desktop), added compact two-line labels (`1 SECTION` + optional `Random seat` sublabel on larger screens), and added subtle borders for very light section colors
- `components/seat-picker/seat-selector.tsx` – Reworked setup-style control bar into grouped zoom buttons, a highlighted **Fit width** control, and a right-aligned **Drag** toggle while preserving existing zoom/fit/drag behavior

**Updates:** Improves seat-action scanning and consistency across breakpoints by separating primary seat actions from secondary canvas controls and reducing wrap/jagged button rows.

## 2026-04-17 – Random seat button labels shortened

- `app/[eventSlug]/book/book-page-client.tsx` – Updated random seat action button labels from long text (e.g. “Select Random Seat (BRONZE LEFT)”) to compact format (e.g. `1 BRONZE LEFT`) across grouped and single-section seat cards

**Updates:** Makes the booking action row shorter and cleaner while preserving the same seat selection behavior.

## 2026-04-17 – Buyer seat card header simplified to unique color chips

- `app/[eventSlug]/book/book-page-client.tsx` – Replaced long section header text (name/price/left) with compact color-only chips for map seat groups; colors are now deduplicated so repeated section colors render once

**Updates:** Prevents oversized “Choose seats” card headers when many sections are grouped together by showing only unique section colors.

## 2026-04-17 – Checkout cancel now releases pending booking seats

- `app/[eventSlug]/checkout/checkout-content.tsx` – Updated checkout cancel flow to cancel pending bookings via `POST /api/bookings/{bookingId}/cancel` when a PayMongo booking reference exists, then fall back to cart delete only if no booking was created
- `app/api/bookings/[bookingId]/cancel/route.ts` – Made booking cancellation idempotent for already terminal states (`cancelled`/`failed`) and returned stable payload shape with `ok` + `status`
- `app/api/admin/events/[id]/reserved-seats/route.ts` – Added pending-booking hold visibility plus normalized `hold_source` tagging (`active_cart_hold`, `pending_booking`, `admin_reserved`) and a combined `blocked_holds` payload
- `components/admin/reserved-seats-tab.tsx` – Added a Pending Booking Holds section so admins can diagnose seats blocked by checkout sessions awaiting payment

**Updates:** Fixes the stale-seat scenario where canceling after checkout initialization left seats blocked; cancel now targets pending bookings directly, and admin diagnostics now show both cart holds and pending booking holds.

## 2026-04-17 – Booking seat selector mobile availability guard

- `app/[eventSlug]/book/book-page-client.tsx` – Added explicit loading and error states for seat availability so the buyer seat selector is not replaced by the “No seat map configured for this event” message while data is still loading or if the availability call fails

**Updates:** Prevents mobile (and slow network) users from incorrectly seeing that no seat map is configured when the availability data has not finished loading yet or temporarily errors.

## 2026-04-17 – Netlify / Lighthouse performance (TTFB, bundles, LCP)

- `app/layout.tsx` – Removed `cookies()` from the root layout so the shell can be statically generated; theme still syncs from the existing inline script + `localStorage` before paint
- `app/page.tsx` – `export const revalidate = 60` for home ISR aligned with cached data
- `lib/supabase/public-anon.ts` – Anonymous Supabase client (no request cookies) for safe use inside `unstable_cache`
- `lib/events/event-grid-server.ts` – Home events split wrapped in `unstable_cache` (60s, `home-events` tag) using admin or anon client
- `components/background-image.tsx` – Hero LCP uses `next/image` with `/concert-bg.webp` (`priority`, `fill`) instead of a CSS background PNG
- `components/app-chrome.tsx` – `AIChatEntry` loaded with `next/dynamic` and `ssr: false` to trim initial JS
- `app/home-client.tsx` – `EventGrid` loaded with `next/dynamic` and a skeleton loading state (defers framer-motion + grid bundle)
- `next.config.ts` – `experimental.optimizePackageImports: ["lucide-react"]` for leaner icon chunks
- `scripts/measure-ttfb.sh` + `package.json` (`npm run ttfb`) – Quick curl-based TTFB check for deploy URLs or localhost

**Updates:** Targets the Netlify Lighthouse report: faster document path (static layout + cached home read), smaller first-load JS, and a lighter LCP image delivery path. Re-run Lighthouse on production after deploy; use `npm run ttfb <url>` to compare cold vs warm TTFB.

## 2026-04-17 – Event Promo Calculator tab

- `supabase/migrations/00156_event_promo_calculator_config.sql` – Add `events.promo_calculator_config` JSONB column for per-event promo worksheet data
- `lib/promo-calculator.ts` – Normalize promo calculator config (budget %, giveaway/discount/expense rows), compute section-level and total promo metrics (projected sales, promo budget allocation, used/remaining budget)
- `app/api/admin/events/[id]/promo-calculator/route.ts` – Event-scoped GET/PATCH using `get_admin_event_by_id`, derives baseline sections from `event_sections` + `event_seats` + `event_prices`, persists JSON config on the event, and logs to the event audit trail
- `components/admin/promo-calculator-tab.tsx` – New **Promo Calculator** admin tab: editable giveaway/discount/expense grids by section, live section summary table, budget summary cards, and saved state per event
- `app/admin/events/[id]/page.tsx` / `components/admin/edit-event-tabs.tsx` – Wire `promoCalculator` tab id, gating visibility by pricing permissions

**Updates:** Adds an event-level promo budget calculator that mirrors the spreadsheet (tiers, giveaways, discounts, other expenses) while staying in sync with the event’s current sections and pricing.

## 2026-04-17 – Additional report cards made collapsible (default expanded)

- `components/admin/reports/sections-horizontal-bar.tsx` – Added collapsible toggle header for **Sections with Highest Sales**, defaulted to expanded
- `components/admin/reports/payment-donut.tsx` – Added collapsible toggle header for **Payment Method Distribution**, defaulted to expanded
- `components/admin/reports/vss-stacked-bar.tsx` – Added collapsible toggle header for **VSS (Seat Allocation Breakdown)**, defaulted to expanded

**Updates:** Brings consistent collapsible behavior across report cards while keeping these three visible by default.

## 2026-04-17 – Section revenue card now collapsible (default collapsed)

- `components/admin/reports/section-revenue-table.tsx` – Added a collapsible header toggle for **Amount Paid & Value by Section** using chevron affordance; content now starts collapsed by default and expands on click

**Updates:** Keeps reports page lighter on first load while preserving access to the full section value table on demand.

## 2026-04-17 – Buyer seat selector: auto fit-to-width on load and resize

- `components/seat-picker/seat-selector.tsx` – Setup-style canvas computes zoom so the plan fits the scroll frame width on first paint and after image natural size loads (delayed refit for layout); auto-fit keys off logical canvas width/height so unrelated parent re-renders do not reshuffle zoom
- `components/seat-picker/seat-selector.tsx` – Lowered `MIN_ZOOM` to `0.05` so wide native canvases can shrink enough to fit; toolbar control **Fit width** re-applies the fit when the user wants it

**Updates:** Avoids horizontal overflow on initial book-page load and refresh; see follow-up entry for manual zoom vs auto-fit.

## 2026-04-17 – Buyer seat selector: manual zoom no longer overridden by auto-fit

- `components/seat-picker/seat-selector.tsx` – Auto fit-to-width runs only when the logical canvas size key changes (first load, image metadata, or seat layout bounds change) or when the user clicks **Fit width**; `+` / `−` zoom set a guard ref so parent re-renders and removed `ResizeObserver` no longer snap zoom back to fit

**Updates:** Keeps initial “fit width” behavior on refresh while preserving user-chosen zoom until they hit Fit width or the underlying layout dimensions change.

## 2026-04-16 – Seat positions save: bulk RPC (fix persistent PATCH 500)

- `supabase/migrations/00155_admin_patch_event_seat_positions.sql` (new) – `admin_patch_event_seat_positions(p_event_id, p_positions jsonb)` SECURITY DEFINER: checks `is_authorized_for_event`, then one `UPDATE … FROM jsonb_array_elements` to set `grid_x`/`grid_y` for all seats in a single DB round trip
- `app/api/admin/events/[id]/seating/positions/route.ts` – Replaced many parallel PostgREST row updates with the new RPC; dedupe by `seatId`, clamp coords to int32, map missing-function errors to **503** with an explicit “run db:push / migration 00155” message

**Updates:** Eliminates flaky **500**s from hammering `/event_seats` with dozens of concurrent updates under RLS; requires applying migration **00155** to the linked Supabase project.

## 2026-04-16 – Seat positions PATCH: stabilize authz + concurrency

- `app/api/admin/events/[id]/seating/positions/route.ts` – Authorize with `get_admin_event_by_id` (same RPC as the admin event page) instead of `is_authorized_for_event`, and normalize a possible array RPC payload before treating the event as missing
- `app/api/admin/events/[id]/seating/positions/route.ts` – Cap parallel seat updates at 8 in flight per outer batch to reduce flaky 500s from hammering PostgREST; wrap the handler in try/catch so unexpected errors return JSON instead of an empty 500 body

**Updates:** Further hardening for persistent **PATCH …/seating/positions** 500s when saving layout from `seat-selector-setup.tsx`.

## 2026-04-16 – Bulk seat positions PATCH: fix 500s (RLS + int32 coords)

- `app/api/admin/events/[id]/seating/positions/route.ts` – After `canManageSeating`, call `is_authorized_for_event` with the user session and return **403** when false (clearer than RLS failures on update)
- `app/api/admin/events/[id]/seating/positions/route.ts` – When `SUPABASE_SERVICE_ROLE_KEY` is set, run bulk `event_seats` updates with `getAdminClientIfAvailable()` so writes succeed like other admin routes; otherwise keep the user-scoped client
- `app/api/admin/events/[id]/seating/positions/route.ts` – Clamp `grid_x` / `grid_y` to signed 32-bit integer range before persist to avoid Postgres `integer` overflow on very large canvas coordinates

**Updates:** Resolves common **500** responses when saving seat layout positions (RLS rejecting updates under the anon/authenticated client, or integer overflow on large logical coordinates).

## 2026-04-16 – Seat selector save guard: avoid top-left reset on refresh

- `components/admin/seat-selector-setup.tsx` – `handleSavePositions` no longer defaults missing in-memory seat positions to `(0,0)`; it now preserves existing persisted `grid_x/grid_y` when available (or uses computed fallback layout), preventing accidental overwrite to top-left coordinates

**Updates:** Fixes cases where refreshing after Save could show seat blocks back at top-left because unsynced positions were being saved as zeroes.

## 2026-04-16 – Buyer seat selector now follows natural canvas size

- `components/seat-picker/seat-selector.tsx` – Updated setup-style canvas base dimensions to use uploaded image `naturalWidth`/`naturalHeight` (fallback `1400x900` only when image size is unavailable)
- `components/seat-picker/seat-selector.tsx` – Aligned seat overlay scaling to natural-size canvas basis (`uniformScale = 1`) so buyer seat positions match admin canvas positioning

**Updates:** Canvas-size behavior now translates to the buyer experience, keeping section seat overlays aligned with the uploaded venue plan dimensions.

## 2026-04-16 – Admin seat selector: canvas uses uploaded image natural size

- `components/admin/seat-selector-setup.tsx` – Canvas sizing now uses uploaded image natural dimensions (`naturalWidth`/`naturalHeight`) when available, with fallback to `1400x900` only before image metadata exists
- `components/admin/seat-selector-setup.tsx` – Canvas wrapper dimensions in canvas mode now bind to dynamic `canvasSize` instead of fixed `CANVAS_WIDTH/CANVAS_HEIGHT`
- `components/admin/seat-selector-setup.tsx` – Canvas coordinate scale helpers now operate on the natural-size basis for canvas mode, keeping drag/select/marquee math aligned to the uploaded image dimensions

**Updates:** In Admin Seat Selector Setup, uploaded canvas images now drive the actual canvas width/height (1:1 basis), so the work area matches the file dimensions instead of a forced fixed width.

## 2026-04-16 – Checkout: PayMongo popup card now full-width

- `app/[eventSlug]/checkout/checkout-content.tsx` – Replaced inline embedded checkout block with a popup-style `Dialog` PayMongo card using near full viewport width/height (`96vw` x `88vh`) and dedicated `Close payment card` control
- `app/[eventSlug]/checkout/checkout-content.tsx` – Kept existing fallback and booking reference messaging inside the popup header/status strip while preserving checkout controls in the page behind the popup

**Updates:** PayMongo now opens in a larger focused payment popup card, with an always-visible close action and better full-app-width presentation.

## 2026-04-16 – Checkout: embed PayMongo in-page card with fallback tab

- `app/[eventSlug]/checkout/checkout-content.tsx` – Replaced immediate `window.location.assign` to PayMongo with an in-page checkout card (`iframe`) that appears after `Proceed to payment`; added close action, `Open in new tab`, and visible booking reference
- `app/[eventSlug]/checkout/checkout-content.tsx` – Added blocked-embed fallback timer that auto-opens PayMongo in a new tab when iframe loading stalls, while preserving checkout controls (cancel/back)
- `app/[eventSlug]/checkout/checkout-content.tsx` – Added `sessionStorage` persistence/restoration of active PayMongo session so refresh/back keeps the payment card state

**Updates:** Buyers can close the payment card and still access `Cancel order` and other checkout actions without losing the page context.

## 2026-04-16 – Confirmation: hide retry/banner once ticket images exist

- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – Recovery indicator/button now depends only on missing `ticket_image_url` records (not `ticket_email_sent_at`), and banner copy now refers to missing ticket images only

**Updates:** Removes false-positive “Retry ticket processing” UI after tickets are already complete/visible in production.

## 2026-04-16 – Confirmation: never `await confirmBooking` on PayMongo return (Netlify timeout)

- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – When booking is still `pending` (or wrongly `failed`) but PayMongo is paid, kick `confirmBooking` in the background and render the polling shell instead of awaiting then redirecting; added shared `ConfirmationProcessingShell`; removed unused `redirect` import; `export const maxDuration = 60` for this segment

**Updates:** Awaiting full `confirmBooking` on that first post-checkout request could exceed Netlify serverless time and abort the RSC stream (`Connection closed` / “Event error”) even though localhost had no strict limit.

## 2026-04-16 – Confirmation: move ticket PNG + QR off the RSC (Netlify stream stability)

- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – Dropped server-side `generateTicketImageForTicketId` batches and `generateQRDataURL` loops; recovery `confirmBooking` is fire-and-forget instead of `await` on the same request
- `app/[eventSlug]/confirmation/[bookingId]/confirmation-tickets.tsx` – Lazy-load full ticket art via `/api/bookings/.../tickets/.../image` on the client; QR from `qr_image_url` or client `qrcode` when needed; QR tiles and load probe use `next/image` (`unoptimized`) to satisfy lint rules

**Updates:** Keeps the confirmation server component under heavy Netlify/Next limits by not doing Sharp + parallel PNG work in the RSC; ticket images still generate on first image request through the existing API route.

## 2026-04-16 – Confirmation page: remove `after(...)` runtime risk on payment return

- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – Replaced `after(async () => confirmBooking(...))` in the `fromPayment` branch with non-blocking fire-and-forget `void confirmBooking(...).catch(...)`

**Updates:** Avoids production runtime incompatibility that can throw right after successful PayMongo return (showing Event error) while keeping confirmation email/ticket repair non-blocking.

## 2026-04-15 – Netlify PayMongo hardening: recovery path for confirmed bookings

- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – Added self-healing recovery attempt for `confirmed` bookings when ticket images or email-send marker are missing; keeps page resilient on recovery failure and shows retry card
- `app/[eventSlug]/confirmation/[bookingId]/retry-ticket-processing-button.tsx` – New client action to re-run ticket processing from confirmation page with progress overlay + status dialog
- `app/api/bookings/[bookingId]/repair/route.ts` – New authenticated repair endpoint (owner/admin) that re-runs `confirmBooking` and returns `email_sent`, `tickets_generated_count`, and `remaining_missing_images`
- `lib/confirm-booking.ts` – Expanded structured return payload; stronger phase-based logs with `duration_ms` and `error_code`; explicit failure return when email send fails; tracks generated/missing ticket image counts
- `app/api/webhooks/paymongo/route.ts` – Added runtime config guards and structured webhook completion logs (`phase`, `result`, `duration_ms`)
- `app/api/bookings/[bookingId]/status/route.ts` – Added structured phase logs for paid/failed/expired transitions to improve production diagnosis

**Updates:** If Netlify confirms payment but background processing is flaky, users can recover ticket images/email from the confirmation page instead of getting stuck with confirmed bookings and no artifacts.

## 2026-04-15 – Full app speed pass: instrumentation + hot-path tuning

- `app/api/checkout/route.ts` – Added route timing marks/logs (`validate_and_load_cart_ms`, `pricing_ms`, `promo_ms`, `payment_init_ms`, `total_ms`); promo used-count increments now batched with `Promise.all`
- `app/api/reservations/route.ts` – Added timing logs (`allocation_ms`, `total_ms`); section allocations now run via `Promise.all` before row assembly
- `app/api/bookings/[bookingId]/status/route.ts` – Added short-lived in-memory cache for PayMongo status lookups to reduce duplicate outbound checks during rapid polling; timing logs include `paymongo_ms`
- `app/api/chat/route.ts` – Added chat timing logs (`total_ms`, `openai_ms`, message/context counts)
- `app/api/events/route.ts` – Added timing logs by mode (`slug`, `split`, `list`)
- `app/[eventSlug]/book/book-page-client.tsx` – Reduced repeated seat/section scans by switching to memoized section-id `Set` lookups; proceed-to-checkout now pushes route before cart-summary refresh fetch
- `app/[eventSlug]/checkout/checkout-content.tsx` – Removed timestamp cache-buster in cart-summary query and disabled focus refetch to reduce extra calls/jitter
- `app/[eventSlug]/confirmation/[bookingId]/confirmation-refresh.tsx` – Polling now uses adaptive backoff (2.5s → 5s → 10s) to reduce refresh pressure while preserving status checks
- `components/ai-chat.tsx` – Added assistant shortcut telemetry logs (`attempt`, `success`, `clarify`, `none_available`, `auth-required`) for booking seat-selection flow
- `app/api/booking-chat/select-seats/route.ts` – Added endpoint timing logs (`total_ms`, `allocation_ms`, outcome)

**Updates:** This pass improves observability and reduces avoidable synchronous work/churn across checkout, reservations, confirmation polling, events/chat routes, and booking-seat UI transitions.

## 2026-04-15 – Event assistant (book page): broader seat phrases + event id fallback

- `components/ai-chat.tsx` – Seat-intent detection includes natural phrases (e.g. “i want svip right 10 tix”, quantity + tix/tickets); resolve `event_id` from sessionStorage, then from `/api/events?slug=` using the first URL segment when storage is empty
- `app/api/booking-chat/select-seats/route.ts` – Treat `tix` as filler token when scoring sections

## 2026-04-15 – Event assistant: select seats on `/[eventSlug]/book`

- `lib/booking-chat-types.ts` – Shared `WTP_BOOK_CHAT_CONTEXT_KEY` and `BookingChatApplyDetail` for chat ↔ booking page
- `lib/reservation-allocate-section.ts` – Extracted `allocateSeatsForSection` from reservations API for reuse
- `app/api/reservations/route.ts` – Import shared allocator
- `app/api/booking-chat/select-seats/route.ts` – POST: auth-required fuzzy match of user message to `event_sections`, quantity parse (cap 20); assigned → allocate seats; free/standing → quantity; clarify / none-available responses
- `app/[eventSlug]/book/book-page-client.tsx` – Persist `wtp_book_chat_context` (`event_id`); listen for `wtp-booking-chat-apply` and merge seats / section quantity (replace prior picks in same assigned section), toasts
- `components/ai-chat.tsx` – On booking path + seat-like intent, call select-seats API first; dispatch custom event on success; dialog copy for booking page

**Updates:** Signed-in users on the book page can say e.g. “select 5 SVIP left” to update the cart without only getting a generic event link.

## 2026-04-15 – Post–PayMongo confirmation: faster load (parallel data, template cache, deferred email)

- `lib/ticket-image.ts` – Dedupe template PNG load per URL (shared inflight promise); cache `getResolvedTicketTemplate` per `event.id` to avoid repeated `app_config` reads; `generateTicketImageForTicketId` loads venue + `event_seats` in parallel, includes early-bird columns on first event read (drops extra `events` query)
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – `after()` defers `confirmBooking` (ticket email) until after the response so "Loading event…" / RSC are not blocked on email + attachment pipeline; `events` + `tickets` fetched with `Promise.all`
- `lib/confirm-booking.ts` – Re-fetch tickets immediately before building email attachments so URLs from on-page generation are reused when possible

**Updates:** Same ticket PNGs still generate in bounded parallel chunks; fewer duplicate storage downloads and less duplicate Sharp work when the confirmation page fills `ticket_image_url` before the background email runs.

## 2026-04-15 – Checkout/cart summary: batched seat lookups + parallel queries

- `lib/cart-summary.ts` – Load `reservation_carts` and `reservation_items` in one `Promise.all`; batch-resolve seat → section via `.in("id", seatIds)` on `event_seats` and `seats` (no per-seat round trips); run `event_seats` batch in parallel with event pricing rows (`events`, `event_prices`, `early_bird_prices`)

**Updates:** Large carts were causing multi-second `/[eventSlug]/checkout` and `/api/events/.../cart-summary` work from sequential Supabase calls per seat; same totals, far fewer queries.

## 2026-04-15 – Confirmation page: bounded parallel ticket PNG generation

- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – Generate missing `ticket_image_url` images in chunks of 6 (`Promise.all` per chunk); per-ticket try/catch so one failure does not drop the whole batch; same chunk size + per-ticket try/catch for `generateQRDataURL` when building `ticketsWithQR`

**Updates:** Aligns with chunked parallelism in `lib/confirm-booking.ts` email attachments; reduces memory spikes and keeps throughput when many tickets load after PayMongo return.

## 2026-04-15 – Confirmation after PayMongo: don’t crash on ticket image / `confirmBooking` errors

- `lib/confirm-booking.ts` – Wrap `generateTicketImageForTicketId` per ticket in try/catch; on failure log and fall back to QR attachment (same as missing image URL)
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – try/catch around all `confirmBooking` calls so server render doesn’t hit `[eventSlug]/error` (“Event error”) when email/image pipeline throws; user still gets confirmation UI after payment

**Updates:** Works together with `loadFont` ArrayBuffer fix in `lib/ticket-image.ts`. Browser `ERR_HTTP2_PROTOCOL_ERROR` often follows an uncaught RSC failure—avoid throwing from confirmation after PayMongo return.

## 2026-04-15 – App-wide performance: Recharts lazy, parallel admin layout, book splits, cache, fonts, analyzer

- `components/admin/reports/reports-content.tsx` – `next/dynamic` + `ssr: false` for Recharts components (`SectionsHorizontalBar`, `PaymentDonut`, `VssStackedBar`, `EventDaySection`) with skeleton loaders; KPI + table stay eager
- `app/admin/layout.tsx` – `Promise.all` for `get_my_role` and `user_capabilities` after auth
- `app/[eventSlug]/book/book-page-client.tsx` – Dynamic imports for `CartExpiredDialog`, `CartStayLongerDialog`, `ConfirmDialog`, `GuestSignupDialog`, `SeatMapImageCarousel` (`ssr: false`)
- `app/api/events/route.ts` – `Cache-Control` on successful public GETs (list/split: 60s `s-maxage`; slug: 30s)
- `app/layout.tsx` – Removed unused Geist Mono (`next/font`); Montserrat weights unchanged
- `app/globals.css` – `--font-mono` uses system UI monospace stack (no extra webfont)
- `next.config.ts` – Wrapped with `@next/bundle-analyzer` when `ANALYZE=true`
- `package.json` – `analyze` script; removed unused `geist` dependency; devDependency `@next/bundle-analyzer`

**Updates:** Smaller initial JS on reports/booking; faster admin shell; CDN can cache anonymous event API responses; run `npm run analyze` for bundle treemap.

## 2026-04-15 – Ticket image: fix detached ArrayBuffer in `loadFont`

- `lib/ticket-image.ts` – Deep-copy Roboto bytes after fetch (stable cache); allocate a fresh `ArrayBuffer` per `opentype.parse()` so parse never detaches the cached buffer (fixes `Cannot perform ArrayBuffer.prototype.slice on a detached ArrayBuffer` on confirmation / parallel generation)

## 2026-04-15 – Netlify CWV: faster home load, optimized images, theme/motion tuning

- `lib/events/event-grid-server.ts` – Shared split-events loader (`getEventsSplit`, `attachVenueAndPrice`, `getEventsSplitForHome`, `resolveSupabaseForEventsApi`)
- `app/api/events/route.ts` – Thin GET handler using shared loader for split mode
- `app/page.tsx` – Home uses `getEventsSplitForHome()` (no server self-fetch to `/api/events`)
- `lib/image-remote.ts` – `remoteImageCanOptimize()` for Next Image vs `unoptimized` on other hosts
- `components/event-card.tsx` – `next/image` for cover and modal media; `lib/image-remote` for Supabase/Unsplash
- `app/[eventSlug]/event-page-content.tsx` – Hero image via `next/image` + priority
- `components/seat-map-image-carousel.tsx` – Carousel slide via `next/image`
- `app/[eventSlug]/confirmation/[bookingId]/confirmation-tickets.tsx` – Ticket preview via `next/image` (`unoptimized` for dynamic API PNGs)
- `components/event-grid.tsx` – `useReducedMotion`: plain wrappers when set; shorter stagger otherwise
- `app/layout.tsx` – Async layout: `data-theme` + `theme` cookie; inline script syncs `localStorage` with server default
- `components/app-chrome.tsx`, `components/background-image.tsx` – `initialTheme` from server for first-paint background
- `components/providers/theme-provider.tsx` – Persist theme to cookie in `applyTheme`

**Updates:** Removes an extra HTTP hop on home SSR, serves smaller images where optimized, reduces layout/theme mismatch and motion cost for INP/CLS. After deploy, confirm with Lighthouse and Netlify RUM; if LCP stays high, check DB latency and cold starts.

## 2026-04-15 – Checkout: same-tab PayMongo (no blank tab)

- `app/[eventSlug]/checkout/checkout-content.tsx` – After `/api/checkout` returns `redirect_url`, navigate with `window.location.assign`; removed blank-tab open, polling wait screen, fallback “Open PayMongo” dialog, and related state/effects; cart summary query no longer gated on removed payment state; helper copy updated for same-tab flow

**Updates:** PayMongo opens in the current tab; return/cancel still use existing `successUrl` / `cancelUrl` redirects.

## 2026-04-15 – Print Tickets tab: sections default collapsed

- `components/admin/print-tickets-tab.tsx` – After the first successful load for the current event, initialize `collapsedSections` with every section id; refetch on the same event keeps expand/collapse state

## 2026-04-15 – Print tickets: same `qr_data` format as purchased tickets

- `lib/print-tickets/generate.ts` – New rows use `formatQrData` (event + section + row + seat); free/standing slots use row **`FS`** / **`ST`** and seat **`String(slot)`**, matching checkout in `app/api/checkout/route.ts`
- `lib/qr-data.ts` – Removed `formatPrintTicketQrData` / `sanitizeToken` (print-only `P-…` payload)

**Updates:** Ticket code on print PNGs matches buyer tickets (e.g. `1RHFREFS12`). Existing rows keep old `qr_data` until **Delete all generated tickets** then regenerate.

## 2026-04-15 – Send selected print email: batch resolve print ticket ids

- `lib/print-tickets/resolve-print-ticket-ids-for-send.ts` – Batch Supabase lookups by section (slot `in`, event_seat `in`, whole-section) instead of one round-trip per selected row
- `app/api/admin/print-tickets/send-selected-email/route.ts` – Use resolver before image prep / SMTP

**Updates:** Free/standing “send many” no longer pays N sequential DB queries for N slots; total time is still dominated by PNG prep + SMTP but the resolver phase is much shorter.

## 2026-04-15 – Print generate “all”: free/standing uses slots even if `event_seats` exist

- `lib/print-tickets/is-free-standing-section.ts` – `isFreeStandingSeatingType()` (trim + lowercase)
- `app/api/admin/print-tickets/generate/route.ts` – For `generateAllSeats`, branch on section `seating_type` **before** `event_seats` count so free/standing always generates `section_slot_index` rows (matches `expand-items` / GET list)
- `lib/print-tickets/expand-items.ts`, `app/api/admin/events/[id]/print-tickets/route.ts`, `app/api/admin/print-tickets/send-section-email/route.ts`, `components/admin/print-tickets-tab.tsx` – Use the same helper for free/standing detection

**Updates:** Fixes free sections that still had template `event_seats` rows: sync “Generate all” no longer only creates seat-linked print tickets that the Print Tickets tab does not list.

## 2026-04-15 – Checkbox: keep checked/indeterminate visible when disabled

- `components/ui/checkbox.tsx` – `disabled:data-[state=checked]:opacity-100` and `disabled:data-[state=indeterminate]:opacity-100` so “checked but disabled” (e.g. Print Tickets row when all images exist) does not fade to near-invisible under `disabled:opacity-50`

**Updates:** Fixes free/standing (and assigned) print rows where the orange “generated” checkbox looked missing after refresh.

## 2026-04-15 – Print Tickets GET: always return sections if print_tickets query fails

- `app/api/admin/events/[id]/print-tickets/route.ts` – On `print_tickets` error (e.g. pending migration), still build `sections` from `event_sections` and return optional `warning` instead of HTTP 500
- `components/admin/print-tickets-tab.tsx` – Show `warning` banner + toast so the tab does not look like “no sections configured” when only print rows failed to load

## 2026-04-15 – Free / standing print tickets: one row per slot

- `supabase/migrations/00154_print_tickets_section_slot.sql` – `section_slot_index` on `print_tickets`; partial unique `(event_section_id, section_slot_index)` when `event_seat_id` is null; backfill legacy free rows to slot 1
- `lib/print-tickets/free-standing-slot-cap.ts` – Cap slot expansion via `MAX_FREE_STANDING_PRINT_SLOTS` (default 2000)
- `lib/qr-data.ts`, `lib/print-tickets/generate.ts`, `lib/ticket-image.ts`, `lib/print-tickets/expand-items.ts` – Thread slot index for QR, upsert, images, and generation
- `app/api/admin/print-tickets/generate/route.ts` – Generate all capped slots for free/standing; single-slot body param
- `app/api/admin/events/[id]/print-tickets/route.ts` – Free/standing `seats[]` from all section-level print rows + `section_capacity`
- `app/api/admin/print-tickets/send-section-email/route.ts`, `app/api/admin/print-tickets/send-selected-email/route.ts`, `app/api/admin/print-tickets/[id]/send-email/route.ts` – Multi-row send / image gen with slot
- `components/admin/print-tickets-tab.tsx` – Per-slot rows, selection keys, generate/send payloads with `sectionSlotIndex`, totals from capped capacity

**Updates:** Admins can generate, list, and email print tickets per free/standing capacity slot with distinct QR/labels.

## 2026-04-15 – Checkout: PayMongo in new tab (iframe blocked)

- `app/[eventSlug]/checkout/checkout-content.tsx` – Open `about:blank` on **Proceed to payment**, then navigate to PayMongo `checkout_url` in that tab (PayMongo hosted checkout does not load in an iframe); if the popup is blocked, dialog shows **Open PayMongo checkout** link + status polling; copy updates when payment is open in another tab

## 2026-04-15 – Manual Distribution send email: elapsed, ETA estimate, Cancel send

- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` – `AbortController` on send-email `fetch`; **Cancel send** in `FloatingProgressBar` footer; 1s timer + rough remaining time from `assignmentTicketCount` (same formula as print bulk send); abort shows toast “Send cancelled.”

## 2026-04-15 – Manual Distribution: `items` from booking when confirmed (fix 5 vs 21)

- `supabase/migrations/00153_get_admin_seat_assignments_items_from_booking.sql` – `get_admin_seat_assignments`: when `booking_id` is set, build `items` **only** from `tickets` for that booking; reserved assignments still use `event_seats` + `admin_assignment_items` (avoids `COALESCE` preferring a stale assignment snapshot over the full ticket list)
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` – **Send email (n)** label reverted to `email_sent_count` (times sent), not attachment count

## 2026-04-15 – Manual Distribution send email: parallel prep + batched lookups

- `app/api/admin/assignments/[id]/send-email/route.ts` – Batch `event_seats` / `event_sections` with `.in(...)` instead of per-ticket queries; build PNG attachments with `runPool` + `getPrintTicketGenConcurrency()`; load ticket PNGs via `loadPngBufferFromUrl` (Supabase storage download) instead of sequential `fetch`

**Updates:** “Send email” for multi-ticket manual distributions should complete image prep much faster; SMTP send is unchanged.

## 2026-04-15 – Print Tickets: “Send selected” shows email (green) selection count

- `components/admin/print-tickets-tab.tsx` – **Send selected** button shows `(n)` from `emailSelectedItems.size`; `aria-label` includes the count for screen readers

## 2026-04-15 – Print Tickets: section row seat totals and selected count

- `components/admin/print-tickets-tab.tsx` – Per section: **`selected / total selected`** label aligned with orange Generate checkboxes (assigned = seat count; free/standing = 1 unit); section row uses `flex-wrap` so counts do not crowd the Send button

**Updates:** Admins see at a glance how many seats are in each section and how many are checked for generate.

## 2026-04-15 – Floating progress: portal above dialogs (clickable Cancel send)

- `components/ui/floating-progress.tsx` – Render overlay with `createPortal(..., document.body)` and `z-[10100]` so it stacks above Radix `Dialog` portals; explicit pointer-events on root/footer

**Updates:** “Cancel send” and other overlay actions work while a modal dialog is still open underneath.

## 2026-04-03 – Print Tickets send email: cancel + elapsed/estimate

- `components/admin/print-tickets-tab.tsx` – `AbortController` on send fetches; **Cancel send** in overlay; elapsed timer + rough **remaining (estimate)** from ticket count; section send uses generated-seat count for estimate
- `components/ui/floating-progress.tsx` – `whitespace-pre-line` on sub-message for multi-line status

**Updates:** Users can abort a long send; timing is indicative only (server does not stream real progress).

## 2026-04-03 – Faster bulk email for generated print tickets

- `lib/print-tickets/load-png-from-url.ts` – Load ticket PNGs via Supabase Storage when URL is a project public object; otherwise `fetch`
- `app/api/admin/print-tickets/send-selected-email/route.ts` – Parallel missing-image generation + parallel attachment loads (`runPool`, `PRINT_TICKET_GEN_CONCURRENCY`); batched `print_ticket_emails` inserts (500 rows)
- `app/api/admin/print-tickets/send-section-email/route.ts` – Same parallelization and batched email log inserts
- `components/admin/print-tickets-tab.tsx` – Send flows use indeterminate overlay + clear subtext (removed fake 95% progress)

**Updates:** “Send selected” / section send should scale better with many tickets; UI no longer stalls visually at 95%.

## 2026-04-03 – Print generation 500 follow-up: make print QR truly unique

- `lib/qr-data.ts` – `formatPrintTicketQrData` now includes normalized event/section/row/seat plus `eventSectionId`/`eventSeatId` tokens, preventing collisions when section codes share prefixes
- `lib/print-tickets/generate.ts` – Switched print ticket QR creation from `formatQrData` to `formatPrintTicketQrData` with section/seat IDs

**Updates:** Fixes early-batch 500s caused by `print_tickets.qr_data` unique collisions (e.g. similar section codes like SVIP Left/Right with same row/seat labels).

## 2026-04-03 – Print generation 500: storage download + print_tickets lookup

- `lib/ticket-image.ts` – Load Supabase public template URLs via `storage.from(bucket).download(path)` instead of same-origin `fetch` to `/api/image-proxy` (avoids parallel generate deadlocks); direct `fetch` only for non-project URLs
- `lib/print-tickets/generate.ts` – Look up existing print rows with `.eq("event_seat_id", id)` when seat is set; `.is(..., null)` only for section-level tickets

**Updates:** Fixes bulk parallel **Generate** returning 500 and duplicate-insert failures from incorrect `.is` on UUID seat ids.

## 2026-04-03 – Parallel / batched print ticket generation

- `lib/print-tickets/run-pool.ts` – `runPool` (bounded waves), `getPrintTicketGenConcurrency()` from `PRINT_TICKET_GEN_CONCURRENCY` (default 6, max 32), `CLIENT_PRINT_GEN_CONCURRENCY` (4) for browser fallback
- `app/api/admin/print-tickets/generate/route.ts` – `generateAllSeats` uses `runPool` with the same server concurrency
- `components/admin/print-tickets-tab.tsx` – Bulk generate uses waves of parallel `fetch` to `/api/admin/print-tickets/generate`
- `docs/NETLIFY_DEPLOY.md`, `README.md` – Document `PRINT_TICKET_GEN_CONCURRENCY`

**Updates:** Bulk print generation scales with concurrency until CPU/memory bound; tune env on staging and re-test Stop.

## 2026-04-03 – Print Tickets: Stop bulk generation (keep completed)

- `components/admin/print-tickets-tab.tsx` – Stop control; cooperative stop for in-page generation loop
- `components/ui/floating-progress.tsx` – Optional `footer` slot for actions (e.g. Stop)

**Updates:** Users can stop long “Generate” runs while keeping tickets already generated.

## 2026-04-03 – Admin event tabs: Manual Ticket Distribution navigates in one click

- `components/admin/edit-event-tabs.tsx` – On tab value `assign`, `router.push` to `/admin/events/[id]/assign-seats` instead of `?tab=assign` (no `TabsContent` for assign); use a normal `TabsTrigger` instead of `asChild` + `Link` conflicting with `onValueChange`
- `app/admin/events/[id]/page.tsx` – Redirect `?tab=assign` to the assign-seats route for old links

**Updates:** Fixes needing a second click to open Manual Ticket Distribution and removes dead `?tab=assign` URLs.

## 2026-04-03 – Ticket image: fix opentype detached ArrayBuffer under parallel generation

- `lib/ticket-image.ts` – Cache only fetched TTF bytes; each `loadFont()` parses a fresh `opentype.Font` from a per-call `ArrayBuffer` via `bytes.buffer.slice(byteOffset, byteOffset + byteLength)` (opentype `parse` / `DataView` requires an `ArrayBuffer`, not a `Uint8Array`) so concurrent `generateTicketImageForTicketId` (e.g. confirmation `Promise.all`) does not share one mutable font instance

**Updates:** Avoids detached-`ArrayBuffer` and “First argument to DataView constructor must be an ArrayBuffer” when generating multiple ticket images at once.

## 2026-04-03 – Buyer seat map: include negative grid origin

- `components/seat-picker/seat-selector.tsx` – `SetupStyleCanvas` computes min/max seat bounds, shifts origin with `originX`/`originY` (`min(0, minDisplay)`), sizes canvas to `spanX`/`spanY`, offsets seat positions and the venue image so seats left/above logical (0,0) are not clipped

**Updates:** Buyer map should show the same seat extent as admin when layouts use negative `grid_x`/`grid_y` or extend past the top-left of the base image box.

## 2026-04-03 – Book page: fix intermittent seat deselection

- `app/[eventSlug]/book/book-page-client.tsx` – Keep `serverCartSeatIdsRef` in sync when the user adds/removes seats (`toggleSeat`, random pick, inline cart remove) so availability refetches do not treat fresh picks as someone else’s hold; after successful cart sync and extend-cart success, rebuild the ref from `useReservationStore.getState().items` instead of a stale closure

**Updates:** Stops split-second deselect when reserved state updates before the debounced reservation POST finishes.

## 2026-04-03 – Buyer seat map: multi-section canvas scroll extent

- `components/seat-picker/seat-selector.tsx` – `SetupStyleCanvas` keeps image at base width/height (top-left); expands logical canvas to seat bounding box + padding so stacked sections on one canvas stay visible/scrollable; `logicalGridXY` + `Number.isFinite` for grid coords in setup mode and `hasGridPositions`

**Updates:** Fixes missing or clipped seats when two assigned sections share one venue canvas (e.g. SVIP Left + SVIP Right).

## 2026-04-03 – Admin: faster seat position save

- `app/api/admin/events/[id]/seating/positions/route.ts` – Validate all rows first; apply updates in parallel chunks (45 per round-trip); cap at 15k positions per request
- `components/admin/seat-selector-setup.tsx` – After a successful PATCH, merge `grid_x` / `grid_y` into local `seats` state instead of calling `fetchSeating()` (avoids heavy GET and loading UI flash)

**Updates:** Seat Selector Setup “Save positions” should complete much faster on large layouts and no longer reloads the full seating endpoint afterward.

## 2026-04-10 – Admissions records: unique admitted list + counts

- `app/api/admissions/records/route.ts` – Collapse multiple `admit` rows per `qr_data` (e.g. re-entry return) to a single list entry; keep latest timestamp/labels per ticket
- `app/admissions/scan/page.tsx` – Column titles `Admitted (n)` and `Grant Re-Entry (n)`; stable list keys by ticket code for admitted

**Updates:** Admitted pane shows one row per ticket; grant re-entry history unchanged.

## 2026-04-10 – Checkout reserved ticket count vs cart summary

- `app/[eventSlug]/checkout/checkout-content.tsx` – Headline count uses `Math.max(client items, effectiveSummary.item_count)` so “X tickets reserved” matches server `reservation_items` when the Zustand cart is stale
- `app/api/reservations/route.ts` – `extend: true` on an existing cart only updates `expires_at` and no longer deletes/rebuilds `reservation_items` from the client list (prevents shrinking the cart on extend)

**Updates:** Fixes “1 ticket reserved” when subtotal/cart-summary reflect multiple seats; prevents checkout “extend” from overwriting the server cart with a stale client.

## 2026-04-10 – Checkout and home perceived performance

- `app/api/checkout/route.ts` – Batch `event_seats` / `seats` lookups for cart total; PayMongo path inserts tickets with `qr_data` only (null image URLs) so assets generate post-payment via `generateTicketImageForTicketId`; parallel section-ticket QR/image work when generating assets; deterministic `registerUniqueQr` before parallel uploads
- `app/[eventSlug]/checkout/checkout-content.tsx` – `checkoutFlowPhase` for overlay copy (extend vs secure payment vs on-site); clear loading before opening PayMongo modal; no “email shortly” during online prep
- `app/api/events/route.ts` – Split list uses slim `EVENT_GRID_LIST_COLUMNS`; `Promise.all` for `attachVenueAndPrice` on featured and upcoming
- `app/page.tsx` – Server `fetch` first home split (`revalidate: 60`) with `NEXT_PUBLIC_SITE_URL` or request host headers
- `app/home-client.tsx` – Pass `initialSplit` into `EventGrid` when category is all and search is empty
- `components/event-grid.tsx` – `initialData` from `initialSplit`; `staleTime` 45s; tighter capped Framer Motion entrance delays

**Updates:** Faster PayMongo checkout response, smaller events API payloads, home grid hydrates from server-fetched first page, clearer checkout progress messaging.

## 2026-04-10 – Supabase Realtime: defer subscribe to reduce dev WebSocket warnings

- `hooks/use-event-availability-realtime.ts` – Subscribe on `requestAnimationFrame` and cancel on cleanup so Strict Mode / HMR do not tear down a mid-handshake socket as often

**Updates:** Mitigates console noise: `WebSocket is closed before the connection is established` from `RealtimeClient` during local dev.

## 2026-04-10 – Checkout: fewer duplicate reservation 404s

- `app/[eventSlug]/checkout/checkout-content.tsx` – Parse cart-summary 400 `code` (`expired` / `not_found`) to redirect without an extra GET; shared `redirectIfReservationGone` + ref dedupe toast/redirect; abort hydration fetch on unmount (Strict Mode)

**Updates:** Cuts redundant `/api/reservations/:id` calls and duplicate console 404 lines when cart-summary already encodes the failure reason.

## 2026-04-03 – Booking flow: cart-summary 400 and reservations 404

- `lib/cart-summary.ts` – `maybeSingle()` for cart row; `GetCartSummaryResult` with `not_found` / `expired` codes
- `app/api/events/[id]/cart-summary/route.ts` – 400 responses include `code` for client handling
- `app/[eventSlug]/checkout/page.tsx` – `initialSummary` only when `getCartSummary` returns `ok: true`
- `app/[eventSlug]/book/book-page-client.tsx` – Abort/clear debounced silent sync before Proceed; use POST `reservation_cart_id` for prefetch/nav; `credentials: "same-origin"` on reservation/cart fetches
- `app/[eventSlug]/checkout/checkout-content.tsx` – `credentials` on cart-summary and reservation GETs; on cart-summary failure, verify reservation GET and redirect to book on 404

**Updates:** Serialized client sync vs Proceed, hardened cart-summary queries, checkout recovers when the cart is gone. **Ops:** This repo has no `GET /api/events/[id]/summary`; if production shows 403 on “summary”, copy the full Network URL (often `cart-summary`) and check CDN/WAF/middleware rewrites.

## 2026-04-03 – Event assistant: reports KPI glossary and live dashboard facts
- `lib/reports-kpi-chat-context.ts` – Authoritative Sales & Reports KPI definitions (aligned with KPI cards; Potential Sales; chart explanation; sold % vs paid %).
- `lib/chat-dashboard-facts.ts` – `wantsAdminDashboardFacts()` intent gate; `formatDashboardFactsForChat()` for RPC snapshot text.
- `app/api/chat/route.ts` – Extended POST `context` (pathname, event_id, date_from, date_to); injects KPI block + optional `get_admin_dashboard_metrics` facts for `view_sales_analytics` users; access/no-event guidance; `max_tokens` 750.
- `components/ai-chat.tsx` – Sends chat context from pathname, `/admin/reports` query + `sessionStorage` date filters; subtitle/placeholder mention Sales & Reports.
- `app/admin/reports/reports-page-client.tsx` – Writes `wtp_reports_chat_context` to `sessionStorage` for assistant date alignment.

**Updates:** Assistant answers KPI/percentage questions from definitions; authorized users on Sales & Reports get live section/KPI data for the selected event (and date filters).

## 2026-04-03 – Reports KPI card title color
- `components/admin/reports/kpi-cards.tsx` – KPI card titles use `text-green-300` instead of muted foreground.

## 2026-04-03 – Reports KPI label rename
- `components/admin/reports/kpi-cards.tsx` – "Total Projected Revenue" renamed to "Potential Sales".

## 2026-04-03 – Admin dashboard card label colors
- `app/admin/page.tsx` – Card icon/label default `text-[var(--wish-yellow)]`, hover `group-hover:text-white` (replacing orange default and yellow-on-hover); `transition-colors`.

## 2026-04-03 – Open seating stepper matches cart size
- `components/seat-picker/section-picker.tsx` – `SectionQuantityStepper` uses `size="compact"` so the quantity matches the cart stepper (same `text-lg` / `h-8` buttons).

## 2026-04-03 – Open seating stepper: smaller quantity digit
- `components/seat-picker/section-quantity-stepper.tsx` – Default count `text-2xl` / `sm:text-3xl` (was `text-3xl` / `sm:text-4xl`); compact `text-lg` (was `text-xl`); slightly tighter min-widths.

**Updates:** Quantity number reads a bit smaller vs. the ± buttons.

## 2026-04-03 – Open seating: stepper instead of quantity dropdown
- `components/seat-picker/section-quantity-stepper.tsx` – New Minus / large numeric display / Plus control with orange border, default and compact sizes.
- `components/seat-picker/section-picker.tsx` – Open sections use `SectionQuantityStepper` (same max rules as before: up to 10 and available).
- `components/booking/inline-cart.tsx` – Section line items use the compact stepper for quantity changes.

**Updates:** Open seating quantity is adjusted with +/− and a prominent count instead of a `<select>`.

## 2026-04-03 – Light mode text readability
- `components/providers/theme-provider.tsx` – Initialize theme from `document` / `localStorage` on first client render so context matches `data-theme` before effects.
- `components/background-image.tsx` – Drive concert scrim from `document.documentElement` via `useSyncExternalStore` so overlay matches CSS immediately (no dark scrim under light tokens).
- `components/footer.tsx` – `site-footer` / `site-footer-bar` / `site-footer-social-chip` classes for theme-scoped backgrounds.
- `app/globals.css` – Footer and event-card tokens (`--footer-*`, `--event-card-media-fade`, `--wish-yellow-text`); light `--foreground-muted` darker; `[data-theme="dark"]` footer/card token resets.
- `components/event-card.tsx` – Theme-aware media fade and countdown color (`--wish-yellow-text`).
- `components/ui/button.tsx` – Light-theme hover/fill for `secondary`, `outline`, and `ghost` (`bg-black/6`-style) so controls read on pale glass.

**Updates:** Light mode: readable hero/nav over background, footer no longer dark-on-dark, clearer pills/buttons and event countdown on cards.

## 2026-04-03 – Home: parallel event card thumbnails
- `components/event-grid.tsx` – Removed sequential mount queue so all featured and upcoming `EventCard`s render at once; thumbnails fetch in parallel instead of one-after-another.
- `components/event-card.tsx` – Dropped `onMediaLoaded` / `loadingLabel` (only used for the old queue); per-card loading overlay unchanged.

**Updates:** Faster perceived load on the home grid when multiple events have images.

## 2026-03-22 – Inline cart: flat rows, section colors kept
- `components/booking/inline-cart.tsx` – Removed collapsible section group headers; cart lines are a single flat list ordered by section, with the same per-row left border tint and background tint by section color.

**Updates:** Cart no longer groups by section with extra header rows; colors still identify each line’s section.

## 2026-03-21 – Real-time seat holds (concurrent users)
- `supabase/migrations/00151_reservation_items_event_id_realtime.sql` – Added `reservation_items.event_id` (backfill + sync trigger), duplicate-active-seat guard trigger, Realtime publication for `reservation_items`.
- `lib/reservation-explicit-seats.ts` – Shared validation for explicit seat picks vs sold / other carts / admin-reserved seats.
- `app/api/reservations/route.ts`, `app/api/reservations/[cartId]/route.ts` – Pre-insert validation (409), mapping of unique-violation errors to 409.
- `hooks/use-event-availability-realtime.ts` – Supabase Realtime subscription scoped by `event_id` to invalidate availability.
- `app/[eventSlug]/book/book-page-client.tsx` – Availability polling fallback, `serverCartSeatIdsRef` reconciliation, 409 resync from `/api/reservations/me`.
- `components/seat-picker/seat-selector.tsx`, `components/seat-picker/seat-map.tsx` – Tooltips distinguish sold vs held seats.

**Updates:** Seat maps stay in sync when other shoppers hold seats (Realtime + polling); server rejects conflicting seat picks; local stale picks are cleared with a toast.

## 2026-03-21 – Active cart hold owner details
- `app/api/admin/events/[id]/reserved-seats/route.ts` – Enriched active cart hold payload with owner metadata (`owner_name`, `owner_email`) by resolving cart `profile_id` via admin profile/auth lookups.
- `components/admin/reserved-seats-tab.tsx` – Displayed cart hold owner name/email in each Active Cart Holds row for easier admin tracing.

**Updates:** Reserved Seats now shows who owns each active cart-held seat (name and email when available).

## 2026-03-21 – Active cart holds query reliability fix
- `app/api/admin/events/[id]/reserved-seats/route.ts` – Reworked active cart holds loading to a deterministic 3-step fetch (`reservation_carts` -> `reservation_items` -> `event_seats`) and added explicit error handling per query.

**Updates:** Active Cart Holds now resolve reliably for events with active buyer cart items.

## 2026-03-21 – Collapsible Event Seat Plan card
- `app/[eventSlug]/book/book-page-client.tsx` – Wrapped the seat map image carousel in a new collapsible glass card titled `Event Seat Plan`, defaulted to expanded, with chevron toggle affordance.

**Updates:** The booking page now shows the image viewer inside a dedicated collapsible card for cleaner layout and optional collapse.

## 2026-03-21 – Active Cart Holds in Reserved Seats tab
- `app/api/admin/events/[id]/reserved-seats/route.ts` – Extended reserved seats response to include `active_cart_holds` from active `reservation_items`/`reservation_carts` with seat and expiry metadata.
- `app/api/admin/events/[id]/reserved-seats/release/route.ts` – Added `reservation_item_id` release path to remove a single active cart-held seat with event validation and audit logging.
- `components/admin/reserved-seats-tab.tsx` – Added `Active Cart Holds` section with per-seat release actions and destructive confirmation dialog before releasing.

**Updates:** Admins can now view temporary cart-held seats and safely release each hold with confirmation, while existing reserved-seat behavior stays intact.

## 2026-03-21 – Admin event tab box hover highlight
- `components/admin/edit-event-tabs.tsx` – Added hover/active border and background highlight styling on tab boxes so each tab pill container is visibly emphasized, not just text.

**Updates:** Admin event tabs now show stronger box-level hover feedback with highlighted border + background.

## 2026-03-21 – Admin event tab hover text highlight
- `components/admin/edit-event-tabs.tsx` – Enhanced tab trigger/link hover styling so tab text highlights more clearly on hover while preserving active-state emphasis.

**Updates:** Admin event tabs now have stronger text highlight feedback when hovered.

## 2026-03-21 – PayMongo failure aligned with cart expiry
- `supabase/migrations/00150_payments_expires_at.sql` (new) – Added `payments.expires_at`, backfilled legacy pending rows, and updated `cleanup_stale_pending_payments()` to use payment deadline instead of fixed 3-minute staleness.
- `app/api/checkout/route.ts` – Persisted `reservation_carts.expires_at` into `payments.expires_at` when creating pending PayMongo payments.
- `app/api/bookings/[bookingId]/status/route.ts` – Enforced payment deadline by failing/releasing pending bookings once `payments.expires_at` is reached.
- `lib/paymongo.ts` – Removed hardcoded 3-minute stale fallback from PayMongo status helpers so timeout decisions are deadline-driven.
- `app/api/cron/cleanup-pending-payments/route.ts` – Updated cron cleanup selection to prioritize `payments.expires_at` and use a safer legacy fallback window only when expiry is missing.

**Updates:** Backend payment failure timing now follows the same reservation/cart expiry timeline instead of an independent 3-minute timeout.

## 2026-03-21 – Shared metadata build type fix
- `app/reports/shared/[token]/page.tsx` – Added explicit typing for joined `events` metadata payload and normalized title extraction from array shape to resolve Next.js production type-check failure.

**Updates:** `npm run build` no longer fails on shared report metadata typing for `events.title`.

## 2026-03-21 – Shared report metadata typing fix
- `app/reports/shared/[token]/page.tsx` – Fixed metadata title generation to handle Supabase joined `events` payloads that may be returned as an array, avoiding a build-time type error.

**Updates:** Production build now succeeds for shared report metadata title generation.

## 2026-03-21 – Admin reports show live timestamp
- `app/admin/reports/reports-page-client.tsx` – Added a live current date/time display in the reports header (updates every second) so screenshots capture exact timestamp context.

**Updates:** Admin screenshots of Sales & Reports now visibly include the current date and time.

## 2026-03-21 – Shared report shows event name and generated time
- `app/reports/shared/[token]/shared-report-client.tsx` – Added visible report heading with event title and formatted generation timestamp at the top of the shared report content.

**Updates:** Public shared report now explicitly displays the event name and exact generated time as part of the report view.

## 2026-03-21 – Admin shared event report links
- `supabase/migrations/00149_shared_report_links.sql` (new) – Added `shared_report_links` table with RLS for temporary public links and a `get_shared_dashboard_metrics` wrapper to allow live report payloads from shared tokens.
- `app/api/admin/reports/share/route.ts` (new) – Added admin endpoint to generate secure share tokens with 30-minute expiry.
- `app/api/reports/shared/[token]/route.ts` (new) – Added public token endpoint that validates expiry and returns live report data for valid links.
- `app/reports/shared/[token]/page.tsx` (new) – Added public shared report route with tab title format `<Event Name> - <Generated Timestamp>`.
- `app/reports/shared/[token]/shared-report-client.tsx` (new) – Added client renderer/fetcher for shared token reports.
- `components/admin/reports/reports-content.tsx` (new) – Extracted reusable report-content renderer shared by admin and public modes.
- `components/admin/reports/kpi-cards.tsx` – Added `disableDrilldown` option so public reports have no drilldown/button behavior.
- `app/admin/reports/reports-page-client.tsx` – Added `Share Report` button, share-link generation flow, clipboard copy, and loading overlay integration.
- `components/app-chrome.tsx` (new) – Added path-aware app chrome wrapper to hide global UI for shared report pages.
- `app/layout.tsx` – Switched to `AppChrome` wrapper so `/reports/shared/*` renders without header/footer/background chrome.

**Updates:** Admins can now generate public report links per event/date filters, and recipients see a report-only page without controls or site chrome until the 30-minute link expiry.

## 2026-03-19 – Random seat button uses section colors
- `app/[eventSlug]/book/book-page-client.tsx` – Styled buyer `Select Random Seat` buttons with each section’s configured color and auto-contrast text for readability.

**Updates:** In buyer `Choose seats`, random-seat action buttons now visually match their section color tags.

## 2026-03-19 – Buyer seat/image zoom alignment fix
- `components/seat-picker/seat-selector.tsx` – Refactored setup-style canvas zoom rendering to use a single parent transform (admin-style) and kept seat coordinates in logical space to prevent drift during zoom-out.
- `components/seat-picker/seat-selector.tsx` – Removed extra buyer-side scaling factor from seat placement so image and seats stay synchronized across zoom levels.

**Updates:** In buyer `Choose seats`, seat overlays remain aligned with the background map when zooming in or out.

## 2026-03-19 – Buyer seat map zoom-out stability
- `components/seat-picker/seat-selector.tsx` – Raised buyer map minimum zoom from `0.25` to `0.5` (matching admin-style limits) and centralized zoom bounds constants for consistent control behavior.

**Updates:** Zooming out no longer reaches unstable tiny-seat scale where seat labels/boxes visually break alignment.

## 2026-03-19 – Buyer seat map width aligned with admin
- `components/seat-picker/seat-selector.tsx` – Updated buyer setup-style canvas to use fixed logical width `1400px` with proportional image height, matching admin seat selector sizing behavior.

**Updates:** Buyer `Choose seats` now renders 1400px plan images at the correct card-fit width baseline, consistent with admin canvas sizing.

## 2026-03-19 – Seat selector fixed 1400px logical width
- `components/admin/seat-selector-setup.tsx` – Updated section/canvas image sizing to always use a fixed logical width of `1400px` and compute proportional height from the uploaded image.

**Updates:** Uploaded venue plans now keep the correct `1400px` baseline width while allowing tall layouts to extend vertically as needed.

## 2026-03-19 – Seat selector canvas keeps manual zoom
- `components/admin/seat-selector-setup.tsx` – Removed first-load auto-fit zoom behavior so canvas zoom remains manual and unchanged after image upload/load.

**Updates:** Seat Selector Setup no longer auto-zooms canvas images; zoom is fully user-controlled again.

## 2026-03-19 – Auto-fit admin canvas image width
- `components/admin/seat-selector-setup.tsx` – Added first-load auto-fit zoom for canvas images so uploaded plans (e.g., 1436px wide) scale to the available card width instead of defaulting to horizontal overflow.

**Updates:** Seat Selector Setup now opens each canvas with an auto-fit zoom that fills the card width for easier seat alignment and preview.

## 2026-03-19 – Buyer/admin canvas grouping parity
- `supabase/migrations/00149_availability_canvas_section_ids_normalized.sql` (new) – Replaced `get_event_availability` with normalized canvas payload behavior so each canvas always returns deterministic `section_ids` arrays (`[]` when empty) in admin-aligned ordering.
- `app/[eventSlug]/book/book-page-client.tsx` – Normalized/deduped `canvas.section_ids`, built canvas groups by `section_ids` order, and retained fallback grouping only for sections not assigned to any canvas.

**Updates:** Buyer `Choose seats` now follows admin Seat Selector Setup canvas grouping/order exactly, with stable handling for empty/duplicate canvas section lists.

## 2026-03-19 – Event details modal mobile CTA/badge layout
- `components/event-card.tsx` – In the event details modal, moved the mobile early-bird promo badge to the bottom of the media/image area (matching home-card placement behavior).
- `components/event-card.tsx` – Updated modal action area to stack buttons vertically on mobile: `Choose seats` full width on first line, `Share event link` full width on second line; desktop keeps inline button layout.

**Updates:** Mobile event details now show the promo badge at the image bottom and clear two-line full-width action buttons.

## 2026-03-19 – Event edit tabs reordered alphabetically
- `components/admin/edit-event-tabs.tsx` – Reordered tab triggers alphabetically while keeping `Event Details` fixed as the first tab.

**Updates:** Event edit navigation is easier to scan: `Event Details` remains first, all other tabs follow alphabetical order.

## 2026-03-19 – Audit Trail columns simplified and actor name shown
- `components/admin/event-audit-trail.tsx` – Removed `Endpoint` and `Details` columns from the table view and kept a cleaner Date/Action/Summary/By layout.
- `app/api/admin/events/[id]/audit-trail/route.ts` – Resolved `actor_user_id` to profile data (`full_name`/`email`) and returned `actor_name` for display so the “By” column shows a real user name when available.

**Updates:** Audit Trail now hides endpoint/details columns and shows actor names instead of “Unknown user” when profile info exists.

## 2026-03-19 – Audit Trail table view + 2-week default window
- `app/api/admin/events/[id]/audit-trail/route.ts` – Added default 2-week filtering for recent audit entries, plus `older=1` mode to page older history and `older_available` metadata for UI controls.
- `components/admin/event-audit-trail.tsx` – Switched audit display from card list to table view (Date/Action/Summary/By/Endpoint/Details), shows recent 2-week data by default, and adds a “Load older trails” button to fetch earlier logs.

**Updates:** Audit Trail now opens as a table limited to the last 2 weeks, with explicit on-demand loading for older trail records.

## 2026-03-19 – Audit trail fix for section create/update/delete
- `app/api/admin/events/[id]/seating/sections/route.ts` – Added audit logging for section creation (`event.section.created`) after successful insert.
- `app/api/admin/events/[id]/seating/sections/[sectionId]/route.ts` – Added audit logging for section updates and deletes (`event.section.updated`, `event.section.deleted`) including section metadata and update payload.

**Updates:** Creating/editing/deleting event sections now appears in the Audit Trail tab.

## 2026-03-19 – Event Audit Trail tab and API logging
- `supabase/migrations/00148_event_audit_logs.sql` (new) – Added `event_audit_logs` table with indexes and RLS for authorized event managers/admins.
- `lib/event-audit.ts` (new) – Added shared best-effort audit logger (`logEventAudit`) and actor helper for consistent audit writes.
- `app/api/admin/events/[id]/audit-trail/route.ts` (new) – Added paginated audit-read API (`limit`, `cursor`) with permission checks.
- `components/admin/event-audit-trail.tsx` (new) – Added Audit Trail UI list/timeline with details expander and “Load more”.
- `components/admin/edit-event-tabs.tsx` – Added `Audit Trail` tab slot/trigger/content wiring.
- `app/admin/events/[id]/page.tsx` – Registered `auditTrail` tab and mounted `EventAuditTrail`.
- `app/api/admin/events/[id]/route.ts`, `app/api/admin/events/[id]/pricing/route.ts`, `app/api/admin/events/[id]/admissions-codes/route.ts`, `app/api/admin/events/[id]/assign-seats/route.ts`, `app/api/admin/events/[id]/print-tickets/route.ts`, `app/api/admin/events/[id]/featured/route.ts`, `app/api/admin/events/[id]/reserved-seats/release/route.ts`, `app/api/admin/assignments/[id]/confirm/route.ts`, `app/api/admin/assignments/[id]/reverse/route.ts`, `app/api/admin/assignments/[id]/send-email/route.ts`, `app/api/admin/print-tickets/generate/route.ts`, `app/api/admin/print-tickets/send-selected-email/route.ts`, `app/api/admin/print-tickets/send-section-email/route.ts`, `app/api/admin/print-tickets/[id]/send-email/route.ts`, `app/api/admin/tickets/send-email-bulk/route.ts`, `app/api/admin/tickets/release-bulk/route.ts` – Added audit log writes on successful mutation flows.

**Updates:** Event admins now have a dedicated Audit Trail tab showing who performed key event-related actions and when, for new changes moving forward.

## 2026-03-19 – Re-prompt at 5 seconds remaining
- `components/booking/reservation-timer.tsx` – Reworked warning API to support multiple warning thresholds via `warnSecondsList` and `onWarn(warnSeconds)`; warnings now fire once per threshold.
- `app/[eventSlug]/book/book-page-client.tsx` – Timer warning thresholds now include both 60s and 5s so the stay-longer dialog can ask again at 5 seconds.
- `app/[eventSlug]/checkout/checkout-content.tsx` – Added one-time threshold tracking for low-time prompts (60s and 5s) to re-prompt at 5 seconds without reopening continuously every second.

**Updates:** Buyers now receive a second extension prompt when the countdown reaches 5 seconds left.

## 2026-03-19 – Cart “Stay longer” prompt at 1 minute
- `components/booking/cart-stay-longer-dialog.tsx` (new) – Dialog UI to renew/decline cart extension.
- `components/booking/reservation-timer.tsx` – Added `warnSeconds`/`onWarn` to trigger the prompt once at <= 60s.
- `app/[eventSlug]/book/book-page-client.tsx` – Show prompt when remaining time drops below 1 minute; renew cart with `/api/reservations` `extend: true`.
- `app/[eventSlug]/checkout/checkout-content.tsx` – Same prompt + renewal behavior while on checkout pages.
- `app/api/reservations/route.ts` – Added optional `extend` flag to actually renew `reservation_carts.expires_at`.

**Updates:** Buyers can decline extension and allow the countdown to clear the cart; accepting renews time without resetting on normal sync/heartbeat.

## 2026-03-18 – Remove per-section send button
- `components/admin/print-tickets-tab.tsx` – Removed the per-section “Send selected section tickets” button (assigned sections). Use the existing top-level “Send selected” button instead.

## 2026-03-18 – Fix build error in event grid
- `components/event-grid.tsx` – Resolved duplicate `upcomingTotal` variable that broke the build during the sequential/queued card loading refactor.
- `components/event-card.tsx` – Removed unused Lucide imports added during the loading overlay change.
- `components/event-grid.tsx` – Removed unused `initialEvents`/`initialTotal` props to reduce noise.

## 2026-03-18 – Queued card loading progress
- `components/event-card.tsx` – Added a cover-media loading overlay and `onMediaLoaded` callback so we can show progress while the next card is loading.
- `components/event-card-skeleton.tsx` – Added optional `statusLabel` to display queued card order.
- `components/event-grid.tsx` – Now renders queued skeletons and shows `Loading X of Y` on the currently loading card (sequentially).

## 2026-03-18 – Sequential event card loading
- `components/event-grid.tsx` – Changed the event grid to reveal featured and upcoming cards one-by-one, using each card’s image load event to incrementally mount the next card so they appear sequentially instead of all at once.

## 2026-03-18 – Early Bird banner full-width strip
- `components/event-card.tsx` – Restyled the EARLY BIRD PROMO overlay into a full-width bar at the bottom of the card image; enlarged the promo text and moved the countdown onto a second line for better readability while keeping the banner aligned with the card width.

## 2026-03-18 – Netlify: remove cold-start white screen on first load
- `app/layout.tsx` – Removed server-side `HeaderWrapper` from the root layout so public pages (like `/`) can be prerendered as static content instead of SSR.
- `middleware.ts` – Narrowed middleware matching to auth/protected routes only (`/admin`, `/dashboard`, `/login`, `/signup`, `/auth/*`).
- `components/header-wrapper.tsx` – Deleted; no longer needed after moving header auth checks client-side.
- **Updates:** Home (`/`) is now `○ (Static)` in `next build`, so first visit after idling should no longer wait on a cold SSR function start.

## 2026-03-18 – Build: type `supabase` client in events API
- `app/api/events/route.ts` – Added explicit `SupabaseClient` typing for the `supabase` variable so Next.js type-checking doesn’t treat it as implicit `any` during `next build`.
- **Updates:** Fixes the production build failure caused by “Variable 'supabase' implicitly has type 'any'”.

## 2026-03-18 – Build: remove `any` + fix Print Tickets lint warnings
- `app/api/events/route.ts` – Replaced `any` usage with typed guards/interfaces so ESLint `no-explicit-any` no longer fails the build.
- `components/admin/print-tickets-tab.tsx` – Removed unused `eventTitle` prop usage and renamed Lucide `Image` icon to `ImageIcon` to avoid the `alt-text` rule misfiring.
- **Updates:** `next build` no longer fails due to `no-explicit-any`, and Print Tickets no longer emits the new warnings.

## 2026-03-18 – Print Tickets: success popup after actions
- `components/admin/print-tickets-tab.tsx` – Added a success popup dialog after ticket generation and after ticket email sending, summarizing what completed (counts + recipient/label).
- **Updates:** Provides clearer confirmation than toasts alone for admin bulk actions.

## 2026-03-18 – Print Tickets: theme generate vs send controls
- `components/admin/print-tickets-tab.tsx` – Removed green row highlighting; generated seats/sections now show green text only. Also themed Generate controls orange and Email-send controls green (checkboxes + buttons).
- **Updates:** Clearer separation between “generate” selection vs “send email” selection.

## 2026-03-18 – Print Tickets: green generated + separate email selection
- `components/admin/print-tickets-tab.tsx` – Highlighted already-generated seats (and free/standing section tickets) with a green tint, and added a separate email-selection checkbox (only visible when tickets exist) so bulk email sending is independent from generation selection.
- **Updates:** Bulk “Send selected” now sends only the items checked in the new email checkbox column.

## 2026-03-17 – Ticket email total fallback
- `lib/confirm-booking.ts` – While building `ticketDetails`, now also accumulates `computedTotalCents` from per-ticket prices and uses this as a fallback when `booking.total_cents` is null or zero, so confirmation emails still show the correct subtotal/total even for legacy or malformed bookings where the totals were not persisted.
- **Updates:** Ensures the email’s subtotal/total lines match the per-ticket prices shown in the order summary, without requiring manual fixes to existing booking rows.

## 2026-03-18 – Faster home event loading
- `components/event-grid.tsx` – Reduced the initial events page size from 18 to 8 and aligned the loading skeletons to PAGE_SIZE so the first batch of cards and their images load faster, with additional events fetched later via the existing “Load more” button.
- **Updates:** Improves perceived performance on the home page’s first load by showing a smaller set of event cards sooner instead of waiting for a large grid of 18 events to finish loading.

## 2026-03-18 – Revert home SSR experiment
- `app/page.tsx`, `app/home-client.tsx` – Reverted the short-lived server-side fetch/prop plumbing for initial events to simplify the home page back to pure client-side loading via `EventGrid`, since the change did not improve LCP in practice.
- `components/event-card.tsx` – Restored the `priority`/`fetchPriority` behavior for the first card so the hero event image can load eagerly again.
- **Updates:** Keeps the earlier performance win of a smaller PAGE_SIZE on the home grid while avoiding additional complexity that didn’t materially help LCP in local testing.

## 2026-03-18 – Fix confirm-booking lint error
- `lib/confirm-booking.ts` – Updated the `discountCents` variable to use `const` instead of `let` now that it is never reassigned, resolving the ESLint `prefer-const` error introduced by the recent total fallback logic.
- **Updates:** Restores a clean lint run for the confirmation email logic so that only non-blocking warnings remain across the project.

## 2026-03-18 – Full-page branded loading screen
- `app/loading.tsx` – Replaced the generic route loader with a full-viewport, dark gradient loading screen that immediately shows the “Wish Tickets Portal” hero title and an animated progress bar while the initial page loads.
- **Updates:** Removes the brief white flash on first visit to the site by giving users an instant, branded loading state before the home content and background image are ready.

## 2026-03-18 – Defer heavy AI chat bundle from root layout
- `components/ai-chat-entry.tsx` (new) – Added a tiny client-only wrapper that dynamically imports the `AIChat` widget with `ssr: false`, so its bundle loads only on the client after the main UI is ready.
- `app/layout.tsx` – Now imports the lightweight `AIChatEntry` client component instead of using `next/dynamic` directly in the server layout, satisfying Next.js 15’s restriction while still keeping the chat code out of the initial server render.
- **Updates:** Reduces heavy work in the root layout by deferring the chat widget JavaScript, helping the first screen for all routes (especially `/`) render faster before optional AI features hydrate.

## 2026-03-18 – Make Ticket Resending search resilient to email source
- `app/api/admin/bookings/search/route.ts` – Updated the search API to always fetch all confirmed bookings via `get_admin_confirmed_bookings_for_resend` with null filters, then apply the email/name filtering in TypeScript using the `buyer_email` and `buyer_name` fields returned by the RPC.
- **Updates:** Ensures the Ticket Resending page can find bookings even when the buyer email is stored in different tables/columns (e.g. `profiles.email` vs `auth.users.email`), since the filtering now happens consistently in the API layer.

## 2026-03-18 – Show booking date/time in Ticket Resending
- `supabase/migrations/00080_admin_confirmed_bookings_for_resend.sql` – Extended the admin search RPC to return a formatted `booking_created_display` column based on `bookings.created_at`.
- `app/api/admin/bookings/search/route.ts` – Propagates the new `booking_created_display` field into the API response as `bookingCreated`.
- `components/admin/ticket-resending.tsx` – Renders both the event date/time and the booking created date/time for each result card, so admins can see when each booking was made.
- **Updates:** Gives admins clearer context on when each booking was created while reviewing and resending tickets.

## 2026-03-18 – Home defaults: featured up to 100, upcoming 8 (cap 100) + centered grids
- `app/api/events/route.ts` – Added a split-mode response (`split=1`) that returns `featured` (capped at 100) and `upcoming` (paged at 8 per request, capped at 100 total) separately, while keeping the legacy `{ events, total }` response for existing callers.
- `components/event-grid.tsx` – Updated the home grid to consume the split response: featured renders independently (up to 100), upcoming loads 8 initially and paginates up to 100 total, and both grids use an auto-fit layout with `justify-center` so 1–3 cards are centered instead of left-aligned.
- **Updates:** Faster first load (only 8 upcoming cards initially), supports many featured cards without affecting upcoming pagination, and improves aesthetics for small result sets by centering incomplete rows.

## 2026-03-17 – Buyer cancel order from checkout and payment screens
- `app/api/bookings/[bookingId]/cancel/route.ts` – Added a POST endpoint that lets the current user cancel an unpaid booking; it deletes tickets and frees seats via `releaseFailedBooking`, marks related payments as `cancelled`, and updates the booking status to `cancelled` while preserving an audit trail.
- `app/[eventSlug]/checkout/checkout-content.tsx` – Added a \"Cancel order\" button with a confirmation dialog on the main checkout page that deletes the active reservation cart, clears the client cart state, and redirects buyers back to seat selection; also added a second \"Cancel order\" button on the \"Complete your payment\" status screen that invokes the new cancel endpoint for the pending booking, clears local state, and returns buyers to seat selection with seats released.
- **Updates:** Buyers now have an explicit way to abandon an unpaid order from both checkout and the PayMongo status screen, ensuring reserved seats are released and partial payment state is cleaned up without affecting confirmed bookings.

## 2026-03-17 – Select Random Seat per section (buyer view)
- `app/[eventSlug]/book/book-page-client.tsx` – Added `selectRandomSeatInSection(sectionId)` handler that clears any selected seat in that section, then selects one random available seat; added “Select Random Seat” button above the seat map/grid in both map-display groups (one button per section in the group) and grid-display sections (one button per section card). Button is disabled when the section has no available seats; guest users are shown the signup dialog as with manual seat click.
- **Updates:** Buyers can quickly pick one random available seat per section; clicking again replaces the current selection with another random seat in the same section.

## 2026-03-14 – Performance: caching and lazy loading
- `app/layout.tsx` – Removed the global `dynamic = "force-dynamic"` flag so pages can use Next.js route caching, while keeping the `AIChat` widget as a client component rendered from the root layout.
- `app/admin/reports/reports-page-client.tsx` – Dynamically imported all heavy analytics widgets (KPI cards, charts, tables, and event-day section) so their code only loads when the admin reports page is viewed, reducing the base admin bundle size.
- `app/admin/events/[id]/page.tsx` – Dynamically imported `SeatConfigurator` and `SeatSelectorSetup` so the complex seating and selector UIs (DnD, grids, dialogs) only hydrate when the relevant admin tabs are active, while keeping the event details tab lightweight.
- `app/admin/events/[id]/assign-seats/page.tsx` – Updated the page to dynamically import the `AssignSeatsClient` module on demand while still running entirely on the server side for parameter handling, so the heavy manual distribution UI only loads when this admin page is requested.
- **Updates:** Improves overall perceived speed by letting the framework cache more routes and keeping heavy admin tooling scoped to the specific pages that need it, without changing user-facing behavior.

## 2026-03-14 – Relax CSP for eval, inline scripts, HTTPS iframes, and media
- `next.config.ts` – Added a global `Content-Security-Policy` header that allows `'unsafe-inline'` and `'unsafe-eval'`/`'wasm-unsafe-eval'` in `script-src` so both eval-based and inline scripts run without CSP violations, set `frame-src 'self' https:` so PayMongo checkout and other HTTPS iframe embeds (e.g. teaser videos) can load, and added `media-src 'self' data: https:` so audio loaded via `data:` URLs (e.g. scanner sounds) is no longer blocked (at the cost of weaker XSS protection).

## 2026-03-13 – Admin bookings search typing fix
- `app/api/admin/bookings/search/route.ts` – Replaced `any` casts with strongly typed Supabase RPC row and ticket interfaces so the admin bookings search API passes ESLint’s `no-explicit-any` rule while preserving the existing response shape used by the Ticket Resending UI.

## 2026-03-13 – Admin Ticket Resending dashboard card
- `app/admin/page.tsx` – Added a “Ticket Resending” card, visible only to admins, super admins, or users with the `view_sales_analytics` capability, that links to the new Ticket Resending tool.
- `app/admin/ticket-resending/page.tsx` – New admin page wrapper that enforces the same role/capability check (admin, super admin, or `view_sales_analytics`) before rendering the Ticket Resending client component, redirecting others back to the admin dashboard.
- `components/admin/ticket-resending.tsx` – Implemented a Ticket Resending UI with global search by buyer email or name, a list of matching confirmed bookings with ticket summaries, and a resend dialog where admins can review/edit the destination email before resending; search now runs only when clicking a “Search” button (no longer on every keypress), a post-search event dropdown lets admins filter results to a specific event, and a confirmation dialog appears after a successful resend to clearly signal that tickets were emailed.
- `app/api/admin/bookings/search/route.ts` (new) – Admin-only API that uses a Supabase RPC to search confirmed bookings by partial email/name and returns compact booking + ticket summaries for the UI.
- `supabase/migrations/00080_admin_confirmed_bookings_for_resend.sql` (new) – Added the `get_admin_confirmed_bookings_for_resend(email, name)` SECURITY DEFINER function used by the admin bookings search.
- `app/api/admin/bookings/[id]/resend-tickets/route.ts` (new) – Admin-only endpoint to reset `ticket_email_sent_at`, optionally set a temporary `buyer_email_override`, and call `confirmBooking` to resend the full ticket email for any confirmed booking.
- `lib/confirm-booking.ts` – Taught `confirmBooking` to honor an optional `buyer_email_override` from `bookings` when choosing the destination email, so admin resends can safely target a different address without changing the user’s login email.
- **Updates:** Gives admins a dedicated dashboard tool to locate confirmed bookings across all events and reliably resend ticket emails to the correct address, while reusing the existing confirmation email flow and attachments.

## 2026-03-13 – Event poster image in ticket emails
- `lib/email.ts` – Extended `SendTicketEmailParams` and placeholder replacement to accept an optional `eventImageUrl`, build an `eventImageBlock` HTML row, and inject it into the default email template.
- `app/api/checkout/route.ts` – Loaded `image_url`/`thumbnail_url` for the event and passed the resolved event poster URL into `sendTicketEmail` for both on-site and non-PayMongo flows.
- `lib/confirm-booking.ts` – Fetched event `image_url`/`thumbnail_url` when sending webhook-driven confirmation emails and forwarded the poster URL to `sendTicketEmail`.
- `app/admin/settings/email-ticket-settings.tsx` – Added `{{eventImageBlock}}`/`{{eventImageUrl}}` to the documented placeholders and updated the default email body to include the optional event image block after the orange header.
- `supabase/migrations/00079_email_template_event_image.sql` (new) – Updated the stored `email_ticket_body` template in `app_config` to match the new default HTML, including the `{{eventImageBlock}}` placeholder beneath the header.
- **Updates:** Confirmation emails now optionally display the event’s poster/cover artwork beneath the Wish Tickets header whenever an event image is configured, while gracefully omitting the image block for events without artwork.

## 2026-03-13 – Dashboard & confirmation: sort, lapsed section, booked datetime, ticket counts, ticket grid, resend button, and copy tweaks
- `app/dashboard/page.tsx` – Joined tickets in the dashboard bookings query so each booking carries its related tickets.
- `app/dashboard/dashboard-bookings.tsx` – Sorted event groups within each status section by event date (nearest first, then by title), split confirmed bookings into separate “Confirmed” (upcoming) and “Lapsed” sections grouped by event, sorted rows inside each event dropdown by most recent booked datetime, and displayed the number of tickets next to the booked date/time.
- `app/api/bookings/[bookingId]/send-email/route.ts` (new) – Added a user-facing API that allows an authenticated user to trigger `confirmBooking` for their own confirmed booking, resending the ticket email for that single booking.
- `app/[eventSlug]/confirmation/[bookingId]/send-tickets-button.tsx` (new) – Client component with a green “Send tickets to email” button (with email icon) that calls the new API and shows a floating progress bar while the email is being sent.
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – Replaced the centered `container` wrapper with a full-width wrapper, let the main glass card stretch to `w-full`, moved the new resend button up next to the “Booking confirmed” heading, removed the redundant “Your tickets have been sent to your email…” helper copy inside the card body, and clarified in the subtitle that users can tap tickets to save images or click the button to send them via email.
- `app/[eventSlug]/confirmation/[bookingId]/confirmation-tickets.tsx` – Switched the tickets list from a single-column stack to a flex-wrapped, center-aligned row of compact ticket cards with a fixed card width matching the ticket image, removed the “View full ticket” text link now that the ticket image itself is zoomable, and dropped the extra “Tickets” subheading above the grid to keep the layout cleaner.
- **Updates:** Makes the personal dashboard easier to scan by showing upcoming events first, collecting past (lapsed) bookings into their own card, ordering tickets within each event from most recently booked to oldest, clearly indicating how many tickets are in each booking, and presenting confirmation tickets as centered, auto-width cards beneath a streamlined confirmation header with a dedicated “Send tickets to email” action scoped to the current booking.

## 2026-03-13 – Ticket template: fix per-event preview copying
- `components/admin/ticket-template-upload.tsx` – Synced the internal preview URL to the latest `initialUrl` and `eventId` props so switching between events always shows each event’s own ticket template image, even when the admin client component is reused in production.
- `app/admin/events/[id]/page.tsx` – Keyed `TicketTemplateUpload` by event ID to force a clean remount when navigating between events in the admin, preventing stale template previews from the previously opened event.
- **Updates:** Fixes a production-only bug where the Ticket Template tab could show or reuse the last event’s template image when switching between events; new previews and new ticket PNGs now consistently use the correct per-event template.

## 2026-03-13 – Ticket template: clarify global vs per-event
- `components/admin/ticket-template-upload.tsx` – Added helper copy explaining that events without their own template use the global ticket template, and that uploading/removing a template only affects the current event and not others.
- **Updates:** Reduces confusion when switching or removing ticket templates so admins understand that per-event templates override, and otherwise fall back to, the shared global design.

## 2026-03-13 – Admin: regenerate ticket images per event
- `app/api/admin/events/[id]/tickets/regenerate-images/route.ts` (new) – Admin-only API to regenerate all ticket PNGs for a given event using the current ticket template, overwriting existing ticket images.
- `components/admin/ticket-template-upload.tsx` – Added a “Regenerate ticket images for this event” button that calls the new API with a confirmation dialog and shows progress via the floating progress bar.
- **Updates:** Allows admins to explicitly refresh ticket PNGs for an event after changing its template, so existing bookings can opt-in to the new design.

## 2026-03-13 – Ticket emails & templates: production diagnostics
- `lib/confirm-booking.ts` – Added environment-aware logging for booking claim attempts, attachment generation stats (image vs QR fallback), and overall ticket email flow to trace why emails may not send in production.
- `app/api/admin/debug/bookings/[id]/resend-ticket/route.ts` (new) – Admin-only endpoint to re-run `confirmBooking` for a specific booking and report `ticket_email_sent_at` before/after, simplifying production resend and debugging.
- `app/api/webhooks/paymongo/route.ts` – Logged when the PayMongo webhook schedules the background `confirmBooking` call so webhook-to-email flow can be traced in Netlify logs.
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – Logged PayMongo status checks and all code paths that invoke `confirmBooking`, covering pending, confirmed, and failed booking states.
- `lib/ticket-image.ts` – Logged how ticket templates are resolved (event vs global), which template URL is fetched, and when template fetches fall back to the clean base, to explain any differences between localhost and Netlify ticket PNGs.
- **Updates:** Makes it much easier to diagnose missing ticket emails and template mismatches in Netlify deploys, while keeping the underlying booking and email behavior unchanged.

## 2026-03-13 – Event card: larger text
- `components/event-card.tsx` – Increased the title, metadata, “days to go,” and price text sizes for better readability on the featured event cards.
- **Updates:** Makes key event details more prominent and easier to scan at a glance on the homepage.

## 2026-03-13 – Event card: combine date and time
- `components/event-card.tsx` – Updated the featured event card to display the event date and time together on a single line next to the calendar icon.
- **Updates:** Matches the desired UI where the date and time appear as one combined line in the card metadata.

## 2026-03-12 – Reports drilldown: fix tickets typing
- `app/api/admin/dashboard/drilldown/route.ts` – Updated admitted drilldown typing to treat `tickets` as an array from Supabase, and adjusted booking/seat ID collection and row building to use the first ticket per record.
- **Updates:** Fixes a TypeScript cast error in the admitted drilldown API while preserving existing behavior for section, recipient, and ticket metadata.

## 2026-03-12 – Reports delete admissions: section_name in body
- `components/admin/reports/kpi-detail-modal.tsx` – Extended the delete admissions request body type to include an optional `section_name` field when deleting admissions by section.
- **Updates:** Fixes a TypeScript error when sending section-based delete requests while keeping the API contract unchanged.

## 2026-03-12 – Event modal: stabilize teaser video
- `components/event-card.tsx` – Memoized `videoInfo` so the YouTube IFrame player is not torn down and recreated on every render (e.g., when early bird timers tick) while the modal is open.
- **Updates:** Fixes a bug where teaser videos in the event details modal would only play about a second and keep restarting instead of playing smoothly.

## 2026-03-12 – Event modal: autoplay video with sound
- `components/event-card.tsx` – Simplified embed handling to use a single iframe for YouTube/Vimeo with `autoplay=1` and removed the “Click to unmute” overlay and related state.
- **Updates:** Teaser videos in the event modal now autoplay directly with sound instead of showing an extra unmute overlay.

## 2026-03-13 – Event card: early bird banner position
- `components/event-card.tsx` – Moved the “EARLY BIRD PROMO” badge from the top-right to the bottom edge and centered it horizontally on the card image.
- **Updates:** Early bird promo ribbon now appears centered along the bottom of the event thumbnail, matching the desired layout.

## 2026-03-12 – Admissions scanner: remove unsupported prop
- `app/admissions/scan/page.tsx` – Removed the unsupported `stopDecoding` prop from the QR `Scanner` component and instead conditionally render the scanner only when not loading and no alert dialog is open.
- **Updates:** Fixes a TypeScript compile error in the admissions scan page while preserving the behavior of pausing scans during alerts/loading.

## 2026-03-12 – Thumbnail portraits 400×500
- `app/api/admin/upload/route.ts` – Updated thumbnail processing to generate 400 × 500 px (4:5) WebP images for event thumbnails.
- `components/admin/event-form.tsx` – Updated thumbnail helper copy to describe the new 400 × 500 px portrait size.
- `components/event-card.tsx` – Switched card media area to a 4:5 aspect ratio and updated image dimensions to 400 × 500 for better portrait presentation.
- `components/event-card-skeleton.tsx` – Updated loading placeholders to use the same 4:5 portrait aspect as event cards.
- **Updates:** Event thumbnails and their loading states are now consistently 400 × 500 portrait images across uploads and cards.

## 2026-03-12 – Early bird: days before event
- `app/api/admin/events/[id]/pricing/route.ts` – Pricing GET API now returns `event_start` so the UI can compute relative early bird windows.
- `components/admin/seat-pricing.tsx` – Replaced early bird start/end datetime pickers with “Starts N days before the event” and “Ends N days before the event” controls; added helpers to derive timestamps from day offsets and validate them.
- **Updates:** Admins configure early bird pricing using days before the event while the backend still stores exact start/end timestamps for eligibility checks.

## 2026-03-12 – Admin events: Ended Events group
- `app/admin/events/page.tsx` – Split non-archived events into Upcoming and Ended based on `event_start`; added an "Ended Events" section between Events and Archived Events, collapsed by default.
- **Updates:** Admins can quickly distinguish ended events from upcoming and archived ones in the Events list.

## 2026-03-12 – Admin event form: separate date & time
- `components/admin/event-form.tsx` – Replaced single `datetime-local` input with separate date and time inputs for the event start, while still combining them into one ISO-like field for saving.
- **Updates:** Admins now pick event dates using a calendar control and a dedicated time picker for start time.

## 2026-03-12 – Event cards: days until event
- `components/event-card.tsx` – Added helper to calculate months and days remaining until `event_start` and display it below the venue line in yellow (e.g., "1 Month 28 Days", "3 Months 1 Day" with correct singular/plural).
- **Updates:** Each event card now shows a yellow countdown-style label indicating how long before the event date.

## 2026-03-12 – Footer social links
- `components/footer.tsx` – Updated Facebook, X, and Instagram links to official Wish 107.5 profiles and replaced Twitter bird icon with an X mark inside a circular badge.
- **Updates:** Footer now points to real social channels with branding aligned to X (`https://www.facebook.com/WishFM1075`, `https://x.com/wish1075`, `https://www.instagram.com/wish1075/`).

## 2026-03-12 – Terms of Use page and footer
- `app/terms-of-use/page.tsx` – Added Terms of Use route metadata and page.
- `app/terms-of-use/terms-of-use-content.tsx` – Added full Terms of Use content per provided text.
- `components/footer.tsx` – New site footer with About, Customer Care, and Terms & Conditions columns, styled with Wish colors.
- `app/layout.tsx` – Wired the new footer into the root layout so it appears on all pages and updated layout to keep the footer pinned to the bottom of the viewport on short pages.
- **Updates:** Users can now read Terms of Use at `/terms-of-use`, access both Terms and Privacy Policy from the global footer, and see the footer consistently at the bottom of the page.

## 2026-03-12 – Privacy Policy page
- `app/privacy-policy/page.tsx` – Added Privacy Policy route metadata and page.
- `app/privacy-policy/privacy-policy-content.tsx` – Added full Privacy Policy content per updated policy text; later removed the “Contacting Us” section and renumbered Consent to section 10.
- `components/header.tsx` – Added “Privacy Policy” link to desktop and mobile navigation.
- `app/signup/page.tsx` – Added link to the full Privacy Policy from the signup Privacy Notice dialog.
- **Updates:** Users can view the full updated Privacy Policy at `/privacy-policy`.

## 2025-03-12 – Admin Dashboard: Card icons
- `app/admin/page.tsx` – Added icons to each dashboard card (Events, Venues, Producers, Reports, Refund lookup, Global Settings).
- `app/admin/page.tsx` – Removed numeric counts from dashboard cards (titles/icons only).
- `app/admin/page.tsx` – Removed Refund lookup subtitle text (“Payment ID for refunds”).
- **Updates:** Admin Dashboard cards now have clear visual identifiers.

## 2025-03-12 – Fix: ThemeProvider runtime crash
- `components/providers/theme-provider.tsx` – `useTheme()` now falls back to a safe default when rendered outside `ThemeProvider`, avoiding runtime crashes.
- **Updates:** Header/theme toggle no longer crashes with “useTheme must be used within ThemeProvider”.

## 2025-03-12 – Reports: Remove venue occupancy gauge
- `app/admin/reports/reports-page-client.tsx` – Removed Venue Occupancy gauge card; Sections with Highest Sales now spans full width.
- `components/admin/reports/sections-horizontal-bar.tsx` – Tooltip now shows only the percent + counts (removed “% Sold” label).
- `supabase/migrations/00148_total_projected_revenue.sql` – Dashboard data now includes `section_color` from `event_sections.color` in sections_sales and vss_breakdown.
- `hooks/use-dashboard-data.ts` – Added `section_color` to `SectionSales` and `VssBreakdown` types.
- `components/admin/reports/sections-horizontal-bar.tsx` – Bars now use each section’s configured color (fallback `#6b7280`).
- `components/admin/reports/vss-stacked-bar.tsx` – X-axis labels now use each section’s configured color (fallback `#6b7280`).
- **Updates:** Cleaner reports layout with a wider sales-by-section chart.

## 2025-03-12 – Reports: Amount Paid KPI card
- `components/admin/reports/kpi-cards.tsx` – Added "Amount Paid" card with total amount paid and percentage relative to Total Projected Revenue in yellow.
- `components/admin/reports/kpi-cards.tsx` – Reordered KPI cards so "Total Sold" appears immediately after "Total Capacity".
- **Updates:** New KPI shows gross revenue and its share of projected revenue.

## 2025-03-12 – Reports: Total Projected Revenue
- `supabase/migrations/00148_total_projected_revenue.sql` – New migration. Replace projected_total_gross with total_projected_revenue_cents: (capacity × price) − complimentary_value per section, summed.
- `hooks/use-dashboard-data.ts` – Add total_projected_revenue_cents to KPIs; add projected_revenue_cents to SectionRevenue.
- `components/admin/reports/kpi-cards.tsx` – Rename "Projected Total Gross" to "Total Projected Revenue"; use total_projected_revenue_cents.
- `components/admin/reports/section-revenue-table.tsx` – Add "Projected Revenue" column and total row.
- **Updates:** Reports show Total Projected Revenue based on seat pricing, grouped by section, minus complimentary ticket value.

## 2025-03-12 – Admissions: Content closer to header
- `app/admissions/scan/page.tsx` – justify-center → justify-start; reduced top padding (pt-4) so content sits closer to app ribbon.
- **Updates:** Main content moved towards top of page.

## 2025-03-12 – Admissions: Panels top-aligned
- `app/admissions/scan/page.tsx` – Changed lg:items-stretch to lg:items-start so scan and admitted panels align at top.
- **Updates:** Left and right panels now top-aligned.

## 2025-03-12 – Admissions: Header styling
- `app/admissions/scan/page.tsx` – Reduced "Admissions Control" size (text-xl); event title now yellow.
- **Updates:** Smaller header; event title in yellow.

## 2025-03-12 – Admissions: Scan section title
- `app/admissions/scan/page.tsx` – Two-line centered title: "Scan QR code with camera" / "or enter ticket code manually."
- **Updates:** Title split and centered.

## 2025-03-12 – Admissions: Refresh Scanner button position
- `app/admissions/scan/page.tsx` – Removed "Camera scanner" label; moved Refresh Scanner button to that position (above camera feed, left of Flip camera/Flip H).
- **Updates:** Cleaner layout with Refresh Scanner above the camera.

## 2025-03-12 – Reports: Admitted drilldown recipient name fallback
- `app/api/admin/dashboard/drilldown/route.ts` – For admitted metric, resolve recipient_name from tickets, admin_seat_assignments, or profiles.full_name (booking user).
- **Updates:** Recipient column now shows name when available from any source.

## 2025-03-12 – Reports: Individual delete admissions (admitted drilldown with ticket_id)
- `app/api/admin/dashboard/drilldown/route.ts` – For metric "admitted", use direct query instead of RPC so rows always include ticket_id and event_section_id.
- **Updates:** Individual Delete buttons now show in the Actions column; no migration required.

## 2025-03-12 – Reports: Fix delete admissions visibility
- `components/admin/reports/kpi-detail-modal.tsx` – Show "Delete all admissions" when rows.length > 0 (not only when ticket_ids present); add section_name fallback for "Delete section" when event_section_id missing.
- `app/api/admin/admissions/delete/route.ts` – Add section_name parameter to delete by section_label when event_section_id not available.
- **Updates:** Delete all and Delete section work without migration 00147; individual Delete still requires migration for ticket_id.

## 2025-03-12 – Reports: Admitted delete button and delete admissions (admin/super_admin)
- `supabase/migrations/00147_admitted_drilldown_ticket_id.sql` – Add ticket_id and event_section_id to admitted drilldown.
- `app/api/admin/admissions/delete/route.ts` – New API: delete admissions by ticket_ids, event_section_id, or delete_all.
- `app/admin/reports/page.tsx` – Add canDeleteAdmissions (admin/super_admin only).
- `app/admin/reports/reports-page-client.tsx` – Pass canDeleteAdmissions to KPICards.
- `components/admin/reports/kpi-cards.tsx` – Pass canDeleteAdmissions to KpiDetailModal.
- `components/admin/reports/kpi-detail-modal.tsx` – GroupedBySectionTable: add Delete (per row), Delete section, Delete all admissions buttons when canDeleteAdmissions.
- **Updates:** Admins and super admins see delete buttons in the Admitted modal: individual, per section, and delete all.

## 2025-03-12 – Admissions scan: pause scanner when dialog open
- `app/admissions/scan/page.tsx` – Add `stopDecoding={alertDialog.open || scanLoading}` to Scanner so decoding pauses while dialog or loading overlay is shown.
- **Updates:** Scanning stops when a dialog pops up and resumes when it closes.

## 2025-03-12 – Admissions scan: fix first-admission dialog not showing (z-index)
- `components/ui/dialog.tsx` – Add highZIndex prop to DialogContent.
- `components/ui/alert-dialog.tsx` – Use highZIndex so dialog appears above FloatingProgressBar (z-10000).
- `app/admissions/scan/page.tsx` – Show success dialog immediately (no setTimeout); dialog now renders above loading overlay.
- **Updates:** First-admission success dialog reliably appears above the loading overlay.

## 2025-03-12 – Admissions scan: remove cooldown, re-entry ready
- `app/admissions/scan/page.tsx` – Remove 5-second scan cooldown; scanner is immediately ready for new scan after closing success dialog.
- **Updates:** No delay between scans; re-entry success shows dialog; closing "Scan New" makes scanner ready right away.

## 2025-03-12 – Admissions scan: error dialogs and wrong-event message
- `app/admissions/scan/page.tsx` – Add dialogs for "Invalid or already used", "Request failed", and "Wrong event" (QR not for current event); remove inline error text.
- **Updates:** All error cases now use dialogs with "Scan another" button; specific message when ticket belongs to a different event.

## 2025-03-12 – Admissions scan: success and already-admitted dialogs
- `app/admissions/scan/page.tsx` – Show popup dialog on first-time admit success with "Scan New" button; show "Scan another" on already-admitted; add "Scan New" to re-entry success dialogs; remove inline success text.
- **Updates:** Success feedback is now via dialogs with contextual action buttons instead of toast/inline text.

## 2025-03-12 – Admissions scan: region filter and cooldown
- `app/admissions/scan/page.tsx` – Restrict QR scanning to the red finder region (center 70%); add 5-second cooldown after successful admit/re-entry.
- **Updates:** Only codes whose center falls inside the red outline are accepted; scanning is disabled for 5 seconds after a successful scan.

## 2025-03-12 – Admin events table: row hover yellow, loading progress on click
- `components/admin/events-table.tsx` – Add `group` and `group-hover:text-yellow-400` to event rows for yellow text on hover; use `useTransition` + `FloatingProgressBar` for loading overlay when clicking an event.
- **Updates:** Event row text turns yellow on hover; clicking an event shows "Loading event…" overlay until navigation completes.

## 2025-03-12 – Error boundaries and loading states
- `components/ui/route-loading.tsx` – New reusable loading shell (glass panel, progress bar)
- `components/ui/route-error.tsx` – New reusable error UI (client component, Try again + Back link)
- `app/error.tsx` – Root error boundary
- `app/loading.tsx` – Root loading state
- `app/admin/error.tsx` – Admin error boundary
- `app/admin/loading.tsx` – Admin loading state
- `app/[eventSlug]/error.tsx` – Event flow error boundary
- `app/[eventSlug]/loading.tsx` – Event flow loading state
- `app/dashboard/loading.tsx` – Dashboard loading state
- **Updates:** Route-level error boundaries and loading states for improved UX when routes fail or load.

## 2025-03-11 – Admin dashboard: card hover enlarge animation
- `app/admin/page.tsx` – Add `hover:scale-105 transition-all duration-200` to dashboard cards; add `group` and `group-hover:text-2xl/4xl group-hover:text-yellow-400` for text enlarge and yellow color on hover.
- **Updates:** Dashboard cards now scale up 5% on hover with smooth transition.

## 2025-03-11 – Admin dashboard: remove Ticket layout card
- `app/admin/page.tsx` – Removed Ticket layout card from dashboard grid; removed canManageTicketLayout.
- **Updates:** Ticket layout card no longer appears on the admin dashboard.

## 2025-03-11 – Admin events table: share button per event
- `components/admin/events-table.tsx` – Add Share column with Share2 icon button after Featured checkbox; uses Web Share API or clipboard fallback; toast on success.
- **Updates:** Each event row has a share button to copy or share the event link.

## 2025-03-11 – Event modal: image no longer clickable
- `components/event-card.tsx` – Removed PhotoView/PhotoProvider wrapper from event image; image is now static display only, no zoom/lightbox on click.
- **Updates:** Event image in modal is no longer clickable for zoom.

## 2025-03-11 – Event modal: description box 1/4 height at bottom
- `components/event-card.tsx` – Description box dynamic: sizes to content when short, max `max-h-[20vh]` (less than 1/4) when long, with `overflow-y-auto` for scrollbar.
- **Updates:** Description takes 1/4 of modal height at bottom; long text scrolls within the box.

## 2025-03-11 – Event modal: description spacing and scrollbar
- `components/event-card.tsx` – Description uses `whitespace-pre-wrap` to preserve newlines/paragraphs like the edit page; wrapped in scrollable container with glass styling.
- **Updates:** Modal description now matches edit page spacing (paragraph breaks) and scrolls when content is long.

## 2025-03-11 – Event modal: arrows to switch between video and image
- `components/event-card.tsx` – For events with both video and event image: add ChevronLeft/ChevronRight overlay buttons to switch between video and image; `mediaView` state; image uses object-contain when shown, object-cover as placeholder.
- **Updates:** Users can toggle between video and event poster image in the details modal via left/right arrows.

## 2025-03-11 – Event modal: larger description text
- `components/event-card.tsx` – Description paragraph changed from `text-sm` to `text-lg` with `leading-relaxed` for improved readability.
- **Updates:** Event details modal description text is now larger and easier to read.

## 2025-03-11 – Event details modal: full-screen + portrait/landscape adaptation
- `components/event-card.tsx` – Modal enlarged to 95vw×95vh; detect image/video orientation (onLoad for images, onLoadedMetadata for direct video); dynamic media container aspect ratio; portrait images use narrower modal (max-w min(95vw,55vh)); flex layout with object-contain for images.
- **Updates:** Event details modal now fits nearly the whole screen and adapts to portrait vs landscape media, eliminating empty space for portrait images.

## 2025-03-11 – Upscale small event images to required sizes
- `app/api/admin/upload/route.ts` – Remove `withoutEnlargement: true` and size guards; always resize full event images to target dimensions (landscape → 1920px wide, portrait → 1080px tall) so smaller uploads are upscaled.
- **Updates:** Small event images are now upscaled to the required sizes instead of being left as-is.

## 2026-03-12 – Remove upload limits; Sharp converts on upload
- `app/api/admin/upload/route.ts` – Event images: 25MB limit (was 2MB); Sharp converts thumbnails to 400×225 and full images per orientation; ticket-templates and seat-map-images keep 2MB.
- `components/admin/event-form.tsx` – Remove 2MB and dimension validation for event images; remove oversize and dimension AlertDialogs; update help text to describe Sharp conversion.
- **Updates:** Users can upload larger event images; Sharp converts on the server.

## 2026-03-12 – Sharp optimization for full event images
- `app/api/admin/upload/route.ts` – For full event images (event-images bucket, not thumbnail): landscape (width ≥ height) resize to max width 1920px; portrait resize to max height 1080px; maintain aspect ratio; output WebP quality 85; withoutEnlargement so small images are not upscaled.
- **Updates:** Full event page images are now optimized with Sharp; landscape max 1920px wide, portrait max 1080px tall.

## 2026-03-12 – Clickable event rows in admin
- `components/admin/events-table.tsx` – Remove Edit button; make entire event row clickable to navigate to edit page; add role="button", tabIndex={0}, keyboard support (Enter/Space); Featured checkbox stops propagation so it remains independently clickable.
- **Updates:** Users click anywhere on an event row to edit; cleaner UI.

## 2026-03-12 – Thumbnail images beside event names in admin
- `components/admin/events-table.tsx` – Add thumbnail_url/image_url to EventRow; display 64×40 thumbnail beside event title in the Title column; show placeholder when no image.
- **Updates:** Admin Events table now shows thumbnail images next to event names.

## 2026-03-12 – Thumbnail 400×225 validation and Sharp optimization
- `components/admin/event-form.tsx` – Add `checkImageDimensions` helper; validate thumbnail dimensions before upload (block if width > 400 or height > 225); show AlertDialog "Thumbnail too large" with actual dimensions; append `isThumbnail: "true"` to FormData; update help text to "400 × 225 px (16:9). Max 2MB."
- `app/api/admin/upload/route.ts` – When `isThumbnail` and bucket is event-images: resize with Sharp to 400×225 (fit: cover), output WebP quality 80, upload processed buffer.
- **Updates:** Thumbnails are limited to 400×225 px with client-side validation and server-side optimization.

## 2026-03-12 – Performance enhancements (LCP, CLS)
- `components/event-card.tsx` – Add width/height (400×225) to images for stable layout; decoding="sync" for priority image, "async" for others; h-full on Card for consistent grid row height.
- `components/event-grid.tsx` – Remove y-offset from motion animations (opacity-only) to reduce layout shift; items-stretch for consistent card heights; loading skeleton structure aligned with loaded state.
- **Updates:** LCP and CLS should improve; images reserve space before load; reduced motion-induced shifts.

## 2026-03-12 – AI bot answers About page content
- `app/api/chat/route.ts` – Add aboutPageContext to system message with full platform features (ticket selling, payment options, promo codes, event management, VIP distribution, reporting, admissions, producer tools, operational tools). AI can now answer questions about payment methods, features, and platform capabilities.
- `components/ai-chat.tsx` – Update hints and placeholder to mention platform features and payment.
- **Updates:** Visitors can ask the AI about GCash, PayMaya, promo codes, seat types, and other About page content.

## 2026-03-12 – About page redesign
- `app/about/about-content.tsx` – Redesigned for a more pleasing visitor experience: hero with "For event producers" badge and Wish orange accent; feature cards in a responsive grid with icons (Ticket, CreditCard, Tag, etc.); glass-style cards with hover states; orange bullet points; "Everything you need" section heading.
- **Updates:** About page is more visually engaging with icons, better hierarchy, and consistent design system.

## 2026-03-12 – Prioritize hero + background for instant homepage
- `app/page.tsx` – Remove server-side events fetch; page is now synchronous so hero text and shell render immediately.
- `app/layout.tsx` – Preload `/concert-bg.png` with `fetchPriority="high"` so background image loads with first paint.
- `app/home-client.tsx` – No longer receives initialEvents; EventGrid fetches client-side.
- `components/event-grid.tsx` – Add "Loading events…" text and animated progress bar above skeleton cards while events load.
- `components/preload-lcp-image.tsx` – Removed (no longer used; events load client-side).
- **Updates:** Visitors see hero + background instantly; events load below with loading progress indicator. EventGrid still uses `priority={true}` on first card for LCP when events load.

## 2026-03-11 – Section heading colors (Featured Event, Upcoming Events)
- `components/event-grid.tsx` – Featured Event: "Featured" orange, "Event" white; Upcoming Events: "Upcoming" orange, "Events" white.
- **Updates:** Section headings now use orange for the first word and white for the second.

## 2026-03-11 – Ticket template validation dialogs
- `components/admin/ticket-template-upload.tsx` – Add `AlertDialog` warnings when file exceeds 2 MB or when dimensions are not exactly 797 × 1500 px; show dimension dialog with actual vs required dimensions.
- **Updates:** Users get clear dialog warnings instead of toasts when upload fails validation.

## 2026-03-11 – Fix ticket template preview on Netlify production
- `lib/image-proxy.ts` – Add optional `noCache` param to `getProxiedImageUrl`; append `&nocache=1` when true.
- `app/api/image-proxy/route.ts` – When `nocache=1` in query, use `Cache-Control: no-store, no-cache, must-revalidate` instead of `max-age=86400`.
- `components/admin/ticket-template-upload.tsx` – Add `previewVersion` state (bumped on upload/remove); pass timestamp + `noCache: true` to `getProxiedImageUrl` so preview always fetches fresh.
- **Updates:** Ticket template preview now updates immediately on Netlify after replace; bypasses CDN/browser cache via timestamp cache-bust and no-cache proxy headers.

## 2026-03-11 – Fix ticket template preview overwrite after upload
- `components/admin/ticket-template-upload.tsx` – Removed `useEffect` that synced `url` from `initialUrl`; it was overwriting the newly uploaded URL with stale server data after `router.refresh()`, causing the preview to revert to the default template.
- **Updates:** Event-specific ticket template preview now correctly shows the uploaded image after replace; no longer reverts to default when router refreshes.

## 2026-03-11 – Fix ticket layout persistence on Netlify
- `app/api/admin/events/[id]/ticket-layout/route.ts` – Use `createAdminClient` for PATCH to bypass RLS; fixes event-specific layout not persisting.
- `app/api/admin/settings/route.ts` – Use `createAdminClient` for GET and PATCH (app_config) to bypass RLS; fixes global ticket layout not persisting on Netlify.
- `components/admin/ticket-layout-editor.tsx` – Add `router.refresh()` after successful save so parent re-fetches and UI reflects persisted state.
- **Updates:** Ticket layout (overlay positions) now persists to DB on Netlify; generated ticket PNGs use the saved layout instead of default.

## 2026-03-11 – Fix ticket template on Netlify deploy
- `app/api/admin/events/[id]/ticket-template/route.ts` – Use `createAdminClient` for PATCH to bypass RLS; fixes ticket template replace failing on Netlify (works on localhost, failed on production).
- `docs/NETLIFY_DEPLOY.md` – Added troubleshooting note for ticket template upload on Netlify; ensure `SUPABASE_SERVICE_ROLE_KEY` has Functions/Runtime scope.
- **Updates:** Event-specific ticket template replace now works on Netlify; PATCH no longer depends on user session/RLS which can behave differently in serverless.

## 2026-03-11 – Fix event-specific ticket template upload and preview
- `app/api/admin/upload/route.ts` – Use `createAdminClient` for storage upload to bypass RLS and ensure reliable file storage.
- `components/admin/ticket-template-upload.tsx` – Add `router.refresh()` after upload/remove, `useEffect` to sync `url` state with `initialUrl`, and cache-busting on preview image via `getProxiedImageUrl(url, url)`.
- **Updates:** Event-specific ticket template upload now displays the uploaded image in the preview instead of the default global template; state stays in sync with server data.

## 2026-03-11 – Admin Operating Instructions
- `docs/ADMIN_OPERATING_INSTRUCTIONS.md` – New admin guide covering setup sequence, event creation, seating, promo codes, admissions, reports, refunds, and quick reference paths.
- `README.md` – Added Documentation section with link to admin guide and other docs.
- **Updates:** Admins have a single reference for operating the app in the correct order.

## 2026-03-11 – Hydration warning: theme script + extensions
- `app/layout.tsx` – Added `suppressHydrationWarning` to the theme inline script so React does not warn when a browser extension (e.g. Exodus) mutates the head before hydration.
- **Updates:** Console hydration mismatch caused by extensions modifying the DOM is suppressed for the theme script.

## 2026-03-11 – LCP consistency: server hero + low-priority images
- `app/page.tsx` – Hero (h1 + tagline) is now server-rendered in the initial HTML so it paints first and wins LCP consistently.
- `app/home-client.tsx` – Renders only search, category pills, and EventGrid; hero moved to server page.
- `components/event-card.tsx` – Added `fetchPriority={priority ? "high" : "low"}` so non-priority images are deprioritized and hero stays LCP.
- **Updates:** LCP is more consistent; hero is the LCP element across runs. Event card images load with low priority and lazy loading.

## 2026-03-11 – Fix LCP: lazy-load event card images
- `components/event-grid.tsx` – Removed `priority` prop from all `EventCard` instances so event images use `loading="lazy"`; hero remains the LCP element and reports a lower LCP.
- **Updates:** Home LCP no longer dominated by the first event card image; hero title paints first for better Web Vitals.

## 2026-03-11 – Fix LCP: remove hero title glow
- `app/home-client.tsx` – Removed `drop-shadow-[0_0_18px_rgba(255,112,0,0.8)]` from the hero `<h1>` to improve Largest Contentful Paint; title keeps orange “Wish” and “Tickets Portal” styling.
- **Updates:** Home hero no longer uses a CSS filter on the LCP element, reducing LCP (previously ~12.34s in DevTools).

## 2026-03-11 – Website URL on global ticket layout
- `components/admin/ticket-layout-editor.tsx` – Added `website` region to layout config and REGIONS: draggable/resizable “Website” control; default position bottom-centered (top 1420, width 450, height 28).
- `lib/ticket-image.ts` – Added `website` to `TicketLayoutConfig` and default layout; render site URL (from `getSiteOrigin()`) as small centered text (11px, muted) in the website region when generating ticket images.
- **Updates:** Global ticket layout now includes a “Website” overlay; default placement is bottom-most, centered, smaller than price. Admins can move/resize it in Ticket layout or Global Settings → Ticket layout.

## 2026-03-11 – Beautify reservation number selectors
- `components/ui/number-stepper.tsx` – New reusable number stepper with glass styling, orange focus ring, and visible up/down chevron buttons (no native spinners).
- `app/admin/settings/seat-settings.tsx` – Replaced plain number inputs in Reservation config with `NumberStepper` for TTL, warn-before-expiry, and heartbeat divisor.
- **Updates:** Reservation config on Global Settings → Events Settings now uses consistent, themed number selectors with orange accent and visible increment/decrement controls.

## 2026-03-11 – Super admins can edit user display names (User Roles)

- `app/api/admin/users/[userId]/route.ts` – Added PATCH handler: super_admin only; accepts `full_name` (string or null) and updates `profiles.full_name`; emails are not editable via this API.
- `app/admin/settings/capability-matrix.tsx` – For super admins, the User column shows an editable name input and read-only email; added `nameEdits` state and save path so Save updates name when changed (with role/capabilities).
- **Updates:** In Global Settings → User Roles, super admins can edit user display names only; emails remain read-only.

## 2026-03-11 – Delete user (Super Admin only) in Global Settings → User Roles

- `app/api/admin/users/[userId]/route.ts` – New DELETE handler: super_admin only; cannot delete self or another super_admin; removes user from `user_capabilities`, `profiles`, and Supabase Auth via service role.
- `app/admin/settings/capability-matrix.tsx` – Added optional `currentUserId` prop; "Delete" column and button visible only to super_admins; button hidden for the current user and for super_admin rows; ConfirmDialog before delete; removes user from local state and refreshes on success.
- `app/admin/settings/page.tsx` – Passes `currentUserId={user.id}` to CapabilityMatrix.
- **Updates:** Super admins can permanently remove non–super-admin users from Global Settings → User Roles. Deletion removes the user from the database (profiles, user_capabilities) and from authentication. Super admins cannot delete themselves or other super admins.

## 2026-03-11 – Modal popups centered

- `components/ui/dialog.tsx` – Wrapped dialog content in a fixed full-viewport flex container (`fixed inset-0 flex items-center justify-center`) so the modal is centered in the viewport. Removed `slide-in-from-left-1/2` / `slide-in-from-top-[48%]` and `slide-out-to-*` animation classes that were overriding the centering transform and causing modals to appear in the upper-left. Kept fade and zoom-in/zoom-out only.
- **Updates:** All dialogs (event card modal, confirm dialogs, etc.) now open centered in the viewport instead of the upper-left.

## 2026-03-11 – Event card modal: Choose seats + Share event link

- `components/event-card.tsx` – Modal primary button set to "Choose seats" linking to `/[slug]/book`; added "Share event link" button (Web Share API or copy event details URL to clipboard with toast)
- **Updates:** From the card modal users go straight to seat selection; they can share the event details page link with others

## 2026-03-11 – Background image center + opacity

- `components/background-image.tsx` – Concert background positioned at `center 50%` with `opacity-90` so the stage is centered and more visible behind the app
- **Updates:** Main app background image is centered better and appears at roughly 90% opacity

## 2026-03-11 – Hero title size + glow

- `app/home-client.tsx` – Increased hero title to `text-5xl md:text-6xl` and added a subtle orange drop-shadow glow to “Wish Tickets Portal”
- **Updates:** Main heading is larger and has a soft orange glow, improving prominence against the dark background

## 2026-03-11 – Event card format and lowest price

- `app/api/events/route.ts` – List response now includes `min_price_cents` per event; batch-fetches event_prices and early_bird_prices, computes effective minimum (early bird aware), and normalizes missing pricing to 0 so cards still show a price
- `lib/types.ts` – Event type includes optional `min_price_cents`
- `lib/events.ts` – Server-side events list (home page initial load) computes `min_price_cents` with the same logic and normalizes missing pricing to 0
- `components/event-card.tsx` – Card layout: Title, (Calendar) Date, (Clock) Time, (MapPin) Location, “Starting from”, lowest price in PHP; when the cheapest section is free or no prices are configured, shows “Starting from ₱0.00”
- `components/event-card-skeleton.tsx` – Skeleton updated to match new card layout (title, 3 meta lines, “Starting from” + price placeholders)
- **Updates:** All event cards use a consistent format with date/time/location on separate lines and always show “Starting from” + a numeric lowest ticket price (including ₱0.00 when free or unpriced)

## 2026-03-11 – Event thumbnail + full image

- `supabase/migrations/00146_events_thumbnail_url.sql` – Added events.thumbnail_url; backfilled from image_url; updated update_admin_event to accept thumbnail_url
- `app/api/admin/events/route.ts` – Accepts thumbnail_url when creating events; defaults thumbnail to image when not provided
- `app/api/admin/events/[id]/route.ts` – PATCH supports thumbnail_url and passes it to update_admin_event
- `lib/types.ts` – Event type includes thumbnail_url
- `components/admin/event-form.tsx` – Separate upload/URL inputs for thumbnail (cards) and full image (event page); shows warning dialog when uploaded image exceeds 2MB
- `components/event-card.tsx` – Uses thumbnail_url ?? image_url for 16:9 card thumbnails
- `app/[eventSlug]/event-page-content.tsx` – Uses image_url ?? thumbnail_url as full event image, with existing portrait-aware layout
- **Updates:** Admins can manage distinct thumbnail and full images per event; cards always use the thumbnail, event page shows full image with graceful fallback

## 2026-03-11 – Force 16:9 event card thumbnails

- `components/event-card.tsx` – Removed portrait detection and forced 16:9 (`aspect-video`) thumbnails for all event cards
- **Updates:** Event cards always display in 16:9; portrait images are cropped to fit

## 2026-03-11 – Reports: amount paid per section, distributed/complimentary value

- `supabase/migrations/00145_reports_section_revenue.sql` – Extended get_admin_dashboard_metrics with section_revenue: amount_paid_cents (allocated from bookings), distributed_value_cents, complimentary_value_cents (price × count per section)
- `hooks/use-dashboard-data.ts` – Added SectionRevenue interface and section_revenue to DashboardData
- `components/admin/reports/section-revenue-table.tsx` – New table: Amount Paid & Value by Section
- `app/admin/reports/reports-page-client.tsx` – Added SectionRevenueTable to reports layout
- **Updates:** Reports show amount paid per section and face value of distributed/complimentary tickets based on section prices

## 2026-03-11 – Event grid 4 cards per row

- `components/event-grid.tsx` – Switched from CSS columns to CSS grid; 4 columns on large screens (lg:grid-cols-4)
- `app/home-client.tsx` – Added max-w-7xl to container for wider layout
- **Updates:** Event cards display 4 per row on desktop with proper grid layout (no compression)

## 2026-03-11 – Reduce side margins for event cards

- `app/home-client.tsx` – Container: max-w-[98%], xl:max-w-[1600px], reduced horizontal padding (px-2 sm:px-3)
- **Updates:** Less margin on sides so event cards spread across more of the viewport

## 2026-03-11 – Further reduce margins, enlarge cards

- `app/home-client.tsx` – max-w-[99%], xl:max-w-[1800px], px-1 sm:px-2
- `components/event-grid.tsx` – gap-5 instead of gap-6
- **Updates:** Tighter margins, wider container, slightly smaller gaps for larger cards; 4 per row unchanged

## 2026-03-11 – Privacy notice checkbox on sign-up

- `app/signup/page.tsx` – Added required checkbox “I agree to the Privacy Notice”; link opens dialog with full notice; both Google and email sign-up disabled until agreed
- **Updates:** Users must agree to the privacy notice before creating an account

## 2026-03-11 – Remove category badges from event cards

- `components/event-card.tsx` – Removed purple category badge from card image overlay
- **Updates:** Event cards no longer show category text (e.g. "Shows & Concerts"); Early Bird Promo badge unchanged

## 2026-03-11 – Title font and Wish Color Orange

- `app/layout.tsx` – Added Montserrat font (weight 600, 700) as `--font-display`
- `app/globals.css` – Updated `--wish-orange` to `#FF7000`; added `--font-display` to theme
- `app/home-client.tsx` – Hero title: "Wish" in orange, "Tickets Portal" in white; Montserrat, bold, uppercase
- `components/event-grid.tsx` – "Featured Events" and "Upcoming Events" headings: first word white, second word orange; same display font
- **Updates:** Titles use Montserrat display font; Wish Color Orange set to `#FF7000` per reference

## 2026-03-11 – Event card style and hover glow

- `components/event-card.tsx` – Card styling: solid orange outline via box-shadow, glow, genre badge (top-left), primary title (bold) + secondary venue (orange); removed card scale on hover; added slow image zoom (duration-700) on hover; enforce 16:9 for landscape images, 9:16 for portrait images
- **Updates:** Event cards keep static size on hover; image zooms slowly inside; image containers use only 16:9 or 9:16 aspect ratios based on image orientation

## 2026-03-11 – Events sorted by date (left to right)

- `components/event-grid.tsx` – Sort featured and upcoming events by event_start ascending; removed portrait-first sorting
- **Updates:** Events display in chronological order, left to right, top to bottom

## 2026-03-11 – Black gradient below card image

- `components/event-card.tsx` – Added black gradient overlay at bottom of image area (transparent to 50%, then to black/60%)
- **Updates:** Image blends softly into dark card body with gradient overlay

## 2026-03-11 – Concert stage background, fit width

- `public/concert-bg.png` – Replaced with concert stage image
- `components/background-image.tsx` – Use concert-bg.png with backgroundSize 100% auto (fit width)
- **Updates:** Page background uses concert stage image, scaled to fit viewport width

## 2026-03-11 – Yellow outline/glow for early bird promo cards

- `components/event-card.tsx` – Cards with active early bird promo use yellow (rgba 255,191,0) outline and hover glow instead of orange
- **Updates:** Early bird promo events visually distinguished with yellow halo

## 2026-03-11 – Delete Template button in Load Seats Template modal

- `app/api/admin/seat-templates/[id]/route.ts` – Added DELETE handler for seat templates
- `components/admin/seat-configurator.tsx` – Added Delete Template button with confirmation dialog in Load Seats Template modal
- **Updates:** Users can delete seat templates from the Load Seats Template modal after confirming in a destructive-styled dialog

## 2026-03-11 – Fix Netlify build type error (searchParams)

- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – Typed fallback for searchParams so `fromPayment` access is valid
- **Updates:** Resolves "Property 'fromPayment' does not exist on type '{}'" build failure

## 2026-03-11 – Fix broken header icon

- `public/logo.png` – Added dedicated logo file (copy of icon.png) to avoid Next.js metadata route conflict
- `components/header.tsx` – Switched header logo from `/icon.png` to `/logo.png`, added `unoptimized` prop
- **Updates:** Header logo now loads correctly by using a distinct path and bypassing Image optimization

## 2026-03-11 – Favicon and app icon from Wish Ticket assets

- `app/icon.png` – Replaced dynamic icon with static Wish Ticket icon (32x32)
- `app/apple-icon.png` – Apple touch icon from Wish Ticket assets
- `app/icon.tsx` – Deleted (replaced by static icon)
- `app/favicon.ico` – Deleted (icon.png used for favicon)
- `app/layout.tsx` – Added explicit icons metadata
- `components/header.tsx` – Replaced Lucide Ticket icon with Wish Ticket image (/icon.png) in header logo
- **Updates:** Favicon, app icon, and header logo now use the Wish Ticket design (ticket with star)

## 2026-03-11 – Print Tickets: Send all Selected, rename section button

- `components/admin/print-tickets-tab.tsx` – Added "Send all Selected" button between Generate and Delete; enabled when any section has generated tickets; sends ALL generated tickets in every section to one email; renamed section "Send all" to "Send selected section tickets"
- `app/api/admin/print-tickets/send-selected-email/route.ts` (new) – API to send tickets (sections or seats) to one recipient email
- **Updates:** "Send all Selected" now enabled when tickets exist; sends all generated tickets across all sections

## 2026-03-11 – Forgot password and reset password flow

- `app/login/page.tsx` – Added "Forgot password?" link next to password label
- `app/forgot-password/page.tsx` – New page: user enters email, receives reset link via Supabase `resetPasswordForEmail`; redirects to `/auth/callback?next=/reset-password`
- `app/reset-password/page.tsx` – New page: user sets new password after clicking email link; validates session, calls `updateUser({ password })`; shows "Invalid or expired link" if no session
- **Updates:** Full forgot/reset password flow; ensure `https://your-domain.com/auth/callback` is in Supabase Auth → URL Configuration → Redirect URLs

## 2026-03-11 – Disable toast notifications

- `lib/toast.ts` (new) – No-op toast module; all toast calls are silenced
- `app/layout.tsx` – Removed ThemeAwareToaster
- Replaced `import { toast } from "sonner"` with `import { toast } from "@/lib/toast"` across 40+ files
- **Updates:** All toast notifications disabled; calls remain in code but show nothing

## 2026-03-11 – Personal settings: edit name, change password

- `app/dashboard/settings/user-settings-form.tsx` – Added "Personal" section (display name, email); added "Change password" section with new/confirm password fields; uses Supabase `auth.updateUser({ password })`
- `app/dashboard/settings/page.tsx` – Title updated to "Personal Settings"
- `app/dashboard/page.tsx` – Added "Personal settings →" link in dashboard header
- `components/header.tsx` – Added "Personal settings" link to user dropdown (desktop and mobile)
- **Updates:** Users can edit their display name and change their password from Personal settings

## 2026-03-11 – Homepage: masonry layout for mixed portrait/landscape cards

- `components/event-grid.tsx` – Switched from grid to CSS columns (masonry); portrait cards sorted first so 2 landscape cards fill space beside them; `onImageLoad` tracks orientation per event
- `components/event-card.tsx` – Added optional `onImageLoad` callback for orientation detection
- **Updates:** Portrait and landscape event cards pack efficiently; blank space below landscape cards is filled by adjacent column items

## 2026-03-11 – Event poster: portrait layout arrangement

- `app/[eventSlug]/event-page-content.tsx` – Portrait image uses intrinsic sizing (`max-h-[55vh]`, no fixed container height); container has `self-start` so it aligns with details; removes empty gray area below portrait images
- **Updates:** Portrait event images size to content with no wasted space; image and details align cleanly

## 2026-03-11 – Event page: portrait layout and click-to-enlarge

- `app/[eventSlug]/event-page-content.tsx` – New client component; detects portrait images via onLoad; when portrait, places description/details/buttons to the right of image; image uses intrinsic sizing; PhotoView for click-to-enlarge
- `app/[eventSlug]/page.tsx` – Uses EventPageContent; widened to max-w-5xl for side-by-side layout
- **Updates:** Portrait event images show with content beside them; image is clickable to enlarge (react-photo-view)

## 2026-03-11 – Event form: Save changes stays on page

- `components/admin/event-form.tsx` – Save changes no longer redirects to events list; stays on event edit page and refreshes; Create event still redirects to new event's edit page
- **Updates:** Editing an event and clicking Save changes keeps you on the Event Details page

## 2026-03-11 – Event Card: fix portrait crop when event has teaser video

- `components/event-card.tsx` – Container now uses flexible min-h when showing image (not aspect-video); previously events with both image and teaser video were forced into 16:9, cropping portrait images
- **Updates:** Portrait event images now display fully even when the event has a YouTube/teaser video

## 2026-03-11 – Event Card: adapt to image ratio (remove h-full)

- `components/event-card.tsx` – Removed h-full from Card so each card sizes to its image's intrinsic aspect ratio
- **Updates:** Event cards fully adapt to image ratio without stretching to match row height

## 2026-03-11 – Event form: click event image to enlarge (react-photo-view)

- `components/admin/event-form.tsx` – Wrapped event image preview in PhotoProvider/PhotoView; clicking the thumbnail opens lightbox
- **Updates:** Admin can click the event image thumbnail to view it enlarged

## 2026-03-11 – Event Card: portrait image support with adaptive aspect ratio

- `components/event-card.tsx` – Card thumbnail uses intrinsic `<img>` (w-full h-auto) so portrait images display fully; video teasers keep aspect-video; dialog image uses object-contain
- `components/event-grid.tsx` – Added items-start to grid so variable card heights align to top
- `app/[eventSlug]/page.tsx` – Hero image uses object-contain for full portrait display
- **Updates:** Event cards now accept portrait images and adjust height to image ratio; masonry-style layout

## 2026-03-11 – Seat Selector Setup: Shift + arrow keys move by 10px

- `components/admin/seat-selector-setup.tsx` – Arrow keys move selected seats by 1px; Shift + arrow keys move by 10px
- **Updates:** Faster positioning when holding Shift while using arrow keys

## 2026-03-11 – Refresh Seats button on book page

- `app/[eventSlug]/book/book-page-client.tsx` – Added "Refresh Seats" button beside "← Back to events"; light green styling (emerald-400)
- **Updates:** Buyers can refresh seat availability and reservation timer status in-place

## 2026-03-11 – Canvas card header: per-section format

- `app/[eventSlug]/book/book-page-client.tsx` – Card header for multi-section canvases shows each section as color swatch + "Section Name - Price - Left Seats", with swatch directly to the left of each section name
- **Updates:** Each color swatch is now placed immediately before its section name (e.g. [Blue] S1 - P300.00 - 15 left / [Red] S2 - P600.00 - 22 left)

## 2026-03-11 – New section: Show seat selection off by default

- `app/api/admin/events/[id]/seating/sections/route.ts` – POST create section: default show_seat_selection to false; accept optional show_seat_selection in body; return show_seat_selection in select
- **Updates:** Newly created sections in Seat Configurator have "Show seat selection" switch off by default (buyer sees grid until turned on)

## 2026-03-11 – Global Settings tabs match Event edit tabs style

- `app/admin/settings/page.tsx` – TabsList uses same styling as EditEventTabs: rounded-lg border glass, bg-white/5 container, orange text, active bg-white/10, grid layout with wrap
- **Updates:** Global Settings tabs now match Event Details tab colors, box type, and preferences

## 2026-03-11 – Event Details card centered and wider

- `components/admin/event-form.tsx` – Event form card: max-w-4xl → max-w-6xl, added mx-auto so the card is centered on screen and wider
- **Updates:** Admin Event Details card is now centered and uses more horizontal space (max-w-6xl)

## 2026-03-11 – Countdown timer in payment modal

- `app/[eventSlug]/checkout/checkout-content.tsx` – Show reservation countdown (time remaining) inside the payment modal below the "Complete your payment" header, same styling as cart timer; reduced padding (py-2 px-3) and gap in countdown card to cut negative space; reduced iframe area min-height (60vh → 42vh), added max-h-[55vh], and tightened gap below timer to reduce empty space in the card; timer card made minimal (py-1 px-2, w-fit) so it sizes to text only, and wrapped with iframe in a single flex column with gap-2 to remove excess negative space below timer
- **Updates:** Users see the countdown while completing PayMongo payment; timer card is compact and negative space below it is minimal

## 2026-03-11 – Reservation timer count size matches cart total

- `components/booking/reservation-timer.tsx` – Timer count and clock icon use text-2xl / h-6 w-6 to match the “Total” price text size in the cart
- **Updates:** Reservation countdown (e.g. 13:13) now matches the visual size of the cart total (e.g. Total: P300.00)

## 2026-03-11 – Buyer page: seat settings and canvas grouping

- `app/[eventSlug]/book/book-page-client.tsx` – Fallback: when canvases array is empty but sections have seat_layout_canvas_id, group sections by canvas on the client so admin canvas grouping still appears on buyer page
- `supabase/migrations/00144_availability_column_direction.sql` – get_event_availability returns column_direction on sections for grid display order
- `components/seat-picker/seat-selector.tsx` – SectionInfo.column_direction; seatsByRow reverses row order when right-to-left; SetupStyleCanvas uses backgroundScale
- `app/[eventSlug]/book/book-page-client.tsx` – SectionInfo.column_direction for availability response
- **Updates:** Seat settings (column_direction, backgroundScale) from admin now carry to buyer page. Grid sections show right-to-left order when configured. Canvas scale applied in map view.

## 2026-03-11 – Seat Selector Setup: fix drag release position

- `components/admin/seat-selector-setup.tsx` – Fixed handleDragEnd delta conversion: use delta/displayScale instead of delta/displayScale * scaleToLogical (was over-correcting and causing seats to snap to wrong position on release)

## 2026-03-11 – Seat Selector Setup: Marquee enabled by default, seats draggable

- `components/admin/seat-selector-setup.tsx` – marqueeMode initial state set to true; marquee overlay z-index lowered to 0, seats wrapper z-index 10 so seats receive pointer events and remain draggable when Marquee is on

## 2026-03-11 – Fix "Failed to load seating": canvasesData used before initialization

- `components/admin/seat-selector-setup.tsx` – Moved `canvasesData` declaration before use in `canvasById` (was causing ReferenceError in fetchSeating)

## 2026-03-11 – Admin Seat Selector Setup: canvas background for sections

- `components/admin/seat-selector-setup.tsx` – When building sectionLayouts, use canvas image_url/scale/opacity for sections that have seat_layout_canvas_id; always show "Add canvas" button (was hidden when no canvases existed); add full toolbar to canvas cards: Marquee, Align, Dist H, Dist V, Grid, Zoom, Pan, Drag (same as section cards)
- `supabase/migrations/00142_availability_canvas_background.sql` – get_event_availability uses canvas image when section has seat_layout_canvas_id (buyer seat picker)
- **Updates:** Admin and buyer both show the canvas background image when a section is assigned to a canvas. Admin: sectionLayouts now derives from canvas when section has seat_layout_canvas_id.

## 2026-03-08 – Seat Selector Setup: fix getCanvasScaleToLogical before initialization

- `components/admin/seat-selector-setup.tsx` – Moved `getCanvasCanvasSize`, `getCanvasUniformScale`, `getCanvasScaleToLogical` above marquee useEffect and handleDragEnd to fix ReferenceError
- **Updates:** Resolved "Cannot access 'getCanvasScaleToLogical' before initialization" runtime error.

## 2026-03-10 – Manual Distribution: collapsed sections, Select all / Deselect All

- `components/seat-picker/seat-map.tsx` – Added `defaultCollapsed` prop; added `onSectionSelectionToggle` and "Select all / Deselect All" button per section
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` – Pass `defaultCollapsed` and `handleSectionSelectionToggle` to SeatMap
- **Updates:** Section cards default to collapsed; each section has one toggle button to select or deselect all available seats.

## 2026-03-10 – Seat Selector Setup: arrow keys move selected seats 1px

- `components/admin/seat-selector-setup.tsx` – Added `moveSelectedSeatsBy(dx, dy)` callback; extended keydown handler for ArrowLeft/Right/Up/Down to move selected seats by 1px (skipped when focus is in input/textarea/select)
- **Updates:** Arrow keys now move selected seats 1 pixel per keypress; Ctrl/Cmd+Z still undoes.

## 2026-03-10 – Admin event tabs: FloatingProgressBar on tab click and tab load

- `components/admin/edit-event-tabs.tsx` – useTransition for tab switch; FloatingProgressBar when isPending
- `components/admin/seat-configurator.tsx` – FloatingProgressBar when loading seating
- `components/admin/seat-selector-setup.tsx` – FloatingProgressBar when loading seating data
- `components/admin/reserved-seats-tab.tsx` – FloatingProgressBar when loading reserved seats
- `components/admin/event-promo-codes.tsx` – FloatingProgressBar when loading promo codes
- `components/admin/event-admissions-codes.tsx` – FloatingProgressBar when loading admissions codes
- `components/admin/event-administrators.tsx` – FloatingProgressBar when loading administrators
- `components/admin/print-tickets-tab.tsx` – FloatingProgressBar when loading sections
- **Updates:** Tab clicks and tab content loads now show a full-viewport progress overlay instead of inline "Loading..." text.

## 2026-03-10 – LCP: defer background to shift LCP to event cards

- `components/background-image.tsx` – Set `fetchPriority="low"` on background image
- `app/layout.tsx` – Remove preload for concert-bg.webp
- **Updates:** Background no longer competes for LCP; first event card image becomes LCP element.

## 2026-03-08 – Improve LCP (Largest Contentful Paint) performance

- `lib/events.ts` (new) – Shared `getEventsList()` for server-side event fetching
- `app/page.tsx` – Convert to server component; fetch initial events on server
- `app/home-client.tsx` (new) – Client component with search/category state; receives `initialEvents`/`initialTotal`
- `components/event-grid.tsx` – Accept `initialEvents`/`initialTotal`; use as `initialData` in `useInfiniteQuery` when category=all and search empty
- `components/background-image.tsx` – Use `<picture>` with WebP primary, PNG fallback; native `img` for format selection
- `app/layout.tsx` – Preload `concert-bg.webp`; add `display: "swap"` to Geist and Geist_Mono fonts
- `scripts/generate-concert-bg-webp.js` (new) – Sharp script to generate WebP from PNG
- `public/concert-bg.webp` (new) – WebP variant (~58% smaller than PNG)
- **Updates:** Server-render initial events on homepage, WebP background, font-display swap to reduce LCP from ~2.79s.

## 2026-03-10 – Seat selector: sold tickets white for better distinction

- `components/seat-picker/seat-selector.tsx` – Sold seats: white background
- `components/seat-picker/seat-map.tsx` – Same styling for sold seats in grid layout
- **Updates:** Sold tickets in the buyer seat selector are now white so available seats (colored by section) stand out clearly.

## 2026-03-10 – View tickets: only open tickets, do not send email

- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – Call confirmBooking only when `fromPayment=1` query param is present (arrival from payment flow). Dashboard "View tickets" uses plain URL, so no email is sent.
- `app/[eventSlug]/checkout/checkout-content.tsx` – Add `?fromPayment=1` to all redirects to confirmation (on-site, direct, poll success, Go to confirmation page links).
- `app/[eventSlug]/payment-return/[bookingId]/page.tsx` – Add `?fromPayment=1` when redirecting to confirmation.
- **Updates:** Clicking "View tickets" from the dashboard now only opens the tickets page; it no longer triggers sending a ticket email. Email is still sent when arriving from payment (checkout, PayMongo return, status poll).

## 2026-03-10 – App-wide loading progress audit and implementation

- **Phase A – FloatingProgressBar:** Added to user-settings-form, user-settings (admin), capability-matrix, seat-settings, events-settings, seat-pricing, event-form (loading/uploading), venue-form, producer-form, login, signup, failed-recheck, book-page-client (isProceedingToCheckout), ConfirmDialog
- **Phase B – NavButtonWithProgress:** Replaced Links in checkout, confirmation, book page (Back to events), assign-seats, admin events/venues/producers/settings/ticket-layout/refund-lookup, dashboard, dashboard-bookings, admissions scan/login, failed-recheck, confirmation-refresh
- **Phase C:** AdminCardLink now uses useTransition + FloatingProgressBar for navigation; producer-form and venue-form Back links use NavButtonWithProgress
- **Updates:** All forms and actions that block interaction now show FloatingProgressBar; key navigation links show loading overlay during route transitions.

## 2026-03-10 – Loading progress for View Event Details and Choose seats

- `components/ui/nav-button-with-progress.tsx` (new) – Reusable button that shows FloatingProgressBar during navigation
- `components/event-card.tsx` – Replace "View Event Details" Link with NavButtonWithProgress
- `app/[eventSlug]/event-page-actions.tsx` (new) – Client component for "Back to Events" and "Choose seats" with loading progress
- `app/[eventSlug]/page.tsx` – Use EventPageActions instead of Button+Link
- **Updates:** Clicking "View Event Details", "Choose seats", or "Back to Events" now shows a full-viewport loading overlay so users see feedback while navigation is in progress.

## 2026-03-10 – Event card video auto-unmute (YouTube)

- `components/event-card.tsx` – Use YouTube IFrame API for modal; call unMute() on player ready so video auto-unmutes when modal opens (user click counts as gesture); Vimeo keeps iframe + click-to-unmute overlay
- **Updates:** YouTube videos in the event details modal now unmute automatically when the player loads; no "Click to unmute" overlay for YouTube.

## 2026-03-10 – Restore background image (blob removed)

- `components/background-image.tsx` (new) – Concert background image only; no animated blobs; theme-aware opacity and overlay
- `app/layout.tsx` – Add BackgroundImage component and preload for concert-bg.png
- `public/concert-bg.png` – Restored (concert atmosphere image)
- **Updates:** Background image restored; animated gradient blobs remain removed.

## 2026-03-10 – Remove blob, progressive card loading

- `app/layout.tsx` – Remove BlobsBackground and concert-bg preload
- `components/event-grid.tsx` – Add Framer Motion staggered reveal (opacity, y) for featured and upcoming event cards; 60ms delay between cards
- `components/blobs-background.tsx` – Deleted
- `public/concert-bg.png`, `public/concert-bg.webp` – Deleted
- **Updates:** Background blob removed; event cards now appear one by one with a progressive reveal animation.

## 2026-03-10 – App load performance optimization

- `app/layout.tsx` – Preload concert-bg.webp for faster LCP
- `components/blobs-background.tsx` – Use picture element with WebP (27KB) + PNG fallback; fetchPriority="high"
- `public/concert-bg.webp` (new) – WebP variant of concert-bg.png (Sharp, quality 80)
- `next.config.ts` – Add images.remotePatterns for Supabase storage, Unsplash
- `components/event-card.tsx` – Replace raw img with Next.js Image (fill, sizes, priority prop for first card)
- `components/event-grid.tsx` – Pass priority to first visible EventCard; min-h-[600px] for layout stability
- `app/api/image-proxy/route.ts` – Increase Cache-Control max-age from 300 to 86400 (24h)
- **Updates:** Addresses poor LCP (8.28s) and CLS (0.48) via preload, WebP background, optimized event images, and longer image cache.

## 2026-03-08 – Generate beautiful About PPT

- `scripts/generate-about-ppt.js` (new) – PptxGenJS script to generate Wish_Ticket_Portal_Features_for_Producers.pptx with dark theme, Wish orange accents, 11 slides (title + 9 features + thank you)
- `package.json` – Add `generate:about-ppt` script; add pptxgenjs devDependency
- **Updates:** Run `npm run generate:about-ppt` to create a polished PowerPoint in `public/` with exact About page content.

## 2026-03-08 – About page big scrollable layout

- `app/about/about-content.tsx` – Single-column full-width cards, larger typography (h1 5xl–7xl, bullets md:text-lg), increased spacing (gap-12–16, py-20–32), min-h-screen for scrollable page

## 2026-03-08 – About page PPT content

- `app/about/about-content.tsx` – Replace generic content with exact PPT content from Wish_Ticket_Portal_Features_for_Producers.pptx (10 slides: overview + 9 feature sections)
- `app/about/page.tsx` – Update metadata description to reflect producer-focused features
- **Updates:** About page now displays comprehensive producer features: sell tickets, payment options (PH-ready), promo codes, event management, VIP distribution, insights & reporting, admissions, producer profiles, and operational tools.

## 2026-03-08 – Event modal video display fix (YouTube iframe)

- `components/event-card.tsx` – Replace YouTube IFrame API with simple iframe embed for event modal; add click-to-unmute overlay for YouTube/Vimeo
- **Updates:** Video now displays reliably in the event details modal. Audio was playing but video was not rendering with the IFrame API; iframe embed fixes this. User clicks overlay to unmute, then can click the video to unmute (YouTube native behavior).

## 2026-03-07 – Revert favicon and app icon to ticket icon

- `app/icon.png` – Deleted
- `app/apple-icon.png` – Deleted
- **Updates:** Favicon and app icon reverted to the dynamic orange ticket icon from `app/icon.tsx`.

## 2026-03-07 – YouTube unmute on play in event modal

- `components/event-card.tsx` – Use YouTube IFrame API to unmute when video plays; add click-to-unmute overlay fallback
- `lib/utils.ts` – Add `getYouTubeVideoId()` helper
- `youtube.d.ts` (new) – TypeScript declarations for YouTube IFrame API
- **Updates:** YouTube video in event details modal now unmutes automatically when playback starts; if blocked by browser, user can click overlay to unmute.

## 2026-03-07 – YouTube autoplay in event modal

- `components/event-card.tsx` – Change modal embed from `mute=0` to `mute=1` so YouTube autoplays (browsers block unmuted autoplay)
- **Updates:** YouTube/Vimeo in event details modal now autoplays muted when card is clicked; user can unmute.

## 2026-03-07 – Netlify secrets scanning

- `app/admin/settings/paymongo-settings.tsx` – Remove placeholder strings that match secret patterns (sk_test_, sk_live_, whsec_) to avoid false positives
- `netlify.toml` – Expand SECRETS_SCAN_OMIT_KEYS; add troubleshooting comment
- **Updates:** Reduce Netlify secrets scan false positives from PayMongo placeholder text.

## 2026-03-07 – Light theme readability (Choose seats)

- `components/seat-picker/section-picker.tsx` – Replace `text-violet-200` with `text-foreground` / `text-foreground-muted`; `bg-neutral-900` with `bg-[var(--surface)]`
- `app/[eventSlug]/book/book-page-client.tsx` – Replace `text-violet-200` with `text-foreground-muted`; `border-white/20`, `border-white/15`, `hover:bg-white/10` with theme-aware vars
- **Updates:** Section labels (VIP, GenAd, etc.) and price text now readable in light theme.

## 2026-03-07 – Light/Dark theme switch

- `supabase/migrations/00140_profiles_theme_preference.sql` (new) – Add `theme_preference` column to profiles
- `app/api/profile/theme/route.ts` (new) – PATCH endpoint to update user theme preference
- `components/providers/theme-provider.tsx` (new) – Theme context with localStorage + DB persistence for logged-in users
- `components/theme-aware-toaster.tsx` (new) – Sonner Toaster that follows current theme
- `app/globals.css` – Light theme vars (`[data-theme="light"]`), `--surface`, `--glass-light-*`, `--scrollbar-*`; theme-aware `.glass-light`, `.seat-selector-scroll`
- `app/layout.tsx` – Inline script for no-flash theme init; ThemeProvider; remove hardcoded `className="dark"`
- `components/header.tsx` – Theme toggle (Sun/Moon) in nav and mobile menu
- `components/blobs-background.tsx` – Theme-aware opacity and overlay for light mode
- 80+ components/pages – Replace `text-white`, `text-neutral-*`, `bg-neutral-800` with `text-foreground`, `text-foreground-muted`, `bg-[var(--surface)]`
- **Updates:** Light/dark theme toggle with user preference persisted (localStorage for anonymous, profiles.theme_preference for logged-in). Default theme for public is dark.

## 2026-03-07 – Event grid loading skeletons

- `components/event-card-skeleton.tsx` (new) – Skeleton card matching EventCard layout with shimmer and per-card progress bar
- `components/event-grid.tsx` – Use EventCardSkeleton during initial load; show 6 cards in Featured + Upcoming sections
- `app/globals.css` – Add `@keyframes shimmer` and `.animate-shimmer` for skeleton shimmer effect
- **Updates:** First-time page load shows card-shaped skeletons with shimmer and orange progress bar per card instead of empty rectangles.

## 2026-03-05 – SMTP Control Panel (super_admin only)

- `lib/smtp-config.ts` (new) – `getSmtpCredentials()` reads smtp_user, smtp_pass, smtp_from from `app_config`, fallback to env vars
- `app/api/admin/settings/route.ts` – GET masks smtp_user and smtp_pass; PATCH accepts smtp_user, smtp_pass, smtp_from
- `app/admin/settings/email-ticket-settings.tsx` – SMTP credentials section at top of Email & Tickets tab
- `lib/email.ts` – Use `getSmtpCredentials()` and create transporter per send; remove top-level transporter
- `app/api/test-email/route.ts`, `lib/send-manual-distribution-email.ts`, `lib/send-print-ticket-email.ts` – Use `getSmtpCredentials()` for DB-backed config
- **Updates:** Super admins can store SMTP_USER, SMTP_PASS, SMTP_FROM in the database via Global Settings → Email & Tickets → SMTP credentials section. Env vars remain fallback.

## 2026-03-05 – Paymongo Control Panel (super_admin only)

- `lib/paymongo-config.ts` (new) – `getPaymongoSecretKey()` and `getPaymongoWebhookSecrets()` read from `app_config`, fallback to env vars
- `app/admin/settings/paymongo-settings.tsx` (new) – Super-admin-only UI for test/live secrets and webhook secrets, mode switch
- `app/admin/settings/page.tsx` – Paymongo tab when super_admin
- `app/api/admin/settings/route.ts` – GET masks paymongo secrets; PATCH accepts paymongo keys
- `lib/paymongo.ts` – Use `getPaymongoSecretKey()` instead of env
- `app/api/webhooks/paymongo/route.ts` – Multi-secret verification from DB + env
- `supabase/migrations/00139_paymongo_settings_seed.sql` – Seed default `paymongo_mode` (test)
- `app/api/admin/refund-lookup/route.ts`, `app/api/debug/paymongo-link/route.ts`, `app/api/checkout/route.ts` – Use `getPaymongoSecretKey()` for DB-backed config
- **Updates:** Super admins can store Paymongo test/live secrets and webhook secrets in the database via Global Settings → Paymongo tab. Mode switch toggles between test and live. Env vars remain fallback.

## 2026-03-04 – Events table mobile: horizontal scroll to see all columns

- `components/admin/events-table.tsx` – overflow-x-auto, min-w-[640px] on table, -mx-4 sm:mx-0 on wrapper
- **Updates:** On phone view, users can scroll horizontally to see Producer, Featured, and Edit columns; table no longer compresses.

## 2026-03-04 – Cart total larger and yellow

- `components/booking/inline-cart.tsx` – Total line: text-2xl (twice size), text-yellow-400
- **Updates:** Cart total is now more prominent with larger text and yellow color.

## 2026-03-04 – Bright violet styling for seat count and price in Choose seats

- `app/[eventSlug]/book/book-page-client.tsx` – Change "(X left)" and price text to light violet (text-violet-200), brighter and close to white
- `components/seat-picker/section-picker.tsx` – Apply same text-violet-200 to section name and price for free/standing sections
- **Updates:** Assigned-seat and free-seating section headers now display names and prices in a soft violet-white for better visibility on dark theme.

- `components/seat-picker/section-picker.tsx` – Remove "(X left)" from section label; only assigned-seat sections display remaining count
- **Updates:** Open seating, free seating, and standing sections no longer show "(X left)"; that count is shown only for assigned seats in the book page.

- `supabase/migrations/00138_availability_section_count_exclude_cart.sql` – Update get_event_availability section `available` to exclude cart-held and reserved seats (same logic as admin seating API)
- **Updates:** Buyer view previously counted event_seats.status='available' only; cart-held seats stayed available, so count was inflated. Now uses NOT (id IN booked OR reserved), matching admin "0 remaining".

- `app/[eventSlug]/book/book-page-client.tsx` – Add remaining seat count `(X left)` next to section name for mapSections and gridSections
- `components/seat-picker/section-picker.tsx` – Add remaining seat count `(X left)` next to section label for free-seating sections
- **Updates:** Assigned-seat and free-seating section headers now show remaining availability (e.g. "GenAd (45 left)") for clarity.

## 2026-03-04 – Sold out ribbon overlay for seat selector sections

- `app/[eventSlug]/book/book-page-client.tsx` – Add diagonal "Sold Out" ribbon overlay to map-style and grid-style seat selector section cards when sold out; remove inline pill for consistency with SectionPicker
- **Updates:** Sections with SeatSelector (assigned seats) now show the same ribbon overlay as free seating when sold out (amber ribbon, -rotate-6, top-right corner).

## 2026-03-04 – Fix: Checkout build type error for ticket URLs

- `app/api/checkout/route.ts` – Allow `qr_image_url` and `ticket_image_url` as `string | null` in sectionTicketRows type (createAndUploadTicketQR and generateAndUploadTicketImage return `string | null` on failure)
- **Updates:** Build failed with "Type 'string | null' is not assignable to type 'string'" at line 510. Updated the typed array to accept null so tickets can be inserted when image generation fails; confirmation page generates on-demand for null URLs.

## 2026-03-04 – Fix: Checkout P0 Delay via Client-Side Subtotal Fallback

- `app/[eventSlug]/book/book-page-client.tsx` – Add `computeSubtotalFromItems` helper; set `cartSummary` from client-computed subtotal before prefetch so checkout always has a value on first paint
- **Updates:** Guarantee immediate price display even when prefetch fails or API is slow (read-after-write lag). Book page computes subtotal from items + `priceCentsBySectionId` (same logic as InlineCart) and stores it before navigating; prefetch overwrites with server data when successful.

## 2026-03-04 – Fix: Checkout P0 Delay (5min) via Prefetch

- `store/reservation-store.ts` – Add cartSummary, setCartSummary, CartSummary type; clear cartSummary on clear()
- `app/[eventSlug]/book/book-page-client.tsx` – After sync, prefetch cart-summary and store in reservation store before navigating
- `app/[eventSlug]/checkout/checkout-content.tsx` – Use storeCartSummary as highest-priority fallback (effectiveSummary = summary ?? storeCartSummary ?? initialSummary)
- **Updates:** Checkout showed P0 for ~5min before displaying price. Server-side fetch helped but timing could still delay. Now we prefetch cart-summary right after sync (before navigation) and store it; checkout reads it immediately on mount, so price displays without delay.

## 2026-03-04 – Fix: Checkout P0 via Server-Side Cart Summary

- `lib/cart-summary.ts` – New: shared getCartSummary(eventId, cartId) for cart total calculation
- `app/api/events/[id]/cart-summary/route.ts` – Use getCartSummary from lib
- `app/[eventSlug]/checkout/page.tsx` – Fetch cart summary server-side when cartId/eventId in URL; pass as initialSummary to CheckoutContent
- `app/[eventSlug]/checkout/checkout-content.tsx` – Accept initialSummary prop; use effectiveSummary = summary ?? initialSummary; show correct price on first paint
- **Updates:** Checkout P0 persisted because client cart-summary ran after paint (Netlify/searchParams timing). Now the server fetches cart summary before render and passes it as initial data, so Subtotal/Total display correctly immediately.

## 2026-03-04 – Hardening: Checkout P0 on Netlify

- `app/[eventSlug]/checkout/page.tsx` – Add `export const dynamic = "force-dynamic"` so searchParams are always available
- `app/[eventSlug]/checkout/checkout-content.tsx` – Cart-summary fetch: add `cache: "no-store"`, timestamp query param, `refetchOnWindowFocus`, `retry: 2`
- **Updates:** Additional hardening for checkout P0 on Netlify: force dynamic rendering for searchParams, disable caching on cart-summary, improve retry/refetch behavior.

## 2026-03-04 – Fix: Free Seating Checkout Summary P0.00

- `app/api/reservations/route.ts` – When allocateSeatsForSection returns empty (section has no event_seats), insert section-based row (section_id, quantity, seat_id: null)
- `app/api/reservations/[cartId]/route.ts` – Same section-based insert in PATCH handler
- `app/api/events/[id]/cart-summary/route.ts` – Select section_id, quantity; process section-based rows for subtotal (getPrice × quantity)
- `app/api/checkout/route.ts` – Accept section-based items; add to totalCents; create section tickets (one per quantity) when no event_seats
- `app/[eventSlug]/book/book-page-client.tsx` – Always sync before proceeding to checkout (remove needsSync guard)
- **Updates:** Checkout showed P0.00 for free seating only. Root cause: free/standing sections without generated event_seats had no reservation_items (allocateSeatsForSection returned []). Now store section-based rows and price them in cart-summary and checkout. Always sync before checkout to avoid stale cart.

## 2026-03-04 – Fix: Checkout P0 while PayMongo has correct value

- `app/[eventSlug]/checkout/page.tsx` – Pass cartId and eventId from server searchParams as initialCartId/initialEventId
- `app/[eventSlug]/checkout/checkout-content.tsx` – Accept initialCartId, initialEventId props; use in eventId and activeCartId derivation so cart-summary runs on first render
- **Updates:** Checkout list showed P0.00 while PayMongo displayed correct amount. useSearchParams can be empty on first render (Netlify). Server page now passes searchParams so cart-summary query has eventId/cartId from first paint.

## 2026-03-04 – Fix: Lower Box P0 and New Section Default Price

- `components/admin/seat-pricing.tsx` – New sections default to 0 instead of 500 PHP; admins must set price before selling
- `app/[eventSlug]/checkout/checkout-content.tsx` – After hydration, update URL with eventId when missing so checkout works on refresh and shared links
- **Updates:** Checkout P0 for Lower Box (and similar) addressed by ensuring eventId is in the URL after hydration. New sections in Seat Pricing now default to 0 so admins must explicitly set a price.

## 2026-03-03 – Fix: reservation_items FK Violation on Clear Cart

- `app/[eventSlug]/book/book-page-client.tsx` – Add syncAbortRef (AbortController); abort in-flight sync on clear and effect cleanup; pass signal to sync fetch; ignore AbortError (no toast)
- **Updates:** Race condition where debounced POST could complete after cart DELETE caused reservation_items FK violation. Aborting in-flight sync when user clears cart prevents the stale POST from inserting.

## 2026-03-04 – Fix: Checkout P0 on Netlify (eventId in URL)

- `app/[eventSlug]/book/book-page-client.tsx` – Append eventId to checkout URL when navigating
- `app/[eventSlug]/checkout/checkout-content.tsx` – Use eventId from URL (searchParams) when store is empty; hydration now runs only when store lacks eventId
- **Updates:** Checkout sometimes showed P0 on Netlify when store was empty. Now eventId is passed in the URL (?cartId=...&eventId=...), so cart-summary runs immediately without waiting for hydration.

## 2026-03-04 – Fix: Proceed to Checkout multiple clicks

- `app/[eventSlug]/book/book-page-client.tsx` – Add isProceedingToCheckout state; disable and show "Proceeding..." during sync/navigation
- `components/booking/inline-cart.tsx` – Add isProceedingToCheckout prop, disable button when true
- **Updates:** Button could be clicked multiple times during sync, causing checkout delays. Now disables on first click and re-enables only if sync fails.

## 2026-03-04 – Fix: Checkout P0 when cart has price

- `app/[eventSlug]/checkout/checkout-content.tsx` – Hydrate store from cart when activeCartId from URL but eventId is null (refresh, new tab, direct link); on 404 redirect to book page.
- **Updates:** Checkout sometimes showed P0.00 subtotal because eventId came only from in-memory store. Now fetches GET /api/reservations/[cartId] when store is empty, populates setCart/setItems, so cart-summary query runs and prices display.

## 2026-03-03 – Reserved Seats tab

- `app/api/admin/events/[id]/reserved-seats/route.ts` – GET reserved seats grouped by section
- `app/api/admin/events/[id]/reserved-seats/release/route.ts` – POST to release one seat or all in a section
- `components/admin/reserved-seats-tab.tsx` – Client component with collapsible sections and release actions
- `components/admin/edit-event-tabs.tsx` – Added reservedSeats prop and tab trigger/content
- `app/admin/events/[id]/page.tsx` – Added reservedSeats tab, VALID_TABS, ReservedSeatsTab with permission checks
- **Updates:** Admin can view and release reserved seats (status=reserved or assignment_id set) per seat or per section from the event edit page.

## 2026-03-03 – Fix: Scrollbar auto-center only on card expand

- `components/seat-picker/seat-selector.tsx` – Restrict center scroll effect to mount-only (`[centerHorizontalScroll]` deps); no longer re-runs when seats/zoom change during panning.
- **Updates:** Scrollbar was recentering during panning because availability refetches produced new seat references. Now centers only when the section card is expanded.

## 2026-03-03 – Fix: 5 duplicate ticket emails

- `lib/confirm-booking.ts` – Use atomic `UPDATE ... WHERE ticket_email_sent_at IS NULL RETURNING id` to claim the email send; only one concurrent caller can succeed. Rollback claim on skip or send failure so retries can send.
- **Updates:** Multiple callers (PayMongo webhook, status API poll, confirmation page) could all pass the check before any update, causing 5+ duplicate emails. Atomic claim ensures exactly one process sends.

## 2026-03-03 – Fix: Ticket text missing in confirmation images (base-only)

- `app/api/bookings/[bookingId]/tickets/[ticketId]/image/route.ts` (new) – API route serves ticket images for confirmed bookings; verifies ticket belongs to booking; regenerates when stored image is missing or suspiciously small (likely base-only without overlay text).
- `app/[eventSlug]/confirmation/[bookingId]/confirmation-tickets.tsx` – Use new booking ticket image API instead of image-proxy; pass bookingId; enlarge preview w-36 sm:w-40; "View full ticket" link.
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – Pass bookingId to ConfirmationTickets.
- **Updates:** Text baked into ticket images was missing on confirmation page but present in email. Added dedicated API that detects and regenerates base-only/corrupt images (< 60KB); confirmation now loads images through this API for reliable display.

## 2026-03-03 – Fix: Netlify-only repeated ticket images and wrong template

- `lib/ticket-image.ts` – Use `getSiteOrigin()` instead of `getAppOrigin()` for template fetch; supports Netlify `URL` env var so template loads correctly in production.
- `lib/image-proxy.ts` – Add optional `cacheBustId` param to `getProxiedImageUrl`; append `&v=...` when provided to prevent CDN serving same image for different tickets.
- `app/[eventSlug]/confirmation/[bookingId]/confirmation-tickets.tsx` – Pass `t.id` as cache-bust when displaying ticket images.
- `app/api/image-proxy/route.ts` – Add `Vary: url` response header for cache differentiation.
- **Updates:** Fixes repeated/identical ticket images and wrong template on Netlify (worked on localhost). Template fetch now uses correct origin on Netlify; cache-busting ensures each ticket image has a unique request URL.

## 2026-03-03 – Close payment modal on Return to Merchant

- `app/[eventSlug]/payment-return/[bookingId]/page.tsx` – New lightweight page that postMessages to parent when loaded in iframe; redirects to confirmation when opened directly.
- `app/api/checkout/route.ts` – Change successUrl to payment-return route instead of confirmation.
- `app/[eventSlug]/checkout/checkout-content.tsx` – Add message listener for PAYMONGO_RETURN; close modal on receive (origin-validated).
- **Updates:** "Return to Merchant" now closes the payment modal; site remains visible behind. Polling redirects to confirmation when payment is confirmed.

## 2026-03-03 – Fix: 404 on Return to Merchant after PayMongo payment

- `lib/site-url.ts` – New `getSiteOrigin(request?)` helper that prefers env vars (NEXT_PUBLIC_SITE_URL, URL, VERCEL_URL) for correct redirects on serverless.
- `app/api/checkout/route.ts` – Use `getSiteOrigin(request)` instead of `request.url` when building PayMongo success/cancel URLs.
- `docs/NETLIFY_DEPLOY.md` – Document `NEXT_PUBLIC_SITE_URL`; add Custom Domain step to set it.
- **Updates:** PayMongo "Return to Merchant" now redirects to the correct site URL on Netlify. Set `NEXT_PUBLIC_SITE_URL` for custom domains.

## 2026-03-03 – Fix: confirmation page wrong seat labels (Seat 1 x3)

- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – Resolve seat labels from event_seats + event_sections; fix ticket image URL mapping with Map; pass seatLabel to ConfirmationTickets.
- `app/[eventSlug]/confirmation/[bookingId]/confirmation-tickets.tsx` – Add seatLabel to interface; display it next to ticket number (e.g. Ticket #JNCV30A3 · Row A Seat 3).
- **Updates:** Confirmation page now shows correct seat labels per ticket from DB; avoids Seat 1 showing multiple times when ticket images had template/layout issues.

## 2026-03-03 – Fix: email not sending after booking confirmed

- `supabase/migrations/00137_bookings_ticket_email_sent_at.sql` – Add `ticket_email_sent_at` column for idempotency.
- `lib/confirm-booking.ts` – Skip email if already sent; set `ticket_email_sent_at` after send; add diagnostic logging when skipping for missing user/event/tickets.
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – Call `confirmBooking` when status is confirmed (safety net when webhook/status fire-and-forget didn’t complete).
- `app/api/checkout/route.ts` – Set `ticket_email_sent_at` when sending email for on-site and !usePayMongo flows.
- **Updates:** Confirmation emails now reliably sent via confirmation-page fallback. Idempotency prevents duplicate emails on refresh.

## 2026-03-02 – Reports: section name over code in drilldowns and charts

- `supabase/migrations/00135_admitted_distinct_tickets.sql` – Drilldown: capacity, sold, occupancy use `COALESCE(NULLIF(TRIM(sec.name), ''), sec.section_code, 'Other')` for section_name.
- `supabase/migrations/00136_kpi_projected_gross.sql` – sec_sales and sec_vss use name over code for section_name.
- **Updates:** Overall Occupancy %, Capacity, Sold modals and Sections with Highest Sales chart show full section names instead of codes (e.g. v1, g3).

## 2026-03-02 – KPI: Remove Gross Revenue card, percentage text yellow

- `components/admin/reports/kpi-cards.tsx` – Removed Gross Revenue card from CARD_CONFIG; refactored getValue to getValueParts; percentage parts (e.g. "(49.4%)", "60.9%") now render in text-yellow-400.
- **Updates:** Gross Revenue card removed. Sold, Distributed, Complimentary, Admitted, and Overall Occupancy % show percentage values in yellow.

## 2026-03-02 – KPI: Projected Total Gross + capacity percentages

- `supabase/migrations/00136_kpi_projected_gross.sql` – New migration. Add `projected_total_gross_cents` to `get_admin_dashboard_metrics` (revenue if sold out at current avg price).
- `hooks/use-dashboard-data.ts` – Add `projected_total_gross_cents` to `DashboardKPIs`.
- `components/admin/reports/kpi-cards.tsx` – Add Projected Total Gross card; show capacity % for Total Sold, Distributed, Complimentary, Admitted; grid layout `lg:grid-cols-4` for 8 cards.
- **Updates:** Reports KPIs include Projected Total Gross and percentage-of-capacity for sold/distributed/complimentary/admitted.

## 2026-03-02 – Fix dashboard skeleton hydration mismatch

- `components/admin/reports/dashboard-skeleton.tsx` – Replaced `Math.random()` with fixed percentages for skeleton bar widths; SSR and client now match.
- **Updates:** Eliminates hydration error on Reports page load.

## 2026-03-02 – Admitted drilldown: section name and row/seat

- `supabase/migrations/00135_admitted_distinct_tickets.sql` – admitted branch: prefer `es_sec.name` over `section_code`; add `row_label`, `seat_number` to output.
- `components/admin/reports/kpi-detail-modal.tsx` – GroupedBySectionTable: add Row and Seat columns.
- **Updates:** Admitted modal shows section names (e.g. "General") instead of codes (e.g. "g3"); each row displays row and seat numbers.

## 2026-03-02 – Admitted: distinct tickets only, no re-entry

- `supabase/migrations/00135_admitted_distinct_tickets.sql` – New migration. `get_admin_dashboard_metrics`: admitted count uses `COUNT(DISTINCT ticket_id)` where `action = 'admit'`; excludes `re_entry_granted` and return scans. `get_admin_dashboard_drilldown`: admitted rows use `DISTINCT ON (ticket_id)` with first admission only.
- `components/admin/reports/kpi-detail-modal.tsx` – GroupedBySectionTable label: "check-ins" → "seats" for admitted drilldown.
- **Updates:** Admitted KPI and drilldown now count distinct seats (tickets). Re-entry return scans no longer inflate the count. Section drilldown shows one row per seat.

## 2026-03-02 – Reports: add Producer filter dropdown

- `app/admin/reports/page.tsx` – Fetch producers from `event_producers`, include `producer_id` in event options, pass producers to client; read `producer_id` from URL, pass `initialProducerId`.
- `app/admin/reports/reports-page-client.tsx` – Add Producer dropdown before Event; filter events by selected producer; cascade selection (Producer → Event); add "No Producer" option; persist Producer and Event in URL so refresh keeps selections.
- **Updates:** Sales & Reports now filters by Producer first, then Event. "No Producer" option shows events without a producer. Producer and Event selections persist on refresh via URL params.

## 2026-03-02 – Fix 404 chunk errors (Turbopack)

- `package.json` – Switched `build` to `next build` (no Turbopack); added `dev:webpack` script as fallback when `npm run dev` returns 404 for chunks.
- **Updates:** Turbopack production builds had chunk-loading issues; use standard webpack build. Run `npm run dev:webpack` if dev with Turbopack fails.

## 2026-03-02 – Admissions scan: fix horizontal centering of scan ticket card

- `app/admissions/scan/page.tsx` – Added a hidden left spacer (flex-1) on desktop so the scan ticket card sits in the true center between left space and the admitted/granted list panel; scan card uses mx-auto on mobile.
- **Updates:** Scan ticket card is now horizontally centered on the app.

## 2026-03-02 – Admissions scan: center scan ticket card

- `app/admissions/scan/page.tsx` – Wrapped content in min-h-[calc(100vh-4rem)] flex flex-col justify-center so the scan ticket card and controls are vertically centered in the viewport.

## 2026-03-02 – Seat selector: default horizontal scroll to center

- `components/seat-picker/seat-selector.tsx` – Added centerHorizontalScroll effect; on mount and when seats/zoom/imageNaturalSize change, scroll the seat map container to center horizontally.
- **Updates:** Seat map horizontal scrollbar now defaults to center instead of left.

## 2026-03-02 – Event assistant: ticket verification

- `app/api/chat/route.ts` – Ticket verification for logged-in users: lookup by qr_data (using admin client to bypass RLS on tickets), verify booking.user_id; return response directly (bypass LLM) for reliability; formatTicketVerificationReply for friendly replies; handles verified, not registered, not found, login required, ask for code.
- `components/ai-chat.tsx` – Add credentials: "same-origin" to fetch for cookie auth.
- **Updates:** Logged-in users can verify ticket numbers; assistant confirms if ticket is registered to their email and shows event details with link.

## 2026-03-02 – Event assistant: scan events by city keywords

- `app/api/chat/route.ts` – Added messageMatchesLocation helper; server-side filtering by city/province when last user message contains matching keywords; when filter yields matching events, only those are passed to LLM; when filter yields empty (location asked but no events there), explicit no-match context.
- **Updates:** Location queries like "events in davao city" now reliably return only matching events (or "no events in that location" when none exist).

## 2026-03-02 – Event assistant: enforce clickable event links

- `app/api/chat/route.ts` – Strengthened system prompt: CRITICAL rule that every event name must be [Event Title](URL); added "When listing any events" clause; reinforced in free/pricing/location scenarios.
- **Updates:** Assistant now consistently outputs markdown links so listed events render as clickable.

## 2026-03-02 – Event assistant: format responses properly

- `app/api/chat/route.ts` – Added formatting instructions to system prompt: use markdown bullet lists, [Event Title](URL) per event, blank lines for readability; increased max_tokens to 500.
- `components/ai-chat.tsx` – Custom ReactMarkdown components for ul, ol, p with proper spacing (list-disc, space-y-1, mb-2).
- **Updates:** Assistant responses now render with proper bullet lists and spacing.

## 2026-03-02 – Event assistant: location-based search

- `app/api/chat/route.ts` – Fetches venues with provinces(name), cities(name) for event venue_ids; includes city and province in event context; system prompt instructs bot to filter by location when users ask about events in a specific city or province.
- **Updates:** Event assistant can now answer location-based queries (e.g. "events in Davao City").

## 2026-03-02 – Event assistant: links open in same window

- `components/ai-chat.tsx` – Removed target="_blank" from markdown links so event links open in the same window.
- **Updates:** Chat assistant links now navigate in the current tab instead of opening a new one.

## 2026-03-02 – Event assistant: pricing information

- `app/api/chat/route.ts` – Fetches event_prices per event; computes min/max price range; includes "from ₱X" or "₱X–₱Y" in event context; system prompt instructs bot to use pricing when users ask about lower prices, cheap events, or budget options.
- **Updates:** Event assistant can now answer pricing questions and suggest events with lower prices.

## 2026-03-02 – Event assistant: search free sections

- `app/api/chat/route.ts` – Queries event_prices for price_cents=0; annotates event context with [has free sections]; system prompt instructs bot to only suggest tagged events when user asks for free events; fallback message when none exist.
- **Updates:** Bot can search for and list events that have free sections (zero-cost sections).

## 2026-03-02 – Event assistant: base URL wishticketsportal.online

- `app/api/chat/route.ts` – Fallback base URL set to https://wishticketsportal.online.

## 2026-03-02 – Event assistant: create direct links

- `app/api/chat/route.ts` – System prompt instructs bot to provide markdown links when users ask for booking links; event context includes full URLs.
- **Updates:** Bot can now create direct links to event pages when requested.

## 2026-03-02 – Event assistant: clickable links

- `components/ai-chat.tsx` – Render assistant messages with ReactMarkdown so markdown links open in a new tab.
- **Updates:** Links in chatbot replies are now clickable.

## 2026-03-02 – Mobile header menu

- `components/header.tsx` – Hamburger menu (md:hidden) opens slide-in drawer with nav links, Dashboard, Admin, Sign In/Out.
- **Updates:** Menu and nav accessible on mobile.

## 2026-03-02 – Print Tickets: async job queue (removed)

- Historical note: a short-lived async job queue and `print_generate_jobs` table were removed; print tickets are generated only via synchronous `POST /api/admin/print-tickets/generate` from the admin UI. The table is dropped in `supabase/migrations/00161_drop_print_generate_jobs.sql`.

## 2026-03-02 – Concert image as background overlay

- `public/concert-bg.png` – Added concert photo (orange/purple stage lights, smoke blobs).
- `components/blobs-background.tsx` – Concert image as bottom layer with reduced opacity (50%), brightness (0.6), and dark overlay (black/50); blobs preserved; animated CSS blobs remain on top.
- **Updates:** Background shows concert atmosphere with visible light blobs; content stays readable.

## 2026-03-02 – Recolor app theme to Wish 107.5 / ROADSHOW palette

- `app/globals.css` – Full palette: background (#0a101f dark), primary orange, wish-purple, wish-yellow, wish-pink, wish-cyan; dark glass slate-navy tint; accent-border utility; report-complimentary uses wish-purple.
- `components/blobs-background.tsx` – Added purple glow blob; orange blobs use CSS vars.
- **Updates:** Dark theme with purple-tinted background, orange primary accent, electric purple secondary, from WishCLUSIVE/ROADSHOW/concert reference imagery.

## 2026-03-02 – Recolor app theme to Wish 107.5 palette (earlier)

- `app/globals.css` – Updated CSS variables: background (#0d0a0a), wish-orange (#FF6B00), wish-orange-hover (#E85C00), wish-orange-muted, wish-orange-glow, glass-bg, report-admitted.
- `components/blobs-background.tsx` – Replaced hardcoded orange rgba with new accent (var and rgba).
- `components/admin/reports/event-day-section.tsx` – ADMITTED_COLOR set to #FF6B00.
- `lib/email.ts` – Email template header and border colors updated to #FF6B00.
- `lib/send-manual-distribution-email.ts` – Distribution email header color updated to #FF6B00.
- **Updates:** Dark theme preserved with vibrant orange-red accent from Wish 107.5 reference images.

## 2026-03-01 – Print Tickets: Simulated progress during email send

- `components/admin/print-tickets-tab.tsx` – Simulated progress during send: increments 0→95% every 350ms while request runs, then 100% on completion.
- **Updates:** Progress bar no longer stuck at 0% during email send; provides visual feedback for single-request operations.

## 2026-03-01 – Print Tickets: Generate beside Delete + interactive checkboxes

- `components/admin/print-tickets-tab.tsx` – Moved Generate button to top row beside "Delete all generated tickets"; made checkboxes interactive for selection; Generate enabled only when sections/seats are selected; generates for all selected items; checkboxes become permanent (disabled) after generating.
- **Updates:** Single Generate button at top; select sections/seats via checkboxes; batch generate for selection.

## 2026-03-01 – Section email: 1 ticket image per 1 ticket number

- `app/api/admin/print-tickets/send-section-email/route.ts` (new) – POST handler to send one email with multiple ticket attachments for assigned sections.
- `components/admin/print-tickets-tab.tsx` – Added "Send all" for assigned sections; extended send dialog for section mode; calls send-section-email when sending all seats.
- **Updates:** Assigned sections can send one email with multiple ticket images (one per seat); each attachment has its own ticket number.

## 2026-03-01 – Print Tickets progress bar and delete all

- `components/ui/floating-progress.tsx` – Added optional `percent` prop (0–100) for determinate progress bar.
- `components/admin/print-tickets-tab.tsx` – Added `progress` state with percentage for generate/send; section Generate loops per seat for real progress; added "Delete all generated tickets" button with ConfirmDialog.
- `app/api/admin/events/[id]/print-tickets/route.ts` – Added DELETE handler to remove all print_tickets for an event.
- **Updates:** Generate and send show percentage-based progress; delete all button above section list with confirmation.

## 2026-03-01 – Print Tickets enhancements

- `app/api/admin/print-tickets/generate/route.ts` – Added `generateAllSeats`; section Generate creates tickets for all seats (or section-level for free/standing). Switched to `formatQrData` (no P prefix/suffix) to match tickets table.
- `lib/ticket-image.ts` – `generateTicketImageForPrint`: compute price from event_prices and early_bird_prices; show actual section price instead of COMPLIMENTARY.
- `components/admin/print-tickets-tab.tsx` – Section Generate passes `generateAllSeats: true`; show count in toast (e.g. "Generated 5 tickets").
- **Updates:** Section Generate creates all seats; ticket images show real price; qr_data and ticket number use same format as tickets table.

## 2026-03-01 – Event Details tab menus responsive + auto width

- `components/admin/edit-event-tabs.tsx` – TabsList: responsive grid (auto-fill, min 10rem per column) so column count adjusts by viewport; w-full min-w-0 to prevent overflow; tabs auto-size within cells.
- **Updates:** Tabs auto-adjust on mobile (fewer columns); auto width overall; no overlap on narrow screens.

## 2026-03-01 – Print Tickets Tab

- `supabase/migrations/00134_print_tickets.sql` (new) – Tables `print_tickets` and `print_ticket_emails` for print-only ticket generation and email audit.
- `lib/send-print-ticket-email.ts` (new) – Email function for subject "Event Ticket – Ready for Printing" with specified body.
- `lib/ticket-image.ts` – Added `generateTicketImageForPrint` for section/seat ticket images without sale/reservation.
- `lib/qr-data.ts` – Added `formatPrintTicketQrData` with P prefix for print tickets.
- `app/api/admin/events/[id]/print-tickets/route.ts` (new) – GET sections/seats and existing print tickets.
- `app/api/admin/print-tickets/generate/route.ts` (new) – POST generate ticket image for section/seat.
- `app/api/admin/print-tickets/[id]/send-email/route.ts` (new) – POST send print ticket via email.
- `components/admin/print-tickets-tab.tsx` (new) – Collapsible section/seat list with Generate and Send buttons, email dialog.
- `components/admin/edit-event-tabs.tsx` – Added Print Tickets tab.
- `app/admin/events/[id]/page.tsx` – Added printTickets tab content and VALID_TABS.
- **Updates:** New Print Tickets tab in Event Details for generating ticket images and emailing them without marking seats sold. Uses `manage_assignments` capability.

## 2026-03-01 – PayMongo Checkout Session Email Receipt

- `lib/paymongo.ts` – Added `send_email_receipt: true` when creating checkout sessions so PayMongo sends payment confirmation emails.
- **Updates:** Checkout Sessions were not sending PayMongo receipt emails because `send_email_receipt` was not set; default is false.

## 2026-03-01 – Admin Refund Lookup Card

- `app/api/admin/refund-lookup/route.ts` (new) – Admin-only GET endpoint; looks up payment by booking ID, fetches PayMongo session/link, returns pay_xxx IDs for refunds.
- `app/admin/refund-lookup/page.tsx` (new) – Form to enter booking ID (Invoice # from ticket email); displays pay_xxx IDs (copyable), amount, status, event, buyer.
- `app/admin/page.tsx` – Added "Refund lookup" card for admin/super_admin linking to refund lookup page.
- **Updates:** Admins can look up PayMongo payment IDs for refunds by entering the booking ID from the ticket confirmation email.

## 2026-03-01 – PayMongo Invoice # in Ticket Email (template fix)

- `supabase/migrations/00133_email_template_invoice_number.sql` – Add `Invoice #: {{invoiceNumber}}` to stored `email_ticket_body` in app_config (template from migrations lacked this line).
- `app/admin/settings/email-ticket-settings.tsx` – Add `{{invoiceNumber}}` to PLACEHOLDERS; include Invoice # line in default template.
- **Updates:** Invoice # was implemented but not visible because the DB template (from earlier migrations) did not include it. Run `npx supabase db push` to apply. If you customized the template in Admin → Settings, add `Invoice #: {{invoiceNumber}}` manually after Total.

## 2026-03-01 – React hydration error #418 fix

- `app/dashboard/dashboard-bookings.tsx` – Added `suppressHydrationWarning` to date cells (BookingRow created_at and StatusSection group header date) to prevent locale/timezone mismatch between server and client.
- `components/event-card.tsx` – Verified all date/time and countdown spans already have `suppressHydrationWarning`.
- **Updates:** Addressed React hydration mismatch (error #418) caused by date formatting differing between Node and browser.

## 2026-03-01 – API error handling and troubleshooting

- `app/api/events/route.ts` – Top-level try-catch; return JSON with error message and details (dev) on 500.
- `app/api/events/[id]/prices/route.ts`, `app/api/events/[id]/availability/route.ts` – Log errors; return JSON with details in dev.
- **Updates:** API 500 responses now include structured error info to help diagnose issues (Supabase, RPCs, env vars).

## 2026-03-01 – PayMongo Billing Prefill via Checkout Sessions

- `lib/paymongo.ts` – Added `createCheckoutSession`, `getCheckoutSessionStatus`, `getPaymentStatusById`, `isPaymongoPaid`; Checkout Sessions support billing prefill (Links API does not).
- `app/api/checkout/route.ts` – Switched from Links to Checkout Sessions; pass billing (name, email, phone) from profile; success_url/cancel_url for redirects.
- `app/api/webhooks/paymongo/route.ts` – Handle `checkout_session.payment.paid` and `checkout_session.payment.failed`.
- `app/api/bookings/[bookingId]/status/route.ts`, `app/[eventSlug]/confirmation/[bookingId]/page.tsx`, `app/api/bookings/[bookingId]/recheck-payment/route.ts` – Use `getPaymentStatusById` / `isPaymongoPaid` for both link and checkout session IDs.
- `app/api/debug/paymongo-link/route.ts` – Support both link and checkout session endpoints.
- `docs/PAYMONGO_SETUP.md`, `docs/NETLIFY_DEPLOY.md` – Webhook events: `checkout_session.payment.paid`, `checkout_session.payment.failed`; billing prefill note.
- **Updates:** PayMongo Billing Details (E-mail, Name, Contact Number) are now prefilled from the user's profile. Switched from Links API to Checkout Sessions API. Add new webhook events in PayMongo Dashboard.

## 2026-03-01 – Multiple Promo Codes at Checkout

- `supabase/migrations/00132_booking_promo_codes.sql` (new) – Table for multiple promos per booking; RLS for read/insert.
- `app/api/promo/validate/route.ts` – Reject duplicate codes; accept applied_promo_codes for stackability.
- `app/[eventSlug]/checkout/checkout-content.tsx` – appliedPromos array, add/remove codes, show list with × to remove; pass promo_codes to checkout.
- `app/api/checkout/route.ts` – Accept promo_codes array (and legacy promo_code); apply each sequentially; insert into booking_promo_codes via admin client (bypass RLS); increment used_count for each; discountDescription = codes.join(", ").
- `lib/confirm-booking.ts` – Fetch from booking_promo_codes for discount description in confirmation email.
- **Updates:** Users can apply multiple promo codes at checkout. Each applied code is shown with its discount; remove with ×. Stackable rules enforced. Emails show all applied codes.

## 2026-03-01 – Promo Code Number Input Steppers

- `components/admin/event-promo-codes.tsx` – Replaced native number spinners with custom ChevronUp/ChevronDown stepper buttons on discount value and max uses inputs; percentage steps by 5, fixed amount by ₱1, max uses by 1.
- **Updates:** Discount and max uses inputs now have styled increment/decrement buttons instead of default browser spinners.

## 2026-03-01 – Promo Code Stackable Feature

- `supabase/migrations/00131_promo_codes_stackable.sql` (new) – Add `stackable` boolean column to `promo_codes`; update `get_promo_by_code` RPC to return it.
- `app/api/admin/events/[id]/promo-codes/route.ts` – Include `stackable` in SELECT.
- `app/api/admin/promo-codes/create/route.ts`, `app/api/admin/promo-codes/[id]/route.ts` – Add `stackable` to schema and payload; PATCH supports partial updates for inline toggle.
- `components/admin/event-promo-codes.tsx` – Add Stackable column with Switch per row; add stackable to create/edit form; inline toggle calls PATCH with `{ stackable }`.
- `app/api/events/[id]/cart-summary/route.ts` – Return `early_bird_active` in response.
- `app/api/promo/validate/route.ts` – Compute early bird from event; reject non-stackable promos when early bird active or other promos applied; return `reason: "not_stackable"`.
- `app/[eventSlug]/checkout/checkout-content.tsx` – When validate returns `not_stackable`, show Dialog explaining restriction; pass `applied_promo_codes` to validate.
- `app/api/checkout/route.ts` – Server-side stackable check: reject non-stackable promo when early bird active.
- **Updates:** Admins can mark promo codes as stackable. Non-stackable codes cannot be used with early bird pricing or other promos; users see a dialog explaining the restriction.

## 2026-03-01 – Cart Time Duration: Global Only

- `components/admin/event-form.tsx` – Removed "Cart time duration (minutes)" field from Event Details form.
- `lib/reservations.ts` – Added `getGlobalReservationTtlMinutes()` to read TTL from `app_config.reservation.ttl_minutes` using admin client.
- `app/api/reservations/route.ts` – Uses global TTL instead of per-event `cart_time_duration_minutes` when creating reservation carts.
- **Updates:** Cart time duration is now controlled by Admin Settings → Seat Settings (TTL minutes). Per-event override removed from Event Details.

## 2026-03-01 – Fix 500 on GET / and React #418 Hydration

- `components/header-wrapper.tsx` – Wrapped auth and `get_my_role` in try/catch; return null role on error to avoid 500 crashes.
- `components/event-card.tsx` – `earlyBirdActive` moved from render-time `Date.now()` to `useState` + `useEffect` to avoid server/client mismatch; added `suppressHydrationWarning` on date/time and countdown spans.
- **Updates:** Homepage no longer crashes when auth/RPC fails; fixes React hydration error #418 (server HTML ≠ client output from `Date.now()` and date formatting).

## 2026-03-01 – Super Admin Danger Zone: Clear Database

- `components/admin/danger-zone-clear-database.tsx` (new) – Client component with Danger Zone card, "Clear database" button, and ConfirmDialog.
- `app/api/admin/clear-database/route.ts` (new) – POST-only API; empties storage buckets (except ticket-templates), deletes all tables (except super admin profile), deletes other auth users. Preserves `global_ticket_template_url` and `global_ticket_layout_config` in app_config.
- `app/admin/page.tsx` – Render DangerZoneClearDatabase below cards when `isSuperAdmin`.
- **Updates:** Super admin dashboard shows a Danger Zone with a "Clear database" button. Confirmation dialog required. Clears all data except the super admin's profile.

## 2026-03-01 – Ticket Template Upload: 2 MB Limit in UI

- `components/admin/ticket-template-upload.tsx` – Client-side 2 MB file size check; instructional text "Max 2 MB".
- `app/admin/settings/email-ticket-settings.tsx` – Same 2 MB check and text for global ticket template upload.
- **Updates:** Upload API already enforced 2 MB; added client-side validation and visible limit so users know before selecting files.

## 2026-03-01 – Remove ticket-images Bucket Size Limit

- `supabase/migrations/00130_ticket_images_no_size_limit.sql` (new) – Set `file_size_limit` to NULL for `ticket-images` bucket; no bucket-level cap (global Supabase limit still applies).
- **Updates:** Eliminates "object exceeded the maximum allowed size" for generated ticket PNGs. Run `npm run db:push` to apply.

## 2026-03-01 – Increase ticket-images Bucket Limit to 5 MB

- `supabase/migrations/00129_ticket_images_bucket_5mb.sql` – Raised `file_size_limit` from 2 MB to 5 MB (superseded by 00130).

## 2026-03-01 – Image Proxy to Fix ERR_INCOMPLETE_CHUNKED_ENCODING for Custom Templates

- `app/api/image-proxy/route.ts` (new) – Proxies Supabase storage images with full buffering; returns Content-Length to avoid chunked-encoding errors in the browser.
- `lib/ticket-image.ts` – When fetching the ticket template during server-side generation (confirmation page, checkout, etc.), route Supabase storage URLs through the image proxy to avoid incomplete chunked responses that could truncate the confirmation page.
- `lib/image-proxy.ts` (new) – Helper `getProxiedImageUrl()` to route Supabase storage URLs through the proxy.
- `components/admin/ticket-template-upload.tsx`, `components/admin/ticket-layout-editor.tsx`, `app/admin/settings/email-ticket-settings.tsx`, `app/[eventSlug]/confirmation/[bookingId]/confirmation-tickets.tsx`, `components/admin/reports-table.tsx` – Use proxied image URLs for template and ticket previews.
- `app/api/admin/tickets/[id]/image/route.ts` – Serve ticket images by proxying instead of redirecting to Supabase.
- **Updates:** Resolves `net::ERR_INCOMPLETE_CHUNKED_ENCODING` when loading custom ticket templates or ticket images by proxying through our API and responding with a complete, non-chunked body.

## 2026-03-01 – Checkout Button Text When Total Is Zero

- `app/[eventSlug]/checkout/checkout-content.tsx` – When total is P0.00, show "Complete Checkout" instead of "Proceed to payment".
- **Updates:** Free orders use clearer button label to reflect that no payment form will open.

## 2026-03-01 – Seat Pricing UI: Stepper Arrows and Early Bird Price Preview

- `components/admin/seat-pricing.tsx` – Replaced default number inputs with custom NumberStepper (ChevronUp/ChevronDown) for Regular price and Early bird %; step 5 for both; show computed early bird price (₱X) beside percentage when enabled.
- **Updates:** Cleaner stepper controls; amount and percentage adjust by 5; early bird discount shows resulting price.

## 2026-03-01 – Early Bird Percent and Free Sections

- `supabase/migrations/00128_early_bird_percent.sql` – Replace `price_cents` with `discount_percent` (0–100) in early_bird_prices; backfill from existing data.
- `app/api/admin/events/[id]/pricing/route.ts` – GET/PATCH use `discount_percent` and validate 0–100.
- `components/admin/seat-pricing.tsx` – Early bird input as percentage; add "Free" toggle per section (sets price to 0, hides early bird).
- `app/api/events/[id]/prices/route.ts`, `app/api/events/[id]/cart-summary/route.ts`, `app/api/checkout/route.ts` – Resolve early bird price as `base * (100 - discount_percent) / 100`.
- `lib/confirm-booking.ts`, `lib/ticket-image.ts` – Same early bird price resolution.
- `app/api/admin/events/[id]/seating/apply-template/route.ts` – Accept `discount_percent` (with backward compat for `price_cents`).
- `app/api/admin/seat-templates/route.ts` – Export `discount_percent` in early_bird payload.
- `components/admin/seat-configurator.tsx` – Template preview shows early bird as percent or legacy price.
- `app/api/checkout/route.ts` – When `totalCents === 0`, bypass PayMongo; status = confirmed; send ticket email.
- `app/api/events/[id]/cart-summary/route.ts` – Remove zero-total fallback so free carts show 0.
- **Updates:** Early bird is now a percentage deduction per section. Sections can be marked Free (price 0). Orders with total 0 skip PayMongo and go straight to confirmation.

## 2026-03-01 – Favicon from Logo Icon

- `app/icon.tsx` – Dynamic favicon (32x32 PNG) using ImageResponse with Lucide Ticket icon in brand orange (#f97316), transparent background.
- **Updates:** Site favicon shows the orange ticket stub icon only (no background) in browser tabs and bookmarks.

## 2026-03-01 – Efficient Page Loading for Large Databases

- `components/event-card.tsx` – Added `loading="lazy"` to all event images (card, dialog, PhotoView).
- `app/[eventSlug]/page.tsx` – Added `loading="lazy"` to event hero image.
- `supabase/migrations/00127_upcoming_events_pagination.sql` – Added `p_limit` and `p_offset` to `get_upcoming_events`; added `get_upcoming_events_count` RPC.
- `app/api/events/route.ts` – Pagination: accept `limit` (default 18) and `offset`; return `{ events, total }`.
- `components/event-grid.tsx` – Switched to `useInfiniteQuery`; Load more button; "Showing X of Y events".
- **Updates:** Images load sequentially (lazy) instead of all at once; events load 18 per page with Load more for large catalogs.

## 2026-03-01 – Ticket Text as SVG Paths (Fix Unreadable Text on Netlify)

- `lib/ticket-image.ts` – Replaced SVG `<text>` with path-based rendering via opentype.js. Text is converted to Bézier paths at runtime using Roboto; Sharp/librsvg no longer needs system fonts, fixing corrupted/unreadable text on Netlify serverless.
- `package.json` – Added opentype.js, @types/opentype.js.
- **Updates:** Ticket text now renders correctly in all environments (local + Netlify); no fontconfig or system font dependency.

## 2026-03-01 – Fix Ticket 00000000 Placeholders (Clean Base)

- `lib/ticket-image.ts` – Replaced default PNG template with programmatic `createCleanTicketBase()` (light green + dusty rose border, no baked-in text). Bypasses templates with placeholder text; overlays now show real event data. Removed unused path/fs imports and template loading.
- `docs/NETLIFY_DEPLOY.md` – Added note on SMTP env scopes (Functions + Runtime); added troubleshooting section for tickets and email on Netlify.
- **Updates:** Fixes ticket text rendering (font) and default template loading on Netlify serverless.

## 2026-03-01 – Ticket Placeholder Text and Email Delivery Fixes

- `lib/ticket-image.ts` – Changed ticket overlay backgrounds from semi-transparent (0.5) to opaque (0.98) so they fully cover any baked-in template placeholder text (e.g. "00000000").
- `lib/email.ts` – Replaced `console.warn` with `console.error` when SMTP is not configured, with clearer message referencing env vars and Netlify.
- `app/api/test-email/route.ts` – Updated POST error message to mention both .env.local and Netlify Site env vars.
- `app/admin/settings/email-ticket-settings.tsx` – Added SMTP status check on load; display warning banner when SMTP is not configured with instructions.
- **Updates:** Ticket images now render real event data over template placeholders; admins see clear SMTP-not-configured warnings in Email & Tickets settings.

## 2026-03-01 – Netlify Secrets Scan Fix

- `netlify.toml` – Added `[build.environment]` with `SECRETS_SCAN_OMIT_KEYS` (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SMTP_USER) and `SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES` (wishticketsportal@gmail.com) to prevent build failure from secrets scanning false positives.
- **Updates:** Unblocks Netlify deploys; NEXT_PUBLIC_* vars are expected in client bundle; contact email is intentionally public.

## 2026-03-01 – Build Fixes (ESLint & TypeScript)

- `app/[eventSlug]/checkout/checkout-content.tsx` – Moved useEffect before early return (rules-of-hooks); fixed setTimeout/Timeout type cast; updated pollFnRef type for optional force param.
- `app/admin/events/[id]/page.tsx` – Replaced `<a href>` with `<Link>` for ticket-layout.
- `app/api/admin/events/[id]/seating/seats/route.ts` – Changed `let seatRows` to `const seatRows` (prefer-const).
- `app/[eventSlug]/confirmation/[bookingId]/confirmation-refresh.tsx` – Fixed setTimeout/Timeout type cast.
- `app/[eventSlug]/confirmation/[bookingId]/failed-recheck.tsx` – Switched Button variant from `outline` to `secondary` (Button lacked outline).
- `components/ui/button.tsx` – Added `outline` variant to buttonVariants.
- `app/[eventSlug]/page.tsx` – Typed event from getEventBySlug as Event.
- `app/admin/events/page.tsx`, `app/admin/page.tsx` – Typed filter callbacks for event status.
- `app/admin/reports/reports-page-client.tsx`, `hooks/use-dashboard-data.ts` – Fixed circular data ref; moved autoRefresh logic into hook with refetchInterval function.
- `app/admin/settings/events-settings.tsx` – Type cast for legacy "cancelled" status migration.
- `app/admin/venues/page.tsx`, `components/admin/venues-table.tsx` – Exported VenueRow; cast venues for VenuesTable.
- `app/api/admin/events/[id]/seating/copy-from-venue/route.ts` – Added initial value to reduce.
- `app/api/admin/events/[id]/seating/positions/route.ts` – Initialized body with positions array.
- `app/dashboard/page.tsx` – Defined BookingRow type for sortByDateThenName.
- `components/admin/event-form.tsx` – Type cast for cancelled status display.
- `components/admin/reports/payment-donut.tsx`, `sections-horizontal-bar.tsx`, `vss-stacked-bar.tsx` – Relaxed Recharts formatter param types.
- `components/admin/seat-selector-setup.tsx` – Non-null assertion for grid_x/grid_y after null check.
- `components/admin/ticket-layout-editor.tsx` – Introduced RegionKey type; guarded isSquare access.
- `components/booking/inline-cart.tsx` – Added type guards for ReservationItem (seat vs section) in reduce, map, and callbacks.
- `app/[eventSlug]/book/book-page-client.tsx` – Cast sectionSeats as SeatInfo[] for SeatSelector.
- **Updates:** Resolved ESLint errors and TypeScript errors so `npm run build` succeeds.

## 2026-03-01 – Netlify Deployment Setup

- `netlify.toml` – New file with build command, publish dir, Next.js plugin.
- `package.json` – Added `netlify:build` script (next build without Turbopack) as fallback.
- `docs/NETLIFY_DEPLOY.md` – New deployment guide with env vars, PayMongo webhook, and Supabase Auth URLs.
- **Updates:** Project ready for Netlify deployment; connect repo, set env vars, and follow post-deploy steps in docs.

## 2026-02-27 – Capability enforcement & permission dialog

- `app/admin/page.tsx`, `components/admin/admin-card-link.tsx`, multiple `app/api/admin/*` routes
- **Updates:** Fixed several admin API routes to properly await capability checks so permissions now correctly gate access. The Admin Dashboard cards now respect these capabilities and, when clicked by a user without access, trigger a Permission required dialog instead of silently failing or navigating.

## 2026-02-27 – Global Settings card for super admins only

- `app/admin/page.tsx`
- **Updates:** Updated the Admin Dashboard so the Global Settings summary card is only visible to super admins, keeping advanced platform configuration entry points restricted while other cards still respect per-capability access.

## 2026-02-27 – Enforce Seats and Prices capabilities

- `app/admin/events/[id]/page.tsx`, `components/admin/edit-event-tabs.tsx`, `app/api/admin/events/[id]/pricing/route.ts`, `app/api/admin/events/[id]/seating/route.ts`, `app/api/admin/events/[id]/seating/layout/route.ts`, `app/api/admin/promo-codes/*`, `app/api/admin/events/[id]/promo-codes/route.ts`
- **Updates:** Tightened server-side guards so pricing and seating APIs now require `manage_prices` or `manage_seats` (or `manage_events` where appropriate) for all non-superadmins. The Edit Event tabs for Seat Configurator, Seat Selector Setup, Seat Pricing, and Promo Codes now only appear and function when the current user has the corresponding capabilities; otherwise, the tab content shows a read-only message explaining that they lack permission.

## 2026-02-27 – Manual Distribution tab respects capability

- `app/admin/events/[id]/page.tsx`, `components/admin/edit-event-tabs.tsx`
- **Updates:** Wired the Manual Distribution tab on the Edit Event screen to the `manage_assignments` capability. Only super admins or users with this capability now see the Manual Distribution → tab linking to assign seats; others do not see the tab and must rely on admins with appropriate permissions.

## 2026-02-27 – Remove Scan Tickets capability

- `lib/capabilities.ts`, `app/api/admin/users/[userId]/capabilities/route.ts`, `supabase/migrations/00102_remove_scan_tickets_capability.sql`
- **Updates:** Removed the Scan Tickets capability from the user roles matrix and API validation. A new migration cleans up any existing `scan_tickets` rows and updates the `valid_capability` CHECK constraint so this flag is no longer stored; ticket scanning is now governed purely by user role (non-User roles can scan) and admissions codes rather than a separate capability toggle.

## 2026-02-27 – Remove Reservations capability

- `lib/capabilities.ts`, `app/api/admin/users/[userId]/capabilities/route.ts`, multiple `app/api/admin/*` reservation/assignment routes, `app/admin/layout.tsx`, `supabase/migrations/00103_remove_manage_reservations_capability.sql`
- **Updates:** Removed the `manage_reservations` capability from shared types and the User Roles matrix. Reservation and release flows (ticket assignments, manual distribution, and booking/ticket release APIs) now rely on Admin/Super Admin roles plus existing `manage_seats`/`manage_assignments` capabilities; a new migration deletes any stored `manage_reservations` rows and updates the `valid_capability` CHECK constraint so this capability is no longer persisted.

## 2026-02-27 – Manage Event Administrators capability

- `lib/capabilities.ts`, `supabase/migrations/00100_event_admin_manager_capability.sql`, `app/api/admin/events/[id]/administrators/route.ts`, `app/api/admin/events/[id]/administrators/[userId]/route.ts`, `components/admin/event-administrators.tsx`
- **Updates:** Added a new `Manage Event Administrators` capability that super admins can assign in Global Settings → User Roles. Users with this capability who are already administrators for a given event can now add or remove other event administrators for that event, enforced via a new `is_authorized_event_admin_manager` helper and RLS policy on `event_administrators`.

## 2026-02-27 – Fix Manage Event Administrators saving in User Roles

- `app/api/admin/users/[userId]/capabilities/route.ts`
- **Updates:** Extended the capabilities API validation schema to accept the new `manage_event_administrators` capability so saving user roles in Global Settings → User Roles no longer returns an “Invalid payload” error.

## 2026-02-27 – Allow Manage Event Administrators capability in DB constraint

- `supabase/migrations/00101_update_valid_capability_manage_event_admins.sql`
- **Updates:** Updated the `valid_capability` CHECK constraint on `user_capabilities.capability` to include `manage_event_administrators`, preventing database-level errors when assigning this capability.

## 2026-02-27 – Fix New event button visibility for admins

- `app/admin/events/page.tsx`
- **Updates:** Simplified the Events admin page permission logic so the **New event** button now relies directly on the same `requireSuperAdminOrCapability("manage_events")` check used to guard the route, ensuring eligible admins consistently see the button.

## 2026-02-27 – Admins can create events and become event administrators

- `app/admin/events/new/page.tsx`, `app/admin/events/page.tsx`, `app/api/admin/events/route.ts`, `supabase/migrations/00099_assign_event_admin_helper.sql`
- **Updates:** Expanded permissions so admins with the `manage_events` capability can open the New Event screen and see the **New event** button on the Events page. When an event is created, the creator is now automatically added to `event_administrators` (via the `assign_event_admin` helper), ensuring the admin who created the event can see and manage it through the existing RLS-backed admin views.

## 2026-02-27 – Back to Dashboard button on Events

- `app/admin/events/page.tsx`
- **Updates:** Added a compact yellow “← Back to Dashboard” button above the Events list so admins can quickly return to the admin dashboard, keeping the New event button on the right.

## 2026-02-27 – Remove admin section nav links

- `app/admin/layout.tsx`
- **Updates:** Removed the internal Admin navigation bar (Dashboard, Events, Ticket layout, Venues, Reports, Manual Distribution, Promo Codes, Global Settings) so only the main site header remains above admin pages.

## 2026-02-27 – Uniform Reports card size

- `app/admin/page.tsx`
- **Updates:** Adjusted the secondary dashboard grid to use the same column configuration as the primary stats row so the Reports card now has the same width as the other admin dashboard cards.

## 2026-02-27 – Separate Reports card on admin dashboard

- `app/admin/page.tsx`
- **Updates:** Adjusted the admin dashboard layout so the Reports card (showing total bookings with a link to View reports) sits on its own row below the main Events/Venues/Ticket layout/Global Settings cards for clearer grouping.

## 2026-02-27 – Ticket layout tab inside Global Settings

- `app/admin/settings/ticket-layout-settings.tsx` (new), `app/admin/settings/page.tsx`, `app/admin/ticket-layout/page.tsx`
- **Updates:** Added a Ticket layout tab to Global Settings that reuses a shared `TicketLayoutSettings` server component. The standalone `/admin/ticket-layout` page now renders the same content so admins can adjust layouts either from the dedicated page or from Global Settings.

## 2026-02-27 – Promo Codes tab inside Global Settings

- `app/admin/settings/page.tsx`, `app/admin/promo-codes/page.tsx`
- **Updates:** Extracted the general promo codes UI into a reusable `PromoCodesSettings` component and added it as a new “Promo Codes” tab inside Global Settings so admins can manage global discounts alongside other configuration.

## 2026-02-27 – Rename admin nav/settings card to Global Settings

- `components/admin/admin-nav.tsx`, `app/admin/page.tsx`
- **Updates:** Updated the admin top nav and dashboard summary card to label the configuration area as “Global Settings”, matching the renamed admin settings page.

## 2026-02-27 – Rename admin Settings heading to Global Settings

- `app/admin/settings/page.tsx`
- **Updates:** Updated the admin settings page heading from “Settings” to “Global Settings” to better distinguish platform-wide configuration from per-user Profile Settings in the dashboard.

## 2026-02-27 – Move user settings to dashboard & remove sales analytics

- `app/admin/settings/page.tsx`, `app/dashboard/settings/page.tsx`
- **Updates:** Removed the User Settings and Sales Analytics tabs from the admin Settings screen. User profile editing now lives under the dashboard at Profile Settings, clarifying that it’s a per-user preference screen rather than an admin configuration panel.

## 2026-02-27 – Clear Cart confirmation dialog

- `components/booking/inline-cart.tsx`
- **Updates:** Added a confirmation dialog when clicking Clear Cart in the booking inline cart so buyers must confirm before all tickets are removed and reserved seats are released.

## 2026-02-27 – Styling Back to Events confirm dialog

- `components/ui/confirm-dialog.tsx`, `app/[eventSlug]/book/book-page-client.tsx`
- **Updates:** Enhanced the Back to Events confirmation dialog so its title uses the Wish orange accent color and the \"Stay here\" button is styled as a green success action, making the safer choice more visually prominent.

## 2026-02-27 – Back to Events confirm when cart active

- `app/[eventSlug]/book/book-page-client.tsx`
- **Updates:** Back to Events button now opens a confirmation dialog when there are reserved items and an active timer, letting buyers choose to stay on the booking page or continue back to the events list.

## 2026-02-27 – Yellow Back to Events button on booking page

- `app/[eventSlug]/book/book-page-client.tsx`
- **Updates:** Converted the \"← Back to events\" text link above the seat map into a compact yellow button using the shared Button component for better visual prominence and consistency with the rest of the UI.

## 2026-02-27 – Section color picker for all seating types

- `components/admin/seat-configurator.tsx`
- **Updates:** Expanded the section color palette to a richer set of high-contrast swatches and enabled the color picker for all seating types (Assigned, Free Seating, Standing). Selected colors continue to flow through to the buyer seat map and open-section cards for clearer visual grouping.

## 2026-02-27 – Show Sold Out badge for fully booked VIP sections

- `app/[eventSlug]/book/book-page-client.tsx`
- **Updates:** Assigned seating section headers (e.g. VIP 1) now compute availability from `sections[].available` and show a \"Sold Out\" badge when `available <= 0`, matching the behavior of the free/standing SectionPicker. Buyers can immediately see that a section has no remaining seats.

## 2026-02-27 – Rename free/standing section header

- `app/[eventSlug]/book/book-page-client.tsx`
- **Updates:** Renamed \"Free / standing sections\" to \"Open Section (No Seat Selection)\" above the SectionPicker for clarity on how these tickets work.

## 2026-02-27 – Cart timer no longer resets on seat selection

- `app/api/reservations/route.ts`
- **Updates:** POST handler preserves existing cart's `expires_at` when updating items. Removed unconditional `update({ expires_at })` that was resetting the countdown on every sync. Response now returns `existingCart?.expires_at ?? expiresAt`.

## 2026-02-27 – Event details popup: larger dialog

- `components/event-card.tsx`
- **Updates:** Increased event details modal size from max-w-2xl to max-w-4xl. Added max-h-[90vh] and overflow-y-auto for tall content.

## 2026-02-27 – Event page: Back to Events beside Choose seats

- `app/[eventSlug]/page.tsx`
- **Updates:** Removed "← Back to events" link from top. Added "Back to Events" button beside "Choose seats" at the bottom (secondary style).

## 2026-02-27 – Event filter options from actual events

- `components/event-filter-dialog.tsx`, `components/event-grid.tsx`
- **Updates:** Year, Month, Province, and City filter options are now derived from the events data. Only years with events appear in the Year dropdown (e.g. 2029 if a 2029 event exists). Months show only months that have events; when a year is selected, months are scoped to that year. Province and City lists are filtered to locations that have events.

## 2026-02-27 – Event filter (Year, Month, Province, City)

- `app/api/geography/route.ts` (new), `app/api/events/route.ts`, `lib/types.ts`, `components/event-filter-dialog.tsx` (new), `components/event-grid.tsx`
- **Updates:** Filter button opens dialog with Year, Month, Province, City selectors. Defaults to no selection (All years, All months, All provinces, All cities). Public geography API for provinces/cities. Client-side filtering by event date and venue location. Venue response includes province_id, city_id for filtering.

## 2026-02-27 – Clickable event cards (remove View Details button)

- `components/event-card.tsx`
- **Updates:** Removed "View Details" button from event cards. Entire card is now clickable to open the details modal. Card image no longer uses PhotoView (zoom still available in modal). Venue map link stops propagation so it opens in new tab.

## 2026-02-27 – Remove Admin and Settings from header

- `components/header.tsx`
- **Updates:** Removed Admin link from main nav (beside Contact). Removed both Settings buttons (standalone header button and dropdown item). Admin remains in user dropdown for admin/super_admin.

## 2026-02-27 – Venue delete (super_admin only)

- `app/api/admin/venues/[id]/route.ts`, `app/admin/venues/page.tsx`, `components/admin/venues-table.tsx`
- **Updates:** Delete button for venues visible only to super_admin. Confirmation dialog before delete. API checks for linked events and returns 409 if any exist. Sections and seats cascade-delete via DB.

## 2026-02-27 – Venue Province and City/Municipality selectors

- `supabase/migrations/00098_provinces_cities.sql` (new), `scripts/generate-psgc-seed.js` (new), `supabase/seed-psgc.sql` (generated), `supabase/seed.sql`, `app/api/admin/geography/route.ts` (new), `components/admin/venue-form.tsx`, `app/api/admin/venues/route.ts`, `app/api/admin/venues/[id]/route.ts`, `app/admin/venues/page.tsx`, `app/admin/venues/[id]/page.tsx`, `components/admin/venues-table.tsx`, `app/admin/events/new/page.tsx`, `app/admin/events/[id]/page.tsx`, `components/admin/event-form.tsx`, `app/api/events/route.ts`, `app/[eventSlug]/page.tsx`, `lib/types.ts`; package.json (generate:psgc-seed script, philippine-location-json-for-geer)
- **Updates:** Replaced venue Address with Province + City/Municipality cascading selectors. Database: provinces and cities tables; venues.province_id, venues.city_id (address dropped). Full Philippines PSGC data (84 provinces, 1648 cities) via seed-psgc.sql. Geography API: GET /api/admin/geography (provinces) and ?province_id= (cities). Venues table shows Location (City, Province). Event form and venues select use id, name only.

## 2026-02-27 – Venues admin: search at top

- `components/admin/venues-table.tsx` (new), `app/admin/venues/page.tsx`
- **Updates:** Added search input at top of Venues page. Search filters by venue name and address (client-side). Empty state shows "No venues match your search." when filtered.

## 2026-02-27 – Contact page: single Reach Us card with form

- `app/contact/contact-content.tsx`
- **Updates:** Removed separate Reach Us info card. Renamed Contact Us card to Reach Us, added mail icon. Single centered form card now titled Reach Us with subtitle.

## 2026-02-27 – Contact form success dialog

- `app/contact/contact-content.tsx`
- **Updates:** Replaced success toast with a success dialog (CheckCircle icon, emerald styling, Ok button) when contact form is submitted successfully.

## 2026-02-27 – Larger titles for open sections

- `components/seat-picker/section-picker.tsx`
- **Updates:** Increased the text size and weight of Free/Standing (open section) titles to match assigned section headers (e.g. VIP 1), improving readability and visual hierarchy in the \"Open Seating\" area.

## 2026-02-27 – Beautify Contact page and add Contact Us form

- `lib/email.ts`, `app/api/contact/route.ts` (new), `app/contact/contact-content.tsx` (new), `app/contact/page.tsx`, `components/ui/floating-progress.tsx`
- **Updates:** Contact page redesigned with hero section, info card (email wishticketsportal@gmail.com), and Contact Us form. Form submissions POST to /api/contact and are emailed to the team. FloatingProgressBar supports optional message/subMessage props.

## 2026-02-27 – Admissions Staff Login visible only to staff roles

- `components/header.tsx`
- **Updates:** "Admissions Staff Login" link in header now shown only when user is logged in with role admin, super_admin, or admissions_staff; hidden for unauthenticated users and regular users.

## 2026-02-27 – Event Administrators dropdown: Name (Email) + searchable

- `components/admin/event-administrators.tsx`
- **Updates:** Replaced Radix Select with custom searchable combobox; users display as "Name (Email)"; super admin can type to filter users by name or email.

## 2026-02-27 – Fix User Roles Invalid payload (manage_assignments)
- `app/api/admin/users/[userId]/capabilities/route.ts`
- **Updates:** Add manage_assignments to capabilities schema so saving User Roles no longer returns 400 Invalid payload.

## 2026-02-27 – Event Administrator Assignments
- `supabase/migrations/00097_event_administrators.sql` (new)
- `app/api/admin/events/[id]/administrators/route.ts`, `app/api/admin/events/[id]/administrators/[userId]/route.ts` (new)
- `components/admin/event-administrators.tsx` (new)
- `components/admin/edit-event-tabs.tsx`, `app/admin/events/[id]/page.tsx`
- `app/admin/events/new/page.tsx`, `app/admin/events/page.tsx`
- `app/api/admin/events/[id]/admissions-codes/route.ts`
- **Updates:** Super admin assigns Event Administrators per event. Admins/manage_events see only assigned events. New event restricted to super admin. Event Administrators tab in Edit Event (super admin only).

## 2026-02-27 – Fix profiles RLS infinite recursion
- `supabase/migrations/00096_fix_profiles_policy_recursion.sql` (new)
- **Updates:** Recreate "Manage users can read all profiles" without profiles-based check; use user_capabilities only to avoid recursion reintroduced by 00092.

## 2026-02-27 – Admissions Control title and event above cards
- `app/admissions/scan/page.tsx`
- **Updates:** "Admissions Control" as main title above cards; event title displayed below it.

## 2026-02-27 – Lists show Section, Row, Seat per ticket
- `supabase/migrations/00095_admission_records_seat_info.sql` (new)
- `app/api/admissions/scan/route.ts`, `app/api/admissions/records/route.ts`
- `app/admissions/scan/page.tsx`
- **Updates:** admission_records stores section_label, row_label, seat_number. Admitted and Grant Re-Entry lists display Section · Row · Seat in yellow below each ticket.

## 2026-02-27 – Admitted successfully: show Section, Row, Seat
- `app/api/admissions/scan/route.ts`, `app/admissions/scan/page.tsx`
- **Updates:** Scan API returns section, row, seatNumber. Display below "Admitted successfully." when available.

## 2026-02-27 – Invalid admissions code: dialog popup
- `app/admissions/login/page.tsx`
- **Updates:** Show AlertDialog instead of toast for invalid code, empty code, and request failed.

## 2026-02-27 – Admissions Staff Login always asks for code
- `components/header.tsx`, `app/admissions/login/page.tsx`
- **Updates:** "Admissions Staff Login" links to /admissions/login. Login page clears session on load and shows admissions code form every time.

## 2026-02-26 – Ticket not found: dialog popup
- `app/admissions/scan/page.tsx`
- **Updates:** Show AlertDialog instead of toast when scan returns 404 "Ticket not found".

## 2026-02-26 – Admission lists persisted in DB, filtered by admissions code
- `supabase/migrations/00094_admission_records.sql` (new)
- `app/api/admissions/scan/route.ts`, `app/api/admissions/records/route.ts` (new)
- `app/admissions/scan/page.tsx`
- **Updates:** Admitted and Grant Re-Entry lists stored in `admission_records` table. Each admissions code sees only its own punched tickets. Lists fetched from API on load and after each scan.

## 2026-02-26 – Re-entry dialog: no auto-switch; list height + newest first
- `app/admissions/scan/page.tsx`
- **Updates:** Re-entry granted dialog no longer auto-switches toggle on OK. List card height matches scan card. Lists sorted newest-first.

## 2026-02-26 – Scan page: separate cards, date/time, search
- `app/admissions/scan/page.tsx`
- **Updates:** Two separate centered cards (scan + list). List shows date/time per ticket. Search box filters ticket codes in both columns.

## 2026-02-26 – Admitted and Grant Re-Entry ticket lists
- `app/admissions/scan/page.tsx`
- **Updates:** Two-column list on the right (desktop) or below (mobile): Admitted and Grant Re-Entry. Updated step-by-step as tickets are processed. Cleared on Switch Event.

## 2026-02-26 – Re-entry granted: dialog popup + switch to Admit on OK
- `app/admissions/scan/page.tsx`
- **Updates:** "Re-entry granted" now shows AlertDialog instead of toast. On OK, toggle automatically switches to Admit ticket.

## 2026-02-26 – Re-Entry is already granted dialog: red title
- `app/admissions/scan/page.tsx`
- **Updates:** "Re-Entry is already granted" dialog title now displays in red.

## 2026-02-26 – Admit ticket toggle: green when selected
- `app/admissions/scan/page.tsx`
- **Updates:** Toggle shows green when Admit ticket is selected, orange when Grant Re-Entry is selected.

## 2026-02-26 – Admit / Grant Re-Entry: toggle instead of buttons
- `app/admissions/scan/page.tsx`
- **Updates:** Replaced segmented buttons with a Switch toggle between "Admit ticket" (left) and "Grant Re-Entry" (right).

## 2026-02-26 – Rename Re-Entry to Grant Re-Entry
- `app/admissions/scan/page.tsx`
- **Updates:** Toggle and action button labels changed from "Re-Entry" to "Grant Re-Entry".

## 2026-02-26 – Ticket already admitted dialog: red title
- `app/admissions/scan/page.tsx`
- **Updates:** "Ticket already admitted" dialog title now displays in red.

## 2026-02-26 – Re-entry used dialog: green title
- `components/ui/alert-dialog.tsx`, `app/admissions/scan/page.tsx`
- **Updates:** Added optional titleClassName to AlertDialog. "Re-entry used" dialog title now displays in green.

## 2026-02-26 – Admit vs Re-Entry selection toggle
- `app/admissions/scan/page.tsx`
- **Updates:** Replaced two buttons with horizontal segmented toggle (Admit ticket left, Re-Entry right). Single action button and QR scanning follow selected mode.

## 2026-02-26 – Pause QR scanner when alert dialog open
- `app/admissions/scan/page.tsx`
- **Updates:** QR scanner ignores scans while any alert dialog is open to prevent scan looping (e.g. "Ticket already admitted").

## 2026-02-26 – Ticket already admitted: dialog popup
- `app/admissions/scan/page.tsx`
- **Updates:** "Ticket already admitted" now shows an AlertDialog instead of a toast, with guidance to use Re-Entry if the person needs to leave and return.

## 2026-02-26 – Re-Entry logic with re_entry_allowed
- `supabase/migrations/00093_tickets_re_entry_allowed.sql`
- `app/api/admissions/scan/route.ts`
- `app/admissions/scan/page.tsx`
- `components/ui/alert-dialog.tsx`
- **Updates:** Re-Entry uses `re_entry_allowed` column. Re-Entry button sets it TRUE; duplicate Re-Entry shows "Re-Entry is already granted" dialog; Admit on re-entry-granted ticket sets it FALSE and shows "Re-entry used" dialog. Added AlertDialog component.

## 2026-02-26 – Scan page: Re-Entry button
- `app/admissions/scan/page.tsx`, `app/api/admissions/scan/route.ts`
- **Updates:** Added Re-Entry button below Admit ticket. Re-Entry allows scanning already-admitted tickets (e.g. re-entry after leaving). API accepts optional `re_entry` flag. When scan fails with "already admitted", manual input is populated so user can click Re-Entry.

## 2026-02-26 – Scan API: clearer 400 error messages
- `app/api/admissions/scan/route.ts`
- **Updates:** Return specific validation errors (e.g. "Invalid uuid") instead of generic "Invalid payload" when schema validation fails.

## 2026-02-26 – Scan page: Admit ticket button yellow
- `app/admissions/scan/page.tsx`
- **Updates:** Admit ticket button color changed to yellow.

## 2026-02-26 – Scan page: Switch Event / Back to home styling
- `app/admissions/scan/page.tsx`
- **Updates:** Center-aligned Switch Event and Back to home buttons; orange for Switch Event, green for Back to home.

## 2026-02-26 – Scan page: Switch Event label + QR scanner with flip
- `app/admissions/scan/page.tsx`
- `package.json` (added @yudiel/react-qr-scanner)
- **Updates:** Renamed "Use different code" to "Switch Event". Added webcam QR scanner with flip (front/rear) controls, flip horizontal (mirror) control, finder overlay, and manual input fallback. Uses FloatingProgressBar during admit.

## 2026-02-26 – Admissions codes API use admin client
- `app/api/admin/events/[id]/admissions-codes/route.ts`
- **Updates:** Use createAdminClient for event_admissions_codes operations to bypass RLS; fixes 500/404 when Generate code fails due to policy state.

## 2026-02-26 – Remove usher role
- `supabase/migrations/00092_remove_usher_role.sql` (new)
- `lib/auth.ts`
- `app/api/admin/users/[userId]/role/route.ts`
- `app/admin/settings/capability-matrix.tsx`
- `app/api/admin/tickets/[id]/image/route.ts`, `send-email/route.ts`, `release/route.ts`
- `app/api/admin/assignments/[id]/route.ts`, `confirm/route.ts`, `reverse/route.ts`, `send-email/route.ts`, `seats/[seatId]/route.ts`
- `app/api/admin/events/[id]/assign-seats/route.ts`, `assignments/route.ts`
- `app/api/admin/ticket-assignments/route.ts`
- `app/api/admin/bookings/[id]/release/route.ts`
- `app/admin/reports/page.tsx`
- `README.md`
- **Updates:** Removed usher role from app_role enum. Existing usher users migrated to admissions_staff. Admin can now only assign admissions_staff (not usher) to users. Role dropdown and capability matrix updated.

## 2026-02-26 – Admissions Code flow (no login)
- `supabase/migrations/00091_event_admissions_codes.sql` (new)
- `lib/admissions-session.ts` (new)
- `components/admin/event-admissions-codes.tsx` (new)
- `app/api/admin/events/[id]/admissions-codes/route.ts` (new)
- `app/api/admissions/validate-code/route.ts` (new)
- `app/api/admissions/session/route.ts` (new)
- `app/api/admissions/clear-session/route.ts` (new)
- `components/admin/edit-event-tabs.tsx`
- `app/admin/events/[id]/page.tsx`
- `components/header.tsx`
- `lib/supabase/middleware.ts`
- `app/admissions/login/page.tsx`
- `app/admissions/scan/page.tsx`
- `app/api/admissions/scan/route.ts`
- **Updates:** Admissions Staff Login now goes directly to Scan ticket page. Staff enter an Admissions Code (per-event, generated in admin) instead of email/password. Event selection removed; each code is tied to a specific event. New Admissions Codes tab in event admin to generate codes.

## 2026-02-26 – Event card date and time on one line
- `components/event-card.tsx`
- **Updates:** Date and time combined on a single line (e.g. "Mar 14, 2026 · 04:00 PM") on event cards.

## 2026-02-26 – Sharable event details page and modal flow
- `app/[eventSlug]/page.tsx` (new)
- `components/event-card.tsx`
- **Updates:** Added dedicated event page at `/{eventSlug}` (image, description, venue, date, Choose seats). Modal button changed to "View Event Details" linking to event page instead of booking page.

## 2026-02-26 – EARLY BIRD PROMO as overlay badge on event cards
- `components/event-card.tsx`
- **Updates:** EARLY BIRD PROMO badge now overlays the card image (top-right, -rotate-6) like the Sold Out badge; no longer takes vertical space in the card body.

## 2026-02-26 – Remove description from home page event cards
- `components/event-card.tsx`
- **Updates:** Description no longer shown on listing cards; only visible in View Details modal.

## 2026-02-26 – Buyer seat selection cards: bright/white with opacity
- `app/globals.css`
- `app/[eventSlug]/book/book-page-client.tsx`
- **Updates:** Added `.glass-light` (white/12 opacity, blur, light border). Replaced `glass` with `glass-light` on all buyer seat selection section cards (VIP, Free/standing, no-map fallback).

## 2026-02-26 – Dynamic seat text color based on background (light=black, dark=white)
- `lib/utils.ts`
- `components/admin/seat-selector-setup.tsx`
- `components/admin/seat-grid.tsx`
- `components/seat-picker/seat-selector.tsx`
- `components/seat-picker/seat-map.tsx`
- **Updates:** Added `getContrastTextColor(bgColor)` utility. Seat chips and buttons now use black text on light backgrounds and white text on dark backgrounds for better readability.

## 2026-02-26 – Copy column direction to Seat Selector Setup
- `components/admin/seat-selector-setup.tsx`
- **Updates:** Seat Selector Setup now respects `column_direction` from sections. `autoPlaceSeats` reverses seat order within each row for right-to-left sections (Reset positions and initial load). `arrangeAsGridInSection` (Grid button) also respects direction when arranging selected seats.

## 2026-02-26 – Fix direction affecting grid display (persist and render right-to-left)
- `supabase/migrations/00090_event_sections_column_direction.sql`
- `app/api/admin/events/[id]/seating/seats/route.ts`
- `app/api/admin/events/[id]/seating/route.ts`
- `components/admin/seat-configurator.tsx`
- `components/admin/seat-grid.tsx`
- **Updates:** Direction was only used at generation time; SeatGrid always sorted columns 1,2,3… so Right to Left appeared as Left to Right. Now: (1) `column_direction` persisted on event_sections when generating, (2) seating API returns it, (3) SeatGrid reverses column order when right-to-left (6,5,4,3,2,1 left to right).

## 2026-02-26 – Add direction buttons for seat generation (Left to Right / Right to Left)
- `app/api/admin/events/[id]/seating/seats/route.ts`
- `components/admin/seat-configurator.tsx`
- **Updates:** Seat generation now supports column direction: Left to Right (1…10) or Right to Left (10…1). Direction toggle buttons added next to Rows/Columns in the assigned seating config. API accepts optional `column_direction`.

## 2026-02-26 – Fix marquee selection gap (mouse pointer and rect not synced)
- `components/admin/seat-selector-setup.tsx`
- **Updates:** `getCanvasCoords` was dividing by `sectionZoom * uniformScale`, causing the marquee rect to appear offset from the cursor. Now divides only by `sectionZoom` so the marquee follows the mouse correctly in the canvas coordinate system.

## 2026-02-26 – Reset positions arranges seats chronologically (A1…A10, B1…B10, etc.)
- `components/admin/seat-selector-setup.tsx`
- **Updates:** "Reset positions" now forces a chronological grid layout (A1, A2, … A10; B1, B2, … B10; C1, C2, …) instead of reusing saved grid positions. Added `forceChronological` option to `autoPlaceSeats`.

## 2026-02-26 – Add row letters for seat labels (A1, A2, etc.)
- `components/admin/seat-selector-setup.tsx`
- `components/seat-picker/seat-selector.tsx`
- `components/seat-picker/seat-map.tsx`
- **Updates:** Seat chips now display `row_label` + `seat_number` (e.g. A1, A2, B3) instead of only the seat number. Admin layout editor, buyer map view, and buyer grid view all show the combined label.

## 2026-02-26 – Fix seat drag boundary cap
- `components/admin/seat-selector-setup.tsx`
- **Updates:** Seat drag handler now uses each section's actual canvas size when clamping positions. Sections with taller background images can have seats dragged to the full extent of the image instead of being capped at 900px.

## 2026-02-26 – Admin Reset positions button per section
- `components/admin/seat-selector-setup.tsx`
- **Updates:** Each section card now has a "Reset positions" button that resets all seats in that section to their default grid layout. Uses undo history.

## 2026-02-26 – Seat selector sections default to collapsed (buyer and admin)
- `app/[eventSlug]/book/book-page-client.tsx`
- `components/admin/seat-selector-setup.tsx`
- **Updates:** Buyer seat selector sections (map and grid) now default to collapsed. Admin Seat Selector Setup section cards are now collapsible and default to collapsed. Click section header to expand/collapse.

## 2026-02-26 – Per-section seat selector cards with individual backgrounds and controls
- `supabase/migrations/00088_event_sections_seat_layout.sql` (new)
- `supabase/migrations/00089_availability_section_layout.sql` (new)
- `app/api/admin/events/[id]/seating/sections/[sectionId]/layout/route.ts` (new)
- `components/admin/seat-selector-setup.tsx`
- `app/[eventSlug]/book/book-page-client.tsx`
- `app/api/admin/events/[id]/seating/route.ts`
- **Updates:** Seat selector (admin and buyer) now renders each section in its own card. Admin Seat Selector Setup: one card per section with section-specific background image upload, opacity, zoom, reset, drag, marquee, align, distribute. Buyer: map and grid sections each in collapsible cards with per-section background (falls back to event-level when section has none). DB: event_sections.seat_layout_image_url, seat_layout_scale, seat_layout_opacity. New PATCH section layout API. get_event_availability returns background_image_url, background_scale, background_opacity per section.

## 2026-02-25 – Role assignment hierarchy
- `supabase/migrations/00087_set_user_role_rpc.sql` (new)
- `app/api/admin/users/[userId]/role/route.ts` (new)
- `app/api/admin/users/route.ts`
- `app/admin/settings/page.tsx`
- `app/admin/settings/capability-matrix.tsx`
- **Updates:** Role assignment with hierarchical permissions. Super Admin: can assign any role (User, Admin, Admissions Staff, Usher). Admin: can only set User → Admissions Staff or Usher. Admissions Staff/Usher: cannot assign any role. User Roles tab now visible to admin and super_admin. Added Role column with dropdown; capability checkboxes disabled for admin (super_admin only).

## 2026-02-25 – Reports button styling and View Ticket in-page
- `components/admin/reports-table.tsx`
- **Updates:** View Ticket: simple button (no icon), orange color, uses react-photo-view to show ticket image in-page lightbox instead of new tab. Release button: red (destructive variant).

## 2026-02-25 – Per-seat Send Email and View Ticket on Reports
- `supabase/migrations/00086_report_tickets_recipient_email_image.sql` (new)
- `app/api/admin/tickets/[id]/send-email/route.ts` (new)
- `app/api/admin/tickets/[id]/image/route.ts` (new)
- `components/admin/reports-table.tsx`
- **Updates:** Reports table now shows per-seat actions: Send Email (only when recipient_email exists, for manual distributions), View Ticket (opens PNG in new tab for download). RPC returns recipient_email and ticket_image_url. Image route generates on-demand if missing.

## 2026-02-25 – Send email counter
- `supabase/migrations/00085_admin_seat_assignments_email_sent_count.sql` (new)
- `app/api/admin/assignments/[id]/send-email/route.ts`
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx`
- **Updates:** Added email_sent_count column to admin_seat_assignments. Button shows "Send email (N)" where N is the number of times email was sent successfully. Count increments on each successful send.

## 2026-02-25 – Manual distribution confirmed dialog
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx`
- **Updates:** Replaced "Manual distribution confirmed" toast with a success dialog (CheckCircle icon, emerald styling, Ok button). Dialog explains that tickets are confirmed and a booking was created.

## 2026-02-25 – Manage seats for reserved manual distribution
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx`
- `app/api/admin/assignments/[id]/seats/[seatId]/route.ts` (new)
- **Updates:** For reserved (unconfirmed) manual distributions, added "Manage seats" button that opens a dialog listing each seat with a Remove button. DELETE API removes seat from assignment and auto-deletes assignment when last seat is removed. Dialog enlarged (max-w-2xl, max-h-85vh), seats grouped by section. Sections are collapsible; each section has "Remove section" to delete all seats in that section.

## 2026-02-25 – Email sent dialog
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx`
- **Updates:** Replaced "Email sent" toast with a success dialog (CheckCircle icon, emerald styling, Ok button). Shows recipient email when available.

### 2026-02-25 – Manual Distribution button order and colors

**Updates:** Order: View booking, Reverse, Send email. Colors: View booking (orange), Reverse (red), Send email (green).

**Edited files:**
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx`

---

### 2026-02-25 – View booking as button

**Updates:** "View booking" in Manual Distribution is now a Button (secondary variant) instead of a text link.

**Edited files:**
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx`

---

### 2026-02-25 – Arrange Manual Distribution buttons

**Updates:** Reordered confirmed-assignment actions: View booking first, then Send email/Add email, then Reverse (with visual separator). Wrapped in flex layout for consistent spacing.

**Edited files:**
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx`

---

### 2026-02-25 – Fix sendManualDistributionEmail "is not a function"

**Updates:** Moved sendManualDistributionEmail to dedicated lib/send-manual-distribution-email.ts to resolve Turbopack bundling/import issue. Route now imports from the new module.

**Edited files:**
- `lib/send-manual-distribution-email.ts` (new)
- `lib/email.ts` – removed sendManualDistributionEmail
- `app/api/admin/assignments/[id]/send-email/route.ts` – import path

---

### 2026-02-25 – Fix migration 00084: DROP before CREATE for return type change

**Updates:** Migration 00084 failed with "cannot change return type of existing function". Added `DROP FUNCTION IF EXISTS public.get_admin_seat_assignments(uuid)` before CREATE and re-added `GRANT EXECUTE` after.

**Edited files:**
- `supabase/migrations/00084_get_admin_seat_assignments_recipient_email.sql`

---

### 2026-02-25 – Send email for manual distribution

**Updates:** Admins can send ticket emails to manual distribution recipients. Added recipient_email to admin_seat_assignments; assign form accepts optional email; confirmed distributions show "Send email" (or "Add email" when missing). Email uses template: "Your Event Tickets Have Been Assigned" with event, section, seat details and attached ticket images.

**Edited files:**
- `supabase/migrations/00083_admin_seat_assignments_recipient_email.sql` (new) – add recipient_email column
- `supabase/migrations/00084_get_admin_seat_assignments_recipient_email.sql` (new) – RPC returns recipient_email
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` – recipient email input, Send email / Add email buttons, FloatingProgressBar
- `app/api/admin/events/[id]/assign-seats/route.ts` – accept recipient_email
- `app/api/admin/assignments/[id]/route.ts` – PATCH for recipient_email
- `app/api/admin/assignments/[id]/send-email/route.ts` (new) – send ticket email to recipient
- `lib/email.ts` – sendManualDistributionEmail

---

### 2026-02-25 – Rename "Assign seats" to Manual Distribution

**Updates:** All remaining "Assign seats" labels renamed to "Manual Distribution" (page heading and edit-event tab).

**Edited files:**
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` – page h1 heading
- `components/admin/edit-event-tabs.tsx` – tab link label

---

### 2026-02-25 – Rename Assignment to Manual Distribution

**Updates:** User-facing labels renamed from "Assignment" to "Manual Distribution" across admin nav, assign-seats page, ticket-assignments page, capability label, toasts, dialogs, and API error messages. URLs, API routes, and DB schema unchanged.

**Edited files:**
- `components/admin/admin-nav.tsx` – nav link label
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` – panel header, empty state, toasts, dialogs
- `app/admin/ticket-assignments/page.tsx` – page title, description, empty state
- `lib/capabilities.ts` – capability label
- `app/api/admin/assignments/[id]/confirm/route.ts` – error messages
- `app/api/admin/assignments/[id]/reverse/route.ts` – error messages
- `app/api/admin/assignments/[id]/route.ts` – error message
- `app/api/admin/events/[id]/assign-seats/route.ts` – error messages

---

### 2026-02-25 – Cleanup: add booking-driven pass alongside payment-driven

**Updates:** Cleanup cron now runs two passes: (1) payment-driven (existing) – payments pending/failed &gt; 3 min; (2) booking-driven (new) – bookings pending &gt; 3 min. Fixes pending bookings not being cleaned when payment record is missing or has unexpected state.

**Edited files:**
- `supabase/migrations/00082_cleanup_pending_bookings_driven.sql` (new) – both passes in cleanup_stale_pending_payments
- `app/api/cron/cleanup-pending-payments/route.ts` – add booking-driven pass

---

### 2026-02-25 – Reset cart timer on Proceed to payment

**Updates:** When user clicks "Proceed to payment", call POST /api/reservations first to extend the cart timer, then proceed with checkout. Gives buyer a full timer window to complete payment in PayMongo. BroadcastChannel syncs new expiresAt to other tabs.

**Edited files:**
- `app/[eventSlug]/checkout/checkout-content.tsx` – extend cart before checkout, setCart, BroadcastChannel

---

### 2026-02-25 – Payment failed: show failed message and Return to Seat Selection button

**Updates:** When payment is marked failed, display an on-screen failed message with a "Return to Seat Selection" button instead of immediately redirecting with a toast.

**Edited files:**
- `app/[eventSlug]/checkout/checkout-content.tsx` – paymentFailed state, failed UI with Return to Seat Selection button

---

### 2026-02-25 – Check payment status button: fix failed/expired not updating

**Updates:** "Check payment status" button now bypasses in-flight guard so manual clicks always run a poll. Added visual feedback (button shows "Checking…" when clicked). PayMongo: added retrieveSource to fetch source status when payment has source.id but no embedded status; improved last_payment_error parsing. Visibility handler forces poll when user returns to tab.

**Edited files:**
- `app/[eventSlug]/checkout/checkout-content.tsx` – poll(force), checkingStatus feedback, disabled state on button
- `lib/paymongo.ts` – retrieveSource for expired detection, broader last_payment_error parsing

---

### 2026-02-25 – Payment status polling fix

**Updates:** Checkout poll interval increased from 200ms to 2s with in-flight guard to prevent request stacking. Added visibilitychange listener for immediate poll when user returns to tab. Added "Check payment status" button (checks both confirmed and failed) and error handling with Retry / Go to confirmation fallback. Confirmation page now polls status API instead of full page reload.

**Edited files:**
- `app/[eventSlug]/checkout/checkout-content.tsx` – poll 2s, in-flight guard, visibilitychange, Check payment status button, pollError handling
- `app/[eventSlug]/confirmation/[bookingId]/confirmation-refresh.tsx` – client-side status poll instead of full reload

---

### 2026-02-25 – Faster payment status updates (webhook + poll)

**Updates:** PayMongo webhook now returns 200 immediately after DB updates; email/ticket work runs in background via `after()`. Checkout poll interval reduced from 300ms to 200ms for quicker status detection.

**Edited files:**
- `app/api/webhooks/paymongo/route.ts` – use `after()` to defer confirmBooking; return 200 after status update
- `app/[eventSlug]/checkout/checkout-content.tsx` – poll interval 200ms

---

### 2026-02-25 – Payment failure detection: fetch payments by ID, webhook docs

**Updates:** When the link response lacks payment details, we now fetch each payment via GET /payments/{id} (from link relationships) to detect expired source status. Improved PAYMONGO_SETUP docs: link.payment.failed is required for fast failure detection; verify webhook URL (ngrok for local).

**Edited files:**
- `lib/paymongo.ts`
- `docs/PAYMONGO_SETUP.md`

---

### 2026-02-25 – Failed payment: auto-release seats, clear cart

**Updates:** When payment fails (status API or webhook), seats are now released immediately (event_seats → available), tickets deleted, and reservation store cleared. User can re-select seats right away.

**Edited files:**
- `lib/release-failed-booking.ts` (new)
- `app/api/bookings/[bookingId]/status/route.ts`
- `app/api/webhooks/paymongo/route.ts`
- `app/[eventSlug]/checkout/checkout-content.tsx`

---

### 2026-02-25 – Confirmation: fast status response, background email

**Updates:** Status API no longer blocks on confirmBooking (ticket images + email). Uses confirmBookingStatusOnly for quick DB updates (~100ms), returns "confirmed" immediately, then runs full confirmBooking (email) in background. Fixes "took forever to confirm" — redirect now happens in &lt;1s after payment.

**Edited files:**
- `lib/confirm-booking.ts` – added confirmBookingStatusOnly; confirmBooking now runs email when already confirmed
- `app/api/bookings/[bookingId]/status/route.ts`

---

### 2026-02-25 – Confirmation: faster fail detection (30s), prevent caching

**Updates:** Time-based fallback reduced to 30 sec (was 90s). Status API set `dynamic = force-dynamic` and poll adds cache-busting `?t=` to avoid stale cached responses that could delay detection.

**Edited files:**
- `lib/paymongo.ts`
- `app/api/bookings/[bookingId]/status/route.ts`
- `app/[eventSlug]/checkout/checkout-content.tsx`
- `docs/PAYMONGO_SETUP.md`

---

### 2026-02-25 – Payment failed UI: red heading, remove Recheck button

**Updates:** "Payment failed" heading now uses red text; Recheck payment button removed; kept "Go to dashboard" link.

**Edited files:**
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx`

---

### 2026-02-25 – Confirmation: faster success/fail detection

**Updates:** Reduced polling from 2s to 1s for quicker redirect when payment succeeds or fails. Shortened time-based fallback from 3 min to 90 sec so expired payments are detected sooner.

**Edited files:**
- `app/[eventSlug]/checkout/checkout-content.tsx`
- `lib/paymongo.ts`

---

### 2026-02-25 – PayMongo expired: still not failing – additional fixes

**Updates:** When PayMongo shows "Source has expired" but the app stayed on "Checking payment status…", added (1) `?include=payments` to link fetch so PayMongo returns payment data; (2) `last_payment_error` check — if PayMongo sets it with "expired" or "source", treat as failed; (3) time-based fallback — after 3 min unpaid, treat as failed (matches cron); (4) status API passes `paymentCreatedAt` for the fallback; (5) debug endpoint `GET /api/debug/paymongo-link?bookingId=xxx` to inspect raw PayMongo response; (6) `DEBUG_PAYMONGO=1` in env logs raw responses.

**Edited files:**
- `lib/paymongo.ts`
- `app/api/bookings/[bookingId]/status/route.ts`
- `app/api/debug/paymongo-link/route.ts` (new)
- `docs/PAYMONGO_SETUP.md`

---

### 2026-02-25 – PayMongo expired status: tag as failed

**Updates:** When PayMongo reports "Source has expired" or payment status "expired", the booking is now correctly tagged as failed. (1) getPaymentStatus checks payment.source.status === "expired" in addition to payment.status. (2) PAYMONGO_SETUP.md recommends enabling `link.payment.failed` webhook for immediate failure detection.

**Edited files:**
- `lib/paymongo.ts`
- `docs/PAYMONGO_SETUP.md`

---

### 2026-02-25 – Confirmation: detect failed/expired payment and unstick checkout

**Updates:** When PayMongo source expires or payment fails, the app now transitions to failed state instead of staying on "Checking payment status…". (1) Checkout poll handles 404 (cron-deleted booking) — redirects to event page with toast. (2) getLinkPaymentStatus parses JSON:API `included` and `relationships.payments` so expired/failed payments are detected. (3) "Try again" link on the waiting screen lets users manually return to seat selection.

**Edited files:**
- `app/[eventSlug]/checkout/checkout-content.tsx`
- `lib/paymongo.ts`

---

### 2026-02-25 – PayMongo billing prefill: add phone from app profile

**Updates:** Prefill PayMongo Billing Details (E-mail, Name, Contact Number) from app data. Added `phone` column to `profiles`, phone field in Admin → Settings → User settings, and checkout now passes `billing.phone` to PayMongo when available.

**Edited files:**
- `supabase/migrations/00081_profiles_phone.sql` (new)
- `app/admin/settings/user-settings.tsx`
- `app/api/checkout/route.ts`

---

### 2026-02-25 – PayMongo: fix status set to failed when opening payment

**Updates:** Removed "unpaid" from terminal failure statuses in getLinkPaymentStatus. "unpaid" means awaiting payment (user hasn't paid yet), not failed. Previously the status API marked the booking failed as soon as the PayMongo window opened because the new link had status "unpaid".

**Edited files:**
- `lib/paymongo.ts`

---

### 2026-02-25 – PayMongo: fix payment failed when actually successful

**Updates:** (1) Webhook now confirms booking on link.payment.paid even when status is already "failed" — recovers from race where PayMongo sends failed before paid. (2) getLinkPaymentStatus handles more PayMongo response shapes (payments.data, status "succeeded"/"completed"). (3) Failed confirmation page has "Recheck payment" button and POST /api/bookings/[id]/recheck-payment to manually re-verify and confirm if PayMongo shows paid.

**Edited files:**
- `app/api/webhooks/paymongo/route.ts`
- `lib/paymongo.ts`
- `app/api/bookings/[bookingId]/recheck-payment/route.ts` (new)
- `app/[eventSlug]/confirmation/[bookingId]/failed-recheck.tsx` (new)
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx`

---

### 2026-02-25 – Event status: Draft, Published, Postponed, Cancelled, Archived

**Updates:** Event status dropdown now includes five options: Draft, Published, Postponed, Cancelled, Archived. API validation and Events Settings default status updated. Dashboard Event status column shows Postponed (amber) and Archived (neutral) in addition to Upcoming, Lapsed, Cancelled.

**Edited files:**
- `components/admin/event-form.tsx`
- `app/admin/settings/events-settings.tsx`
- `app/api/admin/events/route.ts`
- `app/api/admin/events/[id]/route.ts`
- `app/dashboard/dashboard-bookings.tsx`

---

### 2026-02-25 – Assign seats as tab in edit event

**Updates:** "Assign seats →" is now a tab alongside Event Details, Seat Configurator, Seat Selector Setup, Seat Pricing, Promo Codes, and Ticket Template. Clicking it navigates to the assign seats page.

**Edited files:**
- `components/admin/edit-event-tabs.tsx`

---

### 2026-02-25 – Admin nav highlight and settings save redirect fix

**Updates:** Admin sub-navigation now highlights the active page (Events, Ticket layout, Venues, Reports, Ticket Assignments, Promo Codes, Settings) using `usePathname()`. Settings save flows add `type="button"` to prevent accidental form submission and call `router.refresh()` after success so the user stays on the settings page with updated data.

**Edited files:**
- `components/admin/admin-nav.tsx` (new)
- `app/admin/layout.tsx`
- `app/admin/settings/events-settings.tsx`
- `app/admin/settings/seat-settings.tsx`
- `app/admin/settings/user-settings.tsx`
- `app/admin/settings/email-ticket-settings.tsx`
- `app/admin/settings/capability-matrix.tsx`

---

### 2026-02-25 – Cron cleanup fix: add created_at, delete failed rows

**Updates:** Migration `00080_cleanup_pending_payments_fix.sql` ensures `payments` has `created_at`, replaces `cleanup_stale_pending_payments()` to handle null `created_at`, and now deletes payment and booking rows after releasing seats and deleting tickets so both pending and failed are removed from the database. Re-schedules the cron.

**Edited files:**
- `supabase/migrations/00080_cleanup_pending_payments_fix.sql` (new)

---

### 2026-02-25 – PayMongo: avoid overwriting confirmed bookings with failed events

**Updates:** Fixed bug where successful GCash payments showed "Payment failed" in the app. Webhook now only marks a booking as failed when it is still pending; if already confirmed, failed events are ignored. Confirmation page re-checks PayMongo when status is failed before showing failure UI.

**Edited files:**
- `app/api/webhooks/paymongo/route.ts` – Guard failed-event handler: only update to failed if booking is pending
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – Re-check isLinkPaid when status is failed; confirm and redirect if actually paid

---

### 2026-02-24 – Cron: switch to Supabase pg_cron (remove Vercel)

**Updates:** Replaced Vercel Cron with Supabase pg_cron for pending/failed payment cleanup. New migration `00079_cleanup_pending_payments_cron.sql` defines `cleanup_stale_pending_payments()` and schedules it every 2 minutes. Removed `vercel.json`. README now documents Supabase pg_cron as primary; API route remains as alternative for HTTP-triggered cron.

**Edited files:**
- `supabase/migrations/00079_cleanup_pending_payments_cron.sql` (new)
- `vercel.json` (deleted)
- `README.md` – Cron section, CRON_SECRET env description

---

### 2026-02-24 – Checkout: promo code input loads with page

**Updates:** Promo code field and order summary block now render immediately on checkout; Subtotal and Total show "—" until cart summary loads, then show amounts. Apply stays disabled until summary is available.

**Edited files:**
- `app/[eventSlug]/checkout/checkout-content.tsx`

---

### 2026-02-24 – Reservation timer: instant show, moved below event title

**Updates:** Timer appears immediately when a seat is selected (optimistic 15‑min countdown until server returns). Timer moved from above the cart to below the event title and above the "Choose seats" card.

**Edited files:**
- `components/booking/reservation-timer.tsx` (new) – Countdown with optimistic expiry for instant display
- `app/[eventSlug]/book/book-page-client.tsx` – Render ReservationTimer below title, above Choose seats
- `components/booking/inline-cart.tsx` – Removed timer block (timer now only in header area)

---

### 2026-02-24 – Cron: cleanup pending/failed payments and release seats

**Updates:** Added cron job that runs every 2 minutes to clean up payments that are still pending or failed and were created more than 3 minutes ago. For each such payment it releases associated seats (`event_seats` → available), deletes any tickets, and marks the booking and payment as failed. Initially used Vercel Cron; later switched to Supabase pg_cron (see entry above). API route `/api/cron/cleanup-pending-payments` remains as alternative for HTTP-triggered cron.

**Edited files:**
- `app/api/cron/cleanup-pending-payments/route.ts` (new)
- `README.md` – `CRON_SECRET` in env table, "Cron: cleanup pending payments" section

---

### 2026-02-24 – Ticket email: event title bold, Date and Venue on two lines

**Updates:** Order confirmation email now shows event title in bold in the thank-you sentence; Date and Venue each on their own line.

**Edited files:**
- `lib/email.ts` – Default template
- `app/admin/settings/email-ticket-settings.tsx` – Admin default template
- `supabase/migrations/00078_email_template_event_bold_date_venue_two_lines.sql` (new) – Update app_config template

---

### 2026-02-24 – Email confirmation title: Order Confirmation, remove tagline

**Updates:** Ticket email header now shows "Order Confirmation" instead of "Ticket Confirmation"; removed "Your ticket is ready!" line.

**Edited files:**
- `lib/email.ts` – Default template header
- `app/admin/settings/email-ticket-settings.tsx` – Admin default template
- `supabase/migrations/00077_email_template_order_confirmation_title.sql` (new) – Update app_config template in DB

---

### 2026-02-24 – Handle expired/cancelled PayMongo payment (stop "Checking payment status..." stuck)

**Updates:** When the user expires or cancels payment in PayMongo, the status API now detects failed/expired link state, updates the booking to "failed", and returns "failed" so the checkout page redirects to the confirmation page instead of staying stuck on "Checking payment status…".

**Edited files:**
- `lib/paymongo.ts` – Added `getLinkPaymentStatus(linkId)` returning "paid" | "failed" | "pending"; treat link status (expired/unpaid/cancelled) or all payments failed as "failed". `isLinkPaid` now uses it.
- `app/api/bookings/[bookingId]/status/route.ts` – When pending, call `getLinkPaymentStatus`; if "failed", update booking (and payment) to failed and return "failed"; if "paid", confirm and return "confirmed".

---

### 2026-02-24 – Dashboard: add Event status column (Upcoming, Lapsed, Cancelled)

**Updates:** New "Event status" column shows whether the event is Upcoming (future date), Lapsed (past date), or Cancelled (event.status = 'cancelled').

**Edited files:**
- `app/dashboard/page.tsx` – fetch event.status, pass serverNow for consistent hydration
- `app/dashboard/dashboard-bookings.tsx` – Event status column with getEventStatus helper

---

### 2026-02-24 – Dashboard: fix hydration mismatch from date formatting

**Updates:** Use toLocaleDateString("en-CA", {...}) for consistent date formatting on server and client. Fixes hydration error caused by locale differences.

**Edited files:**
- `app/dashboard/dashboard-bookings.tsx` – formatDate with en-CA locale for event date and booked date

---

### 2026-02-24 – Dashboard: collapsible event groups within each status

**Updates:** Within each status section (Confirmed, Pending, Failed), bookings are grouped by event. Each event group is collapsible (starts collapsed); click header to expand. Header shows event name, date, and count.

**Edited files:**
- `app/dashboard/dashboard-bookings.tsx` – groupByEvent; nested collapsible event groups within status sections

---

### 2026-02-24 – Dashboard: collapsible tables by status (confirmed, pending, failed)

**Updates:** Dashboard bookings grouped into separate collapsible tables: Confirmed, Pending, Failed. Each section has a clickable header to expand/collapse. Within each group, sorted by event date then event name.

**Edited files:**
- `app/dashboard/dashboard-bookings.tsx` (new) – client component with collapsible TableSection for each status
- `app/dashboard/page.tsx` – split bookings by status; render DashboardBookings

---

### 2026-02-24 – Dashboard: sort bookings by status, event date, event name

**Updates:** Dashboard bookings sorted by: confirmed first, then pending, then failed; within each status by event date; then by event name.

**Edited files:**
- `app/dashboard/page.tsx` – fetch event_start; sort by status order, event_start, event title

---

### 2026-02-24 – Confirmation page: green "Booking confirmed" heading

**Updates:** "Booking confirmed" heading styled in green (text-green-500) to signify success.

**Edited files:**
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – h1 text-green-500

---

### 2026-02-24 – Checkout: disable cart-summary query when payment opened

**Updates:** Stop fetching cart-summary when paymentOpened is true (cart is deleted at checkout). Prevents 400 errors in console.

**Edited files:**
- `app/[eventSlug]/checkout/checkout-content.tsx` – useQuery enabled: add `&& !paymentOpened`

---

### 2026-02-24 – Checkout: mark seats sold via admin client; clear cart when none

**Updates:** event_seats.update was failing due to RLS (only admins can update). Checkout now uses createAdminClient for the event_seats update so seats are marked sold. Book page clears reservation store when reservations/me returns no cart (e.g. after checkout).

**Edited files:**
- `app/api/checkout/route.ts` – use createAdminClient for event_seats.update({ status: "sold" })
- `app/[eventSlug]/book/book-page-client.tsx` – clear store when reservations/me returns null cart

---

### 2026-02-24 – Status API: check PayMongo when pending (fix stuck checkout)

**Updates:** GET /api/bookings/[id]/status now checks PayMongo directly when the booking is pending. If the link is paid, confirms the booking and returns "confirmed". Fixes the checkout page staying stuck on "Checking payment status…" when the webhook doesn't fire.

**Edited files:**
- `app/api/bookings/[bookingId]/status/route.ts` – when pending, call isLinkPaid; if paid, confirmBooking and return confirmed

---

### 2026-02-24 – Book page: use POST instead of PATCH for reservations (fix 404)

**Updates:** Replaced PATCH /api/reservations/[cartId] with POST /api/reservations for syncing and heartbeat. POST does find-or-create, so expired or deleted carts (e.g. after checkout) no longer cause 404 errors.

**Edited files:**
- `app/[eventSlug]/book/book-page-client.tsx` – syncCartToServer and heartbeat use POST; removed PATCH + 404 fallback

---

### 2026-02-24 – Checkout: remove buttons, rely on auto-redirect

**Updates:** Removed "View confirmation page" and "Go to dashboard" buttons from the payment-waiting screen. Page now only shows "Checking payment status…" and redirects automatically when payment is confirmed.

**Edited files:**
- `app/[eventSlug]/checkout/checkout-content.tsx` – removed buttons from paymentOpened state

---

### 2026-02-24 – Checkout: auto-redirect to confirmation when payment completes

**Updates:** After PayMongo opens in a new tab, the checkout page polls booking status every 2 seconds. When payment is confirmed (or failed), automatically redirects to the confirmation page. No need to click "View confirmation page."

**Edited files:**
- `app/api/bookings/[bookingId]/status/route.ts` (new) – GET returns booking status for auth user
- `app/[eventSlug]/checkout/checkout-content.tsx` – Poll /api/bookings/{id}/status when paymentOpened; redirect on confirmed/failed

---

### 2026-02-24 – Confirmation page: PayMongo status check fallback when webhook fails

**Updates:** When the confirmation page loads with a pending booking, check PayMongo directly (GET link, verify status=paid or payments include paid). If paid, confirm the booking and redirect. Fixes looping when webhook doesn't reach the server (ngrok down, wrong URL, etc.).

**Edited files:**
- `lib/paymongo.ts` – isLinkPaid(linkId): fetch link, check status or payments array
- `lib/confirm-booking.ts` (new) – confirmBooking(supabase, bookingId): update status, send email
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – pending: check PayMongo, confirm if paid, redirect

---

### 2026-02-24 – PayMongo webhook: fix booking lookup for link.payment.paid

**Updates:** link.payment.paid sends the payment object (pay_xxx), not the link. We store link id in payments.paymongo_id. Added PayMongo API fallback: fetch payment by id, get link_id from payment.attributes, then lookup booking. Also support payment.paid with link_id. Improved debug logging for webhook troubleshooting.

**Edited files:**
- `lib/paymongo.ts` – retrievePayment, retrieveLink helpers
- `app/api/webhooks/paymongo/route.ts` – getBookingIdFromPayload: payment id → fetch payment → link_id → booking; payment.paid fallback; debug logs
- `docs/PAYMONGO_SETUP.md` – Troubleshooting for confirmation loop; payment.paid event; webhook URL/secret checks

---

### 2026-02-24 – Checkout: remove loading page, open PayMongo directly

**Updates:** Removed the data-URL loading page. PayMongo now opens directly when the checkout API returns. Note: popup blockers may block the window if opened after async fetch; allow popups if needed.

**Edited files:**
- `app/[eventSlug]/checkout/checkout-content.tsx` – removed window.open(loadingHtml); open PayMongo URL directly after fetch

---

### 2026-02-24 – Checkout: loading page instead of blank tab before PayMongo

**Updates:** Replaced about:blank with a data-URL loading page ("Opening payment…" with spinner) so the new tab shows feedback while the checkout API runs, instead of a blank page.

**Edited files:**
- `app/[eventSlug]/checkout/checkout-content.tsx` – window.open data URL with loading HTML

---

### 2026-02-24 – Checkout: fix PayMongo popup blocked by browser

**Updates:** Open a blank window synchronously on "Proceed to payment" click, then navigate it to the PayMongo URL after the API responds. Prevents popup blockers from blocking the payment tab. Close the blank window on auth redirect, error, or bypass flow.

**Edited files:**
- `app/[eventSlug]/checkout/checkout-content.tsx` – window.open("about:blank") before fetch; set paymentWindow.location.href on success; close on error/redirect

---

### 2026-02-24 – Confirmation page: stop refresh loop, add escape links

**Updates:** Confirmation page stops auto-refreshing after ~60 seconds to avoid infinite loop when webhook hasn't confirmed. Shows "Go to dashboard" and "check your email" instead. Added persistent "Go to dashboard" link so users can escape the loop anytime.

**Edited files:**
- `app/[eventSlug]/confirmation/[bookingId]/confirmation-refresh.tsx` – Timeout after 20 refreshes (~60s); sessionStorage to persist count; stopped state with dashboard link
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – Pass bookingId to ConfirmationRefresh; add "Go to dashboard" link

---

### 2026-02-24 – PayMongo: open in new tab, post-payment instructions

**Updates:** PayMongo checkout now opens in a new tab instead of navigating away. User stays on checkout page with instructions: close PayMongo tab after payment; tickets sent by webhook; links to confirmation page and dashboard. Added "No email after payment" troubleshooting to docs.

**Edited files:**
- `app/[eventSlug]/checkout/checkout-content.tsx` – Open PayMongo in new tab; show paymentOpened state with instructions
- `docs/PAYMONGO_SETUP.md` – Verify flow steps; troubleshooting for no email

---

### 2026-02-24 – PayMongo billing prefill

**Updates:** Prefill PayMongo checkout billing (name, email) from the logged-in user's profile so they can click Next without re-entering.

**Edited files:**
- `lib/paymongo.ts` – Optional `billing` param (name, email, phone) in createPaymentLink
- `app/api/checkout/route.ts` – Fetch profile; pass billing to createPaymentLink

---

### 2026-02-24 – PayMongo test endpoint for debugging 502

**Updates:** Added GET /api/checkout/paymongo-test to diagnose PayMongo failures. Returns the exact API error (401, 422, etc.) when link creation fails.

**Edited files:**
- `app/api/checkout/paymongo-test/route.ts` (new) – Test endpoint
- `docs/PAYMONGO_SETUP.md` – Link to test endpoint in troubleshooting

---

### 2026-02-24 – PayMongo checkout: early link creation, rollback on failure

**Updates:** Create PayMongo link BEFORE tickets/cart deletion so a 502 leaves the cart valid for retry. On link failure, delete booking and return 502 (user can try again). Improved PayMongo error logging. Added troubleshooting to docs/PAYMONGO_SETUP.md.

**Edited files:**
- `app/api/checkout/route.ts` – PayMongo link created early; use payMongoLink after ticket creation
- `lib/paymongo.ts` – Log status code and response when API fails; log when checkout_url missing
- `docs/PAYMONGO_SETUP.md` – Troubleshooting for 502 and 400

---

### 2026-02-24 – PayMongo checkout fix (no redirect loop)

**Updates:** When PayMongo link creation fails, checkout now returns 502 with an error instead of redirecting to confirmation with a pending booking (which caused an infinite "Processing" loop). Added "Go back and try again" link on pending confirmation page.

**Edited files:**
- `app/api/checkout/route.ts` – Return 502 when createPaymentLink fails
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – Link to retry when stuck on pending

---

### 2026-02-24 – Confirmation page 404 fix (PayMongo pending state)

**Updates:** When users land on the confirmation page before the PayMongo webhook runs, the booking is still "pending" and the page previously returned 404. Now shows "Processing your payment" with auto-refresh until confirmed. Also handles "failed" status with a clear message.

**Edited files:**
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx` – Pending/failed states instead of notFound()
- `app/[eventSlug]/confirmation/[bookingId]/confirmation-refresh.tsx` (new) – Client component that auto-refreshes every 3s

---

### 2026-02-24 – PayMongo setup documentation

**Updates:** Added docs/PAYMONGO_SETUP.md with step-by-step guide: account creation, API keys, webhook configuration, env vars, ngrok for local testing, test cards.

**Edited files:**
- `docs/PAYMONGO_SETUP.md` (new) – PayMongo setup guide with links to developer docs

---

### 2026-02-24 – Payment confirmation progress message

**Updates:** Changed FloatingProgressBar text from "Saving in progress… getting everything ready for the show" to "Preparing your tickets… We're finalizing everything and sending them to your email shortly."

**Edited files:**
- `components/ui/floating-progress.tsx` – Updated progress message text

---

### 2026-02-24 – Order summary in ticket email (tickets, sections, prices, discount, total)

**Updates:** Ticket emails now include an order summary table: Section, Seat, Price per ticket; Subtotal; Discount (with promo code if used); Total. New placeholders: {{ticketDetails}}, {{subtotal}}, {{discount}}, {{total}}, {{discountDescription}}.

**Edited files:**
- `lib/email.ts` – SendTicketEmailParams extended; replacePlaceholders for new vars; formatPrice helper
- `app/api/checkout/route.ts` – Build ticketDetails from seatItems; pass order summary to sendTicketEmail
- `app/api/webhooks/paymongo/route.ts` – Fetch booking totals, prices, sections; build ticketDetails; pass order summary
- `app/admin/settings/email-ticket-settings.tsx` – New placeholders; default template with order summary
- `supabase/migrations/00076_email_template_order_summary.sql` (new) – UPDATE app_config with order summary template

### 2026-02-24 – Larger font sizes in ticket email template

**Updates:** Increased all email text sizes: header 20/18/14px → 26/22/18px; body text 18px with line-height 1.6; list items 18px.

**Edited files:**
- `lib/email.ts` – DEFAULT_HTML font sizes
- `app/admin/settings/email-ticket-settings.tsx` – default emailBody state
- `supabase/migrations/00075_email_template_larger_fonts.sql` (new) – UPDATE app_config with larger fonts

### 2026-02-24 – Entrava-style ticket email template

**Updates:** Replaced plain ticket email with Entrava-style format: branded orange header, personalized greeting (fallback to "Hi there," when buyerName empty), info boxes with left border, bullet-point entry instructions, support section. Uses Wish Tickets Portal branding.

**Edited files:**
- `lib/email.ts` – New DEFAULT_HTML (table layout, header, info boxes, bullets); greeting fallback for empty buyerName
- `app/admin/settings/email-ticket-settings.tsx` – Default emailBody state updated to match
- `supabase/migrations/00074_entrava_style_email_template.sql` (new) – UPDATE app_config with new template

### 2026-02-24 – Email debugging: From fallback, logging, test button

**Updates:** When SMTP_FROM uses a different domain than SMTP_USER (e.g. sales@wish1075.com with Gmail), the app now falls back to SMTP_USER for the From address to avoid Gmail rejection. Added logging in checkout and sendTicketEmail. Added GET /api/test-email to verify SMTP connection. Added "Send test email" button in Admin → Settings → Email & Tickets.

**Edited files:**
- `lib/email.ts` – From address fallback when domain differs from SMTP_USER; success log
- `app/api/checkout/route.ts` – Log when sending email, on success, and when user has no email
- `app/api/test-email/route.ts` – GET handler for SMTP connection verify
- `app/admin/settings/email-ticket-settings.tsx` – "Send test email" button
- `docs/EMAIL_SETUP.md` – SMTP_FROM / Gmail requirement note

### 2026-02-24 – Send ticket email on checkout when PayMongo is disabled

**Updates:** When `PAYMONGO_SECRET_KEY` is not set, checkout now sends the ticket email immediately after a successful booking (no webhook). Enables testing email delivery without PayMongo setup.

**Edited files:**
- `app/api/checkout/route.ts` – After non-PayMongo checkout, build ticket attachments and call `sendTicketEmail` to buyer's email

### 2026-02-24 – Email troubleshooting: link.payment.paid, logging, test endpoint

**Updates:** Webhook now handles `link.payment.paid` (PayMongo Links) in addition to `payment.paid`; extracts booking ID from `remarks` or link id lookup. Added logging for event type, skipped conditions, and SMTP send. Added admin-only `/api/test-email` to verify SMTP. Wrapped `sendTicketEmail` in try/catch with error logging.

**Edited files:**
- `app/api/webhooks/paymongo/route.ts` – Handle `link.payment.paid` and `link.payment.failed`; `getBookingIdFromPayload` for remarks/link id; logging; try/catch around sendTicketEmail
- `lib/email.ts` – try/catch around transporter.sendMail with error log
- `app/api/test-email/route.ts` (new) – Admin-only POST to send test ticket email
- `docs/EMAIL_SETUP.md` – Test endpoint instructions, PayMongo webhook config for `link.payment.paid`

### 2026-02-21 – Ticket image, email templates, and Gmail setup

**Updates:** Implemented ticket image generation fallback in webhook, Gmail SMTP docs, customizable email template with placeholders, global default ticket template (image + layout), and admin Email & Tickets settings tab.

**Edited files:**
- `app/api/webhooks/paymongo/route.ts` – On-demand ticket image generation when `ticket_image_url` is null; fetch profile for `buyerName`; use template-based email
- `lib/email.ts` – Template loading from `app_config`; placeholders `{{eventTitle}}`, `{{eventDate}}`, `{{venueName}}`, `{{buyerName}}`
- `lib/ticket-image.ts` – `getResolvedTicketTemplate()` for event + global fallback; used in checkout, webhook, admin assignment
- `app/api/checkout/route.ts` – Use `getResolvedTicketTemplate` for ticket images
- `app/api/admin/assignments/[id]/confirm/route.ts` – Use `getResolvedTicketTemplate` for ticket images
- `app/api/admin/settings/route.ts` – Handle `email_ticket_subject`, `email_ticket_body`, `global_ticket_template_url`, `global_ticket_layout_config`
- `app/api/admin/upload/route.ts` – Support `isGlobalTemplate` for global ticket template (path `ticket-templates/global/default.png`)
- `app/admin/settings/page.tsx` – Add Email & Tickets tab
- `app/admin/settings/email-ticket-settings.tsx` (new) – Email template form, global ticket template upload, link to layout editor
- `app/admin/ticket-layout/page.tsx` – Fetch global config; pass to client
- `app/admin/ticket-layout/ticket-layout-client.tsx` – Add Global (default) option; pass `isGlobal` to editor
- `components/admin/ticket-layout-editor.tsx` – `isGlobal` prop; save to `/api/admin/settings` when global
- `.env.example` – Gmail App Password comments
- `docs/EMAIL_SETUP.md` (new) – Step-by-step Gmail SMTP setup
- `supabase/migrations/00073_email_and_global_ticket_templates.sql` (new) – Seed `app_config` with email and global template keys

### 2026-02-21 – Ticket seat name for free/standing sections

**Updates:** On ticket images, when the section is Free Seating or Standing, the seat name now shows "Free Seating" or "Standing" instead of "Row X Seat Y". Applied to on-demand generation, checkout, and admin assign confirm.

**Edited files:**
- `lib/ticket-image.ts` – Use section seating_type for seatLabel when seat has section
- `app/api/checkout/route.ts` – Include seating_type in section fetch; set seatLabel by section type
- `app/api/admin/assignments/[id]/confirm/route.ts` – Set seatLabel by section type for seat tickets

### 2026-02-21 – Early bird badge text

**Updates:** Changed "Early Bird Sale" to "EARLY BIRD PROMO" on event cards.

**Edited files:**
- `components/event-card.tsx`

### 2026-02-20 – Default ticket template image

**Updates:** When an event has no ticket template, tickets now use `public/default-ticket-template.png` (light green on dusty rose) instead of the gradient. Falls back to gradient if the default file is missing.

**Edited files:**
- `lib/ticket-image.ts`
- `public/default-ticket-template.png` (new)

### 2026-02-20 – Ticket price box

**Updates:** Added separate "Price" box below Section & Seat on tickets. Price shown in PHP format. New layout region in editor. Checkout, admin confirm, and on-demand generation pass/lookup price per ticket.

**Edited files:**
- `lib/ticket-image.ts`
- `components/admin/ticket-layout-editor.tsx`
- `app/api/checkout/route.ts`
- `app/api/admin/assignments/[id]/confirm/route.ts`
- `supabase/migrations/00072_ticket_layout_config.sql`

### 2026-02-20 – Ticket text overflow: wrap and shrink

**Updates:** Long text now wraps to multiple lines (max 2) and reduces font size if still overflowing. Event title, venue, date, section, seat, and ticket number all use wrapText with proportional font scaling.

**Edited files:**
- `lib/ticket-image.ts`

### 2026-02-20 – Ticket size 797×1500

**Updates:** Ticket dimensions changed from 750×1400 to 797×1500 px. Template upload validation, layout editor canvas, and image generator updated. Default layout positions scaled proportionally.

**Edited files:**
- `lib/ticket-image.ts`
- `components/admin/ticket-layout-editor.tsx`
- `app/api/admin/upload/route.ts`
- `components/admin/ticket-template-upload.tsx`
- `supabase/migrations/00070_ticket_template_and_images.sql`
- `supabase/migrations/00071_ticket_images_bucket_size.sql`
- `supabase/migrations/00072_ticket_layout_config.sql`

### 2026-02-20 – Ticket layout in main admin, larger text

**Updates:** Ticket layout editor moved from event edit to main admin. New /admin/ticket-layout page with event selector. Dashboard card and nav link added. Event Ticket Template tab now links to Ticket layout. Ticket text sizes increased (event 20→24px, section label 14→16px/value 18→20px, ticket number 16→18px).

**Edited files:**
- `app/admin/page.tsx`
- `app/admin/layout.tsx`
- `app/admin/ticket-layout/page.tsx` (new)
- `app/admin/ticket-layout/ticket-layout-client.tsx` (new)
- `app/admin/events/[id]/page.tsx`
- `lib/ticket-image.ts`

### 2026-02-20 – Section/Seat labels and larger ticket text

**Updates:** Section block now shows separate "Section" and "Seat" labels with their values. All ticket text sizes increased (event 18→20px, section label 12→14px/value 16→18px, ticket number 14→16px).

**Edited files:**
- `lib/ticket-image.ts`

### 2026-02-20 – Ticket layout editor: resize support

**Updates:** Layout editor now supports resizing each region via a corner handle. Config includes width/height (or size for QR). Ticket image generator uses configurable dimensions for all overlays.

**Edited files:**
- `components/admin/ticket-layout-editor.tsx`
- `lib/ticket-image.ts`

### 2026-02-20 – Visual ticket layout editor

**Updates:** Admins can drag-and-drop position overlays (Event Info, Section, QR, Ticket Number) on the ticket template via a visual editor in the Ticket Template tab. Layout is saved to `events.ticket_layout_config` and used when generating ticket images.

**Edited files:**
- `components/admin/ticket-layout-editor.tsx` (new)
- `app/admin/events/[id]/page.tsx`
- `lib/ticket-image.ts`
- `app/api/admin/events/[id]/ticket-layout/route.ts`
- `app/api/checkout/route.ts`
- `app/api/admin/assignments/[id]/confirm/route.ts`

### 2026-02-20 – Fix ticket image upload size limit

**Updates:** ticket-images bucket limit was 512KB; 750x1400 PNGs exceeded it. Migration 00071 increases limit to 2MB. Added PNG compressionLevel: 9 in Sharp to reduce output size.

**Edited files:**
- `supabase/migrations/00071_ticket_images_bucket_size.sql` (new)
- `lib/ticket-image.ts`

### 2026-02-20 – On-demand ticket image generation on confirmation page

**Updates:** When confirmation page loads and tickets have null ticket_image_url, we now generate them on-demand via generateTicketImageForTicketId. Fetches ticket, event, venue, section/seat data, calls generateAndUploadTicketImage, updates ticket. Ensures full ticket images appear even when checkout-time generation failed (e.g. bucket missing). Wrapped in try/catch so page still renders with QR fallback if generation fails.

**Edited files:**
- `lib/ticket-image.ts` (generateTicketImageForTicketId)
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx`

### 2026-02-20 – Fix ticket image generation: logging and template fallback

**Updates:** Added defensive template fetch with 10s timeout; on fetch failure, fall back to gradient background instead of failing. Improved error logging (full stack, storage error details) to diagnose upload failures. Extracted createGradientBase helper.

**Edited files:**
- `lib/ticket-image.ts`

### 2026-02-20 – Ticket image font: Helvetica

**Updates:** All ticket overlay text (event title, venue, date, section, seat, ticket number) now uses Helvetica font.

**Edited files:**
- `lib/ticket-image.ts`

### 2026-02-20 – Ticket image styling: white 50% opacity, layout tweaks

**Updates:** Ticket data boxes now use white 50% opacity (`rgba(255,255,255,0.5)`) so the template gradient shows through. Subtle border `rgba(0,0,0,0.2)`. Event info moved up (top 750); section/QR aligned at 1020; ticket number at 1150. Ticket number text dark for readability.

**Edited files:**
- `lib/ticket-image.ts`

### 2026-02-20 – Ticket template upload and full ticket image generation

**Updates:** Admin can upload a 750×1400 PNG ticket template per event (Ticket Template tab). Every ticket now gets a generated full PNG (template + Event Title, Venue, Date/Time, Section, Seat/Free Seating/Standing, QR code, ticket number) stored in Supabase. Confirmation page and PayMongo email use full ticket image when available; fallback to QR-only.

**Edited files:**
- `supabase/migrations/00070_ticket_template_and_images.sql` (new)
- `app/api/admin/upload/route.ts`
- `app/api/admin/events/[id]/ticket-template/route.ts` (new)
- `components/admin/ticket-template-upload.tsx` (new)
- `components/admin/edit-event-tabs.tsx`
- `app/admin/events/[id]/page.tsx`
- `lib/ticket-image.ts` (new)
- `app/api/checkout/route.ts`
- `app/api/admin/assignments/[id]/confirm/route.ts`
- `app/api/webhooks/paymongo/route.ts`
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx`

### 2026-02-20 – Fullscreen event image on click

**Updates:** Clicking the event image on cards or in the View Details modal opens it in fullscreen using react-photo-view. Image fills viewport (object-fit: fill). Added cursor-zoom-in to indicate clickability.

**Edited files:**
- `components/event-card.tsx`

### 2026-02-20 – Hide YouTube/Vimeo controls with invisible overlay

**Updates:** Added an invisible overlay over embedded YouTube/Vimeo videos on event cards and in the View Details modal. The overlay blocks pointer events so the video controls do not appear on hover.

**Edited files:**
- `components/event-card.tsx`

### 2026-02-20 – Venue Google Maps URL

**Updates:** Admins can add a Google Maps share URL (e.g. https://maps.app.goo.gl/...) to venue settings. Stored in `venues.google_maps_url`. When set, the venue name on event cards and in the View Details modal is a clickable link that opens the map in a new tab.

**Edited files:**
- `supabase/migrations/00069_venues_google_maps_url.sql` – Add `google_maps_url` column
- `components/admin/venue-form.tsx` – Google Maps URL input field
- `app/api/events/route.ts` – Include `google_maps_url` in venue select
- `components/event-card.tsx` – Venue name as link when `google_maps_url` present
- `app/admin/venues/[id]/page.tsx` – Fetch `google_maps_url`
- `app/api/admin/venues/route.ts` – POST schema and insert
- `app/api/admin/venues/[id]/route.ts` – PATCH schema, select, update
- `lib/types.ts` – Venue `google_maps_url` field

### 2026-02-20 – Early bird glowing badge and countdown on event cards

**Updates:** Event cards show a glowing "Early Bird Sale" badge when early bird pricing is active, with a live countdown. Badge is below the venue on cards and beside "Choose seats" in the View Details modal.

**Edited files:**
- `lib/types.ts` – Added `early_bird_starts_at` and `early_bird_ends_at` to Event type
- `components/event-card.tsx` – Early bird badge (amber glow), Zap icon, countdown timer

### 2026-02-20 – Early bird pricing display for buyers

**Updates:** When an event has active early bird pricing, seat selection and cart now show the base price (struck through) and the early bird price in orange, with "(Early bird)" label. Applied to: Choose seats header, grid section headers, SectionPicker (free/standing), InlineCart (seats and section items).

**Edited files:**
- `app/api/events/[id]/prices/route.ts`
- `app/[eventSlug]/book/book-page-client.tsx`
- `components/seat-picker/section-picker.tsx`
- `components/booking/inline-cart.tsx`

### 2026-02-20 – Pricing API error handling

**Updates:** Added try-catch and event query error handling to pricing GET; returns clear error when DB columns are missing (e.g. migration 00068 not applied).

**Edited files:**
- `app/api/admin/events/[id]/pricing/route.ts`

### 2026-02-20 – Per-section early bird toggle

**Updates:** Added a toggle switch beside each section's Early bird (PHP) input to enable or disable early bird pricing per section. When global early bird is on, only sections with the toggle on are included in early_bird_prices.

**Edited files:**
- `components/admin/seat-pricing.tsx`

### 2026-02-20 – Early bird single date settings

**Updates:** Early bird pricing now uses a single start and end date per event (stored on `events`). Date pickers moved beside the "Enable early bird pricing" toggle; both dates required when early bird enabled. Removed per-section cutoff from `early_bird_prices`.

**Edited files:**
- `supabase/migrations/00068_early_bird_event_dates.sql` (new)
- `app/api/admin/events/[id]/pricing/route.ts`
- `components/admin/seat-pricing.tsx`
- `app/api/events/[id]/prices/route.ts`
- `app/api/checkout/route.ts`
- `app/api/events/[id]/cart-summary/route.ts`

### 2026-02-20 – Promo default fixed amount 100

**Updates:** New promo form defaults to fixed amount ₱100. Switching discount type to fixed also sets amount to 100.

**Edited files:**
- `app/admin/promo-codes/page.tsx`
- `components/admin/event-promo-codes.tsx`

### 2026-02-20 – Promo fixed amount in pesos

**Updates:** Promo form now shows fixed discount in pesos (₱) instead of centavos. Label and description updated; backend still stores centavos.

**Edited files:**
- `app/admin/promo-codes/page.tsx`
- `components/admin/event-promo-codes.tsx`

### 2026-02-20 – Event-specific promo codes

**Updates:** Added Promo Codes tab to Edit event page; each event has its own promo management. General Promo Codes page now shows only all-events promos (event_id null). New API GET /api/admin/events/[id]/promo-codes; PATCH/DELETE accept ?event_id= for scoped validation.

**Edited files:**
- `components/admin/edit-event-tabs.tsx`
- `app/admin/events/[id]/page.tsx`
- `components/admin/event-promo-codes.tsx` (new)
- `app/api/admin/events/[id]/promo-codes/route.ts` (new)
- `app/api/admin/promo-codes/route.ts`
- `app/api/admin/promo-codes/[id]/route.ts`
- `app/admin/promo-codes/page.tsx`

### 2026-02-20 – Dynamic video in event View Details dialog

**Updates:** Event teaser supports any video link: YouTube, Vimeo, or direct URLs. Image placeholder shown while loading; video fades in and autoplays unmuted when ready. Added `getVideoEmbedInfo`, `getVimeoEmbedUrl` in `lib/utils.ts`.

**Edited files:**
- `components/event-card.tsx`
- `supabase/seed.sql`

### 2026-02-20 – Fix Next.js 15 params enumeration (server wrappers)

**Updates:** Resolved "params are being enumerated" console error by adding server component wrappers that await params and pass resolved values to client components. The params Promise never reaches the client tree.

**Edited files:**
- `app/[eventSlug]/book/page.tsx` (server wrapper)
- `app/[eventSlug]/book/book-page-client.tsx` (new)
- `app/[eventSlug]/checkout/page.tsx` (server wrapper)
- `app/[eventSlug]/checkout/checkout-content.tsx` (new)
- `app/[eventSlug]/cart/page.tsx` (server wrapper)
- `app/[eventSlug]/cart/cart-redirect.tsx` (new)
- `app/admin/events/[id]/assign-seats/page.tsx` (server wrapper)
- `app/admin/events/[id]/assign-seats/assign-seats-client.tsx` (new)

### 2026-02-20 – Ticket pricing: early bird, promo codes, discount types

**Updates:** Implemented ticket pricing features per plan: (1) Base price unchanged. (2) Early bird pricing: `early_bird_prices` table with per-section price + cutoff date; SeatPricing admin UI with toggle and date picker; prices API and checkout resolve early bird when now < cutoff. (3) Promo codes: `promo_codes` table with code, event_id, discount_type (percentage/fixed), discount_value, max_uses, dates; POST /api/promo/validate; checkout accepts promo_code, applies discount, stores promo_code_id + discount_cents on booking. (4) Admin Promo Codes page (CRUD). (5) Checkout page shows subtotal, promo input, Apply button, discounted total.

**Edited files:**
- `supabase/migrations/00066_early_bird_pricing.sql` (new)
- `supabase/migrations/00067_promo_codes.sql` (new)
- `app/api/events/[id]/prices/route.ts`
- `app/api/events/[id]/cart-summary/route.ts` (new)
- `app/api/checkout/route.ts`
- `app/api/promo/validate/route.ts` (new)
- `app/api/admin/events/[id]/pricing/route.ts`
- `app/api/admin/promo-codes/route.ts` (new)
- `app/api/admin/promo-codes/create/route.ts` (new)
- `app/api/admin/promo-codes/[id]/route.ts` (new)
- `app/api/admin/events/list/route.ts` (new)
- `components/admin/seat-pricing.tsx`
- `app/[eventSlug]/checkout/page.tsx`
- `app/admin/layout.tsx`
- `app/admin/promo-codes/page.tsx` (new)
- `components/ui/select.tsx` (new)

### 2026-02-20 – Fix params enumeration warning (Next.js 15)

**Updates:** Changed page components to use `props.params` / `props.searchParams` instead of destructuring `{ params }` in the function signature, per Next.js 15 async request API guidance. Avoids "params are being enumerated" console error.

**Edited files:**
- `app/admin/events/[id]/page.tsx`
- `app/admin/venues/[id]/page.tsx`
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx`
- `app/admin/reports/page.tsx`

### 2026-02-20 – Reports section title uses name not code

**Updates:** get_admin_report_tickets now returns section name (es_sec.name, sec.name) for section_label instead of section_code, so report groups show human-readable section names (e.g. "VIP Section") rather than codes (e.g. "v1").

**Edited files:**
- `supabase/migrations/00065_report_tickets_per_ticket_amount.sql`

### 2026-02-20 – Reports grouping and border radius

**Updates:** Sales & Reports table now groups tickets by event → section → buyer with collapsible rows (default collapsed). Border radius changed from 12px to 10px on the reports container.

**Edited files:**
- `app/admin/reports/page.tsx`
- `components/admin/reports-table.tsx`

### 2026-02-20 – Admin tab highlight only when on admin pages

**Updates:** Admin nav link now uses orange highlight only when the current path starts with /admin. On homepage and other non-admin pages, it appears like other nav links (neutral gray).

**Edited files:**
- `components/header.tsx`

### 2026-02-20 – Activate Event assistant

**Updates:** Added OPENAI_API_KEY placeholder to .env.local and created .env.example documenting all env vars. User must paste their OpenAI API key and restart the dev server for the Event assistant to work.

**Edited files:**
- `.env.local`
- `.env.example` (new)

### 2026-02-20 – Search clears automatically show all events

**Updates:** Clearing the search bar now immediately shows all events without needing to click the search button.

**Edited files:**
- `app/page.tsx`

### 2026-02-20 – Fix event date/time and venue on cards

**Updates:** Event form now initializes event_start in local time (was using UTC, causing wrong display). Events API now attaches venue to each event so event cards show correct location instead of "TBA". Added toDatetimeLocal helper and sync useEffect for form when initialEvent changes.

**Edited files:**
- `components/admin/event-form.tsx`
- `app/api/events/route.ts`

### 2026-02-19 – Permission dialog across admin

**Updates:** Shared permission dialog shown when any admin API returns 403. Added PermissionDialogProvider in admin layout; wired into ticket-assignments, reports-table, assign-seats, capability-matrix, events-settings, seat-settings. Replaced local dialog in ticket-assignments with shared provider.

**Edited files:**
- `components/providers/permission-dialog-provider.tsx` (new)
- `app/admin/layout.tsx`
- `app/admin/ticket-assignments/page.tsx`
- `components/admin/reports-table.tsx`
- `app/admin/events/[id]/assign-seats/page.tsx`
- `app/admin/settings/capability-matrix.tsx`
- `app/admin/settings/events-settings.tsx`
- `app/admin/settings/seat-settings.tsx`
- `components/admin/events-table.tsx`

### 2026-02-19 – Ticket Assignments collapsible, default collapsed

**Updates:** Event, Recipient, and Section groups are now collapsible with chevron toggles. Default state is collapsed; click to expand and see ticket details.

**Edited files:**
- `app/admin/ticket-assignments/page.tsx`

### 2026-02-19 – Ticket Assignments: fix build, permission dialog, grouped table

**Updates:** Fixed JSX parsing error in ticket-assignments (extracted row building into useMemo). Added permission dialog when user lacks access (403 from fetch or release). Table remains grouped by event → person → section.

**Edited files:**
- `app/admin/ticket-assignments/page.tsx`

### 2026-02-19 – Ticket Assignments grouped by event, person, section

**Updates:** Ticket Assignments table now groups rows by Event → Recipient → Section, with rowSpan for cleaner hierarchy. Column order: Event, Recipient, Section, Seat, Status, Date, Release.

**Edited files:**
- `app/admin/ticket-assignments/page.tsx`

### 2026-02-19 – Beautify About page

**Updates:** About page redesigned with hero section (large typography, fade-in), three feature cards (Discover, Book Seats, Instant Tickets) with icons and staggered animations, and a mission glass card. Uses existing design tokens, Card components, and framer-motion.

**Edited files:**
- `app/about/page.tsx`
- `app/about/about-content.tsx` (new)

### 2026-02-19 – YouTube support for Teaser Video

**Updates:** Teaser video URL now accepts YouTube links (e.g. `https://www.youtube.com/watch?v=...` or `https://youtu.be/...`). YouTube videos are embedded via iframe on event cards and in the Details modal. Direct video URLs (MP4, WebM) continue to work as before. YouTube autoplays (muted) when the Details modal opens. Event card thumbnails prioritize the image file over video when both exist.

**Edited files:**
- `lib/utils.ts` – added `getYouTubeEmbedUrl()`
- `components/event-card.tsx` – YouTube iframe for card and modal; autoplay (muted) in Details modal
- `components/admin/event-form.tsx` – placeholder and hint for YouTube/direct video

### 2026-02-19 – Event image in Details modal

**Updates:** Clicking "View Details" on an event card now displays the event image in the modal when no teaser video is present. Previously the modal showed only text; it now shows video (if available) or the event image.

**Edited files:**
- `components/event-card.tsx`

### 2026-02-19 – Fix report ticket Amount column (per-ticket price)

**Updates:** Sales & Reports ticket table now shows the per-ticket amount instead of the full booking total. Previously each ticket row displayed the entire booking total (e.g. ₱12,500 repeated 5 times); now each row shows the correct per-ticket amount (e.g. ₱2,500).

**Edited files:**
- `supabase/migrations/00065_report_tickets_per_ticket_amount.sql`

### 2026-02-19 – Add/remove capability for Free Seating and Standing sections

**Updates:** Free Seating and Standing sections now have "Add seats" and "Remove seats" number-selector controls (when seats exist), reusing add-column/remove-column APIs. Prohibition dialog blocks removal when seats are reserved or sold. FloatingProgressBar shows during operations.

**Edited files:**
- `components/admin/seat-configurator.tsx`

### 2026-02-19 – Prohibit row/column removal when seats reserved or sold

**Updates:** Seat Configurator now blocks Remove Row and Remove Column when the rows/columns to be removed contain reserved or sold seats. Shows an "Action Not Allowed" dialog with Cancel button explaining that deleting would affect existing ticket holders.

**Edited files:**
- `components/admin/seat-configurator.tsx`

### 2026-02-19 – Mark reserved and sold seats in Seat Configurator

**Updates:** Seat Configurator now visually distinguishes available, reserved, and sold seats. The admin seating API returns a `status` per seat (computed from bookings, active carts, and admin assignments). SeatGrid styles: section color = available, amber = reserved, gray = sold. Added a compact legend per section.

**Edited files:**
- `app/api/admin/events/[id]/seating/route.ts`
- `components/admin/seat-grid.tsx`
- `components/admin/seat-configurator.tsx`

### 2026-02-19 – Floating progress for add/remove row/column

**Updates:** Seat Configurator now shows FloatingProgressBar overlay when adding or removing rows/columns, so admins see progress during multi-row/column operations.

**Edited files:**
- `components/admin/seat-configurator.tsx`

### 2026-02-19 – Row/column number selectors in Seat Configurator

**Updates:** Replaced "+ Add row below", "- Remove last row", "+ Add column", "- Remove column" buttons with number selectors (stepper + input + Add/Remove button). Admins can add or remove multiple rows/columns in one action. Handlers loop API calls; toasts show total seats affected.

**Edited files:**
- `components/admin/seat-configurator.tsx`

### 2026-02-19 – Marquee auto-enable and section colors for assign seats

**Updates:** (1) Removed Marquee button; marquee selection is always on when onSelectMultiple is provided—any drag starts the selection box. (2) SeatMap now uses each section's color for seat backgrounds (available/sold) instead of hardcoded emerald; matches buyer SeatSelector. SectionInfo gains color prop; SeatGrid receives sectionColorMap.

**Edited files:**
- `components/seat-picker/seat-map.tsx`
- `app/admin/events/[id]/assign-seats/page.tsx`

### 2026-02-19 – Fix marquee onSelectMultiple setState-during-render

**Updates:** SeatMap defers `onSelectMultiple` via `queueMicrotask` so parent state updates run after React finishes the current render, fixing "Cannot update a component while rendering a different component".

**Edited files:**
- `components/seat-picker/seat-map.tsx`

### 2026-02-19 – Marquee selection for ticket assignments

**Updates:** Assign seats page now supports marquee (drag-to-select) for selecting multiple available seats. Hold Alt and drag, or click the Marquee button to enable drag-from-anywhere mode. Ctrl/Cmd+drag adds to selection. SeatMap component extended with `onSelectMultiple`, `marqueeMode`, and `helperText` props.

**Edited files:**
- `components/seat-picker/seat-map.tsx`
- `app/admin/events/[id]/assign-seats/page.tsx`

### 2026-02-19 – Cart timer on checkout page

**Updates:** Checkout page now shows the reservation countdown timer (MM:SS, yellow) above the payment card so buyers are aware of the time limit. When the timer expires, the cart is cleared and the user is redirected to seat selection with a toast.

**Edited files:**
- `app/[eventSlug]/checkout/page.tsx`

### 2026-02-19 – Sold Out badge size tweak

**Updates:** SectionPicker Sold Out badge enlarged (text-sm, px-4 py-1.5) for better visibility.

**Edited files:**
- `components/seat-picker/section-picker.tsx`

### 2026-02-19 – Shrink Sold Out banner

**Updates:** SectionPicker Sold Out banner is now a compact corner badge (top-right, text-[10px], px-2 py-0.5, -rotate-6) instead of a full-card overlay.

**Edited files:**
- `components/seat-picker/section-picker.tsx`

### 2026-02-19 – Fix free section availability from event_seats.status

**Updates:** get_event_availability now uses event_seats.status as source of truth when a section has event_seats. available = COUNT(status='available'). Sections without event_seats keep capacity-based logic. Fixes Sold Out banner not showing when event_seats are marked sold.

**Edited files:**
- `supabase/migrations/00064_availability_use_event_seats_status_for_sections.sql` (new)

### 2026-02-19 – Fix Sold Out check for 0 available

**Updates:** SectionPicker now uses `available <= 0` with `Number(sec.available ?? 0)` so sold-out sections (0 remaining) reliably show the Sold Out banner and hide the dropdown, including edge cases like string values.

**Edited files:**
- `components/seat-picker/section-picker.tsx`

### 2026-02-19 – Free seating: Sold Out banner and dynamic dropdown cap

**Updates:** SectionPicker shows a Sold Out banner (yellow bg, red text, tilted) for sections with 0 remaining seats. Dropdown options capped by `Math.min(10, available)` with `sec.available ?? 0` safeguard.

**Edited files:**
- `components/seat-picker/section-picker.tsx`

### 2026-02-19 – Free seating: dropdown with max 10

**Updates:** Replaced stepper (+/-) with a dropdown for free/standing section quantity. Options 0–10, capped at available. Applied in SectionPicker and InlineCart.

**Edited files:**
- `components/seat-picker/section-picker.tsx`
- `components/booking/inline-cart.tsx`

### 2026-02-19 – Fix free seating quantity glitch

**Updates:** Removed unconditional refetch-after-sync that overwrote local state and caused feedback loop. Free seating quantity no longer glitches to random numbers or resets to zero when changing quantity.

**Edited files:**
- `app/[eventSlug]/book/page.tsx`

### 2026-02-19 – Admin: show remaining seats per section

**Updates:** Seat Configurator now displays "X remaining" for each section instead of "X seats" or "X capacity". Admin seating API computes remaining (total − booked − reserved − admin reserved) per section.

**Edited files:**
- `app/api/admin/events/[id]/seating/route.ts`
- `components/admin/seat-configurator.tsx`

### 2026-02-19 – Cap ticket quantity at available, no error

**Updates:** When requested quantity exceeds available seats in a section, the API now allocates up to the available cap instead of returning an error. No "Only X seat(s) available (requested Y)" toast. After sync, the book page refetches cart items so the UI reflects the capped quantity.

**Edited files:**
- `app/api/reservations/route.ts`
- `app/api/reservations/[cartId]/route.ts`
- `app/[eventSlug]/book/page.tsx`

### 2026-02-19 – Dashboard bookings to table layout

**Updates:** Converted My Dashboard bookings list from Card layout to a table. Columns: Event, Booked, Status, Actions (View tickets). Preserved status styling (green/red/neutral) and View tickets link for confirmed bookings.

**Edited files:**
- `app/dashboard/page.tsx`

### 2026-02-19 – Cart list to table layout

**Updates:** Converted InlineCart from list/card layout to a table. Columns: Section, Seat/Details, Price, Actions. Preserved grouping by section, collapsible section headers, per-seat and per-section pricing, quantity steppers for free seating, delete actions, colored section accents, timer, and cart summary.

**Edited files:**
- `components/booking/inline-cart.tsx`

### 2026-02-19 – Seat map carousel: arrows inside, taller image, auto-loop

**Updates:** Moved prev/next arrows inside the image card (no overflow). Increased image height from max-h-64 to max-h-[28rem]. Added 5s auto-loop when multiple images.

**Edited files:**
- `components/seat-map-image-carousel.tsx`

### 2026-02-19 – Seat map image carousel

**Updates:** Replaced static thumbnail grid with carousel for seat map images. New `SeatMapImageCarousel` component: one main image, prev/next arrows, dot indicators. Buyer: click opens react-photo-view lightbox. Admin: delete button overlay on current image.

**Edited files:**
- `components/seat-map-image-carousel.tsx` (new)
- `app/[eventSlug]/book/page.tsx`
- `components/admin/seat-configurator.tsx`

### 2026-02-19 – Seat map image upload and viewer

**Updates:** Admin Seat Configurator: "Overall seat map images" section with multi-file upload. New Supabase bucket `seat-map-images`. Events.seat_map_image_urls (text[]) stores URLs. Buyer book page: react-photo-view gallery below "Select your seats below" and before seat selections.

**Edited files:**
- `supabase/migrations/00062_event_seat_map_images.sql` (new)
- `supabase/migrations/00063_seat_map_images_bucket.sql` (new)
- `app/api/admin/upload/route.ts`
- `app/api/admin/events/[id]/seat-map-images/route.ts` (new)
- `components/admin/seat-configurator.tsx`
- `app/admin/events/[id]/page.tsx`
- `app/[eventSlug]/book/page.tsx`
- `lib/types.ts`

### 2026-02-19 – Section pricing on cards and free/standing

**Updates:** Assigned section cards (map and grid) now show section price (e.g. VIP 1: ₱500). Free/standing sections show price per ticket below section name in SectionPicker.

**Edited files:**
- `app/[eventSlug]/book/page.tsx`
- `components/seat-picker/section-picker.tsx`

### 2026-02-19 – Reservations/me: 200 when no cart

**Updates:** GET /api/reservations/me now returns 200 with empty cart data (reservation_cart_id: null, items: []) when user has no cart, instead of 404. Avoids console 404 errors on first visit to book page.

**Edited files:**
- `app/api/reservations/me/route.ts`
- `app/[eventSlug]/book/page.tsx`

### 2026-02-19 – Choose seats: separate card per section, collapsible

**Updates:** Grid-mode assigned sections rendered as one card per section. Cards are collapsible (click header to expand/collapse); default expanded. Removed legend from standard seat selection. Fixed "Cannot access 'availability' before initialization" by moving gridSectionIds useMemo/useEffect after availability query.

**Edited files:**
- `app/[eventSlug]/book/page.tsx`

### 2026-02-19 – Buyer view: show section name instead of section code

**Updates:** Seat selector, section picker, inline cart, and seat map now display section name (e.g. "VIP 1", "GenAd") instead of section code (e.g. "v1", "g3") in the buyer booking flow.

**Edited files:**
- `components/seat-picker/seat-selector.tsx`
- `components/seat-picker/section-picker.tsx`
- `components/seat-picker/seat-map.tsx`
- `components/booking/inline-cart.tsx`

### 2026-02-19 – Show Seat Selection switch (per section)

**Updates:** Per-section "Show seat selection" switch in Seat Configurator for assigned sections. When ON, buyers see the visual seat map (SetupStyleCanvas). When OFF, buyers see the default row/column grid (RowColumnGrid). Added Switch component (Radix UI, oval track + sliding thumb, Wish orange when on). Migration 00060 adds `show_seat_selection` column to event_sections (default true). Migration 00061 updates get_event_availability to return it. Book page splits assigned sections by show_seat_selection and renders map/grid blocks accordingly.

**Edited files:**
- `components/ui/switch.tsx` (new)
- `supabase/migrations/00060_event_sections_show_seat_selection.sql` (new)
- `supabase/migrations/00061_availability_show_seat_selection.sql` (new)
- `components/admin/seat-configurator.tsx`
- `app/api/admin/events/[id]/seating/route.ts`
- `app/api/admin/events/[id]/seating/sections/[sectionId]/route.ts`
- `components/seat-picker/seat-selector.tsx`
- `app/[eventSlug]/book/page.tsx`

### 2026-02-19 – Section Visibility and Lock card (Seat Selector Setup)

**Updates:** New Section Controls card below the Seat Selector Setup canvas. Lists each assigned section with per-section toggles: visibility (hide/show seats on canvas) and lock (prevent seat dragging to protect positions). Global actions: Show all, Hide all, Lock all, Unlock all. State is client-side only. Fix: useEffect for section defaults depends on `sections` (not `assignedSections`) to avoid infinite re-renders.

**Edited files:**
- `components/admin/seat-selector-setup.tsx`

### 2026-02-19 – QR data format: remove dashes (########)

**Updates:** QR data format changed from `###-###-#-#` to `########` (no dashes), e.g. `ABCG30A5` instead of `ABC-G30-A-5`.

**Edited files:**
- `lib/qr-data.ts`

### 2026-02-19 – QR data format 3EventID-3SectionID-Rowlabel-SeatNumber

**Updates:** Ticket QR data now uses human-readable format: `3EventID-3SectionID-Rowlabel-SeatNumber` (e.g. `ABC-G30-A-5`). Event code truncated to 3 chars; section code padded to 3; row and seat from event_seats. Checkout and admin assign confirm both use the new format. Section tickets (free/standing) create one ticket per quantity with format `3EventID-3SectionID-FS|ST-N`.

**Edited files:**
- `lib/qr-data.ts` (new)
- `app/api/checkout/route.ts`
- `app/api/admin/assignments/[id]/confirm/route.ts`

### 2026-02-19 – Cart timer text yellow for readability

**Updates:** Countdown timer and warning message in the cart now use yellow (`text-yellow-400`) for better readability on dark background.

**Edited files:**
- `components/booking/inline-cart.tsx`

### 2026-02-19 – Cart expired dialog on auto-release

**Updates:** When the cart timer expires and the cart is automatically released, a dialog now appears: "Oops… your cart has expired." with "Back to Seats" button. Replaces the toast notification.

**Edited files:**
- `components/booking/cart-expired-dialog.tsx` (new)
- `app/[eventSlug]/book/page.tsx`

### 2026-02-19 – Remove expiry warning dialog, auto-release on timeout

**Updates:** Removed the "Your reservation is about to expire" confirmation dialog. When the cart timer reaches zero, the cart is automatically released (no user confirmation). Toast "Your reservation has expired." still shown.

**Edited files:**
- `app/[eventSlug]/book/page.tsx`
- `lib/reservations.ts`
- `components/reservation-expiry-dialog.tsx` (deleted)

### 2026-02-19 – Per-event Cart Time Duration

**Updates:** Added per-event Cart Time Duration (default 15 minutes). Admins can set 1–120 minutes in Event Details. New events default to 15 min. Reservation API fetches the event’s `cart_time_duration_minutes` and uses it for `expires_at` when creating/updating carts.

**Edited files:**
- `supabase/migrations/00059_events_cart_time_duration.sql` (new)
- `lib/reservations.ts` (getExpiresAt/getHeartbeatIntervalMs accept minutes)
- `components/admin/event-form.tsx`
- `app/api/admin/events/route.ts`
- `app/api/admin/events/[id]/route.ts`
- `app/api/reservations/route.ts`

### 2026-02-19 – Timer only starts once, no reset on add seat

**Updates:** Reservation countdown timer no longer resets when adding seats. PATCH handler no longer updates `expires_at`; it only updates cart items. `expires_at` is set once on POST (cart creation) and preserved on subsequent PATCH calls.

**Edited files:**
- `app/api/reservations/[cartId]/route.ts`

### 2026-02-19 – Fix duplicate React key in InlineCart seat items

**Updates:** Resolved "Encountered two children with the same key" error when the same seat_id appeared multiple times in cart items. Keys now use `seat-${sectionId}-${item.seat_id}-${idx}` to ensure uniqueness.

**Edited files:**
- `components/booking/inline-cart.tsx`

### 2026-02-19 – Move timer above cart in separate card

**Updates:** The 15-minute countdown timer is now in its own card above the cart. Shows time in red with Clock icon and a message: "Please complete your purchase by the time shown or your tickets and items in your cart will be released for others to purchase."

**Edited files:**
- `components/booking/inline-cart.tsx`

### 2026-02-19 – Cart 15-min countdown timer and auto-clear

**Updates:** When the cart has items, a 15-minute countdown timer (MM:SS format) appears in the cart header showing time remaining. When the timer reaches zero, the cart is automatically cleared and availability is invalidated. Heartbeat now updates the client's `expiresAt` when the server extends the reservation, keeping the timer accurate. Toast "Your reservation has expired." on auto-clear.

**Edited files:**
- `app/[eventSlug]/book/page.tsx`
- `components/booking/inline-cart.tsx`

### 2026-02-19 – Group seats by section, collapsible

**Updates:** Cart items are now grouped by section. Each section has a collapsible header showing section name, ticket count, and color accent. Click the header to expand/collapse the list of seats in that section.

**Edited files:**
- `components/booking/inline-cart.tsx`

### 2026-02-19 – Colorize cart items by section color

**Updates:** Cart items (seats and sections) now display a colored left border and subtle background tint based on the section color from availability, so each item matches its section in the seat map.

**Edited files:**
- `components/booking/inline-cart.tsx`

### 2026-02-19 – Cart price display (per-seat, per-section, total)

**Updates:** Added per-seat and per-section prices in the cart, plus cart total. New `GET /api/events/[id]/prices` returns section prices. Book page fetches prices and passes to InlineCart. Cart items show PHP price; total appears above Proceed to Checkout. Fallback ₱500 when section has no price configured.

**Edited files:**
- `app/api/events/[id]/prices/route.ts` (new)
- `app/[eventSlug]/book/page.tsx`
- `components/booking/inline-cart.tsx`

### 2026-02-19 – Fix seat showing white after delete; invalidate availability

**Updates:** When removing a seat from the cart, the seat map now refetches availability so the seat reverts to available (gray) instead of staying white (reserved). Invalidate the availability query after successful cart sync (PATCH/POST) and after cart clear (DELETE).

**Edited files:**
- `app/[eventSlug]/book/page.tsx`

### 2026-02-19 – Collapsible cart; Proceed to Checkout in separate card

**Updates:** Cart is now collapsible: click the header to expand/collapse the ticket list. Proceed to Checkout and Clear Cart moved to a separate card below the cart.

**Edited files:**
- `components/booking/inline-cart.tsx`

### 2026-02-19 – Fix seat selection not saving (reservation_item_seat_or_section constraint)

**Updates:** The `reservation_items` table has a check constraint `reservation_item_seat_or_section` that enforces either seat_id (section_id null) OR section_id (seat_id null). The API was inserting both seat_id and section_id for assigned seats, causing constraint violations. Fixed by setting `section_id: null` for all rows with seat_id in both POST and PATCH reservation endpoints.

**Edited files:**
- `app/api/reservations/route.ts`
- `app/api/reservations/[cartId]/route.ts`

### 2026-02-19 – section_id in reservation_items; individual cart display for assigned seats

**Updates:** (1) Populate section_id when inserting reservation_items (from event_seats.event_section_id or item.section_id for allocated). (2) GET /reservations/me and GET /reservations/[cartId] return assigned seats as individual items; free/standing remain grouped by section. Cart shows "Row X Seat Y" per assigned seat after refresh.

**Edited files:**
- `app/api/reservations/route.ts`
- `app/api/reservations/[cartId]/route.ts`
- `app/api/reservations/me/route.ts`

### 2026-02-19 – Profile-based reservation carts

**Updates:** All carts require auth; no guest carts. Added `profile_id` to `reservation_carts`. New `GET /api/reservations/me?event_id=X` returns user's cart. POST/PATCH/DELETE enforce ownership. Removed localStorage persist; cart fetched from API on load.

**Edited files:**
- `supabase/migrations/00057_reservation_carts_profile_id.sql` (new)
- `app/api/reservations/me/route.ts` (new)
- `app/api/reservations/route.ts`
- `app/api/reservations/[cartId]/route.ts`
- `store/reservation-store.ts`
- `app/[eventSlug]/book/page.tsx`

### 2026-02-19 – Persist cart across page refresh

**Updates:** Reservation cart (cartId, eventId, items, expiresAt) now persists to localStorage. On book page load, validates persisted cart via GET; clears if expired or wrong event, otherwise restores items from server.

**Edited files:**
- `store/reservation-store.ts`
- `app/[eventSlug]/book/page.tsx`

### 2026-02-19 – Reserved seats styled white

**Updates:** Reserved seats now display with white background in the buyer seat selector and SeatMap fallback.

**Edited files:**
- `components/seat-picker/seat-selector.tsx`
- `components/seat-picker/seat-map.tsx`

### 2026-02-19 – Fix reservation_items_cart_id_fkey on deselection

**Updates:** When deselecting seats, a race could cause PATCH to fail with FK violation (cart deleted between check and insert). API now returns 404 (instead of 500) when insert fails due to cart_id FK. Client treats 500 with FK error as stale cart and retries with POST to create a fresh cart.

**Edited files:**
- `app/api/reservations/[cartId]/route.ts`
- `app/[eventSlug]/book/page.tsx`

### 2026-02-19 – Floating progress bar for loading/saving

**Updates:** Added `FloatingProgressBar` component; shows full-viewport overlay and centered progress bar when `active`, blocking interaction. Includes center-aligned text: "Saving in progress… / getting everything ready for the show ✨". Used in Seat Selector Setup during save and upload. Added `.cursor/rules/floating-progress.mdc` rule: use floating progress bar whenever loading or saving blocks the UI.

**Edited files:**
- `components/ui/floating-progress.tsx` (new)
- `app/globals.css`
- `components/admin/seat-selector-setup.tsx`
- `.cursor/rules/floating-progress.mdc` (new)

### 2026-02-19 – Align buyer seat positions with admin

**Updates:** Buyer seat selector now uses the same uniform scale (min of scaleX, scaleY) as admin for position and seat size, so layouts match between admin Seat Selector Setup and buyer Choose seats view.

**Edited files:**
- `components/seat-picker/seat-selector.tsx`

### 2026-02-19 – Seat Selector Setup: uniform grid spacing, configurator layout, section colors

**Updates:** (1) Uniform vertical and horizontal spacing: use uniformScale for display and reduce sectionGap to match row spacing. (2) Default placement mirrors Seat Configurator grid. (3) Seats use section colors; default teal when unset.

**Edited files:**
- `components/admin/seat-selector-setup.tsx`

### 2026-02-19 – Fix reservation_items_cart_id_fkey violation

**Updates:** Fixed FK violation when inserting `reservation_items` with a cart that no longer exists (race between PATCH and DELETE). API re-validates cart before insert and returns 404 if missing. Client falls back to POST on PATCH 404—clears stale cart and creates a new one.

**Edited files:**
- `app/api/reservations/[cartId]/route.ts`
- `app/[eventSlug]/book/page.tsx`

### 2026-02-19 – Buyer seat selector: section colors, lighter reserved/sold

**Updates:** Section colors from configurator now carry through to the buyer's seat selector. Available seats use full section color. Reserved seats use the same section color at 60% opacity, unclickable. Sold seats use the same section color at 35% opacity, unclickable. Migration 00056 adds color to get_event_availability sections.

**Edited files:**
- `supabase/migrations/00056_availability_section_color.sql`
- `components/seat-picker/seat-selector.tsx`
- `app/[eventSlug]/book/page.tsx`

### 2026-02-19 – Seat configurator: section color picker for assigned seating

**Updates:** Assigned seating sections now have a color picker. Each section can be assigned a unique color from a Maraschino-inspired palette (Red, Orange, Yellow, Lime Green, Green, Cyan, Blue, Purple, Magenta, Coral, Mint, Sky Blue, Lavender, Dark Red, Forest Green, Navy Blue). Colors are stored in event_sections.color and used in the seat grid. Migration 00055 adds the color column.

**Edited files:**
- `supabase/migrations/00055_event_sections_color.sql`
- `app/api/admin/events/[id]/seating/route.ts`
- `app/api/admin/events/[id]/seating/sections/[sectionId]/route.ts`
- `components/admin/seat-configurator.tsx`
- `components/admin/seat-grid.tsx`

### 2026-02-19 – Reduce scrollbar gap (admin + buyer)

**Updates:** Added `.seat-selector-scroll` with transparent scrollbar track and corner to reduce visible gap between content and scrollbar. Applied to admin seat-selector-setup and buyer SeatSelector.

**Edited files:**
- `app/globals.css`
- `components/admin/seat-selector-setup.tsx`
- `components/seat-picker/seat-selector.tsx`

### 2026-02-19 – Restore scroll container border

**Updates:** Reverted removal of border from scroll containers; border restoration avoids the widened gap that appeared after removal.

**Edited files:**
- `components/admin/seat-selector-setup.tsx`
- `components/seat-picker/seat-selector.tsx`

### 2026-02-19 – Buyer: move image controls above seating area

**Updates:** Zoom, Reset, and Drag controls moved from overlay (top-right of diagram) to a toolbar row above the seating area, still inside the Choose seats card.

**Edited files:**
- `components/seat-picker/seat-selector.tsx`

### 2026-02-19 – Opacity slider, drag on buyer, reset zoom

**Updates:** Admin: opacity control changed to slider with debounced save and pointer-up persistence. Buyer: Drag checkbox and Reset zoom button added to seat selector. Admin: Reset zoom button added to zoom toolbar.

**Edited files:**
- `components/admin/seat-selector-setup.tsx`
- `components/seat-picker/seat-selector.tsx`

### 2026-02-19 – Seat setup: always native resolution, remove Scale, add Drag canvas

**Updates:** Edit page: removed "Native resolution" checkbox; background image always displays at 1:1 pixels. Removed Scale control. Re-added "Drag" checkbox; when checked, dragging pans the entire canvas (image + seats) by scrolling the container.

**Edited files:**
- `components/admin/seat-selector-setup.tsx`

### 2026-02-19 – Buyer native resolution; Edit page overall zoom, remove Drag image

**Updates:** Buyer page: background image now displays at native resolution (1:1 pixels). Image preloaded to get natural dimensions; canvas and seats scale accordingly. Edit page: zoom controls apply to entire canvas (seats + background); removed "Drag image" checkbox; zoom toolbar relabeled "Zoom"; pan buttons scroll the container.

**Edited files:**
- `components/seat-picker/seat-selector.tsx`
- `components/admin/seat-selector-setup.tsx`

### 2026-02-19 – Seat Selector Setup: zoom and pan buttons

**Updates:** View controls: Zoom In/Out (0.5x–2x) and Pan (Up/Down/Left/Right) buttons for the canvas. Marquee selection coordinates adjusted for zoom. **Updated:** Zoom/pan affect only the background image; seats stay fixed. Smaller pan step (16px). "Drag image" checkbox. Zoom increment 5% (was 25%). Editable zoom input (50–200%). **Native resolution** checkbox: when checked, image displays at 1:1 pixels (no auto-fit); canvas and seats scale to match.

**Edited files:**
- `components/admin/seat-selector-setup.tsx`

### 2026-02-19 – Buyer SeatSelector: match admin setup view

**Updates:** Buyer seat selector now uses same canvas layout as admin (1400x900, background image, seats at pixel positions). Image is locked (pointer-events: none). Zoom controls (+/-) scale canvas; seats and image scale together so positions stay relative. Row/section fallback when no grid positions.

**Edited files:**
- `components/seat-picker/seat-selector.tsx`

### 2026-02-19 – Seat Selector Setup: grid and distribute controls

**Updates:** Distribute H (equal horizontal spacing), Distribute V (equal vertical spacing), and Grid (arrange in rows by row/seat order) for multi-selection. All actions push to undo history.

**Edited files:**
- `components/admin/seat-selector-setup.tsx`

### 2026-02-19 – Seat Selector Setup: add Undo for moves and alignments

**Updates:** Undo button and Ctrl/Cmd+Z to revert last seat move or alignment. History capped at 30 entries. History cleared on fetch/reload.

**Edited files:**
- `components/admin/seat-selector-setup.tsx`

### 2026-02-19 – Seat Selector Setup: fix marquee select, add Marquee button

**Updates:** Fixed marquee selection being cleared by handleCanvasClick after pointerup. Added justCompletedMarqueeRef to skip clear when marquee just finished. Added Marquee toolbar button as alternative to Alt+drag. Added preventDefault/stopPropagation when starting marquee.

**Edited files:**
- `components/admin/seat-selector-setup.tsx`

### 2026-02-19 – Seat Selector Setup: always show Align toolbar

**Updates:** Align controls (Left, Right, Top, Bottom, Center H, Center V) are now always visible instead of auto-hiding. Buttons are disabled when fewer than 2 seats selected.

**Edited files:**
- `components/admin/seat-selector-setup.tsx`

### 2026-02-19 – Seat Selector Setup: fix selection coordinates and Alt release

**Updates:** Use scroll-aware coordinates for marquee selection (scroll container rect + scroll offset) so selection matches visible seat positions. Do not cancel selection when Alt is released mid-drag—let pointerup complete it.

**Edited files:**
- `components/admin/seat-selector-setup.tsx`

### 2026-02-19 – Seat Selector Setup: Alt+drag marquee for selecting 2+ seats

**Updates:** Alt+drag overlay on top of seats lets you start a selection box from anywhere (even on a seat), fixing the inability to select just 2 seats when the canvas is crowded. Hold Alt, then drag to draw a marquee; release Alt to exit marquee mode.

**Edited files:**
- `components/admin/seat-selector-setup.tsx`

### 2026-02-19 – Seat Selector Setup: improve drag-to-select for 2+ seats

**Updates:** Reduced min drag threshold (5px to 2px) so small drags count as selection. Pointer capture so selection continues when pointer moves over seats. Ctrl/Cmd+drag adds to selection instead of replacing.

**Edited files:**
- `components/admin/seat-selector-setup.tsx`

### 2026-02-19 – Seat Selector Setup: lock background image, fix drag-to-select

**Updates:** Background image is now non-interactive (pointer-events: none on container and img, draggable=false). Reordered layers: image at z-index 0 (bottom), selection hit-target at z-index 1 (above image) so drag-to-select works over the image.

**Edited files:**
- `components/admin/seat-selector-setup.tsx`

### 2026-02-19 – Seat Selector Setup: drag-to-select box, fix seat jump on drag

**Updates:** Rectangle selection: hold and drag on empty canvas to select multiple seats. Fixed seat jumping to upper-left during drag by keeping left/top in style and applying transform on top.

**Edited files:**
- `components/admin/seat-selector-setup.tsx`

### 2026-02-19 – Seat Selector Setup: fix drag by removing onPointerDown override

**Updates:** Fixed seats not draggable: removed `onPointerDown` that overwrote dnd-kit listeners and prevented drag initiation. Reduced activation distance to 4px for easier drag on small seats.

**Edited files:**
- `components/admin/seat-selector-setup.tsx`

### 2026-02-19 – Seat Selector Setup: free drag, multi-select, alignment

**Updates:** Seat Selector Setup: free dragging (no grid snap, delta-based pixel positions), multi-select (click, Ctrl+click, Shift+click for range), drag moves all selected seats. Alignment toolbar when 2+ selected: Align Left, Right, Top, Bottom, Center H, Center V. Buyer SeatSelector supports pixel-based positions when coordinates span > 50.

**Edited files:**
- `components/admin/seat-selector-setup.tsx`
- `components/seat-picker/seat-selector.tsx`

### 2026-02-19 – Aircraft-style seat selector and admin Seat Selector Setup

**Updates:** Aircraft-style Tailwind seat selector for buyers: spatial grid when seats have grid_x/grid_y, row-column fallback, hover/selected/sold states. New admin tab "Seat Selector Setup" for positioning seats (drag-and-drop on grid), background venue image upload with scale/opacity. Seat Configurator unchanged (manages quantities); Seat Selector Setup manages layout only. DB: event_seats.grid_x/grid_y, events.seat_layout_image_url, seat_layout_scale, seat_layout_opacity. APIs: PATCH seating/seats/[seatId] (grid position), PATCH seating/positions (bulk), PATCH seating/layout. get_event_availability includes grid_x/grid_y.

**Edited files:**
- `supabase/migrations/00052_event_seats_grid_position.sql` (new)
- `supabase/migrations/00053_events_seat_layout_config.sql` (new)
- `supabase/migrations/00054_availability_include_grid_position.sql` (new)
- `app/api/admin/events/[id]/seating/route.ts`
- `app/api/admin/events/[id]/seating/seats/[seatId]/route.ts`
- `app/api/admin/events/[id]/seating/positions/route.ts` (new)
- `app/api/admin/events/[id]/seating/layout/route.ts` (new)
- `components/admin/seat-selector-setup.tsx` (new)
- `components/admin/edit-event-tabs.tsx`
- `app/admin/events/[id]/page.tsx`
- `components/seat-picker/seat-selector.tsx` (new)
- `app/[eventSlug]/book/page.tsx`
- `lib/types.ts`

### 2026-02-18 – Seat selection cards height increased

**Updates:** Seat map section cards (VIP1, VIP2, etc.) default max height increased from 192px to 480px for better visibility. Sections remain collapsible.

**Edited files:**
- `components/seat-picker/seat-map.tsx`

### 2026-02-18 – Row label sort order: A–Z, then AA–AZ, BA–BZ

**Updates:** Seat map now sorts row labels correctly: single letters A–Z first, then AA–AZ, BA–BZ, etc., instead of alphabetical (A, AA, AB, ...).

**Edited files:**
- `components/seat-picker/seat-map.tsx`

### 2026-02-18 – Seat configurator Rows/Columns input fits 3 digits

**Updates:** Widened Rows and Columns number inputs in seat configurator from w-12/min-w-[3rem] to w-14/min-w-[4rem] to comfortably display 3-digit values (e.g. 100, 999).

**Edited files:**
- `components/admin/seat-configurator.tsx`

### 2026-02-18 – Guest signup dialog icon change to ticket

**Updates:** Replaced UserPlus icon with Ticket icon in guest signup dialog for ticket-themed branding.

**Edited files:**
- `components/guest-signup-dialog.tsx`

### 2026-02-18 – Guest signup dialog copy update

**Updates:** Updated dialog title to "You're almost there!", body to "Sign up to book your tickets and make memories with us.", buttons to "Maybe Later" and "Get Started".

**Edited files:**
- `components/guest-signup-dialog.tsx`

### 2026-02-18 – Confirmation page uses qr_data for ticket number

**Updates:** Ticket label on confirmation page now displays `qr_data` (e.g. N7WYQ4GD) instead of truncated ticket UUID, matching the QR code content and usher scan data.

**Edited files:**
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx`

### 2026-02-18 – Confirm email field on signup

**Updates:** Added "Confirm email" field to signup form so users re-enter their email. Form validates both match before submitting to prevent typos.

**Edited files:**
- `app/signup/page.tsx`

### 2026-02-18 – Orange blobs on background

**Updates:** Changed BlobsBackground from gray/warm blobs to Wish orange blobs for brand consistency. Increased blob animation displacement and scale variation for more noticeable drifting movement.

**Edited files:**
- `components/blobs-background.tsx`

### 2026-02-18 – Rename app to Wish Tickets Portal

**Updates:** Rebranded the app from "Wish Ticket Portal" / "Wish Ticket" to "Wish Tickets Portal" across header, hero, page titles, metadata, emails, chat AI, and copy.

**Edited files:**
- `components/header.tsx`
- `app/page.tsx`
- `app/layout.tsx`
- `app/login/page.tsx`
- `app/signup/page.tsx`
- `app/about/page.tsx`
- `app/contact/page.tsx`
- `app/api/checkout/route.ts`
- `app/api/chat/route.ts`
- `lib/email.ts`
- `README.md`

### 2026-02-18 – Guest signup prompt on seat selection

**Updates:** When a guest tries to select a seat or increase FS/ST quantity on the book page, a dialog prompts them to create an account. Cancel closes the dialog; Sign up redirects to signup with redirectTo back to seat selection.

**Edited files:**
- `components/guest-signup-dialog.tsx` (new)
- `app/[eventSlug]/book/page.tsx`

### 2026-02-18 – Google login on signup and login

**Updates:** Added "Continue with Google" option to signup and login pages with Google "G" logo. Users can sign up or sign in via Google OAuth. Uses existing auth callback route; `redirectTo` preserved through OAuth flow for checkout redirects. Supabase config updated with callback paths in additional_redirect_urls.

**Edited files:**
- `app/signup/page.tsx`
- `app/login/page.tsx`
- `supabase/config.toml`

### 2026-02-17 – Guest checkout redirect to signup

**Updates:** On 401 from checkout API, guest is redirected to signup with `redirectTo` set to seat selection (`/book`). After signup, user returns to seat selection to pick seats (cart does not persist across full-page redirect). Signup page reads `redirectTo` from query, redirects there after signup, and passes it through to login link.

**Edited files:**
- `app/[eventSlug]/checkout/page.tsx`
- `app/signup/page.tsx`

### 2026-02-17 – Ticket QR images stored in Supabase

**Updates:** When tickets are created (checkout, admin confirm), a QR PNG is generated from `qr_data` and uploaded to the `ticket-qr` storage bucket. New `qr_image_url` column on tickets stores the public URL. Confirmation page displays QR per ticket (uses stored URL or generates from qr_data as fallback).

**Edited files:**
- `supabase/migrations/00051_tickets_qr_image_url.sql` (new)
- `lib/ticket-qr.ts` (new)
- `app/api/checkout/route.ts`
- `app/api/admin/assignments/[id]/confirm/route.ts`
- `app/[eventSlug]/confirmation/[bookingId]/page.tsx`

### 2026-02-17 – Assign seats: show remaining count for FS/ST sections

**Updates:** Free seating and standing sections (Genad, ST1, etc.) now display "X remaining" below the section name on the Assign seats page.

**Edited files:**
- `app/admin/events/[id]/assign-seats/page.tsx`

### 2026-02-17 – View booking filters Reports by that assignment

**Updates:** "View booking" link on Assignments page now goes to `/admin/reports?booking_id=...`, showing only tickets from that specific booking (the person's assignment). Reports page passes `p_booking_id` to `get_admin_report_tickets`. When filtered, shows "Showing tickets for this booking" with "Show all" link.

**Edited files:**
- `supabase/migrations/00050_report_tickets_filter_by_booking.sql` (new)
- `app/admin/reports/page.tsx`
- `app/admin/events/[id]/assign-seats/page.tsx`

### 2026-02-17 – Reports: display amounts in PHP

**Updates:** Sales & Reports page now shows Amount and Revenue in PHP (₱) instead of centavos. Uses `toLocaleString("en-PH", { style: "currency", currency: "PHP" })`.

**Edited files:**
- `app/admin/reports/page.tsx`
- `components/admin/reports-table.tsx`

### 2026-02-17 – Individual ticket release on Reports and Ticket Assignments

**Updates:** Reports page now shows one row per ticket (via get_admin_report_tickets) with Recipient, Seat, Release per ticket. New POST /api/admin/tickets/[id]/release releases a single ticket, frees the seat, and recalculates or removes the booking. Ticket Assignments page adds Release button per ticket (when user has release permission).

**Edited files:**
- `supabase/migrations/00049_get_admin_report_tickets.sql` (new)
- `app/api/admin/tickets/[id]/release/route.ts` (new)
- `app/api/admin/ticket-assignments/route.ts` (returns canRelease)
- `app/admin/reports/page.tsx`
- `components/admin/reports-table.tsx`
- `app/admin/ticket-assignments/page.tsx`

### 2026-02-17 – Prevent duplicate tickets (same seat, same booking)

**Updates:** (1) Checkout deduplicates reservation_items by seat_id before creating tickets. (2) Migration 00048 adds UNIQUE(booking_id, seat_id) on tickets and removes existing duplicates. Fixes two tickets sharing the same seat_id and qr_data.

**Edited files:**
- `app/api/checkout/route.ts`
- `supabase/migrations/00048_tickets_unique_booking_seat.sql` (new)

### 2026-02-17 – Add base venue schema migration (sections, venues, seats)

**Updates:** Migration 00001 creates `venues`, `sections`, and `seats` tables if missing. Fixes `relation "public.sections" does not exist` when the base schema was not created by earlier migrations.

**Edited files:**
- `supabase/migrations/00001_create_base_venue_tables.sql` (new)

### 2026-02-17 – Assignments card: prevent stale cache, surface API errors

**Updates:** Assignments fetch now uses cache: "no-store" and API route has dynamic = "force-dynamic" to avoid stale empty responses. Added error handling when assignments API fails (toast). Defensive parsing ensures assignments is always an array.

**Edited files:**
- `app/admin/events/[id]/assign-seats/page.tsx`
- `app/api/admin/events/[id]/assignments/route.ts`

### 2026-02-17 – Hide remaining seat count for free/standing sections

**Updates:** Removed "X of Y available" / "X available" display from free seating and standing section controls on both the book page and Assign seats admin page.

**Edited files:**
- `components/seat-picker/section-picker.tsx`
- `app/admin/events/[id]/assign-seats/page.tsx`

### 2026-02-17 – Fix reservation_items seat_id FK for event seating

**Updates:** Dropped `reservation_items_seat_id_fkey` constraint. seat_id can reference either `seats` (venue) or `event_seats` (event-specific). Events using assigned seating (e.g. VIP1) insert event_seats IDs; the previous FK to `seats` caused violations.

**Edited files:**
- `supabase/migrations/00047_reservation_items_seat_id_fk_fix.sql` (new)

### 2026-02-17 – Assign-seats: FS/ST stacked vertically; SeatMap collapsible + scroll

**Updates:** (1) Free seating and standing sections on Assign seats page now stack vertically (one per line). (2) Seat selection sections are collapsible (click header to expand/collapse) and show an auto scrollbar when content overflows (max height 192px).

**Edited files:**
- `app/admin/events/[id]/assign-seats/page.tsx`
- `components/seat-picker/seat-map.tsx`

### 2026-02-17 – Hide individual seat grid for FS/ST (book + assign-seats)

**Updates:** Free seating (FS) and standing (ST) sections now show only the quantity adjuster. The individual seat selector grid is shown only for assigned seating sections. Applied to both the customer book page and the admin Assign seats page.

**Edited files:**
- `app/[eventSlug]/book/page.tsx`
- `app/admin/events/[id]/assign-seats/page.tsx`

### 2026-02-17 – Reports: correct summary counts (confirmed bookings, revenue)

**Updates:** "Confirmed bookings" and "Revenue (centavos)" are now computed from a new `get_admin_report_summary` RPC over all confirmed bookings, instead of deriving from the limited (50) report rows. Prevents undercounting when there are many bookings.

**Edited files:**
- `supabase/migrations/00046_report_summary_totals.sql` (new)
- `app/admin/reports/page.tsx`

### 2026-02-17 – Assignments seat data: fix labels and tickets fallback

**Updates:** Assignments panel was showing `--` or "Section x1" instead of proper seat labels. `get_admin_seat_assignments` now (1) joins `event_seats` for `admin_assignment_items` with `seat_id` to build section + row + seat labels, (2) falls back to `tickets` when no items from event_seats/admin_assignment_items (e.g. confirmed assigned-seating bookings).

**Edited files:**
- `supabase/migrations/00045_assignments_seat_data_from_items_and_tickets.sql` (new)

### 2026-02-17 – Fix duplicate React key in ReportsTable

**Updates:** ReportsTable used `booking_id-section_label` as list key, causing duplicates when a booking had multiple rows with same section_label (e.g. "Other"). Key now includes `section_id` and index for uniqueness.

**Edited files:**
- `components/admin/reports-table.tsx`

### 2026-02-17 – Generate seats button green for free/standing sections

**Updates:** Free seating and standing section "Generate seats" button now uses variant="success" (green) to match assigned seating.

**Edited files:**
- `components/admin/seat-configurator.tsx`

### 2026-02-17 – Remove unused venue_defaults from settings

**Updates:** Dropped venue_defaults.seat_types and venue_defaults.default_section_capacity from Seat Settings UI and API. These were vestigial after seat_type column removal (migration 00031).

**Edited files:**
- `app/admin/settings/seat-settings.tsx`
- `app/api/admin/settings/route.ts`

### 2026-02-17 – Free/standing individual seats with 8-char scan code

**Updates:** Free seating and standing sections now have individual event_seats (row FS/ST, seat numbers 1..N) with unique 4-char scan_code. Events get event_code (4 alphanumeric). Tickets use qr_data = event_code + scan_code (8 chars) for QR and usher scan. Seat configurator: free/standing "Generate seats" by capacity. Reservation API allocates N event_seats when user selects section+quantity. Checkout and admin confirm use 8-char qr_data. Admin assign-seats allocates event_seats for free/standing instead of section-based admin_assignment_items. get_event_availability derives section availability from event_seats when present.

**Edited files:**
- `supabase/migrations/00044_event_code_and_scan_code.sql` (new)
- `app/api/admin/events/[id]/seating/seats/route.ts`
- `app/api/admin/events/[id]/seating/seats/add-row/route.ts`
- `app/api/admin/events/[id]/seating/seats/add-column/route.ts`
- `app/api/admin/events/[id]/seating/copy-from-venue/route.ts`
- `components/admin/seat-configurator.tsx`
- `app/api/reservations/route.ts`
- `app/api/reservations/[cartId]/route.ts`
- `app/api/checkout/route.ts`
- `app/api/admin/assignments/[id]/confirm/route.ts`
- `app/api/admin/events/[id]/assign-seats/route.ts`

### 2026-02-17 – Reports: group by section, Release button

**Updates:** Sales & Reports page uses get_admin_report_rows (one row per booking, section). Bookings grouped by section_label. Release button per row (when user has manage_reservations/manage_assignments) calls POST /api/admin/bookings/[id]/release to cancel booking and free seats.

**Edited files:**
- `supabase/migrations/00043_get_admin_report_rows.sql` (new)
- `app/api/admin/bookings/[id]/release/route.ts` (new)
- `app/admin/reports/page.tsx`
- `components/admin/reports-table.tsx` (new)

### 2026-02-17 – Seat labels include section in assignments

**Updates:** get_admin_seat_assignments now prepends section_code/name to assigned seat labels (e.g. "vip1 A5, vip1 B5" instead of "A5, B5").

**Edited files:**
- `supabase/migrations/00042_seat_labels_include_section.sql` (new)

### 2026-02-17 – Assignments: collapsible recipient sections, default collapsed

**Updates:** Each recipient name in Assignments panel is now a collapsible header (ChevronRight/ChevronDown). Summary shown in header when collapsed; full details when expanded. Default state is collapsed.

**Edited files:**
- `app/admin/events/[id]/assign-seats/page.tsx`

### 2026-02-17 – Fix tickets section_id FK for event_sections

**Updates:** Drop tickets_section_id_fkey so tickets.section_id can reference event_sections (event-specific) in addition to sections (venue). Fixes FK violation when confirming admin assignments for free/standing sections.

**Edited files:**
- `supabase/migrations/00041_tickets_section_id_fk_fix.sql` (new)

### 2026-02-17 – Section labels in assignments

**Updates:** get_admin_seat_assignments now includes section_code/name (e.g. genad x5, standing1 x10) in seat_label for free/standing items instead of generic "Section x5".

**Edited files:**
- `supabase/migrations/00040_section_labels_in_assignments.sql` (new)

### 2026-02-17 – Admin assign seats for free seating and standing

**Updates:** Admin can assign tickets for free and standing sections by quantity; availability deducts admin-assigned quantities. Recreated admin_assignment_items for section-based assignments. Assign-seats API accepts seat_ids and/or section_assignments. Assign page shows quantity stepper for free/standing sections. Confirm creates section tickets (section_id + quantity). Release deletes admin_assignment_items.

**Edited files:**
- `supabase/migrations/00038_admin_section_assignments.sql` (new)
- `supabase/migrations/00039_availability_admin_reserved_and_assignments.sql` (new)
- `app/api/admin/events/[id]/assign-seats/route.ts`
- `app/admin/events/[id]/assign-seats/page.tsx`
- `app/api/admin/assignments/[id]/confirm/route.ts`
- `app/api/admin/assignments/[id]/route.ts`

### 2026-02-17 – Seat map: separate seats per section

**Updates:** SeatMap now accepts optional `sections` prop. When provided, seats are grouped by section with a header (section_code || name) and distinct block per section. Assign seats page and public Book page both pass sections so the seat picker displays sections separately.

**Edited files:**
- `components/seat-picker/seat-map.tsx` (sections prop, SectionInfo, groupedBySection, SeatGrid)
- `app/admin/events/[id]/assign-seats/page.tsx` (sections={availability?.sections ?? []})
- `app/[eventSlug]/book/page.tsx` (sections={sections})

---

### 2026-02-17 – Release/Reverse: custom confirmation dialog

**Updates:** Replaced native `confirm()` dialogs with a custom Dialog for Release and Reverse actions on the Assign seats page. Glass-style design with icons (AlertTriangle, RotateCcw), Cancel and confirm buttons, and loading state.

**Edited files:**
- `app/admin/events/[id]/assign-seats/page.tsx` (Dialog, confirmDialog state, handleReleaseClick, handleReverseClick, handleConfirmAction)

---

### 2026-02-17 – Event seats status: reserved vs sold, admin confirm keeps reserved

**Updates:** Admin-confirmed assignments keep `event_seats.status = 'reserved'` (not 'sold'). Seats with `assignment_id` always show as reserved in availability. Public checkout and PayMongo webhook set `event_seats.status = 'sold'` when tickets are created. get_event_availability checks `assignment_id` first so admin-assigned seats render amber (reserved).

**Edited files:**
- `app/api/admin/assignments/[id]/confirm/route.ts` (removed event_seats update to sold)
- `app/api/checkout/route.ts` (update event_seats to sold after creating tickets)
- `app/api/webhooks/paymongo/route.ts` (update event_seats to sold on payment.paid)
- `supabase/migrations/00037_availability_use_event_seats_status.sql` (CASE order: assignment_id first)

---

### 2026-02-17 – Event seats status: replace admin_assignment_items

**Updates:** Migrations 00036 and 00037. Added `status` (available|reserved|sold) and `assignment_id` to event_seats. Dropped admin_assignment_items. Assign-seats API updates event_seats instead of inserting items. Confirm reads seats from event_seats; Delete and Reverse update event_seats before/after. get_event_availability and get_admin_seat_assignments use event_seats.status and assignment_id.

**Edited files:**
- `supabase/migrations/00036_event_seats_status.sql` (new)
- `supabase/migrations/00037_availability_use_event_seats_status.sql` (get_event_availability, get_admin_seat_assignments)
- `app/api/admin/events/[id]/assign-seats/route.ts` (UPDATE event_seats, remove section_items)
- `app/api/admin/assignments/[id]/confirm/route.ts` (read from event_seats, create tickets)
- `app/api/admin/assignments/[id]/route.ts` (UPDATE event_seats before delete)
- `app/api/admin/assignments/[id]/reverse/route.ts` (get seat_ids from tickets, UPDATE event_seats after)

---

### 2026-02-17 – Seat configurator: section kind label after seats/capacity

**Updates:** Display section kind label (Assigned Seating, Free Seating (FCFS), Standing Section) after the seats/capacity count in each section row.

**Edited files:**
- `components/admin/seat-configurator.tsx`

### 2026-02-17 – Seat configurator: add buttons green, remove buttons red

**Updates:** Add row below, Add column use success (green) variant; Remove last row, Remove column use destructive (red) variant.

**Edited files:**
- `components/admin/seat-configurator.tsx`

### 2026-02-17 – Seat Configurator: add/remove row-column, preserve expanded, stepper

**Updates:** Add row below, Remove last row, Add column, Remove column buttons when section has seats. fetchSeating preserves expanded section state when add/remove (no collapse on refresh). Rows/columns use stepper (minus/plus) with manual input; config synced from actual seat grid.

**Edited files:**
- `app/api/admin/events/[id]/seating/seats/add-row/route.ts` (new)
- `app/api/admin/events/[id]/seating/seats/remove-row/route.ts` (new)
- `app/api/admin/events/[id]/seating/seats/add-column/route.ts` (new)
- `app/api/admin/events/[id]/seating/seats/remove-column/route.ts` (new)
- `components/admin/seat-configurator.tsx`

---

### 2026-02-17 – Remove seat_type from database (event_seats, seats)

**Updates:** Migration 00031 drops seat_type column from event_seats and seats (venue). get_event_availability RPC updated to omit seat_type from seat JSON. Seat generation (POST, add-row, add-column), copy-from-venue, and booking UI updated.

**Edited files:**
- `supabase/migrations/00031_remove_seat_type_from_seats.sql` (new)
- `app/api/admin/events/[id]/seating/route.ts`
- `app/api/admin/events/[id]/seating/seats/route.ts`, `seats/add-row/route.ts`, `seats/add-column/route.ts`
- `app/api/admin/events/[id]/seating/copy-from-venue/route.ts`
- `components/admin/seat-configurator.tsx`, `seat-grid.tsx`
- `components/booking/inline-cart.tsx`, `app/[eventSlug]/book/page.tsx`
- `supabase/seed.sql`

---

### 2026-02-17 – Simplify seat pricing: one price per section, remove seat type

**Updates:** Seat Pricing reduced to one price per section. Removed seat type (All/Standard/VIP) from pricing. Migration 00030 consolidates event_prices to one row per (event_id, section_id) and drops seat_type column. Pricing API and checkout use section_id only for lookup.

**Edited files:**
- `supabase/migrations/00030_simplify_event_prices_one_per_section.sql` (new)
- `components/admin/seat-pricing.tsx` (single price input per section)
- `app/api/admin/events/[id]/pricing/route.ts` (section_id-only schema)
- `app/api/checkout/route.ts` (section_id-only price lookup)

---

### 2026-02-17 – Event form width utilization

**Updates:** Event Details form widened from max-w-lg to max-w-4xl. Title|Slug and Teaser video|Event start in two-column grid for better horizontal space use.

**Edited files:**
- `components/admin/event-form.tsx`

---

### 2026-02-17 – Section name and section code required

**Updates:** Section Name and Section Code are now required when adding or editing sections in the Seat Configurator. API validates both fields; UI shows required indicators (*) and validates before save. Toast errors for empty values.

**Edited files:**
- `app/api/admin/events/[id]/seating/sections/route.ts` (section_code required in POST schema)
- `app/api/admin/events/[id]/seating/sections/[sectionId]/route.ts` (min(1) on name/section_code for PATCH)
- `components/admin/seat-configurator.tsx` (validation in handleAddSection, handleUpdateSection; required placeholders)

---

### 2026-02-17 – Edit Event three sections: Event Details, Seat Configurator, Seat Pricing

**Updates:** Edit Event page restructured into three tabs: Event Details (existing form), Seat Configurator (event-specific sections and seats; copy from venue, add sections, generate seats), Seat Pricing (per-section pricing). New tables: event_sections, event_seats, event_prices. get_event_availability uses event_sections/event_seats when present. Checkout uses event_prices for total_cents. (Note: later migrations 00030–00031 simplified pricing to one price per section and removed seat_type.)

**Edited files:**
- `supabase/migrations/00027_event_seating_and_pricing.sql` (new)
- `app/admin/events/[id]/page.tsx` (three-section tabs)
- `components/admin/edit-event-tabs.tsx` (new)
- `components/admin/seat-configurator.tsx` (new)
- `components/admin/seat-pricing.tsx` (new)
- `app/api/admin/events/[id]/seating/route.ts` (new)
- `app/api/admin/events/[id]/seating/copy-from-venue/route.ts` (new)
- `app/api/admin/events/[id]/seating/sections/route.ts` (new)
- `app/api/admin/events/[id]/seating/sections/[sectionId]/route.ts` (new)
- `app/api/admin/events/[id]/seating/seats/route.ts` (new)
- `app/api/admin/events/[id]/seating/seats/[seatId]/route.ts` (new)
- `app/api/admin/events/[id]/pricing/route.ts` (new)
- `app/api/checkout/route.ts` (dynamic pricing from event_prices)

---

### 2026-02-17 – Featured Events section on homepage

**Updates:** Added "Featured Events" section above "Upcoming Events" on the homepage. Events marked featured in admin appear in the top section; the rest appear in Upcoming Events. Both sections respect category/search filters and sort by date. Migration 00026 updates `get_upcoming_events` RPC to order by featured first.

**Edited files:**
- `supabase/migrations/00026_upcoming_events_featured_first.sql` (new)
- `lib/types.ts` (add featured to Event)
- `components/event-grid.tsx` (split into Featured and Upcoming sections)

---

### 2026-02-17 – Admin Events table: collapsible groups, Featured checkbox, sort by date

**Updates:** Admin Events page refactored with collapsible category groups (click header to expand/collapse), Featured Event checkbox beside Edit (toggles via PATCH), events sorted by nearest date and grouped by category. Added `featured` column to events; new `update_admin_event_featured` RPC and `/api/admin/events/[id]/featured` endpoint.

**Edited files:**
- `supabase/migrations/00023_events_featured.sql` (new)
- `supabase/migrations/00024_events_featured_rpc.sql` (new)
- `app/api/admin/events/[id]/featured/route.ts` (new)
- `components/admin/events-table.tsx` (new)
- `app/admin/events/page.tsx` (use EventsTable)

---

### 2026-02-17 – Event by slug RPC (fix 500 on book page)

**Updates:** Migration 00013 adds `get_event_by_slug(p_slug)` RPC (SECURITY DEFINER) to fetch a single event by slug without RLS. Events API slug path now uses this RPC instead of table query. Fixes 500 when opening event book page (fun-day-carnival, acoustic-night-live, etc.).

**Edited files:**
- `supabase/migrations/00013_event_by_slug_rpc.sql` (new)
- `app/api/events/route.ts` (use rpc get_event_by_slug for slug)

---

### 2026-02-17 – Admin Events Settings, Seat Settings

**Updates:** Added Events Settings tab: default status (draft/published), default category, events per page. Settings API handles event_defaults. Event form fetches event_defaults for initial category/status; API accepts status. Admin dashboard: Settings card. Events Settings tab first in Settings page.

**Edited files:**
- `app/admin/settings/events-settings.tsx` (new)
- `app/admin/settings/page.tsx` (Events Settings tab)
- `app/api/admin/settings/route.ts` (event_defaults)
- `app/api/admin/events/route.ts` (status in schema)
- `app/admin/page.tsx` (Settings card)
- `components/admin/event-form.tsx` (fetch defaults, status field)

---

### 2026-02-17 – Events RPC to bypass RLS

**Updates:** Migration 00012 adds `get_upcoming_events(p_category, p_search)` RPC (SECURITY DEFINER) to fetch published upcoming events without RLS. Events API list uses this RPC instead of table query. Fixes "No events in list" when RLS blocks the events table.

**Edited files:**
- `supabase/migrations/00012_events_rpc.sql` (new)
- `app/api/events/route.ts` (use rpc get_upcoming_events for list)

---

### 2026-02-17 – RPC for profile role, bypass RLS 500

**Updates:** Migration 00011 adds `get_my_role()` RPC (SECURITY DEFINER) that returns the current user's role without RLS. Header and HeaderWrapper now use `supabase.rpc('get_my_role')` instead of querying profiles table. Bypasses RLS recursion that caused 500 when fetching role. Removed admin client logic from HeaderWrapper.

**Edited files:**
- `supabase/migrations/00011_profiles_role_rpc.sql` (new)
- `components/header.tsx` (use rpc get_my_role)
- `components/header-wrapper.tsx` (use rpc get_my_role, remove admin client)

---

### 2026-02-17 – Fix profiles RLS recursion (500 error)

**Updates:** Migration 00010 removes the recursive profiles reference from "Manage users can read all profiles". The policy previously checked `EXISTS (SELECT FROM profiles WHERE...)` to determine if the user is admin, causing infinite recursion and 500 when the Header fetched profile. Now uses only auth.uid() = id and user_capabilities (manage_users); admins get manage_users from backfill.

**Edited files:**
- `supabase/migrations/00010_fix_profiles_rls_recursion.sql` (new)

---

### 2026-02-17 – Admin client when available, fix events and Settings

**Updates:** Added `getAdminClientIfAvailable()` (returns client or null, no throw). Events API and HeaderWrapper use admin client when `SUPABASE_SERVICE_ROLE_KEY` is set; otherwise fall back to createClient. This bypasses RLS and fixes both events (empty list) and Settings (hidden for admin) when the service role key is configured. README: emphasized adding the key as the primary fix.

**Edited files:**
- `lib/supabase/admin.ts` (getAdminClientIfAvailable)
- `app/api/events/route.ts` (use admin when available)
- `components/header-wrapper.tsx` (use admin when available for role)
- `.env.example` (stronger REQUIRED note)
- `README.md` (setup checklist)

---

### 2026-02-17 – Revert HeaderWrapper, idempotent events policy

**Updates:** Reverted HeaderWrapper to always use createClient for profile fetch (removed createAdminClient). Admin-client-first logic was causing Settings to disappear when admin fetch failed without falling back. Migration 00009: added DROP POLICY IF EXISTS before CREATE so it applies cleanly if policy already exists.

**Edited files:**
- `components/header-wrapper.tsx` (revert to createClient only)
- `supabase/migrations/00009_public_read_published_events.sql` (idempotent)

---

### 2026-02-17 – Public read events policy, admin role lookup, setup docs

**Updates:** Added migration 00009: "Public can read published events" RLS policy so anonymous and regular users can read events. HeaderWrapper now uses createAdminClient when available for role lookup (Settings visibility). Created .env.example with SUPABASE_SERVICE_ROLE_KEY. README: Events and Settings setup checklist, service role key note.

**Edited files:**
- `supabase/migrations/00009_public_read_published_events.sql` (new)
- `components/header-wrapper.tsx` (admin client for role)
- `.env.example` (new)
- `README.md` (setup checklist, env doc)

---

### 2026-02-17 – Settings visibility, events API, Admin nav

**Updates:** Layout set to `force-dynamic` so HeaderWrapper gets fresh role on each request. Events API uses `createAdminClient()` (bypasses RLS) with fallback to `createClient()` if service role key is missing. Added Admin link in header nav and user dropdown for admin/super_admin. Fixed db:seed script to use `supabase db push --include-seed --linked`.

**Edited files:**
- `app/layout.tsx` (force-dynamic)
- `app/api/events/route.ts` (admin client, fallback)
- `components/header.tsx` (Admin link in nav and dropdown)
- `package.json` (db:seed script)

### Template for new entries

```
## YYYY-MM-DD – Brief description

**Updates:** Short summary.

**Edited files:**
- path/to/file1.ts
- path/to/file2.tsx
```

---

## 2026-02-11 – Roles retention and super_admin

**Updates:** Added super_admin role to app_role enum. Settings button in header and dashboard visible only for admin and super_admin; user, admissions_staff, usher do not see it. New signups default to user role (unchanged). RLS policies updated for super_admin. Auth helpers (requireAdmin, requireStaff) allow super_admin. Migration split: 00007 adds enum only; 00008 applies RLS policies and backfill (PostgreSQL cannot use new enum value in same transaction).

**Edited files:**
- `supabase/migrations/00007_add_super_admin_role.sql` (new, enum only)
- `supabase/migrations/00008_super_admin_policies_and_backfill.sql` (new)
- `lib/auth.ts` (AppRole, requireAdmin, requireStaff)
- `components/header.tsx` (fetch role, conditional Settings)
- `app/dashboard/page.tsx` (Settings button for admin/super_admin only)
- `app/admin/layout.tsx`, `app/admin/settings/page.tsx`
- `app/api/admin/events/route.ts`, `app/api/admin/venues/route.ts` (use requireAdmin)
- `app/admissions/login/page.tsx`, `app/api/admissions/scan/route.ts`

---

## 2026-02-11 – Settings page and capability matrix

**Updates:** New Settings page at `/admin/settings` with tabs: Seat Settings (reservation TTL, venue/seat defaults), User Settings (profile), User Roles (capability checkbox matrix), Sales Analytics (link to reports). Replaced role-based RBAC with capabilities: `user_capabilities` table, `app_config` table. Capability matrix: users × capabilities with per-user Save. Admin nav shows Settings when user has `manage_settings`; Events/Venues/Reports gated by capabilities. Migration 00006 creates tables, backfills from profiles, RLS policies.

**Edited files:**
- `supabase/migrations/00006_capabilities_and_settings.sql` (new)
- `lib/capabilities.ts` (new)
- `lib/auth.ts` (hasCapability, requireCapability, getUserCapabilities, requireAnyCapability)
- `components/ui/checkbox.tsx` (new)
- `components/ui/tabs.tsx` (new)
- `app/admin/settings/page.tsx` (new)
- `app/admin/settings/seat-settings.tsx` (new)
- `app/admin/settings/user-settings.tsx` (new)
- `app/admin/settings/capability-matrix.tsx` (new)
- `app/admin/settings/sales-analytics.tsx` (new)
- `app/admin/layout.tsx` (Settings nav, capability-based access)
- `app/api/admin/users/route.ts` (new), `app/api/admin/users/[userId]/capabilities/route.ts` (new)
- `app/api/admin/settings/route.ts` (new)
- `package.json` (@radix-ui/react-checkbox)

---

## 2026-02-11 – Inline cart and auto-reserve flow

**Updates:** Cart moved inline below seat selection (no right sidebar). Single "Proceed to Checkout" button; "Reserve tickets" and "View Cart" removed. Reservations sync automatically when items change (debounced ~400ms, silent). InlineCart component: item list with edit controls (remove seat, section qty stepper), Clear Cart, Proceed to Checkout. Cart page redirects to book page.

**Edited files:**
- `components/booking/inline-cart.tsx` (new)
- `app/[eventSlug]/book/page.tsx` (layout, auto-sync, InlineCart, handlers)
- `app/[eventSlug]/cart/page.tsx` (redirect to book)

---

## 2026-02-17 – Cart page and View Cart flow

**Updates:** Replaced "Proceed to checkout" with "View Cart" on book page. New cart page at /[eventSlug]/cart: item list (seats as Row/Seat, sections with qty), per-item delete, section quantity edit, Clear Cart, Proceed to Checkout. Heartbeat and expiry dialog on cart page.

**Edited files:**
- `app/[eventSlug]/book/page.tsx`
- `app/[eventSlug]/cart/page.tsx` (new)

---

## 2026-02-17 – Section picker minus/plus buttons

**Updates:** Replaced number input with a counter: minus (-) on the left, quantity in center, plus (+) on the right. Glass-style bordered container, disabled states at min/max.

**Edited files:**
- `components/seat-picker/section-picker.tsx`

---

## 2026-02-17 – Reservation expiry dialog

**Updates:** Added dialog that appears when reservation is about to expire (1 min left). User can extend or release seats. Glass-style design with Wish orange accent.

**Edited files:**
- `lib/reservations.ts` (RESERVATION_WARN_MS)
- `components/reservation-expiry-dialog.tsx` (new)
- `app/[eventSlug]/book/page.tsx` (expiry check, dialog, handlers)

---

## 2026-02-17 – Move done migrations to Done folder

**Updates:** Moved applied migrations (00001–00005) into `supabase/migrations/Done/`. Symlinks in the migrations root keep the Supabase CLI compatible.

**Edited files:**
- `supabase/migrations/` (restructured: added Done folder, symlinks)

---

## 2026-02-17 – Auto-clear expired reservation carts

**Updates:** Added pg_cron job to delete expired reservation carts every 5 minutes. `reservation_items` cascade-deletes when carts are removed.

**Edited files:**
- `supabase/migrations/00005_cleanup_expired_reservation_carts.sql` (new)

---

## 2026-02-11 – AppUpdates and rules setup

**Updates:** Created changelog (AppUpdates.MD) and Cursor rule to enforce updating it on every project edit.

**Edited files:**
- `AppUpdates.MD` (new)
- `.cursor/rules/app-updates.mdc` (new)
