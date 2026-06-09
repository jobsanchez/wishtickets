---
name: First-load perceived performance
overview: "Keep no-cache behavior (`force-dynamic` + `revalidate = 0` unchanged). Improve perceived first-load speed with a staged UI: solid/blank background first, then 'loading events' (Suspense + skeletons) and optionally a deferred hero backdrop so the page feels instant even when the server and data are still catching up."
todos:
  - id: perceived-shell
    content: "Define first-paint order: default body bg only → optional deferred BackgroundImage (low priority / after layout) → home Suspense fallbacks for events."
    status: completed
  - id: background-staged
    content: "Adjust BackgroundImage (or app-chrome) so the concert backdrop is not competing with first paint—e.g. solid bg first, image fades in on load, drop fetchPriority high or load after first paint."
    status: completed
  - id: home-suspense-fallback
    content: "Tighten HomeStreamFallback (and any EventGrid loading) to a clear 'Loading events' + skeletons matching final layout so time-to-something-meaningful is minimal."
    status: completed
  - id: profile-optional
    content: "Optional: TTFB/Lighthouse to verify improved LCP/CLS; keep React Query tuning only if post-paint refetch still feels like a second load."
    status: pending
isProject: true
---

# First-load perceived performance (no caching changes)

## Constraints (locked)

- **Do not** remove `dynamic = "force-dynamic"` or `revalidate = 0` from `app/layout.tsx`. You want **no HTML/data caching**; all techniques below are **perceived** speed and **resource ordering**, not stale cache.

## Problem reframed

- Actual TTFB and Supabase work may stay the same, but the user should **see a stable layout immediately** (header + body background from CSS), then **explicit loading** for the slow part (events), instead of a long blank or a heavy image blocking first paint.

## Current hooks in the repo

- **Home** already uses `Suspense` with `HomeStreamFallback` around `HomeSplitLoader` in `app/page.tsx` — this is the right place to make the "loading events" experience obvious and on-brand.
- **Backdrop**: `components/background-image.tsx` uses a full-viewport `<picture>` with `fetchPriority="high"` on the default `img` — on first load this competes with text, fonts, and the events shell for bandwidth and main thread.
- **Chrome**: `components/app-chrome.tsx` always renders the header; backdrop is skipped only on `/admissions/*`.

## Recommended staged sequence (first visit)

1. **Instant**: `body` / theme background (already in `app/layout.tsx` classes) — reads as "page loaded."
2. **Optional deferral**: Backdrop **image** appears after first paint (e.g. start with no image or a minimal gradient; add image in `useEffect` / `onLoad` with a short CSS fade-in) so the browser does not treat the big WebP as the critical path.
3. **Server stream**: Keep streaming `HomeSplitLoader`; ensure the **Suspense fallback** is the dominant visual under the hero until real content arrives.
4. **Client grid**: `app/home-client.tsx` already dynamic-imports `EventGrid` with a loading state — align copy ("Loading events") and skeleton density with the final grid so the transition feels continuous.

## Implementation notes (when you execute)

- **`BackgroundImage`**: e.g. `useState` mounted → show picture; or `fetchPriority="low"` / `auto`; or placeholder `div` with `bg-background` until `img` `onLoad`. Preserve reduced-motion and light theme behavior (return `null` for light as today).
- **`HomeStreamFallback`**: Reuse or mirror patterns from `RouteLoading` / existing skeletons; avoid a tiny spinner that disappears too fast while the shell is still empty.
- **Do not** rely on HTTP caching; changes are 100% UI sequencing and image priority.

## Out of scope for this direction

- Removing root `force-dynamic` / revalidate (explicitly out).
- Global React Query `staleTime` changes are **optional** follow-up only if post-hydration refetch still feels like a "second" load (does not change server no-cache policy).

## Success criteria

- First meaningful paint is **structural** (bg + header + hero + clear "events loading"), not waiting on the hero **image** or event **data** to start showing something.
- No change to your **no cache** server semantics.
