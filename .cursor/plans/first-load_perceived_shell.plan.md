---
name: First-load perceived shell (progress-only)
overview: "Improve first-load perceived speed using branded shell + loading progress (RouteLoading / FloatingProgressBar patterns)—no skeleton cards or pulse placeholders."
todos:
  - id: home-stream-progress
    content: "Enrich HomeStreamFallback with stronger progress-only UI (aligned with RouteLoading: spinner, title, subtitle, track, dots)—reserve vertical space via min-height/layout without skeleton grids."
    status: pending
  - id: event-loading-fullscreen
    content: "Use RouteLoading fullscreen for app/[eventSlug]/loading.tsx (progress-only); no hero-shaped skeleton blocks."
    status: pending
  - id: eventgrid-loading-align
    content: "Replace EventGrid isLoading skeleton grids with the same progress-only pattern for consistency (compact RouteLoading or shared WishLoadingBody block)."
    status: pending
  - id: optional-cache-slug
    content: "Optional: React.cache on getPublicEventBySlug for metadata+page dedupe."
    status: pending
isProject: true
---

# First-load perceived shell (progress-only, no skeletons)

## Constraint (updated)

- **Do not** introduce or rely on **skeleton** UIs (card placeholders, pulse blocks mimicking layout). Use **loading progress** only: spinner, **`WishLoadingTrack`** shimmer, **`WishLoadingBody`** / **`RouteLoading`** variants, and **`FloatingProgressBar`** where blocking overlay fits ([components/ui/route-loading.tsx](components/ui/route-loading.tsx), [components/ui/floating-progress.tsx](components/ui/floating-progress.tsx)).

## Current baseline

- Home hero streams sync; **`HomeSplitLoader`** is behind **`Suspense`** with **`HomeStreamFallback`** ([app/page.tsx](app/page.tsx), [app/home-stream-fallback.tsx](app/home-stream-fallback.tsx)) — already progress-oriented but minimal vs viewport.
- Root **`app/loading.tsx`** — fullscreen **`RouteLoading`** with branded headline ([app/loading.tsx](app/loading.tsx)).
- **`BackgroundImage`** — solid theme bg first, image fades in ([components/background-image.tsx](components/background-image.tsx)).
- **`EventGrid`** **`isLoading`** still renders **skeleton grids** ([components/event-grid.tsx](components/event-grid.tsx)) — conflicts with progress-only direction; should be aligned.

## Planned changes

### 1. Home Suspense fallback — richer progress, no skeletons

**File:** [app/home-stream-fallback.tsx](app/home-stream-fallback.tsx)

- Expand to reuse the same building blocks as **`RouteLoading`** (e.g. **`WishLoadingGlassCard`** + **`WishLoadingBody`** + subtitle copy), or compose **`RouteLoading`** `variant="compact"` / **`variant="page"`** inside a **`min-h-[...]`** wrapper so the lower half feels intentionally “loading” rather than empty.
- Avoid **`EventCardSkeleton`** or pulse rectangles.

### 2. Event detail route loading — fullscreen progress

**File:** [app/[eventSlug]/loading.tsx](app/[eventSlug]/loading.tsx)

- Switch to **`RouteLoading`** **`variant="fullscreen"`** with messages like **Loading event…** (no hero-shaped placeholder blocks).

### 3. Event grid initial loading — progress-only

**File:** [components/event-grid.tsx](components/event-grid.tsx)

- Replace the **`if (isLoading)`** skeleton **`EventCardSkeleton`** grids with a single progress column (**`RouteLoading`** **`compact`** or **`WishLoadingBody`** + **`WishLoadingTrack`**), matching copy used on the home fallback so transitions feel consistent.

### 4. Optional: dedupe slug fetch per request

**File:** [lib/events/get-public-event-by-slug.ts](lib/events/get-public-event-by-slug.ts) (or adjacent wrapper)

- Wrap **`getPublicEventBySlug`** with **`React.cache()`** so **`generateMetadata`** and the page share one Supabase round-trip ([app/[eventSlug]/page.tsx](app/[eventSlug]/page.tsx)).

## Out of scope unless requested

- Changing root **`force-dynamic`** / caching policy.
- **`FloatingProgressBar`** on first paint without hydration — reserved for client-driven blocking states; server/streaming paths stay **`RouteLoading`** / static progress markup.

## Success criteria

- First meaningful paint: theme bg + chrome + hero (home) or fullscreen branded progress (slow segments), **without** skeleton cards.
- **`EventGrid`** loading state matches that vocabulary (progress only).
