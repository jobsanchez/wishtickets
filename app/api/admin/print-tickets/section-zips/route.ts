import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { getCurrentUserId } from "@/lib/auth";
import { getAdminClientIfAvailable } from "@/lib/supabase/admin";
import { forbiddenUnlessPrintTicketsBulkScope } from "@/lib/print-tickets/print-tickets-bulk-access";
import { extractPrintFolderPathFromTicketImageUrl } from "@/lib/print-tickets/folder-links";
import {
  enqueueSectionZipJob,
  getEventSlug,
  getManualDistributionEventStorageSlug,
  listSectionZipObjectPaths,
  listSectionZipStatuses,
  loadEventSeatSectionBySeatIdMap,
  manualDistributionSectionStorageSlug,
  votePrintBySectionFolderPrefixForBookingSection,
} from "@/lib/print-tickets/section-zip-jobs";

export const dynamic = "force-dynamic";
/** Netlify/serverless: allow POST inline ZIP and heavy work when opted in. */
export const maxDuration = 120;
const STORAGE_BUCKET = "ticket-images";
/** GET inline ZIP used to mark rows `processing` without bumping `attempts`; timeouts left poison rows that starved the worker. Reclaim after this quiet period. */
const POISON_ZIP_JOB_RECLAIM_MS = 120_000;

/**
 * When true, POST /section-zips waits for full in-request ZIP build (lists storage + downloads
 * every image). Large sections can take many minutes and will freeze the admin UI until done.
 * Default false: enqueue rows + kick `print-folder-zip-worker`; completion is async (poll status).
 * Set PRINT_SECTION_ZIP_INLINE=true only for small events or local debugging without the worker.
 */
function shouldRunSectionZipInline(): boolean {
  const v = process.env.PRINT_SECTION_ZIP_INLINE?.trim().toLowerCase() ?? "";
  return v === "1" || v === "true" || v === "yes";
}

