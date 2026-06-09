import { createAdminClient } from "@/lib/supabase/admin";

const PUBLIC_STORAGE_MARKER = "/storage/v1/object/public/";

/**
 * Load a PNG buffer from a URL. For this project's Supabase public object URLs,
 * uses Storage API (no extra HTTP hop). Otherwise uses fetch.
 */
export async function loadPngBufferFromUrl(url: string): Promise<Buffer | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const useStorageDownload =
    Boolean(supabaseUrl) &&
    url.startsWith(supabaseUrl) &&
    url.includes(PUBLIC_STORAGE_MARKER);

  if (useStorageDownload) {
    try {
      const pathname = new URL(url).pathname;
      const idx = pathname.indexOf(PUBLIC_STORAGE_MARKER);
      if (idx === -1) return null;
      const rest = pathname.slice(idx + PUBLIC_STORAGE_MARKER.length);
      const slash = rest.indexOf("/");
      if (slash <= 0) return null;
      const bucket = decodeURIComponent(rest.slice(0, slash));
      const objectPath = decodeURIComponent(rest.slice(slash + 1));
      if (!bucket || !objectPath) return null;

      const admin = createAdminClient();
      const { data, error } = await admin.storage.from(bucket).download(objectPath);
      if (error || !data) {
        console.warn("[load-png-from-url] storage download failed:", error?.message);
        return null;
      }
      return Buffer.from(await data.arrayBuffer());
    } catch (e) {
      console.warn("[load-png-from-url] storage download error:", e);
      return null;
    }
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
