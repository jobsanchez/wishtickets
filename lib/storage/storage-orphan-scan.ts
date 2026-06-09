import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractPrintBySectionObjectPathFromUrlString,
  resolveTicketImageStorageObjectPath,
} from "@/lib/print-tickets/folder-links";
import type { StorageOrphanBucketId } from "@/lib/storage/storage-orphan-buckets";

function normalizePath(p: string): string {
  return p.replace(/^\/+/, "").trim();
}

/** Parses Supabase Storage object URLs into bucket + object key (after bucket). */
export function parseSupabaseStorageObjectUrl(
  url: string
): { bucket: string; objectPath: string } | null {
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (!trimmed || trimmed.startsWith("#")) return null;
  try {
    const u = new URL(trimmed);
    let pathname = u.pathname;
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      /* keep raw */
    }
    const m = pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i);
    if (!m?.[1] || !m?.[2]) return null;
    return { bucket: m[1], objectPath: normalizePath(m[2]) };
  } catch {
    return null;
  }
}

function addTicketImagesPathFromUrl(ref: Set<string>, raw: string | null | undefined) {
  if (!raw || typeof raw !== "string") return;
  const parsed = parseSupabaseStorageObjectUrl(raw);
  if (parsed?.bucket === "ticket-images") {
    ref.add(parsed.objectPath);
    return;
  }
  const p =
    resolveTicketImageStorageObjectPath(raw) ??
    extractPrintBySectionObjectPathFromUrlString(raw);
  if (p) ref.add(normalizePath(p));
}

function addIfBucket(ref: Set<string>, bucketId: string, raw: string | null | undefined) {
  if (!raw || typeof raw !== "string") return;
  const parsed = parseSupabaseStorageObjectUrl(raw);
  if (parsed?.bucket === bucketId) ref.add(parsed.objectPath);
}

/** Keys stored as plain paths (no URL), always under ticket-images (ZIP artifacts). */
function addBareTicketImagesKey(ref: Set<string>, raw: string | null | undefined) {
  if (!raw || typeof raw !== "string") return;
  const t = raw.trim();
  if (!t || /^https?:\/\//i.test(t)) return;
  ref.add(normalizePath(t));
}

function coerceAppConfigTemplateUrl(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const s = value.trim();
    if (!s || s === "null") return null;
    return s;
  }
  return null;
}

const PAGE = 1000;
/** Supabase Storage allows up to 1000 paths per `remove()` call. */
const REMOVE_CHUNK = 1000;

/**
 * Distinguish blob rows from folder placeholders in list responses.
 * Folders typically have `metadata: null`; files have an object id and/or non-null metadata.
 */
function isStorageListBlobEntry(item: {
  id?: string | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  if (item.id) return true;
  return item.metadata !== null && item.metadata !== undefined;
}

async function collectTicketImagesRefs(admin: SupabaseClient, ref: Set<string>) {
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("tickets")
      .select("ticket_image_url")
      .not("ticket_image_url", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const r of rows as { ticket_image_url?: string | null }[]) {
      addTicketImagesPathFromUrl(ref, r.ticket_image_url);
    }
    if (rows.length < PAGE) break;
  }

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("print_tickets")
      .select("ticket_image_url")
      .not("ticket_image_url", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const r of rows as { ticket_image_url?: string | null }[]) {
      addTicketImagesPathFromUrl(ref, r.ticket_image_url);
    }
    if (rows.length < PAGE) break;
  }

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("print_folder_zip_jobs")
      .select("zip_object_path, zip_object_paths")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const r of rows as {
      zip_object_path?: string | null;
      zip_object_paths?: string[] | null;
    }[]) {
      addBareTicketImagesKey(ref, r.zip_object_path);
      const paths = r.zip_object_paths;
      if (Array.isArray(paths)) {
        for (const z of paths) addBareTicketImagesKey(ref, z);
      }
    }
    if (rows.length < PAGE) break;
  }
}

async function collectTicketQrRefs(admin: SupabaseClient, ref: Set<string>) {
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("tickets")
      .select("qr_image_url")
      .not("qr_image_url", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const r of rows as { qr_image_url?: string | null }[]) {
      addIfBucket(ref, "ticket-qr", r.qr_image_url);
    }
    if (rows.length < PAGE) break;
  }
}

async function collectEventImagesRefs(admin: SupabaseClient, ref: Set<string>) {
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("events")
      .select("image_url, thumbnail_url, teaser_video_url")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const r of rows as {
      image_url?: string | null;
      thumbnail_url?: string | null;
      teaser_video_url?: string | null;
    }[]) {
      addIfBucket(ref, "event-images", r.image_url);
      addIfBucket(ref, "event-images", r.thumbnail_url);
      addIfBucket(ref, "event-images", r.teaser_video_url);
    }
    if (rows.length < PAGE) break;
  }
}

async function collectEventBannersRefs(admin: SupabaseClient, ref: Set<string>) {
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("event_banners")
      .select("image_url")
      .not("image_url", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const r of rows as { image_url?: string | null }[]) {
      addIfBucket(ref, "event-banners", r.image_url);
    }
    if (rows.length < PAGE) break;
  }
}

