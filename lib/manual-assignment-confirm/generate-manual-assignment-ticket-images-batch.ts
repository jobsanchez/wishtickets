import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTicketImageForTicketId } from "@/lib/ticket-image";
import { runPool } from "@/lib/print-tickets/run-pool";
import { MANUAL_CONFIRM_IMAGE_BATCH_SIZE } from "@/lib/manual-assignment-confirm/constants";
import { BULK_PRINT_ZIP_MAX_TICKETS_PER_PART } from "@/lib/print-tickets/bulk-zip-email";

const BATCH_CONCURRENCY = 32;
const POSTGREST_IN_CHUNK = 200;

export type GenerateManualTicketImagesBatchResult = {
  processed: number;
  failed: number;
  generatedTotal: number;
  total: number;
  complete: boolean;
};

async function fetchEventSeatsByIdsChunked(
  admin: SupabaseClient,
  seatIds: string[]
): Promise<{
  rows: Array<{
    id: string;
    row_label: string | null;
    seat_number: string | null;
    event_section_id: string | null;
  }>;
  error: string | null;
}> {
  if (seatIds.length === 0) return { rows: [], error: null };
  const rows: Array<{
    id: string;
    row_label: string | null;
    seat_number: string | null;
    event_section_id: string | null;
  }> = [];
  for (let i = 0; i < seatIds.length; i += POSTGREST_IN_CHUNK) {
    const slice = seatIds.slice(i, i + POSTGREST_IN_CHUNK);
    const { data, error } = await admin
      .from("event_seats")
      .select("id, row_label, seat_number, event_section_id")
      .in("id", slice);
    if (error) return { rows: [], error: error.message };
    rows.push(
      ...((data ?? []) as Array<{
        id: string;
        row_label: string | null;
        seat_number: string | null;
        event_section_id: string | null;
      }>)
    );
  }
  return { rows, error: null };
}

async function fetchEventSectionsByIdsChunked(
  admin: SupabaseClient,
  sectionIds: string[]
): Promise<{
  rows: Array<{
    id: string;
    section_code: string | null;
    name: string | null;
    seating_type: string | null;
  }>;
  error: string | null;
}> {
  if (sectionIds.length === 0) return { rows: [], error: null };
  const rows: Array<{
    id: string;
    section_code: string | null;
    name: string | null;
    seating_type: string | null;
  }> = [];
  for (let i = 0; i < sectionIds.length; i += POSTGREST_IN_CHUNK) {
    const slice = sectionIds.slice(i, i + POSTGREST_IN_CHUNK);
    const { data, error } = await admin
      .from("event_sections")
      .select("id, section_code, name, seating_type")
      .in("id", slice);
    if (error) return { rows: [], error: error.message };
    rows.push(
      ...((data ?? []) as Array<{
        id: string;
        section_code: string | null;
        name: string | null;
        seating_type: string | null;
      }>)
    );
  }
  return { rows, error: null };
}

function normUuid(s: string): string {
  return s.trim().toLowerCase();
}

function slugifyPathSegment(input: string, fallback: string): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s.length > 0 ? s : fallback;
}

function sanitizePrintFilenamePart(raw: string, maxLen: number): string {
  const s = raw
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
  return s.length > 0 ? s : "x";
}

function buildManualStorageBaseName(opts: {
  ticketId: string;
  sectionCode: string;
  seatingType: string;
  seatId: string | null;
  rowLabel: string;
  seatNumber: string;
  sectionSlotIndex: number;
}): string {
  const sec = sanitizePrintFilenamePart(opts.sectionCode || "sec", 32);
  let base: string;
  if (opts.seatId) {
    const row = sanitizePrintFilenamePart(opts.rowLabel || "-", 32);
    const seat = sanitizePrintFilenamePart(opts.seatNumber || "-", 32);
    base = `${sec}-${row}-${seat}`;
  } else {
    const kind = opts.seatingType === "standing" ? "ST" : "FS";
    base = `${sec}-${kind}-${String(Math.max(1, opts.sectionSlotIndex)).padStart(3, "0")}`;
  }
  const maxBase = 140;
  if (base.length > maxBase) {
    const short = opts.ticketId.replace(/-/g, "").slice(0, 8);
    base = `${base.slice(0, Math.max(1, maxBase - 9))}-${short}`;
  }
  return base;
}

