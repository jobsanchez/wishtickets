/** Hostnames allowed for Next.js Image optimization (see next.config.ts remotePatterns). */
export function remoteImageCanOptimize(src: string): boolean {
  try {
    const h = new URL(src).hostname;
    return (
      h.endsWith(".supabase.co") ||
      h.endsWith(".supabase.in") ||
      h === "images.unsplash.com"
    );
  } catch {
    return false;
  }
}

const SUPABASE_CO_SUFFIX = ".supabase.co";
const SUPABASE_IN_SUFFIX = ".supabase.in";

/** Project subdomain for `xyz.supabase.co` / `xyz.supabase.in`. */
export function extractSupabaseProjectRef(hostname: string): string | null {
  const h = hostname.toLowerCase();
  if (h.endsWith(SUPABASE_CO_SUFFIX)) {
    return h.slice(0, -SUPABASE_CO_SUFFIX.length) || null;
  }
  if (h.endsWith(SUPABASE_IN_SUFFIX)) {
    return h.slice(0, -SUPABASE_IN_SUFFIX.length) || null;
  }
  return null;
}

/** Same Supabase REST project despite http/https or benign hostname differences. */
export function supabaseApiOriginsMatchStorageUrl(apiBase: URL, storageUrl: URL): boolean {
  const pa = `${apiBase.protocol}//${apiBase.hostname}`.toLowerCase();
  const pb = `${storageUrl.protocol}//${storageUrl.hostname}`.toLowerCase();
  if (pa === pb) return true;

  const ha = apiBase.hostname.toLowerCase();
  const hb = storageUrl.hostname.toLowerCase();
  if (
    !(ha.endsWith(SUPABASE_CO_SUFFIX) || ha.endsWith(SUPABASE_IN_SUFFIX)) ||
    !(hb.endsWith(SUPABASE_CO_SUFFIX) || hb.endsWith(SUPABASE_IN_SUFFIX))
  ) {
    return false;
  }
  const ra = extractSupabaseProjectRef(ha);
  const rb = extractSupabaseProjectRef(hb);
  return !!ra && ra === rb;
}

/** Turn DB/query strings into an absolute Storage URL (`/storage/...` resolves against env). */
export function resolveSupabaseAssetAbsoluteUrl(raw: string): URL | null {
  const trimmed = raw.replace(/\uFEFF/g, "").trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    /* continue */
  }
  const baseRaw =
    typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string"
      ? process.env.NEXT_PUBLIC_SUPABASE_URL.trim()
      : "";
  if (!baseRaw) return null;
  try {
    const normalizedBase = baseRaw.replace(/\/$/, "");
    const rel = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
    return new URL(rel, `${normalizedBase}/`);
  } catch {
    return null;
  }
}

/** Paths the image proxy is allowed to fetch (must match server allow-list). */
export function isProxiableSupabaseStorageObjectUrl(url: URL): boolean {
  const p = url.pathname;
  return (
    p.startsWith("/storage/v1/object/public/") || p.startsWith("/storage/v1/object/sign/")
  );
}

/**
 * Serves Supabase Storage images via `/api/image-proxy` so we emit stronger Cache-Control than the
 * default storage CDN (improves repeat visits + Lighthouse cache audit). Same-origin URL uses
 * `unoptimized` image loading on Netlify.
 *
 * Only **Storage object** URLs are proxied. Other `*.supabase.co` origins (REST, malformed query-only
 * resolution, accidental `/api/image-proxy?url` strings resolved against project base, etc.) are
 * returned as their absolute **`href`** so we never emit `/api/image-proxy?url=` with an empty target.
 */
export function supabaseStorageDisplaySrc(url: string | null | undefined): string {
  if (url == null || url === "") return "";
  const trimmed = url.replace(/\uFEFF/g, "").trim();
  if (!trimmed) return "";
  let resolved = resolveSupabaseAssetAbsoluteUrl(trimmed);
  if (!resolved) {
    try {
      const decoded = decodeURIComponent(trimmed.replace(/\+/g, "%20"));
      if (decoded !== trimmed) resolved = resolveSupabaseAssetAbsoluteUrl(decoded);
    } catch {
      /* ignore */
    }
  }
  const isSupabaseHost =
    !!resolved &&
    (resolved.hostname.endsWith(".supabase.co") ||
      resolved.hostname.endsWith(".supabase.in"));

  if (isSupabaseHost && resolved && isProxiableSupabaseStorageObjectUrl(resolved)) {
    const href = resolved.href.trim();
    const encoded = href ? encodeURIComponent(href) : "";
    if (encoded) {
      return `/api/image-proxy?url=${encoded}`;
    }
    return href || trimmed;
  }
  if (resolved) {
    return resolved.href || trimmed;
  }
  return trimmed;
}
