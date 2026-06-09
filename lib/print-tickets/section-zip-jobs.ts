import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractPrintBySectionObjectPathFromUrlString,
  extractPrintFolderPathFromTicketImageUrl,
  resolveTicketImageStorageObjectPath,
} from "@/lib/print-tickets/folder-links";

export type SectionZipJobStatus =
  | "none"
  | "pending"
  | "processing"
  | "completed"
  | "failed";

type EventSectionRow = {
  id: string;
  name: string | null;
  section_code: string | null;
};

type SectionZipJobRow = {
  id: string;
  event_id: string | null;
  event_section_id: string | null;
  folder_prefix: string | null;
  section_slug: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  zip_object_path: string | null;
  error_message: string | null;
  progress_pct: number | null;
  current_stage: string | null;
  total_files: number | null;
  processed_files: number | null;
  updated_at: string | null;
};

export type SectionZipStatusItem = {
  sectionId: string;
  status: SectionZipJobStatus;
  zipObjectPath: string | null;
  progressPct: number;
  currentStage: string;
  errorMessage: string | null;
  updatedAt: string | null;
};

const TICKET_IMAGE_FILE_RE = /\.(png|jpe?g)$/i;

/** PostgREST `.in("id", …)` on huge lists blows URL length; Deno/HTTP2 clients then fail manual ZIP listing. */
const EVENT_SEAT_IN_QUERY_CHUNK = 100;

/**
 * Resolve `event_seats.event_section_id` for many seat ids without exceeding PostgREST URL limits.
 */
