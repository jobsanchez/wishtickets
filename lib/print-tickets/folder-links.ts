import { getSiteOrigin } from "@/lib/site-url";
import { getBulkZipSignedUrlSeconds } from "@/lib/print-tickets/bulk-zip-email";

const PUBLIC_STORAGE_MARKER = "/storage/v1/object/public/";
const PRINT_FOLDER_PREFIX = "print-by-section/";

function normalizeStoragePath(path: string): string {
  return path.replace(/^\/+/, "").trim();
}

export function extractStorageObjectPathFromPublicUrl(url: string): string | null {
  if (!url.includes(PUBLIC_STORAGE_MARKER)) return null;
  try {
    const pathname = new URL(url).pathname;
    const idx = pathname.indexOf(PUBLIC_STORAGE_MARKER);
    if (idx === -1) return null;
    const rest = pathname.slice(idx + PUBLIC_STORAGE_MARKER.length);
    const slash = rest.indexOf("/");
    if (slash <= 0) return null;
    const objectPath = decodeURIComponent(rest.slice(slash + 1));
    return objectPath ? normalizeStoragePath(objectPath) : null;
  } catch {
    return null;
  }
}

/**
 * `/storage/v1/object/{public|sign|authenticated}/{bucket}/{key}` → storage object key.
 * Handles signed/authenticated URLs where {@link extractStorageObjectPathFromPublicUrl} does not apply.
 */
export function extractStorageObjectPathFromSupabaseObjectUrl(url: string): string | null {
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    let pathname = u.pathname;
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      /* keep raw */
    }
    const m = pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/[^/]+\/(.+)$/i);
    if (!m?.[1]) return null;
    return normalizeStoragePath(m[1]);
  } catch {
    return null;
  }
}

const TICKET_IMAGE_EXT_RE = /\.(png|jpe?g)$/i;

/**
 * Find `print-by-section/.../file.jpg|png` inside any URL shape (encoded slashes, querystrings).
 */
export function extractPrintBySectionObjectPathFromUrlString(rawUrl: string): string | null {
  const tryOne = (raw: string): string | null => {
    const slashNorm = raw.replace(/%2[fF]/g, "/");
    const lower = slashNorm.toLowerCase();
    const idx = lower.indexOf("print-by-section/");
    if (idx < 0) return null;
    let tail = slashNorm.slice(idx);
    const extM = /\.(png|jpe?g)\b/i.exec(tail);
    if (!extM) return null;
    tail = tail.slice(0, extM.index + extM[0].length);
    for (const t of ["?", "#", '"', "'", " ", "\n", "\r", "&"]) {
      const ti = tail.indexOf(t);
      if (ti >= 0) tail = tail.slice(0, ti);
    }
    tail = normalizeStoragePath(tail.replace(/[,;>]+$/, ""));
    return TICKET_IMAGE_EXT_RE.test(tail) ? tail : null;
  };

  const attempts = [rawUrl];
  try {
    attempts.push(decodeURIComponent(rawUrl));
  } catch {
    /* ignore */
  }
  try {
    attempts.push(decodeURI(rawUrl));
  } catch {
    /* ignore */
  }
  for (const a of attempts) {
    const hit = tryOne(a);
    if (hit) return hit;
  }
  return null;
}

/**
 * Storage object key for a ticket image URL. Uses the public Supabase pattern first, then scans
 * the raw string for `print-by-section/...` (custom domains, proxies, or unusual URL shapes).
 */
export function resolveTicketImageStorageObjectPath(url: string): string | null {
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (!trimmed) return null;

  const normBare = normalizeStoragePath(trimmed.replace(/^\/+/, ""));
  if (
    normBare.toLowerCase().startsWith(PRINT_FOLDER_PREFIX) &&
    TICKET_IMAGE_EXT_RE.test(normBare)
  ) {
    return normBare;
  }

  const fromObjectApi = extractStorageObjectPathFromSupabaseObjectUrl(trimmed);
  if (fromObjectApi && TICKET_IMAGE_EXT_RE.test(fromObjectApi)) return fromObjectApi;

  const fromPublic = extractStorageObjectPathFromPublicUrl(trimmed);
  if (fromPublic && TICKET_IMAGE_EXT_RE.test(fromPublic)) return fromPublic;

  const trySlice = (raw: string): string | null => {
    const slashNorm = raw.replace(/%2[fF]/g, "/");
    const lower = slashNorm.toLowerCase();
    const idx = lower.indexOf("print-by-section/");
    if (idx < 0) return null;
    let tail = slashNorm.slice(idx);
    for (const t of ["?", "#", '"', "'", " ", "\n", "\r", "&"]) {
      const ti = tail.indexOf(t);
      if (ti >= 0) tail = tail.slice(0, ti);
    }
    tail = normalizeStoragePath(tail.replace(/[,;>]+$/, ""));
    return TICKET_IMAGE_EXT_RE.test(tail) ? tail : null;
  };

  try {
    return (
      trySlice(trimmed) ??
      trySlice(decodeURIComponent(trimmed)) ??
      extractPrintBySectionObjectPathFromUrlString(trimmed)
    );
  } catch {
    return trySlice(trimmed) ?? extractPrintBySectionObjectPathFromUrlString(trimmed);
  }
}

