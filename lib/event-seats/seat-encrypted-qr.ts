import { randomBytes } from "crypto";
import type { SupabaseClient as AdminSupabaseClient } from "@supabase/supabase-js";
import { buildEncryptedQrFromQrData, formatQrData, rotateSeatEncryptedQr } from "@/lib/qr-data";

export type SeatQrFormatContext = {
  eventCode: string;
  sectionCode: string;
  rowLabel: string;
  seatNumber: string;
};

/** Deterministic base `qr_data` for a seat (CTRL line / print row label). */
export function canonicalQrDataForSeat(ctx: SeatQrFormatContext): string {
  return formatQrData({
    eventCode: ctx.eventCode,
    sectionCode: ctx.sectionCode,
    rowLabel: ctx.rowLabel,
    seatNumber: ctx.seatNumber,
  });
}

/** Initial `event_seats.encrypted_qr` when creating a seat (matches checkout seed before first sale). */
export function deterministicEncryptedQrForNewSeat(ctx: SeatQrFormatContext): string {
  return buildEncryptedQrFromQrData(canonicalQrDataForSeat(ctx));
}

/**
 * Ensures `event_seats.encrypted_qr` is set for sale: backfill with deterministic hash if null.
 */
export async function ensureSeatEncryptedQrForSale(
  admin: AdminSupabaseClient,
  seatId: string,
  ctx: SeatQrFormatContext
): Promise<string> {
  const { data: row, error } = await admin
    .from("event_seats")
    .select("encrypted_qr")
    .eq("id", seatId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load event_seat");

  const existing = (row?.encrypted_qr ?? "").trim();
  if (existing.length > 0) return existing.toUpperCase();

  const enc = buildEncryptedQrFromQrData(canonicalQrDataForSeat(ctx));
  const { error: upErr } = await admin
    .from("event_seats")
    .update({ encrypted_qr: enc })
    .eq("id", seatId);
  if (upErr) throw new Error(upErr.message ?? "Failed to set event_seats.encrypted_qr");
  return enc;
}

async function loadSeatRotationContext(
  admin: AdminSupabaseClient,
  seatId: string
): Promise<{
  eventId: string;
  scanCode: string | null;
  ctx: SeatQrFormatContext;
} | null> {
  const { data: es, error: esErr } = await admin
    .from("event_seats")
    .select("id, event_id, scan_code, row_label, seat_number, event_section_id")
    .eq("id", seatId)
    .maybeSingle();
  if (esErr || !es) return null;

  const [{ data: ev }, { data: sec }] = await Promise.all([
    admin.from("events").select("event_code").eq("id", es.event_id).maybeSingle(),
    admin
      .from("event_sections")
      .select("section_code")
      .eq("id", es.event_section_id)
      .maybeSingle(),
  ]);

  const ctx: SeatQrFormatContext = {
    eventCode: (ev as { event_code?: string | null } | null)?.event_code ?? "XXX",
    sectionCode: (sec as { section_code?: string | null } | null)?.section_code ?? "000",
    rowLabel: es.row_label ?? "-",
    seatNumber: es.seat_number ?? "-",
  };

  return {
    eventId: es.event_id as string,
    scanCode: (es.scan_code as string | null) ?? null,
    ctx,
  };
}

/**
 * After invalidation: new seat master code + sync seat-scoped print_tickets so stale prints cannot bridge scans.
 */
export async function rotateEncryptedQrForSeatOnRelease(
  admin: AdminSupabaseClient,
  seatId: string
): Promise<void> {
  const loaded = await loadSeatRotationContext(admin, seatId);
  if (!loaded) {
    throw new Error(
      "Cannot rotate event_seats.encrypted_qr: seat not found or failed to load context"
    );
  }

  const newEnc = rotateSeatEncryptedQr({
    seatId,
    eventId: loaded.eventId,
    scanCode: loaded.scanCode,
  });

  const { data: rotatedSeat, error: seatErr } = await admin
    .from("event_seats")
    .update({ encrypted_qr: newEnc })
    .eq("id", seatId)
    .select("id")
    .maybeSingle();
  if (seatErr) throw new Error(seatErr.message ?? "Failed to rotate event_seats.encrypted_qr");
  if (!rotatedSeat) {
    throw new Error(
      "Failed to rotate event_seats.encrypted_qr: update matched no row (check seat id / RLS)"
    );
  }

  const baseQr = canonicalQrDataForSeat(loaded.ctx);
  // One-shot unique-ish qr_data (invalidate path only calls here); avoids up to 100 sequential lookups.
  const qrDataForPrint = `${baseQr}-R${randomBytes(8).toString("hex")}`;

  const { error: ptErr } = await admin
    .from("print_tickets")
    .update({
      encrypted_qr: newEnc,
      qr_data: qrDataForPrint,
      ticket_image_url: null,
    })
    .eq("event_seat_id", seatId);
  if (ptErr) throw new Error(ptErr.message ?? "Failed to sync print_tickets after rotation");
}