/**
 * Generates up to `MANUAL_CONFIRM_IMAGE_BATCH_SIZE` ticket PNGs for a manual-assignment
 * booking where `ticket_image_url` is still null. Call repeatedly until `complete` is true.
 *
 * Authorization uses the caller's Supabase session (assignment + booking must match).
 * Image generation uses the same path as print/on-demand tickets: `generateTicketImageForTicketId`
 * (service role reads + storage upload), matching `lib/print-tickets/generate.ts` behavior.
 */
export async function generateNextManualAssignmentTicketImagesBatch(
  supabase: SupabaseClient,
  params: { assignmentId: string; bookingId: string }
): Promise<GenerateManualTicketImagesBatchResult> {
  const { assignmentId, bookingId } = params;
  const bookingIdNorm = normUuid(bookingId);

  const { data: assign, error: assignErr } = await supabase
    .from("admin_seat_assignments")
    .select("id, booking_id, event_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (assignErr) throw new Error(assignErr.message);
  const assignBookingId =
    typeof assign?.booking_id === "string" ? normUuid(assign.booking_id) : "";
  if (!assign || assignBookingId !== bookingIdNorm) {
    throw new Error("Assignment not found or booking mismatch");
  }

  const resolvedBookingId = assign.booking_id as string;

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Ticket images require the service role (${msg}). Set SUPABASE_SERVICE_ROLE_KEY like print-ticket generation.`
    );
  }

  const { count: totalCount, error: countErr } = await admin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", resolvedBookingId);
  if (countErr) throw new Error(countErr.message);
  const total = typeof totalCount === "number" ? totalCount : 0;

  const { count: doneCount, error: doneErr } = await admin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", resolvedBookingId)
    .not("ticket_image_url", "is", null);
  if (doneErr) throw new Error(doneErr.message);
  const generatedTotal = typeof doneCount === "number" ? doneCount : 0;

  const { data: batch, error: batchErr } = await admin
    .from("tickets")
    .select("id, seat_id, section_id")
    .eq("booking_id", resolvedBookingId)
    .is("ticket_image_url", null)
    // `tickets` does not guarantee a created_at column across environments.
    // Use PK ordering for deterministic batch progression.
    .order("id", { ascending: true })
    .limit(MANUAL_CONFIRM_IMAGE_BATCH_SIZE);
  if (batchErr) throw new Error(batchErr.message);

  const { data: allTickets, error: allTicketsErr } = await admin
    .from("tickets")
    .select("id, seat_id, section_id")
    .eq("booking_id", resolvedBookingId)
    .order("id", { ascending: true });
  if (allTicketsErr) throw new Error(allTicketsErr.message);
  const allRows = (allTickets ?? []) as Array<{
    id: string;
    seat_id: string | null;
    section_id: string | null;
  }>;

  const { data: eventRow, error: eventErr } = await admin
    .from("events")
    .select("slug, title")
    .eq("id", assign.event_id as string)
    .maybeSingle();
  if (eventErr) throw new Error(eventErr.message);
  const eventBaseSlug = slugifyPathSegment(
    (eventRow?.slug as string | null) ??
      (eventRow?.title as string | null) ??
      `event-${(assign.event_id as string).slice(0, 8)}`,
    "event"
  );
  // Isolate manual-distribution files from print-generated files under same event.
  const eventSlug = slugifyPathSegment(`${eventBaseSlug}-manual-${assignmentId.slice(0, 8)}`, "event");

  const seatIds = [
    ...new Set(
      allRows.map((r) => r.seat_id).filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
  const { rows: seatRows, error: seatErr } = await fetchEventSeatsByIdsChunked(admin, seatIds);
  if (seatErr) throw new Error(seatErr);
  const seatById = new Map<
    string,
    { row_label: string | null; seat_number: string | null; event_section_id: string | null }
  >();
  for (const s of (seatRows ?? []) as Array<{
    id: string;
    row_label: string | null;
    seat_number: string | null;
    event_section_id: string | null;
  }>) {
    seatById.set(s.id, {
      row_label: s.row_label,
      seat_number: s.seat_number,
      event_section_id: s.event_section_id,
    });
  }

  const sectionIds = [
    ...new Set(
      allRows
        .map((r) => (r.seat_id ? seatById.get(r.seat_id)?.event_section_id ?? null : r.section_id))
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
  const { rows: secRows, error: secErr } = await fetchEventSectionsByIdsChunked(admin, sectionIds);
  if (secErr) throw new Error(secErr);
  const sectionById = new Map<
    string,
    { section_code: string | null; name: string | null; seating_type: string | null }
  >();
  for (const sec of (secRows ?? []) as Array<{
    id: string;
    section_code: string | null;
    name: string | null;
    seating_type: string | null;
  }>) {
    sectionById.set(sec.id, {
      section_code: sec.section_code,
      name: sec.name,
      seating_type: sec.seating_type,
    });
  }

  const sectionSlotByTicketId = new Map<string, number>();
  const sectionRunning = new Map<string, number>();
  for (const row of allRows) {
    const secId = row.seat_id ? seatById.get(row.seat_id)?.event_section_id ?? null : row.section_id;
    const secKey = secId ?? "section";
    const next = (sectionRunning.get(secKey) ?? 0) + 1;
    sectionRunning.set(secKey, next);
    sectionSlotByTicketId.set(row.id, next);
  }

  const rows = (batch ?? []) as Array<{ id: string; seat_id: string | null; section_id: string | null }>;
  if (rows.length === 0) {
    return {
      processed: 0,
      failed: 0,
      generatedTotal,
      total,
      complete: true,
    };
  }

  let processed = 0;
  let failed = 0;
  await runPool(rows, BATCH_CONCURRENCY, async (row) => {
    const secId = row.seat_id ? seatById.get(row.seat_id)?.event_section_id ?? null : row.section_id;
    const secMeta = secId ? sectionById.get(secId) : undefined;
    const sectionCode = secMeta?.section_code ?? "SEC";
    const sectionName = secMeta?.name ?? secMeta?.section_code ?? "section";
    const sectionSlug = slugifyPathSegment(sectionCode || sectionName, "section");
    const seatingType = (secMeta?.seating_type ?? "free").toLowerCase();
    const seatMeta = row.seat_id ? seatById.get(row.seat_id) : undefined;
    const rowLabel = seatMeta?.row_label ?? "-";
    const seatNumber = seatMeta?.seat_number ?? "-";
    const sectionSlot = sectionSlotByTicketId.get(row.id) ?? 1;
    const part = Math.floor((sectionSlot - 1) / BULK_PRINT_ZIP_MAX_TICKETS_PER_PART) + 1;
    const base = buildManualStorageBaseName({
      ticketId: row.id,
      sectionCode,
      seatingType,
      seatId: row.seat_id,
      rowLabel,
      seatNumber,
      sectionSlotIndex: sectionSlot,
    });
    const storagePath = `print-by-section/${eventSlug}/${sectionSlug}/part-${part}/${base}`;
    const url = await generateTicketImageForTicketId(row.id, { storagePath });
    if (!url) {
      const { data: stillExists, error: existsErr } = await admin
        .from("tickets")
        .select("id, qr_data")
        .eq("id", row.id)
        .maybeSingle();
      if (existsErr) throw new Error(existsErr.message);
      // Race-safe: if ticket disappeared after batch selection, skip it and let
      // final recount drive completion instead of failing the whole request.
      if (!stillExists) return;
      failed += 1;
      console.error("[manual-confirm/generate-images] ticket image generation failed", {
        ticketId: row.id,
        assignmentId,
        bookingId: resolvedBookingId,
        storagePath,
      });
      return;
    }
    processed += 1;
  });

  const { count: finalTotalCount, error: finalTotalErr } = await admin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", resolvedBookingId);
  if (finalTotalErr) throw new Error(finalTotalErr.message);
  const finalTotal = typeof finalTotalCount === "number" ? finalTotalCount : total;

  const { count: finalDoneCount, error: finalDoneErr } = await admin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", resolvedBookingId)
    .not("ticket_image_url", "is", null);
  if (finalDoneErr) throw new Error(finalDoneErr.message);
  const finalDone = typeof finalDoneCount === "number" ? finalDoneCount : generatedTotal + processed;
  const complete = finalDone >= finalTotal;

  return {
    processed,
    failed,
    generatedTotal: finalDone,
    total: finalTotal,
    complete,
  };
}