export function extractPrintFolderPathFromTicketImageUrl(url: string): string | null {
  const objectPath = resolveTicketImageStorageObjectPath(url);
  if (!objectPath || !objectPath.startsWith(PRINT_FOLDER_PREFIX)) return null;
  const slash = objectPath.lastIndexOf("/");
  if (slash <= 0) return null;
  return objectPath.slice(0, slash);
}

/** One-click: server streams a ZIP of every PNG in the folder (no HTML page, no JSZip in browser). */
export function buildFolderZipDownloadUrl(eventId: string, folderPath: string): string {
  const origin = getSiteOrigin();
  const u = new URL("/api/print-ticket-folders/download-zip", origin);
  u.searchParams.set("eventId", eventId);
  u.searchParams.set("folder", folderPath);
  u.searchParams.set("expiresIn", String(getBulkZipSignedUrlSeconds()));
  return u.toString();
}

/** Download a prebuilt ZIP object from storage. */
export function buildPrebuiltZipDownloadUrl(eventId: string, zipObjectPath: string): string {
  const origin = getSiteOrigin();
  const u = new URL("/api/print-ticket-folders/download-zip", origin);
  u.searchParams.set("eventId", eventId);
  u.searchParams.set("zipObject", zipObjectPath);
  u.searchParams.set("expiresIn", String(getBulkZipSignedUrlSeconds()));
  return u.toString();
}

/** @deprecated use `buildFolderZipDownloadUrl` — kept for bookmarks; same as zip download. */
export function buildFolderViewUrl(eventId: string, folderPath: string): string {
  return buildFolderZipDownloadUrl(eventId, folderPath);
}

export function buildUniquePrintFolderViewUrls(eventId: string, ticketImageUrls: string[]): string[] {
  return buildUniquePrintFolderDownloadItems(eventId, ticketImageUrls).map((x) => x.url);
}

function prettifySectionSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

function parseSectionAndPartFromFolder(folderPath: string): {
  sectionLabel: string;
  part: number | null;
} {
  const parts = folderPath.split("/").filter(Boolean);
  // Supports both:
  // - print-by-section/{event}/{section}
  // - print-by-section/{event}/{section}/part-01
  const sectionSlug = parts[2] ?? "section";
  const maybePart = parts[3] ?? "";
  const m = /^part-(\d{1,4})$/i.exec(maybePart);
  const part = m ? Math.max(1, parseInt(m[1]!, 10)) : null;
  return { sectionLabel: prettifySectionSlug(sectionSlug), part };
}

export function buildUniquePrintFolderDownloadItems(
  eventId: string,
  ticketImageUrls: string[]
): Array<{ url: string; label: string; folderPath: string; sectionLabel: string; part: number | null }> {
  const seen = new Set<string>();
  const out: Array<{ url: string; label: string; folderPath: string; sectionLabel: string; part: number | null }> = [];
  for (const u of ticketImageUrls) {
    const folderPath = extractPrintFolderPathFromTicketImageUrl(u);
    if (!folderPath || seen.has(folderPath)) continue;
    seen.add(folderPath);
    const parsed = parseSectionAndPartFromFolder(folderPath);
    out.push({
      url: buildFolderZipDownloadUrl(eventId, folderPath),
      folderPath,
      sectionLabel: parsed.sectionLabel,
      part: parsed.part,
      label: parsed.part != null ? `${parsed.sectionLabel}-Part-${parsed.part}` : parsed.sectionLabel,
    });
  }
  out.sort((a, b) => {
    const bySection = a.sectionLabel.localeCompare(b.sectionLabel);
    if (bySection !== 0) return bySection;
    return (a.part ?? 0) - (b.part ?? 0);
  });
  return out;
}