function normalizeStoragePath(path: string): string {
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

type InlineZipDebug = {
  sectionId: string;
  folderPrefixUsed: string | null;
  resolvedImageCount: number;
  outcome: "completed" | "failed" | "skipped";
  errorMessage?: string | null;
};

/**
 * Reset rows stuck in `processing` with `attempts` still 0 (e.g. abandoned GET inline work).
 * Legitimate worker jobs bump attempts immediately after lock.
 *
 * Manual SQL equivalent (all events):
 *   update print_folder_zip_jobs set status = 'pending', current_stage = 'pending', error_message = null, updated_at = now(), last_activity_at = now()
 *   where status = 'processing' and coalesce(attempts, 0) = 0 and updated_at < now() - interval '2 minutes';
 */
async function reclaimPoisonSectionZipJobs(
  admin: NonNullable<ReturnType<typeof getAdminClientIfAvailable>>,
  eventId: string
): Promise<void> {
  const cutoff = new Date(Date.now() - POISON_ZIP_JOB_RECLAIM_MS).toISOString();
  const now = new Date().toISOString();
  await admin
    .from("print_folder_zip_jobs")
    .update({
      status: "pending",
      current_stage: "pending",
      error_message: null,
      updated_at: now,
      last_activity_at: now,
    })
    .eq("event_id", eventId)
    .eq("status", "processing")
    .lt("updated_at", cutoff)
    .or("attempts.is.null,attempts.eq.0");
}

async function processSectionZipJobsInline(
  admin: NonNullable<ReturnType<typeof getAdminClientIfAvailable>>,
  eventId: string,
  sectionIds: string[]
): Promise<InlineZipDebug[]> {
  if (sectionIds.length === 0) return [];
  const { data: rows } = await admin
    .from("print_folder_zip_jobs")
    .select(
      "id, event_section_id, folder_prefix, section_slug, status, error_message, updated_at, source_booking_id"
    )
    .eq("event_id", eventId)
    .in("event_section_id", sectionIds);
  const candidates = (rows ?? []) as Array<{
    id: string;
    event_section_id: string | null;
    folder_prefix: string | null;
    section_slug: string | null;
    status: string | null;
    error_message: string | null;
    updated_at?: string | null;
    source_booking_id?: string | null;
  }>;
  const debugRows: InlineZipDebug[] = [];
  for (const row of candidates) {
    if (!row.id || !row.folder_prefix || !row.event_section_id) continue;
    const status = row.status ?? "";
    const msg = row.error_message ?? "";
    const shouldProcess =
      status === "pending" ||
      status === "processing" ||
      (status === "failed" && /No ticket image files found in folder prefix/i.test(msg));
    if (!shouldProcess) {
      debugRows.push({
        sectionId: row.event_section_id,
        folderPrefixUsed: row.folder_prefix,
        resolvedImageCount: 0,
        outcome: "skipped",
      });
      continue;
    }
    try {
      const now = new Date().toISOString();
      await admin
        .from("print_folder_zip_jobs")
        .update({
          status: "processing",
          current_stage: "listing",
          error_message: null,
          updated_at: now,
          last_activity_at: now,
        })
        .eq("id", row.id);
      const objectPaths = await listSectionZipObjectPaths(admin, {
        eventId,
        eventSectionId: row.event_section_id,
        folderPrefix: row.folder_prefix,
        sourceBookingId: row.source_booking_id,
      });
      await admin
        .from("print_folder_zip_jobs")
        .update({
          total_files: objectPaths.length,
          processed_files: 0,
          progress_pct: 0,
          current_stage: "zipping",
          updated_at: now,
          last_activity_at: now,
        })
        .eq("id", row.id);
      if (objectPaths.length === 0) {
        await admin
          .from("print_folder_zip_jobs")
          .update({
            status: "failed",
            current_stage: "failed",
            progress_pct: 0,
            total_files: 0,
            processed_files: 0,
            error_message: "No ticket image files found in folder prefix",
            updated_at: now,
            last_activity_at: now,
            last_error_at: now,
          })
          .eq("id", row.id);
        debugRows.push({
          sectionId: row.event_section_id,
          folderPrefixUsed: row.folder_prefix,
          resolvedImageCount: 0,
          outcome: "failed",
          errorMessage: "No ticket image files found in folder prefix",
        });
        continue;
      }
      const zip = new JSZip();
      const relativePrefix = `${normalizeStoragePath(row.folder_prefix)}/`;
      for (const objectPath of objectPaths) {
        const { data, error } = await admin.storage.from(STORAGE_BUCKET).download(objectPath);
        if (error || !data) continue;
        const bytes = new Uint8Array(await data.arrayBuffer());
        const rel = objectPath.startsWith(relativePrefix)
          ? objectPath.slice(relativePrefix.length)
          : objectPath.split("/").slice(-1)[0]!;
        zip.file(rel, bytes);
      }
      const zipBytes = await zip.generateAsync({
        type: "uint8array",
        compression: "STORE",
      });
      const sectionSlug = safeSlug(
        row.section_slug ?? row.folder_prefix.split("/").slice(-1)[0] ?? "section"
      );
      const zipObjectPath = `print-section-zips/${eventId}/${sectionSlug}.zip`;
      const { error: uploadError } = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(zipObjectPath, zipBytes, {
          contentType: "application/zip",
          upsert: true,
        });
      if (uploadError) {
        debugRows.push({
          sectionId: row.event_section_id,
          folderPrefixUsed: row.folder_prefix,
          resolvedImageCount: objectPaths.length,
          outcome: "failed",
          errorMessage: uploadError.message,
        });
        continue;
      }
      await admin
        .from("print_folder_zip_jobs")
        .update({
          status: "completed",
          zip_object_path: zipObjectPath,
          zip_object_paths: [zipObjectPath],
          zip_size_bytes: zipBytes.byteLength,
          total_files: objectPaths.length,
          processed_files: objectPaths.length,
          progress_pct: 100,
          current_stage: "completed",
          error_message: null,
          updated_at: now,
          last_activity_at: now,
        })
        .eq("id", row.id);
      debugRows.push({
        sectionId: row.event_section_id,
        folderPrefixUsed: row.folder_prefix,
        resolvedImageCount: objectPaths.length,
        outcome: "completed",
        errorMessage: null,
      });
    } catch (e) {
      const now = new Date().toISOString();
      const message = e instanceof Error ? e.message : String(e);
      await admin
        .from("print_folder_zip_jobs")
        .update({
          status: "failed",
          current_stage: "failed",
          error_message: message,
          updated_at: now,
          last_activity_at: now,
          last_error_at: now,
        })
        .eq("id", row.id);
      debugRows.push({
        sectionId: row.event_section_id,
        folderPrefixUsed: row.folder_prefix,
        resolvedImageCount: 0,
        outcome: "failed",
        errorMessage: message,
      });
    }
  }
  return debugRows;
}

async function kickSectionZipWorker(): Promise<{ ok: boolean; error?: string }> {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  if (!supabaseUrl) return { ok: false, error: "Missing SUPABASE_URL" };

  const workerUrl = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/print-folder-zip-worker`;
  const workerSecret = process.env.PRINT_FOLDER_ZIP_WORKER_SECRET?.trim() ?? "";

  try {
    const res = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(workerSecret ? { "x-worker-secret": workerSecret } : {}),
      },
      body: "{}",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Worker returned ${res.status}${body ? `: ${body}` : ""}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(request: NextRequest) {
  const eventId = (request.nextUrl.searchParams.get("eventId") ?? "").trim();
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const denied = await forbiddenUnlessPrintTicketsBulkScope(eventId);
  if (denied) return denied;

  const admin = getAdminClientIfAvailable();
  if (!admin) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 }
    );
  }

  const summaryOnly =
    request.nextUrl.searchParams.get("summary") === "1" ||
    request.nextUrl.searchParams.get("summary") === "true";

  const { data: sections, error: secErr } = await admin
    .from("event_sections")
    .select("id")
    .eq("event_id", eventId);
  if (secErr) {
    return NextResponse.json({ error: secErr.message }, { status: 500 });
  }
  const sectionIds = (sections ?? [])
    .map((s) => (s as { id?: string }).id)
    .filter((id): id is string => typeof id === "string");

  if (!summaryOnly) {
    await reclaimPoisonSectionZipJobs(admin, eventId);
  }
  const bySection = await listSectionZipStatuses(admin, eventId, sectionIds);
  const hasPending = Object.values(bySection).some(
    (s) => s.status === "pending" || s.status === "processing"
  );
  // Polling uses summary=1: avoid reclaim + worker kick every few seconds (full GET on tab mount / after queue still nudges worker).
  if (summaryOnly) {
    return NextResponse.json({
      eventId,
      bySection,
      summary: true as const,
    });
  }
  const kicked = hasPending ? await kickSectionZipWorker() : { ok: false as const };
  return NextResponse.json({
    eventId,
    bySection,
    inlineDebug: [] as InlineZipDebug[],
    workerKick: hasPending ? kicked : undefined,
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    eventId?: string;
    sectionId?: string;
    bookingId?: string;
    generateAll?: boolean;
    overwrite?: boolean;
  };
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const sectionId = typeof body.sectionId === "string" ? body.sectionId : "";
  const bookingId = typeof body.bookingId === "string" ? body.bookingId : "";
  const generateAll = body.generateAll === true;
  const overwrite = body.overwrite === true;
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const denied = await forbiddenUnlessPrintTicketsBulkScope(eventId);
  if (denied) return denied;

  const admin = getAdminClientIfAvailable();
  if (!admin) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 }
    );
  }
  if (!generateAll && !sectionId && !bookingId) {
    return NextResponse.json(
      { error: "sectionId or bookingId is required unless generateAll is true" },
      { status: 400 }
    );
  }

  if (bookingId) {
    const { data: bookingRow, error: bookingRowErr } = await admin
      .from("bookings")
      .select("id")
      .eq("id", bookingId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (bookingRowErr) {
      return NextResponse.json({ error: bookingRowErr.message }, { status: 500 });
    }
    if (!bookingRow) {
      return NextResponse.json({ error: "Booking not found for this event" }, { status: 404 });
    }
  }

  const actorUserId = await getCurrentUserId();
  const eventSlug = await getEventSlug(admin, eventId);

  const secQuery = admin
    .from("event_sections")
    .select("id, name, section_code")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });
  const sectionsResult = generateAll
    ? await secQuery
    : sectionId
      ? await secQuery.eq("id", sectionId)
      : await secQuery;
  const { data: sections, error: secErr } = sectionsResult;
  if (secErr) {
    return NextResponse.json({ error: secErr.message }, { status: 500 });
  }

  let targetSections = (sections ?? []) as Array<{ id: string; name: string | null; section_code: string | null }>;
  const bookingFolderPrefixBySection = new Map<string, string>();
  if (!generateAll && !sectionId && bookingId) {
    const { data: bookingTickets, error: bookingTicketsErr } = await admin
      .from("tickets")
      .select("section_id, seat_id, ticket_image_url")
      .eq("booking_id", bookingId);
    if (bookingTicketsErr) {
      return NextResponse.json({ error: bookingTicketsErr.message }, { status: 500 });
    }

    const sectionIds = new Set<string>();
    const seatIds = new Set<string>();
    for (const row of (bookingTickets ?? []) as Array<{ section_id?: string | null; seat_id?: string | null }>) {
      if (row.section_id) sectionIds.add(row.section_id);
      if (row.seat_id) seatIds.add(row.seat_id);
    }
    if (seatIds.size > 0) {
      let sectionBySeatId: Map<string, string>;
      try {
        sectionBySeatId = await loadEventSeatSectionBySeatIdMap(admin, [...seatIds]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Seat lookup failed";
        return NextResponse.json({ error: msg }, { status: 500 });
      }
      for (const secId of sectionBySeatId.values()) {
        sectionIds.add(secId);
      }
      for (const sid of sectionIds) {
        const voted = votePrintBySectionFolderPrefixForBookingSection(
          (bookingTickets ?? []) as Array<{
            section_id?: string | null;
            seat_id?: string | null;
            ticket_image_url?: string | null;
          }>,
          sid,
          sectionBySeatId
        );
        if (voted) bookingFolderPrefixBySection.set(sid, voted);
      }
    }
    targetSections = targetSections.filter((s) => sectionIds.has(s.id));
  }

  if (bookingId && targetSections.length > 0) {
    const sectionIds = targetSections.map((s) => s.id);
    const { data: bookingTickets } = await admin
      .from("tickets")
      .select("section_id, seat_id, ticket_image_url")
      .eq("booking_id", bookingId)
      .not("ticket_image_url", "is", null);

    const seatIds = [
      ...new Set(
        ((bookingTickets ?? []) as Array<{ seat_id?: string | null }>)
          .map((r) => r.seat_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      ),
    ];
    const sectionBySeatId =
      seatIds.length > 0 ? await loadEventSeatSectionBySeatIdMap(admin, seatIds) : new Map<string, string>();
    for (const sid of sectionIds) {
      const voted = votePrintBySectionFolderPrefixForBookingSection(
        (bookingTickets ?? []) as Array<{
          section_id?: string | null;
          seat_id?: string | null;
          ticket_image_url?: string | null;
        }>,
        sid,
        sectionBySeatId
      );
      if (voted) bookingFolderPrefixBySection.set(sid, voted);
    }
  }

  if (!targetSections.length) {
    return NextResponse.json({ error: "Section not found for ZIP generation" }, { status: 404 });
  }

  if (bookingId) {
    const targetSectionIds = targetSections.map((s) => s.id);
    const unresolved = targetSectionIds.filter((id) => !bookingFolderPrefixBySection.has(id));
    if (unresolved.length > 0) {
      const { data: printRows } = await admin
        .from("print_tickets")
        .select("event_section_id, ticket_image_url, created_at")
        .eq("event_id", eventId)
        .in("event_section_id", unresolved)
        .not("ticket_image_url", "is", null)
        .order("created_at", { ascending: false });
      const grouped = new Map<string, string[]>();
      for (const row of (printRows ?? []) as Array<{
        event_section_id?: string | null;
        ticket_image_url?: string | null;
      }>) {
        const sid = row.event_section_id ?? null;
        const url = row.ticket_image_url ?? null;
        if (!sid || !url) continue;
        const folderPath = extractPrintFolderPathFromTicketImageUrl(url);
        if (!folderPath) continue;
        const m = /^(print-by-section\/[^/]+\/[^/]+)(?:\/part-\d+)?$/i.exec(folderPath);
        if (!m) continue;
        const list = grouped.get(sid) ?? [];
        list.push(m[1]!);
        grouped.set(sid, list);
      }
      for (const sid of unresolved) {
        const candidates = grouped.get(sid) ?? [];
        if (candidates.length === 0) continue;
        const manualPref =
          candidates.find((p) => /-manual-/i.test(p)) ??
          candidates[0]!;
        bookingFolderPrefixBySection.set(sid, manualPref);
      }
    }
  }

  if (bookingId) {
    const manualEvtSlug = await getManualDistributionEventStorageSlug(
      admin,
      eventId,
      bookingId
    );
    if (manualEvtSlug) {
      for (const row of targetSections) {
        if (bookingFolderPrefixBySection.has(row.id)) continue;
        const secSlug = manualDistributionSectionStorageSlug(row);
        bookingFolderPrefixBySection.set(
          row.id,
          `print-by-section/${manualEvtSlug}/${secSlug}`
        );
      }
    }
  }

  const queued: string[] = [];
  const existing: Array<{ sectionId: string; zipObjectPath: string | null | undefined }> = [];
  const sectionResults: Array<{
    sectionId: string;
    action: "queued" | "exists";
    zipObjectPath?: string | null;
  }> = [];

  for (const row of targetSections) {
    const result = await enqueueSectionZipJob(admin, {
      eventId,
      section: row,
      eventSlug,
      overwrite,
      requestedBy: actorUserId,
      bookingId: bookingId || null,
      folderPrefixOverride: bookingFolderPrefixBySection.get(row.id) ?? null,
    });
    if (result.status === "exists") {
      existing.push({ sectionId: row.id, zipObjectPath: result.existingZipPath });
      sectionResults.push({
        sectionId: row.id,
        action: "exists",
        zipObjectPath: result.existingZipPath ?? null,
      });
      continue;
    }
    queued.push(row.id);
    sectionResults.push({ sectionId: row.id, action: "queued" });
  }

  if (existing.length > 0 && !overwrite) {
    return NextResponse.json(
      { error: "ZIP already exists for one or more sections", queued, existing, requiresOverwrite: true },
      { status: 409 }
    );
  }

  const workerKick = queued.length > 0 ? await kickSectionZipWorker() : undefined;
  let inlineDebug: InlineZipDebug[] = [];
  const runInlineZip = shouldRunSectionZipInline();
  if (queued.length > 0 && runInlineZip) {
    inlineDebug = await processSectionZipJobsInline(admin, eventId, queued);
  }
  return NextResponse.json({
    queued,
    existing,
    sectionResults,
    inlineDebug,
    inlineSkipped: queued.length > 0 && !runInlineZip,
    overwrite,
    workerKick,
  });
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    eventId?: string;
    sectionId?: string;
    deleteAll?: boolean;
  };
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const sectionId = typeof body.sectionId === "string" ? body.sectionId : "";
  const deleteAll = body.deleteAll === true;
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const denied = await forbiddenUnlessPrintTicketsBulkScope(eventId);
  if (denied) return denied;

  const admin = getAdminClientIfAvailable();
  if (!admin) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 }
    );
  }
  if (!deleteAll && !sectionId) {
    return NextResponse.json(
      { error: "sectionId is required unless deleteAll is true" },
      { status: 400 }
    );
  }

  const secQuery = admin
    .from("event_sections")
    .select("id")
    .eq("event_id", eventId);
  const { data: sections, error: secErr } = deleteAll
    ? await secQuery
    : await secQuery.eq("id", sectionId);
  if (secErr) {
    return NextResponse.json({ error: secErr.message }, { status: 500 });
  }
  if (!sections?.length) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }
  const sectionIds = (sections ?? [])
    .map((s) => (s as { id?: string }).id)
    .filter((id): id is string => typeof id === "string");

  const { data: rows, error: rowsErr } = await admin
    .from("print_folder_zip_jobs")
    .select("id, zip_object_path, zip_object_paths")
    .eq("event_id", eventId)
    .in("event_section_id", sectionIds);
  if (rowsErr) {
    return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  }

  const zipPaths = new Set<string>();
  for (const r of (rows ?? []) as Array<{
    zip_object_path?: string | null;
    zip_object_paths?: string[] | null;
  }>) {
    if (typeof r.zip_object_path === "string" && r.zip_object_path.length > 0) {
      zipPaths.add(r.zip_object_path);
    }
    if (Array.isArray(r.zip_object_paths)) {
      for (const p of r.zip_object_paths) {
        if (typeof p === "string" && p.length > 0) zipPaths.add(p);
      }
    }
  }

  if (zipPaths.size > 0) {
    const { error: rmErr } = await admin.storage
      .from("ticket-images")
      .remove([...zipPaths]);
    if (rmErr) {
      return NextResponse.json({ error: rmErr.message }, { status: 500 });
    }
  }

  const { error: delErr } = await admin
    .from("print_folder_zip_jobs")
    .delete()
    .eq("event_id", eventId)
    .in("event_section_id", sectionIds);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({
    deletedSections: sectionIds.length,
    deletedZipObjects: zipPaths.size,
  });
}