export async function loadEventSeatSectionBySeatIdMap(
  admin: SupabaseClient,
  seatIds: string[]
): Promise<Map<string, string>> {
  const sectionBySeatId = new Map<string, string>();
  const uniq = [
    ...new Set(seatIds.filter((id): id is string => typeof id === "string" && id.length > 0)),
  ];
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

function normalizeComparableSlug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Must match `generate-manual-assignment-ticket-images-batch.ts`:
 * `sectionCode = section_code ?? "SEC"`, `sectionName = name ?? section_code ?? "section"`,
 * then slugify `sectionCode || sectionName`.
 */
export function manualDistributionSectionStorageSlug(section: {
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

/**
 * For booking-scoped ZIPs: only storage paths for `tickets` in this booking that belong
 * to `eventSectionId` (resolves `seat_id` via `event_seats` when `section_id` is null).
 */
export async function listTicketObjectPathsForBookingSection(
  admin: SupabaseClient,
  opts: {
    eventId: string;
    eventSectionId: string;
    bookingId: string;
    /** Job/UI folder prefix: if set, include resolved paths under this prefix for tickets in the section (covers URL parse edge cases when storage list is empty). */
    storageFolderPrefixHint?: string | null;
  }
): Promise<string[]> {
  const { data: bookingRow, error: bookingErr } = await admin
    .from("bookings")
    .select("id, event_id")
    .eq("id", opts.bookingId)
    .maybeSingle();
  if (bookingErr) throw new Error(bookingErr.message);
  if (!bookingRow) return [];
  const bookingEventId = (bookingRow as { event_id?: string }).event_id;
  if (bookingEventId && bookingEventId !== opts.eventId) {
    // Job row can reference a stale `event_id`; listing is still scoped by booking + section.
  }

  const { data: bookingTickets, error } = await admin
    .from("tickets")
    .select("section_id, seat_id, ticket_image_url")
    .eq("booking_id", opts.bookingId)
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
    seatIds.length > 0 ? await loadEventSeatSectionBySeatIdMap(admin, seatIds) : new Map<string, string>();

  const { data: targetSecRow } = await admin
    .from("event_sections")
    .select("name, section_code")
    .eq("id", opts.eventSectionId)
    .maybeSingle();
  const targetFolderNorm = normalizeComparableSlug(
    manualDistributionSectionStorageSlug(
      targetSecRow as { name?: string | null; section_code?: string | null } | null
    )
  );

  function rowInTargetSection(
    row: { section_id?: string | null; seat_id?: string | null },
    path: string | null
  ): boolean {
    const sectionForRow =
      row.section_id ?? (row.seat_id ? sectionBySeatId.get(row.seat_id) ?? null : null);
    if (sectionForRow === opts.eventSectionId) return true;
    if (!path) return false;
    const parts = path.split("/").filter(Boolean);
    if (parts.length < 3 || parts[0] !== "print-by-section") return false;
    return normalizeComparableSlug(parts[2] ?? "") === targetFolderNorm;
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

  const pfx = normalizeZipFolderPrefix(opts.storageFolderPrefixHint ?? "");
  if (pfx) {
    const byPrefix = new Set<string>();
    for (const row of rows) {
      const sectionForRow =
        row.section_id ?? (row.seat_id ? sectionBySeatId.get(row.seat_id) ?? null : null);
      if (sectionForRow !== opts.eventSectionId) continue;
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

const TICKET_IMAGES_BUCKET = "ticket-images";
const STORAGE_LIST_PAGE_SIZE = 1000;

function normalizeZipFolderPrefix(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * When `source_booking_id` is missing (legacy row, or booking FK cleared), infer the booking from
 * `tickets.ticket_image_url` paths under `folderPrefix` so we do not recurse storage (which counts
 * every PNG ever written under the folder, e.g. multiple runs → 4× the real ticket count).
 */
export async function resolveBookingIdFromTicketImagesUnderPrefix(
  admin: SupabaseClient,
  opts: { eventId: string; eventSectionId: string; folderPrefix: string }
): Promise<string | null> {
  const prefix = normalizeZipFolderPrefix(opts.folderPrefix);
  if (!prefix) return null;

  const { data: bookingRows, error: bookErr } = await admin
    .from("bookings")
    .select("id")
    .eq("event_id", opts.eventId);
  if (bookErr) throw new Error(bookErr.message);
  const bookingIds = (bookingRows ?? [])
    .map((b) => (b as { id?: string }).id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (bookingIds.length === 0) return null;

  const { data: seatRows, error: seatErr } = await admin
    .from("event_seats")
    .select("id")
    .eq("event_section_id", opts.eventSectionId);
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
      row.section_id === opts.eventSectionId ||
      (row.seat_id != null && seatIds.has(row.seat_id));
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
      // Job row may store only `print-by-section/{eventSlug}` while files sit under
      // `print-by-section/{eventSlug}-manual-{assignment8}/{section}/...`.
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

async function listPrintTicketImagePathsForSection(
  admin: SupabaseClient,
  eventId: string,
  eventSectionId: string,
  expectedPrefix: string
): Promise<string[]> {
  const normalizedPrefix = normalizeZipFolderPrefix(expectedPrefix);
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

async function listTicketImagePathsRecursive(
  admin: SupabaseClient,
  folderPrefix: string
): Promise<string[]> {
  const prefix = normalizeZipFolderPrefix(folderPrefix);
  if (!prefix) return [];
  const foldersToScan = [prefix];
  const out: string[] = [];
  for (let i = 0; i < foldersToScan.length; i++) {
    const folder = foldersToScan[i]!;
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage.from(TICKET_IMAGES_BUCKET).list(folder, {
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
      offset += data.length;
      if (data.length === 0) break;
    }
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

/**
 * Paths to include in a section ZIP: booking-scoped ticket URLs when possible, then print_tickets,
 * then full storage recursion (last resort — can over-count orphan files).
 */
export async function listSectionZipObjectPaths(
  admin: SupabaseClient,
  opts: {
    eventId: string;
    eventSectionId: string;
    folderPrefix: string;
    sourceBookingId: string | null | undefined;
  }
): Promise<string[]> {
  const folderPrefix = normalizeZipFolderPrefix(opts.folderPrefix);
  if (!folderPrefix) return [];

  const explicit =
    typeof opts.sourceBookingId === "string" && opts.sourceBookingId.trim().length > 0
      ? opts.sourceBookingId.trim()
      : null;

  let paths: string[] = [];

  if (explicit) {
    paths = await listTicketObjectPathsForBookingSection(admin, {
      eventId: opts.eventId,
      eventSectionId: opts.eventSectionId,
      bookingId: explicit,
      storageFolderPrefixHint: folderPrefix,
    });
    if (paths.length === 0) {
      const manualSlug = await getManualDistributionEventStorageSlug(
        admin,
        opts.eventId,
        explicit
      );
      if (manualSlug) {
        const { data: secRow } = await admin
          .from("event_sections")
          .select("name, section_code")
          .eq("id", opts.eventSectionId)
          .maybeSingle();
        const sec = secRow as { name?: string | null; section_code?: string | null } | null;
        const secSlug = manualDistributionSectionStorageSlug(sec);
        paths = await listTicketImagePathsRecursive(
          admin,
          `print-by-section/${manualSlug}/${secSlug}`
        );
      }
    }
    return paths;
  } else {
    const inferred = await resolveBookingIdFromTicketImagesUnderPrefix(admin, {
      eventId: opts.eventId,
      eventSectionId: opts.eventSectionId,
      folderPrefix,
    });
    if (inferred) {
      paths = await listTicketObjectPathsForBookingSection(admin, {
        eventId: opts.eventId,
        eventSectionId: opts.eventSectionId,
        bookingId: inferred,
        storageFolderPrefixHint: folderPrefix,
      });
    }
  }

  if (paths.length === 0) {
    paths = await listPrintTicketImagePathsForSection(
      admin,
      opts.eventId,
      opts.eventSectionId,
      folderPrefix
    );
  }
  if (paths.length === 0) {
    paths = await listTicketImagePathsRecursive(admin, folderPrefix);
  }
  return paths;
}

export function slugifyPathSegment(input: string, fallback: string): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s.length > 0 ? s : fallback;
}

/** Normalize storage folder prefix for equality checks (enqueue / supersede logic). */
function normalizeFolderPrefixForCompare(p: string | null | undefined): string {
  if (p == null || p === "") return "";
  return p.replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Manual Distribution ticket images are stored under
 * `print-by-section/{slugify(base + "-manual-" + assignmentId.slice(0,8))}/{sectionSlug}/...`
 * (see `generate-manual-assignment-ticket-images-batch.ts`), not under the bare event slug.
 * Resolves that middle path segment for ZIP listing when bookingId refers to a manual assignment.
 */
/** `_eventId` is kept for callers; slug resolution uses the assignment/booking row (job `event_id` may be stale). */
export async function getManualDistributionEventStorageSlug(
  admin: SupabaseClient,
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
    const eventBaseSlug = slugifyPathSegment(
      ev?.slug ?? ev?.title ?? `event-${assignEventId.slice(0, 8)}`,
      "event"
    );
    return slugifyPathSegment(`${eventBaseSlug}-manual-${assignId.slice(0, 8)}`, "event");
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
    const folderPath = extractPrintFolderPathFromTicketImageUrl(url);
    if (!folderPath) continue;
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

export async function getEventSlug(
  admin: SupabaseClient,
  eventId: string
): Promise<string> {
  const { data: eventRow } = await admin
    .from("events")
    .select("slug, title")
    .eq("id", eventId)
    .single();
  return slugifyPathSegment(
    (eventRow as { slug?: string | null; title?: string | null } | null)?.slug ??
      (eventRow as { title?: string | null } | null)?.title ??
      "event",
    "event"
  );
}

function parseSectionPrefixFromTicketImageUrl(url: string): string | null {
  const folderPath = extractPrintFolderPathFromTicketImageUrl(url);
  if (!folderPath) return null;
  const m = /^(print-by-section\/[^/]+\/[^/]+)(?:\/part-\d+)?$/i.exec(folderPath);
  return m ? m[1] : null;
}

type TicketRowForFolderPrefix = {
  section_id?: string | null;
  seat_id?: string | null;
  ticket_image_url?: string | null;
};

/**
 * Pick the most common `print-by-section/{a}/{b}` among ticket URLs for a section.
 * The enqueue path used to take the *first* parseable URL only; on large manual orders an early
 * outlier produced a wrong `folder_prefix` while most images lived elsewhere → ZIP "no files".
 */
/** Load tickets with images and return majority `print-by-section/{evt}/{sec}` for this section. */
export async function resolveVotedPrintBySectionFolderPrefixForBookingSection(
  admin: SupabaseClient,
  bookingId: string,
  eventSectionId: string
): Promise<string | null> {
  const { data: bookingTickets, error } = await admin
    .from("tickets")
    .select("section_id, seat_id, ticket_image_url")
    .eq("booking_id", bookingId)
    .not("ticket_image_url", "is", null);
  if (error) throw new Error(error.message);
  const rows = (bookingTickets ?? []) as TicketRowForFolderPrefix[];
  const seatIds = [
    ...new Set(
      rows.map((r) => r.seat_id).filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
  const sectionBySeatId =
    seatIds.length > 0 ? await loadEventSeatSectionBySeatIdMap(admin, seatIds) : new Map<string, string>();
  return votePrintBySectionFolderPrefixForBookingSection(rows, eventSectionId, sectionBySeatId);
}

export function votePrintBySectionFolderPrefixForBookingSection(
  ticketRows: TicketRowForFolderPrefix[],
  sectionId: string,
  sectionBySeatId: Map<string, string>
): string | null {
  const counts = new Map<string, number>();
  for (const row of ticketRows) {
    const sec = row.section_id ?? (row.seat_id ? sectionBySeatId.get(row.seat_id) ?? null : null);
    if (sec !== sectionId) continue;
    const url = row.ticket_image_url;
    if (typeof url !== "string" || !url.trim()) continue;
    const prefix = parseSectionPrefixFromTicketImageUrl(url);
    if (!prefix) continue;
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
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

export async function resolveSectionFolderPrefix(
  admin: SupabaseClient,
  opts: {
    eventId: string;
    eventSlug: string;
    sectionId: string;
    sectionName: string;
    sectionCode: string | null;
    bookingId?: string | null;
  }
): Promise<{ folderPrefix: string; sectionSlug: string }> {
  const canonicalSectionSlug = slugifyPathSegment(
    opts.sectionCode || opts.sectionName || "section",
    "section"
  );
  const canonicalPrefix = `print-by-section/${opts.eventSlug}/${canonicalSectionSlug}`;

  let url: string | null = null;
  if (opts.bookingId) {
    const { data: bookingTicket } = await admin
      .from("tickets")
      .select("ticket_image_url")
      .eq("booking_id", opts.bookingId)
      .eq("section_id", opts.sectionId)
      .not("ticket_image_url", "is", null)
      .limit(1)
      .maybeSingle();
    url = (bookingTicket as { ticket_image_url?: string | null } | null)?.ticket_image_url ?? null;
    if (!url) {
      const { data: bookingSeatTickets } = await admin
        .from("tickets")
        .select("seat_id, ticket_image_url")
        .eq("booking_id", opts.bookingId)
        .not("ticket_image_url", "is", null);
      const seatIds = [
        ...new Set(
          ((bookingSeatTickets ?? []) as Array<{ seat_id?: string | null }>)
            .map((r) => r.seat_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        ),
      ];
      if (seatIds.length > 0) {
        const sectionIdBySeat = await loadEventSeatSectionBySeatIdMap(admin, seatIds);
        const match = ((bookingSeatTickets ?? []) as Array<{
          seat_id?: string | null;
          ticket_image_url?: string | null;
        }>).find((r) => {
          const sid = typeof r.seat_id === "string" ? sectionIdBySeat.get(r.seat_id) : null;
          return sid === opts.sectionId && typeof r.ticket_image_url === "string" && r.ticket_image_url.length > 0;
        });
        url = match?.ticket_image_url ?? null;
      }
    }
  }
  if (!url) {
    const { data: firstPrintTicket } = await admin
      .from("print_tickets")
      .select("ticket_image_url")
      .eq("event_id", opts.eventId)
      .eq("event_section_id", opts.sectionId)
      .not("ticket_image_url", "is", null)
      .limit(1)
      .maybeSingle();
    url = (firstPrintTicket as { ticket_image_url?: string | null } | null)?.ticket_image_url ?? null;
  }
  if (!url) {
    // `tickets` has no `event_id`; restrict via `bookings` for this event.
    const { data: sectionTicketRows } = await admin
      .from("tickets")
      .select("ticket_image_url, booking_id")
      .eq("section_id", opts.sectionId)
      .not("ticket_image_url", "is", null)
      .limit(200);
    const bIds = [
      ...new Set(
        ((sectionTicketRows ?? []) as Array<{ booking_id?: string | null }>)
          .map((r) => r.booking_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      ),
    ];
    if (bIds.length > 0) {
      const { data: eventBookings } = await admin
        .from("bookings")
        .select("id")
        .in("id", bIds)
        .eq("event_id", opts.eventId);
      const allowed = new Set(
        ((eventBookings ?? []) as Array<{ id?: string }>)
          .map((b) => b.id)
          .filter((id): id is string => typeof id === "string")
      );
      const firstSold = ((sectionTicketRows ?? []) as Array<{
        ticket_image_url?: string | null;
        booking_id?: string | null;
      }>).find((r) => r.booking_id && allowed.has(r.booking_id) && r.ticket_image_url);
      url = firstSold?.ticket_image_url ?? null;
    }
  }
  const fromImage = url ? parseSectionPrefixFromTicketImageUrl(url) : null;
  if (fromImage) {
    const parts = fromImage.split("/").filter(Boolean);
    const middleSeg = parts[1] ?? "";
    // Manual Distribution images always live under `...-manual-.../section`; never substitute
    // bare `print-by-section/{eventSlug}/{section}` — that path has no files and breaks ZIP.
    if (/-manual-/i.test(middleSeg) || /-manual-/i.test(fromImage)) {
      return { folderPrefix: fromImage, sectionSlug: parts[2] ?? "section" };
    }
    // Guard against historical mis-grouped image paths: prefer URL-derived prefix
    // when its section tail is equivalent to canonical slug (ignoring separators).
    const fromImageSectionSlug = parts[2] ?? "";
    const equivalentSectionSlug =
      normalizeComparableSlug(fromImageSectionSlug) ===
      normalizeComparableSlug(canonicalSectionSlug);
    if (!equivalentSectionSlug) {
      return {
        sectionSlug: canonicalSectionSlug,
        folderPrefix: canonicalPrefix,
      };
    }
    return { folderPrefix: fromImage, sectionSlug: parts[2] ?? "section" };
  }

  return {
    sectionSlug: canonicalSectionSlug,
    folderPrefix: canonicalPrefix,
  };
}

export async function listSectionZipStatuses(
  admin: SupabaseClient,
  eventId: string,
  sectionIds: string[]
): Promise<Record<string, SectionZipStatusItem>> {
  const out: Record<string, SectionZipStatusItem> = {};
  for (const id of sectionIds) {
    out[id] = {
      sectionId: id,
      status: "none",
      zipObjectPath: null,
      progressPct: 0,
      currentStage: "none",
      errorMessage: null,
      updatedAt: null,
    };
  }
  if (sectionIds.length === 0) return out;

  const { data: rows } = await admin
    .from("print_folder_zip_jobs")
    .select(
      "id, event_id, event_section_id, folder_prefix, section_slug, status, zip_object_path, error_message, progress_pct, current_stage, total_files, processed_files, updated_at"
    )
    .eq("event_id", eventId)
    .in("event_section_id", sectionIds);

  for (const raw of (rows ?? []) as SectionZipJobRow[]) {
    const sid = raw.event_section_id;
    if (!sid) continue;
    out[sid] = {
      sectionId: sid,
      status: raw.status ?? "none",
      zipObjectPath: raw.zip_object_path ?? null,
      progressPct: Math.max(0, Math.min(100, Math.round(raw.progress_pct ?? 0))),
      currentStage: raw.current_stage ?? raw.status ?? "none",
      errorMessage: raw.error_message ?? null,
      updatedAt: raw.updated_at ?? null,
    };
  }
  return out;
}

export async function enqueueSectionZipJob(
  admin: SupabaseClient,
  opts: {
    eventId: string;
    section: EventSectionRow;
    eventSlug: string;
    overwrite: boolean;
    requestedBy: string | null;
    bookingId?: string | null;
    folderPrefixOverride?: string | null;
  }
): Promise<{ status: "queued" | "exists"; existingZipPath?: string | null }> {
  const requestedBookingId =
    typeof opts.bookingId === "string" && opts.bookingId.trim().length > 0
      ? opts.bookingId.trim()
      : null;

  const resolved = await resolveSectionFolderPrefix(admin, {
    eventId: opts.eventId,
    eventSlug: opts.eventSlug,
    sectionId: opts.section.id,
    sectionName: opts.section.name ?? "",
    sectionCode: opts.section.section_code ?? null,
    bookingId: opts.bookingId ?? null,
  });
  const folderPrefix = opts.folderPrefixOverride ?? resolved.folderPrefix;
  const sectionSlug = (opts.folderPrefixOverride?.split("/")?.[2] ?? "").trim() || resolved.sectionSlug;

  const { data: existing } = await admin
    .from("print_folder_zip_jobs")
    .select("id, status, zip_object_path, source_booking_id, folder_prefix")
    .eq("event_id", opts.eventId)
    .eq("event_section_id", opts.section.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingRow = existing as {
    id?: string;
    zip_object_path?: string | null;
    source_booking_id?: string | null;
    folder_prefix?: string | null;
  } | null;
  const existingZipPath = existingRow?.zip_object_path ?? null;
  const existingSourceBookingId = existingRow?.source_booking_id ?? null;
  const existingFolderPrefix = existingRow?.folder_prefix ?? null;
  const existingPathParts = existingFolderPrefix?.split("/").filter(Boolean) ?? [];
  const existingIsManualScoped =
    !!existingSourceBookingId ||
    (existingPathParts[0] === "print-by-section" &&
      !!existingPathParts[1] &&
      /-manual-/i.test(existingPathParts[1])) ||
    (!!existingFolderPrefix && /-manual-/i.test(existingFolderPrefix));

  const targetFolderNorm = normalizeFolderPrefixForCompare(folderPrefix);
  const existingFolderNorm = normalizeFolderPrefixForCompare(existingFolderPrefix);
  const printFolderTargetDiffersFromExistingRow =
    targetFolderNorm !== existingFolderNorm;

  /** Print Tickets (no booking): allow replacing a job that targets another folder or any manual-scoped row. */
  const printFlowSupersedesExisting =
    requestedBookingId === null &&
    (existingIsManualScoped || printFolderTargetDiffersFromExistingRow);

  if (!opts.overwrite && existingZipPath && !printFlowSupersedesExisting) {
    return { status: "exists", existingZipPath };
  }

  const bookingId = requestedBookingId;
  const shouldResetArtifact = opts.overwrite || printFlowSupersedesExisting;
  const now = new Date().toISOString();
  const payload = {
    event_id: opts.eventId,
    event_section_id: opts.section.id,
    section_slug: sectionSlug,
    folder_prefix: folderPrefix,
    folder_path: folderPrefix,
    source_booking_id: bookingId,
    status: "pending" as const,
    zip_object_path: shouldResetArtifact ? null : existingZipPath,
    zip_size_bytes: shouldResetArtifact ? 0 : undefined,
    error_message: null,
    progress_pct: 0,
    processed_files: 0,
    total_files: 0,
    current_stage: "pending",
    attempts: 0,
    requested_by: opts.requestedBy,
    last_error_at: null,
    last_activity_at: now,
    updated_at: now,
  };

  const existingId = existingRow?.id ?? null;
  if (existingId) {
    const { error: updateError } = await admin
      .from("print_folder_zip_jobs")
      .update(payload)
      .eq("id", existingId);
    if (updateError) throw new Error(updateError.message);
  } else {
    const { error: insertError } = await admin
      .from("print_folder_zip_jobs")
      .insert(payload);
    if (insertError) throw new Error(insertError.message);
  }
  return { status: "queued" };
}