async function collectTicketTemplatesRefs(admin: SupabaseClient, ref: Set<string>) {
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("events")
      .select("ticket_template_image_url")
      .not("ticket_template_image_url", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const r of rows as { ticket_template_image_url?: string | null }[]) {
      addIfBucket(ref, "ticket-templates", r.ticket_template_image_url);
    }
    if (rows.length < PAGE) break;
  }

  const { data: cfgRow, error: cfgErr } = await admin
    .from("app_config")
    .select("value")
    .eq("key", "global_ticket_template_url")
    .maybeSingle();
  if (cfgErr) throw new Error(cfgErr.message);
  const rawVal = cfgRow?.value as unknown;
  const url = coerceAppConfigTemplateUrl(rawVal);
  if (url) addIfBucket(ref, "ticket-templates", url);
}

async function collectSeatMapImagesRefs(admin: SupabaseClient, ref: Set<string>) {
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("events")
      .select("seat_map_image_urls, seat_layout_image_url")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const r of rows as {
      seat_map_image_urls?: string[] | null;
      seat_layout_image_url?: string | null;
    }[]) {
      addIfBucket(ref, "seat-map-images", r.seat_layout_image_url);
      const arr = r.seat_map_image_urls;
      if (Array.isArray(arr)) {
        for (const u of arr) addIfBucket(ref, "seat-map-images", u);
      }
    }
    if (rows.length < PAGE) break;
  }

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("event_sections")
      .select("seat_layout_image_url")
      .not("seat_layout_image_url", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const r of rows as { seat_layout_image_url?: string | null }[]) {
      addIfBucket(ref, "seat-map-images", r.seat_layout_image_url);
    }
    if (rows.length < PAGE) break;
  }

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("event_layout_canvases")
      .select("image_url")
      .not("image_url", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const r of rows as { image_url?: string | null }[]) {
      addIfBucket(ref, "seat-map-images", r.image_url);
    }
    if (rows.length < PAGE) break;
  }
}

export async function collectReferencedPathsForBucket(
  admin: SupabaseClient,
  bucketId: StorageOrphanBucketId
): Promise<Set<string>> {
  const ref = new Set<string>();
  switch (bucketId) {
    case "ticket-images":
      await collectTicketImagesRefs(admin, ref);
      break;
    case "ticket-qr":
      await collectTicketQrRefs(admin, ref);
      break;
    case "event-images":
      await collectEventImagesRefs(admin, ref);
      break;
    case "event-banners":
      await collectEventBannersRefs(admin, ref);
      break;
    case "ticket-templates":
      await collectTicketTemplatesRefs(admin, ref);
      break;
    case "seat-map-images":
      await collectSeatMapImagesRefs(admin, ref);
      break;
  }
  return ref;
}

type StorageListRow = {
  name: string;
  id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function listAllObjectPathsInBucket(
  admin: SupabaseClient,
  bucket: string
): Promise<string[]> {
  const out: string[] = [];

  /** Paginate each prefix — a single list() call only returns up to `limit` rows. */
  async function listAllAtPrefix(prefix: string): Promise<StorageListRow[]> {
    const aggregated: StorageListRow[] = [];
    let offset = 0;
    for (;;) {
      const { data: batch, error } = await admin.storage.from(bucket).list(prefix || undefined, {
        limit: PAGE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(error.message);
      const rows = (batch ?? []) as StorageListRow[];
      aggregated.push(...rows);
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
    return aggregated;
  }

  async function walk(prefix: string) {
    const items = await listAllAtPrefix(prefix);
    if (!items.length) return;
    for (const item of items) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (isStorageListBlobEntry(item)) {
        out.push(path);
      } else {
        await walk(path);
      }
    }
  }

  await walk("");
  return out;
}

export async function computeStorageOrphanStats(
  admin: SupabaseClient,
  bucketId: StorageOrphanBucketId
): Promise<{ fileCountInUse: number; fileCountOrphaned: number; scannedAt: string }> {
  const referenced = await collectReferencedPathsForBucket(admin, bucketId);
  const allPaths = await listAllObjectPathsInBucket(admin, bucketId);
  let inUse = 0;
  for (const p of allPaths) {
    if (referenced.has(p)) inUse++;
  }
  return {
    fileCountInUse: inUse,
    fileCountOrphaned: allPaths.length - inUse,
    scannedAt: new Date().toISOString(),
  };
}

export async function deleteOrphanedObjectsForBucket(
  admin: SupabaseClient,
  bucketId: StorageOrphanBucketId
): Promise<{ deletedCount: number }> {
  const referenced = await collectReferencedPathsForBucket(admin, bucketId);
  const allPaths = await listAllObjectPathsInBucket(admin, bucketId);
  const orphans = allPaths.filter((p) => !referenced.has(p));
  let deleted = 0;
  for (let i = 0; i < orphans.length; i += REMOVE_CHUNK) {
    const chunk = orphans.slice(i, i + REMOVE_CHUNK);
    const { data, error } = await admin.storage.from(bucketId).remove(chunk);
    if (error) throw new Error(error.message);
    const reported = Array.isArray(data) ? data.length : 0;
    deleted += reported > 0 ? reported : chunk.length;
  }
  return { deletedCount: deleted };
}
