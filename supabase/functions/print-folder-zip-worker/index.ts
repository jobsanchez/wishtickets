import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";

const BUCKET = "ticket-images";
const STORAGE_LIST_PAGE_SIZE = 1000;
/** PostgREST `.in("id", …)` with hundreds of UUIDs exceeds safe URL length for Deno HTTP/2 to Supabase. */
const EVENT_SEAT_IN_QUERY_CHUNK = 100;
const PRINT_FOLDER_PREFIX = "print-by-section/";
/** Full ticket renders: legacy PNG or JPEG (see app ticket-image generation). */
const TICKET_IMAGE_FILE_RE = /\.(png|jpe?g)$/i;
const PUBLIC_STORAGE_MARKER = "/storage/v1/object/public/";
const ZIP_PART_MAX_FILES = getZipPartMaxFiles();
const PROGRESS_UPDATE_EVERY_FILES = getProgressUpdateEveryFiles();

function getZipPartMaxFiles(): number {
  const raw = Deno.env.get("ZIP_PART_MAX_FILES") ?? "";
  if (!raw) return 250;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 250;
  return Math.min(Math.floor(n), 500);
}

function getProgressUpdateEveryFiles(): number {
  const raw = Deno.env.get("ZIP_PROGRESS_UPDATE_EVERY_FILES") ?? "";
  if (!raw) return 50;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 10) return 50;
  return Math.min(Math.floor(n), 500);
}

type ZipJobRow = {
  id: string;
  event_id: string | null;
  event_section_id: string | null;
  folder_prefix: string | null;
  section_slug: string | null;
  source_booking_id?: string | null;
  status: string;
  attempts?: number | null;
  processed_files?: number | null;
  total_files?: number | null;
  zip_object_paths?: string[] | null;
  zip_size_bytes?: number | null;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isAllowedPrefix(prefix: string): boolean {
  return prefix.startsWith("print-by-section/");
}

function normalize(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

function safeSlug(input: string): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length > 0 ? s : "section";
}

function extractStorageObjectPathFromPublicUrl(url: string): string | null {
  if (!url.includes(PUBLIC_STORAGE_MARKER)) return null;
  try {
    const pathname = new URL(url).pathname;
    const idx = pathname.indexOf(PUBLIC_STORAGE_MARKER);
    if (idx === -1) return null;
    const rest = pathname.slice(idx + PUBLIC_STORAGE_MARKER.length);
    const slash = rest.indexOf("/");
    if (slash <= 0) return null;
    const objectPath = decodeURIComponent(rest.slice(slash + 1));
    return objectPath ? normalize(objectPath) : null;
  } catch {
    return null;
  }
}

/** Keep in sync with `extractStorageObjectPathFromSupabaseObjectUrl` in `lib/print-tickets/folder-links.ts`. */
function extractStorageObjectPathFromSupabaseObjectUrl(url: string): string | null {
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
    return normalize(m[1]);
  } catch {
    return null;
  }
}

