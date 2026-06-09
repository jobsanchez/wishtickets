/**
 * Use the real Supabase public object URL in img src (not /api/image-proxy).
 * For ticket templates, report thumbnails, and layout editor backgrounds — same URL as storage.
 * @param cacheBust - e.g. ticket id, timestamp, or version — appended as v= for CDN/browser when the object path is unchanged (global template upsert) or after replacement.
 */
export function getDirectTicketImageDisplayUrl(
  url: string | null | undefined,
  cacheBust?: string | null
): string | null {
  if (!url) return null;
  if (cacheBust == null || cacheBust === "") return url;
  try {
    const u = new URL(url);
    u.searchParams.set("v", String(cacheBust));
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Returns a proxied URL for Supabase storage images to avoid
 * net::ERR_INCOMPLETE_CHUNKED_ENCODING when loading in the browser.
 * For non-Supabase URLs, returns the original.
 * @param cacheBustId - Optional id (e.g. ticket id) to append as &v=... for cache-busting; prevents CDN from serving same image for different tickets.
 * @param noCache - When true, append &nocache=1 so the proxy returns no-store Cache-Control; use for admin previews that must always show fresh content.
 */
export function getProxiedImageUrl(
  url: string | null | undefined,
  cacheBustId?: string | null,
  noCache?: boolean
): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabase) return url;
    const base = new URL(supabase);
    if (u.origin === base.origin && u.pathname.startsWith("/storage/v1/object/public/")) {
      let proxyUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`;
      if (cacheBustId) {
        proxyUrl += `&v=${encodeURIComponent(cacheBustId)}`;
      }
      if (noCache) {
        proxyUrl += "&nocache=1";
      }
      return proxyUrl;
    }
  } catch {
    // Invalid URL, return as-is
  }
  return url;
}
