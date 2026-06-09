/**
 * Returns the site origin for server-side use (e.g. PayMongo redirect URLs).
 * Prefers env vars so redirects work correctly on Netlify/Vercel serverless.
 */
export function getSiteOrigin(request?: Request): string {
  // Explicit config (recommended for production)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) return siteUrl.replace(/\/$/, "");

  // Netlify
  const netlifyUrl = process.env.URL?.trim();
  if (netlifyUrl) {
    const u = netlifyUrl.startsWith("http") ? netlifyUrl : `https://${netlifyUrl}`;
    return u.replace(/\/$/, "");
  }

  // Vercel
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");

  // Fallback: request url (local dev)
  if (request) return new URL(request.url).origin;
  return `http://localhost:${process.env.PORT || "3000"}`;
}