/** Keep in sync with `extractPrintBySectionObjectPathFromUrlString` in `lib/print-tickets/folder-links.ts`. */
function extractPrintBySectionObjectPathFromUrlString(rawUrl: string): string | null {
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
    tail = normalize(tail.replace(/[,;>]+$/, ""));
    return TICKET_IMAGE_FILE_RE.test(tail) ? tail : null;
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

/** Keep in sync with `resolveTicketImageStorageObjectPath` in `lib/print-tickets/folder-links.ts`. */
function resolveTicketImageStorageObjectPath(url: string): string | null {
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (!trimmed) return null;

  const normBare = normalize(trimmed.replace(/^\/+/, ""));
  if (
    normBare.toLowerCase().startsWith(PRINT_FOLDER_PREFIX) &&
    TICKET_IMAGE_FILE_RE.test(normBare)
  ) {
    return normBare;
  }

  const fromObjectApi = extractStorageObjectPathFromSupabaseObjectUrl(trimmed);
  if (fromObjectApi && TICKET_IMAGE_FILE_RE.test(fromObjectApi)) return fromObjectApi;

  const fromPublic = extractStorageObjectPathFromPublicUrl(trimmed);
  if (fromPublic && TICKET_IMAGE_FILE_RE.test(fromPublic)) return fromPublic;

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
    tail = normalize(tail.replace(/[,;>]+$/, ""));
    return TICKET_IMAGE_FILE_RE.test(tail) ? tail : null;
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

/** Match `extractPrintFolderPathFromTicketImageUrl` in `lib/print-tickets/folder-links.ts`. */
function extractPrintFolderPathFromTicketImageUrlWorker(url: string): string | null {
  const objectPath =
    resolveTicketImageStorageObjectPath(url) ?? extractPrintBySectionObjectPathFromUrlString(url);
  if (!objectPath || !objectPath.toLowerCase().startsWith("print-by-section/")) return null;
  const slash = objectPath.lastIndexOf("/");
  if (slash <= 0) return null;
  return normalize(objectPath.slice(0, slash));
}

/** Match `votePrintBySectionFolderPrefixForBookingSection` in `lib/print-tickets/section-zip-jobs.ts`. */
function votePrintBySectionFolderPrefixForBookingSectionWorker(
  ticketRows: Array<{
    section_id?: string | null;
    seat_id?: string | null;
    ticket_image_url?: string | null;
  }>,
  sectionId: string,
  sectionBySeatId: Map<string, string>
): string | null {
  const counts = new Map<string, number>();
  const re = /^(print-by-section\/[^/]+\/[^/]+)(?:\/part-\d+)?$/i;
  for (const row of ticketRows) {
    const sec = row.section_id ?? (row.seat_id ? sectionBySeatId.get(row.seat_id) ?? null : null);
    if (sec !== sectionId) continue;
    const url = row.ticket_image_url;
    if (typeof url !== "string" || !url.trim()) continue;
    const folderPath = extractPrintFolderPathFromTicketImageUrlWorker(url);
    if (!folderPath) continue;
    const m = re.exec(folderPath);
    if (!m?.[1]) continue;
    const p = normalize(m[1]);
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    const am = /-manual-/i.test(a[0]) ? 1 : 0;
    const bm = /-manual-/i.test(b[0]) ? 1 : 0;
    if (bm !== am) return bm - am;
    return a[0].localeCompare(b[0]);
  });
  return ranked[0]?.[0] ?? null;
}

async function loadEventSeatSectionBySeatIdMapWorker(
  admin: ReturnType<typeof createClient>,
  seatIds: string[]
): Promise<Map<string, string>> {
  const sectionBySeatId = new Map<string, string>();
  const uniq = [...new Set(seatIds.filter((id) => id.length > 0))];
  for (let i = 0; i < uniq.length; i += EVENT_SEAT_IN_QUERY_CHUNK) {
    const slice = uniq.slice(i, i + EVENT_SEAT_IN_QUERY_CHUNK);
    const { data: seatRows, error: seatErr } = await admin
      .from("event_seats")
      .select("id, event_section_id")
      .in("id", slice);
    if (seatErr) throw new Error(seatErr.message);
    for (const s of (seatRows ?? []) as Array<{ id?: string; event_section_id?: string | null }>) {
      if (s.id && s.event_section_id) sectionBySeatId.set(s.id, s.event_section_id);
    }
  }
  return sectionBySeatId;
}

async function listTicketImageObjectPathsFromVotedBookingPrefix(
  admin: ReturnType<typeof createClient>,
  bookingId: string,
  eventSectionId: string
): Promise<string[]> {
  const { data: bookingTickets, error } = await admin
    .from("tickets")
    .select("section_id, seat_id, ticket_image_url")
    .eq("booking_id", bookingId)
    .not("ticket_image_url", "is", null);
  if (error) throw new Error(error.message);
  const rows = (bookingTickets ?? []) as Array<{
    section_id?: string | null;
    seat_id?: string | null;
    ticket_image_url?: string | null;
  }>;
  const seatIds = [
    ...new Set(
      rows.map((r) => r.seat_id).filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
  const sectionBySeatId =
    seatIds.length > 0 ? await loadEventSeatSectionBySeatIdMapWorker(admin, seatIds) : new Map<string, string>();
  const voted = votePrintBySectionFolderPrefixForBookingSectionWorker(rows, eventSectionId, sectionBySeatId);
  if (!voted) return [];
  return listTicketImageObjectPaths(admin, voted);
}

async function listTicketImageObjectPaths(
  admin: ReturnType<typeof createClient>,
  folderPrefix: string
): Promise<string[]> {
  const prefix = normalize(folderPrefix);
  const foldersToScan = [prefix];
  const out: string[] = [];

  for (let idx = 0; idx < foldersToScan.length; idx++) {
    const folder = foldersToScan[idx]!;
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage.from(BUCKET).list(folder, {
        limit: STORAGE_LIST_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      for (const item of data) {
        const name = typeof item.name === "string" ? item.name : "";
        if (!name) continue;
        const objectPath = `${folder}/${name}`;
        if (TICKET_IMAGE_FILE_RE.test(name)) {
          out.push(objectPath);
          continue;
        }
        const meta = item.metadata as { size?: unknown } | null | undefined;
        const fileSize =
          meta != null && typeof meta === "object" && typeof meta.size === "number" ? meta.size : null;
        if (fileSize != null && fileSize > 0) continue;
        foldersToScan.push(objectPath);
      }
      const pageLen = data.length;
      if (pageLen === 0) break;
      offset += pageLen;
    }
  }

  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function normalizeComparableSlugWorker(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Booking-scoped ZIP: only `tickets` for this booking that map to the section. */
async function listTicketObjectPathsForBookingSection(
  admin: ReturnType<typeof createClient>,
  eventId: string,
  eventSectionId: string,
  bookingId: string,
  storageFolderPrefixHint?: string | null
): Promise<string[]> {
  const { data: bookingRow, error: bookingErr } = await admin
    .from("bookings")
    .select("id, event_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingErr) throw new Error(bookingErr.message);
  if (!bookingRow) return [];
  const bookingEventId = (bookingRow as { event_id?: string }).event_id;
  if (bookingEventId && bookingEventId !== eventId) {
    /* allow stale job event_id */
  }

  const { data: bookingTickets, error } = await admin
    .from("tickets")
    .select("section_id, seat_id, ticket_image_url")
    .eq("booking_id", bookingId)
    .not("ticket_image_url", "is", null);
  if (error) throw new Error(error.message);
  const rows = (bookingTickets ?? []) as Array<{
    section_id?: string | null;
    seat_id?: string | null;
    ticket_image_url?: string | null;
  }>;
  const seatIds = [
    ...new Set(
      rows
        .map((r) => r.seat_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
  const sectionBySeatId =
    seatIds.length > 0 ? await loadEventSeatSectionBySeatIdMapWorker(admin, seatIds) : new Map<string, string>();

  const { data: targetSecRow } = await admin
    .from("event_sections")
    .select("name, section_code")
    .eq("id", eventSectionId)
    .maybeSingle();
  const targetFolderNorm = normalizeComparableSlugWorker(
    manualDistributionSectionStorageSlugWorker(
      targetSecRow as { name?: string | null; section_code?: string | null } | null
    )
  );

  function rowInTargetSection(
    row: { section_id?: string | null; seat_id?: string | null },
    path: string | null
  ): boolean {
    const sectionForRow =
      row.section_id ?? (row.seat_id ? sectionBySeatId.get(row.seat_id) ?? null : null);
    if (sectionForRow === eventSectionId) return true;
    if (!path) return false;
    const parts = path.split("/").filter(Boolean);
    if (parts.length < 3 || parts[0] !== "print-by-section") return false;
    return normalizeComparableSlugWorker(parts[2] ?? "") === targetFolderNorm;
  }

  const out = new Set<string>();
  for (const row of rows) {
    const url = row.ticket_image_url;
    if (typeof url !== "string" || !url) continue;
    const path =
      resolveTicketImageStorageObjectPath(url) ?? extractPrintBySectionObjectPathFromUrlString(url);
    if (!rowInTargetSection(row, path)) continue;
    if (path) out.add(path);
  }
  if (out.size > 0) return [...out].sort((a, b) => a.localeCompare(b));

  for (const row of rows) {
    const url = row.ticket_image_url;
    if (typeof url !== "string" || !url) continue;
    const path =
      resolveTicketImageStorageObjectPath(url) ?? extractPrintBySectionObjectPathFromUrlString(url);
    if (!rowInTargetSection(row, path) || !path) continue;
    const parts = path.split("/").filter(Boolean);
    if (parts.length < 3 || parts[0] !== "print-by-section") continue;
    const root = `${parts[0]}/${parts[1]}/${parts[2]}`;
    return listTicketImageObjectPaths(admin, root);
  }

  const pfx = storageFolderPrefixHint ? normalize(storageFolderPrefixHint) : "";
  if (pfx) {
    const byPrefix = new Set<string>();
    for (const row of rows) {
      const sectionForRow =
        row.section_id ?? (row.seat_id ? sectionBySeatId.get(row.seat_id) ?? null : null);
      if (sectionForRow !== eventSectionId) continue;
      const url = row.ticket_image_url;
      if (typeof url !== "string" || !url) continue;
      const path =
        resolveTicketImageStorageObjectPath(url) ?? extractPrintBySectionObjectPathFromUrlString(url);
      if (!path) continue;
      if (path === pfx || path.startsWith(`${pfx}/`)) byPrefix.add(path);
    }
    if (byPrefix.size > 0) return [...byPrefix].sort((a, b) => a.localeCompare(b));
  }
  return [];
}

/** Keep in sync with `resolveBookingIdFromTicketImagesUnderPrefix` in `lib/print-tickets/section-zip-jobs.ts`. */
async function resolveBookingIdFromTicketImagesUnderPrefix(
  admin: ReturnType<typeof createClient>,
  eventId: string,
  eventSectionId: string,
  folderPrefix: string
): Promise<string | null> {
  const prefix = normalize(folderPrefix);
  if (!prefix) return null;

  const { data: bookingRows, error: bookErr } = await admin
    .from("bookings")
    .select("id")
    .eq("event_id", eventId);
  if (bookErr) throw new Error(bookErr.message);
  const bookingIds = (bookingRows ?? [])
    .map((b) => (b as { id?: string }).id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (bookingIds.length === 0) return null;

  const { data: seatRows, error: seatErr } = await admin
    .from("event_seats")
    .select("id")
    .eq("event_section_id", eventSectionId);
  if (seatErr) throw new Error(seatErr.message);
  const seatIds = new Set(
    (seatRows ?? [])
      .map((s) => (s as { id?: string }).id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  );

  const likeNeedle = `%/${prefix}%`;
  const { data: ticketRows, error: tErr } = await admin
    .from("tickets")
    .select("booking_id, ticket_image_url, section_id, seat_id")
    .in("booking_id", bookingIds)
    .not("ticket_image_url", "is", null)
    .ilike("ticket_image_url", likeNeedle);
  if (tErr) throw new Error(tErr.message);

  const matchedBookings = new Set<string>();
  for (const row of (ticketRows ?? []) as Array<{
    booking_id?: string | null;
    ticket_image_url?: string | null;
    section_id?: string | null;
    seat_id?: string | null;
  }>) {
    const bid = row.booking_id;
    if (typeof bid !== "string" || !bid) continue;
    const inSection =
      row.section_id === eventSectionId || (row.seat_id != null && seatIds.has(row.seat_id));
    if (!inSection) continue;
    const url = row.ticket_image_url;
    if (typeof url !== "string" || !url) continue;
    const path =
      resolveTicketImageStorageObjectPath(url) ?? extractPrintBySectionObjectPathFromUrlString(url);
    if (!path) continue;
    const prefixSlash = `${prefix}/`;
    const prefixParts = prefix.split("/").filter(Boolean);
    const underPrefix =
      path === prefix ||
      path.startsWith(prefixSlash) ||
      (prefixParts.length === 2 &&
        prefixParts[0] === "print-by-section" &&
        path.startsWith(`${prefix}-`));
    if (!underPrefix) continue;
    matchedBookings.add(bid);
    if (matchedBookings.size > 1) return null;
  }

  const only = [...matchedBookings][0];
  return only ?? null;
}

/** Match `slugifyPathSegment` in `lib/print-tickets/section-zip-jobs.ts` (event / composed paths). */
function slugifyPathSegmentLib(input: string, fallback: string): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s.length > 0 ? s : fallback;
}

/** Match `manualDistributionSectionStorageSlug` in `lib/print-tickets/section-zip-jobs.ts`. */
function manualDistributionSectionStorageSlugWorker(section: {
  section_code?: string | null;
  name?: string | null;
} | null): string {
  const sectionCode = section?.section_code ?? "SEC";
  const sectionName = section?.name ?? section?.section_code ?? "section";
  const input = sectionCode || sectionName;
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s.length > 0 ? s : "section";
}

/** Keep in sync with `getManualDistributionEventStorageSlug` in `lib/print-tickets/section-zip-jobs.ts`. */
async function getManualDistributionEventStorageSlugWorker(
  admin: ReturnType<typeof createClient>,
  _eventId: string,
  bookingId: string
): Promise<string | null> {
  const { data: assign } = await admin
    .from("admin_seat_assignments")
    .select("id, event_id")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const assignRow = assign as { id?: string; event_id?: string | null } | null;
  const assignId = assignRow?.id;
  const assignEventId =
    typeof assignRow?.event_id === "string" && assignRow.event_id.length > 0
      ? assignRow.event_id
      : null;
  if (assignId && assignEventId) {
    const { data: eventRow } = await admin
      .from("events")
      .select("slug, title")
      .eq("id", assignEventId)
      .maybeSingle();
    const ev = eventRow as { slug?: string | null; title?: string | null } | null;
    const eventBaseSlug = slugifyPathSegmentLib(
      ev?.slug ?? ev?.title ?? `event-${assignEventId.slice(0, 8)}`,
      "event"
    );
    return slugifyPathSegmentLib(`${eventBaseSlug}-manual-${assignId.slice(0, 8)}`, "event");
  }
  const { data: bookingRow } = await admin
    .from("bookings")
    .select("id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!bookingRow) return null;
  const { data: ticketRows } = await admin
    .from("tickets")
    .select("ticket_image_url")
    .eq("booking_id", bookingId)
    .not("ticket_image_url", "is", null)
    .limit(100);
  for (const r of (ticketRows ?? []) as Array<{ ticket_image_url?: string | null }>) {
    const url = r.ticket_image_url;
    if (typeof url !== "string" || !url) continue;
    const objectPath = resolveTicketImageStorageObjectPath(url);
    if (!objectPath?.startsWith("print-by-section/")) continue;
    const slash = objectPath.lastIndexOf("/");
    if (slash <= 0) continue;
    const folderPath = objectPath.slice(0, slash);
    const parts = folderPath.split("/").filter(Boolean);
    if (
      parts.length >= 2 &&
      parts[0] === "print-by-section" &&
      /-manual-/i.test(parts[1] ?? "")
    ) {
      return parts[1] ?? null;
    }
  }
  return null;
}

async function listSectionObjectPathsFromPrintTickets(
  admin: ReturnType<typeof createClient>,
  eventId: string,
  eventSectionId: string,
  expectedPrefix: string
): Promise<string[]> {
  const normalizedPrefix = normalize(expectedPrefix);
  const out = new Set<string>();
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await admin
      .from("print_tickets")
      .select("ticket_image_url")
      .eq("event_id", eventId)
      .eq("event_section_id", eventSectionId)
      .not("ticket_image_url", "is", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ ticket_image_url?: string | null }>;
    if (rows.length === 0) break;
    for (const r of rows) {
      const url = typeof r.ticket_image_url === "string" ? r.ticket_image_url : "";
      if (!url) continue;
      const path = resolveTicketImageStorageObjectPath(url);
      if (!path) continue;
      if (path.startsWith(`${normalizedPrefix}/`) || path === normalizedPrefix) {
        out.add(path);
      }
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

async function updateProgress(
  admin: ReturnType<typeof createClient>,
  jobId: string,
  patch: Record<string, unknown>
) {
  const now = new Date().toISOString();
  await admin
    .from("print_folder_zip_jobs")
    .update({ ...patch, updated_at: now, last_activity_at: now })
    .eq("id", jobId);
}

async function describeNoTicketImagesFailure(
  admin: ReturnType<typeof createClient>,
  explicitBooking: string,
  folderPrefix: string
): Promise<string> {
  const base = "No ticket image files found in folder prefix";
  if (!explicitBooking) return base;
  const { count: withUrl, error } = await admin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", explicitBooking)
    .not("ticket_image_url", "is", null);
  if (error) return base;
  const n = typeof withUrl === "number" ? withUrl : 0;
  if (n === 0) {
    return `${base}. This booking has no ticket_image_url yet — run manual ticket image generation, then retry.`;
  }
  return `${base}. ${n} ticket(s) have image URLs but no files were found under "${folderPrefix}" (check Storage bucket ticket-images and redeploy the worker if you just fixed path logic).`;
}

type ZipEntry = { rel: string; bytes: Uint8Array };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const cronSecret = Deno.env.get("PRINT_FOLDER_ZIP_WORKER_SECRET") ?? "";
  if (cronSecret) {
    const xSecret = req.headers.get("x-worker-secret") ?? "";
    const auth = req.headers.get("authorization") ?? "";
    const bearer =
      auth.length >= 7 && auth.slice(0, 7).toLowerCase() === "bearer "
        ? auth.slice(7).trim()
        : "";
    if (xSecret !== cronSecret && bearer !== cronSecret) {
      return json(401, { error: "Unauthorized" });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: locked, error: lockError } = await admin.rpc("lock_next_print_folder_zip_job");
  if (lockError) return json(500, { error: lockError.message });

  const row = Array.isArray(locked) ? (locked[0] as ZipJobRow | undefined) : (locked as ZipJobRow | null);
  if (!row) return json(200, { ok: true, message: "No pending ZIP job" });

  const prefix = normalize(row.folder_prefix ?? "");
  if (!prefix || !isAllowedPrefix(prefix)) {
    await updateProgress(admin, row.id, {
      status: "failed",
      error_message: "Invalid folder_prefix",
      current_stage: "failed",
      progress_pct: 0,
      last_error_at: new Date().toISOString(),
    });
    return json(400, { error: "Invalid folder_prefix", jobId: row.id });
  }

  try {
    await updateProgress(admin, row.id, {
      current_stage: "listing",
      attempts: Math.max(0, row.attempts ?? 0) + 1,
      error_message: null,
    });

    let objectPaths: string[] = [];
    const explicitBooking =
      typeof row.source_booking_id === "string" && row.source_booking_id.trim().length > 0
        ? row.source_booking_id.trim()
        : "";

    const eventIdForJob = typeof row.event_id === "string" && row.event_id.length > 0 ? row.event_id : "";

    if (explicitBooking && row.event_section_id) {
      objectPaths = await listTicketObjectPathsForBookingSection(
        admin,
        eventIdForJob,
        row.event_section_id,
        explicitBooking,
        prefix
      );
      if (objectPaths.length === 0) {
        objectPaths = await listTicketImageObjectPathsFromVotedBookingPrefix(
          admin,
          explicitBooking,
          row.event_section_id
        );
      }
      if (objectPaths.length === 0) {
        const manualSlug = await getManualDistributionEventStorageSlugWorker(
          admin,
          eventIdForJob,
          explicitBooking
        );
        if (manualSlug) {
          const { data: secRow } = await admin
            .from("event_sections")
            .select("name, section_code")
            .eq("id", row.event_section_id)
            .maybeSingle();
          const sec = secRow as { name?: string | null; section_code?: string | null } | null;
          const secSlug = manualDistributionSectionStorageSlugWorker(sec);
          objectPaths = await listTicketImageObjectPaths(
            admin,
            `print-by-section/${manualSlug}/${secSlug}`
          );
        }
      }
    } else if (eventIdForJob && row.event_section_id) {
      const inferred = await resolveBookingIdFromTicketImagesUnderPrefix(
        admin,
        eventIdForJob,
        row.event_section_id,
        prefix
      );
      if (inferred) {
        objectPaths = await listTicketObjectPathsForBookingSection(
          admin,
          eventIdForJob,
          row.event_section_id,
          inferred,
          prefix
        );
      }
    }

    if (objectPaths.length === 0 && eventIdForJob && row.event_section_id) {
      objectPaths = await listSectionObjectPathsFromPrintTickets(
        admin,
        eventIdForJob,
        row.event_section_id,
        prefix
      );
    }
    if (objectPaths.length === 0 && eventIdForJob && row.event_section_id) {
      objectPaths = await listTicketImageObjectPaths(admin, prefix);
    }
    if (objectPaths.length === 0) {
      objectPaths = await listTicketImageObjectPaths(admin, prefix);
    }
    if (objectPaths.length === 0) {
      const errDetail = await describeNoTicketImagesFailure(admin, explicitBooking, prefix);
      await updateProgress(admin, row.id, {
        status: "failed",
        current_stage: "failed",
        error_message: errDetail,
        progress_pct: 0,
        total_files: 0,
        processed_files: 0,
        last_error_at: new Date().toISOString(),
      });
      return json(404, { error: errDetail, jobId: row.id });
    }

    await updateProgress(admin, row.id, {
      current_stage: "zipping",
      total_files: objectPaths.length,
      processed_files: Math.max(0, row.processed_files ?? 0),
      progress_pct: Math.min(
        94,
        Math.round((Math.max(0, row.processed_files ?? 0) / objectPaths.length) * 94)
      ),
    });

    const relativePrefix = `${prefix}/`;
    const priorProcessed = Math.max(
      0,
      Math.min(objectPaths.length, Math.floor(row.processed_files ?? 0))
    );
    let currentPartEntries: ZipEntry[] = [];
    const uploadedPaths: string[] = Array.isArray(row.zip_object_paths)
      ? row.zip_object_paths.filter((v): v is string => typeof v === "string" && v.length > 0)
      : [];
    const priorUploadedBytes = Math.max(0, Math.floor(row.zip_size_bytes ?? 0));
    let uploadedBytes = priorUploadedBytes;
    let partNumber = uploadedPaths.length + 1;
    const sectionSlug = safeSlug(row.section_slug ?? prefix.split("/").slice(-1)[0] ?? "section");
    const eventPart = row.event_id ?? "event";

    const flushPart = async () => {
      if (currentPartEntries.length === 0) return null;

      const zip = new JSZip();
      for (const e of currentPartEntries) {
        zip.file(e.rel, e.bytes);
      }

      await updateProgress(admin, row.id, {
        current_stage: "packaging",
        progress_pct: 95,
      });
      const zipBytes = await zip.generateAsync({
        type: "uint8array",
        compression: "STORE",
      });

      await updateProgress(admin, row.id, {
        current_stage: "uploading",
        progress_pct: 96,
      });
      const zipObjectPath =
        partNumber === 1
          ? `print-section-zips/${eventPart}/${sectionSlug}.zip`
          : `print-section-zips/${eventPart}/${sectionSlug}-part-${String(partNumber).padStart(2, "0")}.zip`;
      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(zipObjectPath, zipBytes, {
          contentType: "application/zip",
          upsert: true,
        });
      if (uploadError) throw new Error(uploadError.message);

      uploadedPaths.push(zipObjectPath);
      uploadedBytes += zipBytes.byteLength;
      partNumber += 1;
      currentPartEntries = [];
      return zipObjectPath;
    };

    let cursor = priorProcessed;
    while (cursor < objectPaths.length && currentPartEntries.length < ZIP_PART_MAX_FILES) {
      const objectPath = objectPaths[cursor]!;
      const { data, error } = await admin.storage.from(BUCKET).download(objectPath);
      if (error || !data) {
        throw new Error(error?.message ?? `Download failed: ${objectPath}`);
      }
      const bytes = new Uint8Array(await data.arrayBuffer());
      const rel = objectPath.startsWith(relativePrefix)
        ? objectPath.slice(relativePrefix.length)
        : objectPath.split("/").slice(-1)[0]!;
      const entry: ZipEntry = { rel, bytes };

      currentPartEntries.push(entry);
      cursor += 1;

      const processedInTotal = cursor;
      const shouldWriteProgress =
        processedInTotal === objectPaths.length ||
        processedInTotal - priorProcessed >= PROGRESS_UPDATE_EVERY_FILES;
      if (shouldWriteProgress) {
        const pct = Math.min(94, Math.round((processedInTotal / objectPaths.length) * 94));
        await updateProgress(admin, row.id, {
          processed_files: processedInTotal,
          progress_pct: pct,
        });
      }
    }

    const uploadedPartPath = await flushPart();
    const processedAfterPart = cursor;
    const firstPath = uploadedPaths[0] ?? null;

    if (!uploadedPartPath) {
      throw new Error("Unable to build ZIP part from remaining files");
    }

    if (processedAfterPart < objectPaths.length) {
      const pct = Math.min(99, Math.round((processedAfterPart / objectPaths.length) * 99));
      await updateProgress(admin, row.id, {
        status: "pending",
        current_stage: "queued",
        zip_object_path: firstPath,
        zip_object_paths: uploadedPaths,
        zip_size_bytes: uploadedBytes,
        processed_files: processedAfterPart,
        total_files: objectPaths.length,
        progress_pct: pct,
        error_message: null,
      });

      return json(200, {
        ok: true,
        continued: true,
        jobId: row.id,
        zipObjectPath: firstPath,
        zipObjectPaths: uploadedPaths,
        processedFiles: processedAfterPart,
        totalFiles: objectPaths.length,
        partCount: uploadedPaths.length,
      });
    }

    await updateProgress(admin, row.id, {
      status: "completed",
      current_stage: "completed",
      zip_object_path: firstPath,
      zip_object_paths: uploadedPaths,
      zip_size_bytes: uploadedBytes,
      processed_files: objectPaths.length,
      total_files: objectPaths.length,
      progress_pct: 100,
      error_message: null,
    });

    return json(200, {
      ok: true,
      jobId: row.id,
      zipObjectPath: firstPath,
      zipObjectPaths: uploadedPaths,
      totalFiles: objectPaths.length,
      partCount: uploadedPaths.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await updateProgress(admin, row.id, {
      status: "failed",
      current_stage: "failed",
      error_message: message,
      last_error_at: new Date().toISOString(),
    });
    return json(500, { error: message, jobId: row.id });
  }
});
