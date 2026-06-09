import { NextRequest, NextResponse } from "next/server";

import {
  resolveSupabaseAssetAbsoluteUrl,
  supabaseApiOriginsMatchStorageUrl,
} from "@/lib/image-remote";

const STORAGE_OBJECT_PREFIXES = ["/storage/v1/object/public/", "/storage/v1/object/sign/"] as const;

function isAllowedSupabaseStoragePath(pathname: string): boolean {
  return STORAGE_OBJECT_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Supabase redirects HTTP Storage to HTTPS — compare and fetch on HTTPS consistently. */
function normalizeSupabaseHttps(u: URL): URL {
  if (u.protocol !== "http:") return u;
  const h = u.hostname.toLowerCase();
  if (h.endsWith(".supabase.co") || h.endsWith(".supabase.in")) {
    return new URL(u.toString().replace(/^http:/i, "https:"));
  }
  return u;
}

function resolveProxyTargetFromParam(urlParam: string): URL | null {
  let u = resolveSupabaseAssetAbsoluteUrl(urlParam);
  if (!u) {
    try {
      const decoded = decodeURIComponent(urlParam.replace(/\+/g, "%20"));
      if (decoded !== urlParam) {
        u = resolveSupabaseAssetAbsoluteUrl(decoded);
      }
    } catch {
      /* ignore */
    }
  }
  return u ?? null;
}
/**
 * Proxied assets are keyed by `?url=…` — **shared CDN caches** (e.g. Netlify Edge) often key only on
 * `/api/image-proxy` pathname and ignore query unless `Vary` is correct (`Vary` must be HTTP header names,
 * not "url"). `public, immutable` on one blob can therefore be wrongly reused for another `url`.
 * Always **`private`** so shared caches MUST NOT fuse distinct proxy requests; browsers may still reuse.
 */
function cacheControlForImageProxy(nocache: boolean): string {
  if (nocache) return "no-store, no-cache, must-revalidate";
  return "private, max-age=86400, must-revalidate";
}

/**
 * Proxies images from Supabase Storage (public + signed `/object/sign` URLs). Buffers the full
 * response with Content-Length for reliable delivery (`net::ERR_INCOMPLETE_CHUNKED_ENCODING` fixes)
 * — used by seat-map `<img>` and ticket/template flows.
 */
export async function GET(request: NextRequest) {
  const rawParam = request.nextUrl.searchParams.get("url");
  const urlParam = rawParam?.trim() ?? "";
  const nocache = request.nextUrl.searchParams.get("nocache") === "1";
  if (!urlParam) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  let base: URL;
  try {
    base = normalizeSupabaseHttps(new URL(supabaseUrl));
  } catch {
    return NextResponse.json({ error: "Invalid NEXT_PUBLIC_SUPABASE_URL" }, { status: 500 });
  }

  let targetUrl = resolveProxyTargetFromParam(urlParam);
  if (!targetUrl) {
    return NextResponse.json(
      {
        error: "Invalid url",
        detail:
          process.env.NODE_ENV === "development"
            ? "Could not resolve absolute URL from url param."
            : undefined,
      },
      { status: 400 }
    );
  }

  targetUrl = normalizeSupabaseHttps(targetUrl);

  if (
    !supabaseApiOriginsMatchStorageUrl(base, targetUrl) ||
    !isAllowedSupabaseStoragePath(targetUrl.pathname)
  ) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  try {
    const res = await fetch(targetUrl.toString(), {
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      // Supabase Storage often returns HTTP 400 with JSON `{ statusCode: "404", error: "not_found" }`
      // for missing objects — surfacing that avoids mistaking it for a broken proxy.
      const bodyText = await res.text().catch(() => "");
      type SupabaseStorageErrorBody = {
        statusCode?: string | number;
        error?: string;
        message?: string;
      };
      let parsed: SupabaseStorageErrorBody | null = null;
      try {
        parsed = JSON.parse(bodyText) as SupabaseStorageErrorBody;
      } catch {
        /* not JSON */
      }

      const sc = parsed?.statusCode;
      const isStorageNotFound =
        (res.status === 400 || res.status === 404) &&
        (sc === "404" || sc === 404) &&
        (parsed?.error === "not_found" ||
          String(parsed?.message ?? "")
            .toLowerCase()
            .includes("not found"));

      const clientStatus = isStorageNotFound ? 404 : res.status;
      const error = isStorageNotFound
        ? "Storage object not found"
        : `Upstream returned ${res.status}`;

      return NextResponse.json(
        {
          error,
          ...(parsed?.message ? { message: String(parsed.message) } : {}),
          ...(process.env.NODE_ENV === "development" && parsed ? { upstream: parsed } : {}),
        },
        { status: clientStatus }
      );
    }

    const contentType = res.headers.get("content-type") ?? "image/png";
    const buffer = Buffer.from(await res.arrayBuffer());

    const cacheControl = cacheControlForImageProxy(nocache);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Cache-Control": cacheControl,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fetch failed";
    console.warn("[image-proxy]", msg);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 });
  }
}
