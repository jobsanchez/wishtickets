import type { SupabaseClient as AdminSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTicketImageForPrint } from "@/lib/ticket-image";
import { buildEncryptedQrFromQrData, formatQrData } from "@/lib/qr-data";
import { allocateUniquePrintQrData } from "@/lib/print-tickets/allocate-print-qr-data";
import { ensureSeatEncryptedQrForSale } from "@/lib/event-seats/seat-encrypted-qr";
import {
  ensureInventoryForSeats,
  generateInventoryImages,
} from "@/lib/ticket-inventory";

export type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type GenerateOneResult =
  | { ok: true; id: string; ticket_image_url: string }
  | { ok: false; message: string };

function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  const m = err.message ?? "";
  return m.includes("duplicate key") || m.includes("unique constraint");
}

async function getConfirmedSaleQrForSeat(
  admin: AdminSupabaseClient,
  eventId: string,
  eventSeatId: string
): Promise<string | null> {
  const { data: rows, error } = await admin
    .from("tickets")
    .select("qr_data, booking_id")
    .eq("seat_id", eventSeatId)
    .not("qr_data", "is", null)
    .order("created_at", { ascending: false });
  if (error || !rows?.length) return null;
  const bookingIds = [...new Set(rows.map((r) => r.booking_id).filter(Boolean))] as string[];
  if (bookingIds.length === 0) return null;
  const { data: bookings } = await admin
    .from("bookings")
    .select("id")
    .in("id", bookingIds)
    .eq("event_id", eventId)
    .eq("status", "confirmed");
  const ok = new Set((bookings ?? []).map((b) => b.id));
  for (const r of rows) {
    const q = r.qr_data;
    if (typeof q === "string" && q.length > 0 && ok.has(r.booking_id as string)) return q;
  }
  return null;
}

/**
 * After a failed insert (race or legacy index), resolve the row we should use.
 */
async function resolvePrintTicketAfterInsertConflict(
  admin: AdminSupabaseClient,
  eventId: string,
  eventSectionId: string,
  eventSeatId: string | null,
  slotForRow: number,
  qrData: string
): Promise<{ id: string; qr_data: string } | null> {
  let bySeat = admin
    .from("print_tickets")
    .select("id, qr_data, event_seat_id, section_slot_index")
    .eq("event_id", eventId)
    .eq("event_section_id", eventSectionId);

  bySeat =
    eventSeatId != null
      ? bySeat.eq("event_seat_id", eventSeatId)
      : bySeat.is("event_seat_id", null).eq("section_slot_index", slotForRow);

  const { data: seatRow } = await bySeat.maybeSingle();
  if (seatRow) return { id: seatRow.id, qr_data: seatRow.qr_data as string };

  const { data: qrRow } = await admin
    .from("print_tickets")
    .select("id, qr_data, event_seat_id, section_slot_index")
    .eq("event_id", eventId)
    .eq("qr_data", qrData)
    .maybeSingle();

  if (!qrRow) return null;

  if (eventSeatId != null && qrRow.event_seat_id === eventSeatId) {
    return { id: qrRow.id, qr_data: qrRow.qr_data as string };
  }
  if (
    eventSeatId == null &&
    qrRow.event_seat_id == null &&
    Number(qrRow.section_slot_index) === slotForRow
  ) {
    return { id: qrRow.id, qr_data: qrRow.qr_data as string };
  }
  return null;
}

async function generateOneSeatLinked(
  admin: AdminSupabaseClient,
  eventId: string,
  eventSectionId: string,
  eventSeatId: string
): Promise<GenerateOneResult> {
  const ensured = await ensureInventoryForSeats(admin, eventId, [eventSeatId]);
  const printTicketId = ensured.print_ticket_ids[0];
  if (!printTicketId) {
    return { ok: false, message: "Failed to ensure ticket inventory for seat" };
  }

  const { data: row } = await admin
    .from("print_tickets")
    .select("ticket_image_url")
    .eq("id", printTicketId)
    .single();

  let ticketImageUrl = (row?.ticket_image_url as string | null) ?? "";
  if (!ticketImageUrl.trim()) {
    const img = await generateInventoryImages(admin, [printTicketId]);
    if (img.images_generated < 1) {
      return {
        ok: false,
        message:
          "Ticket image render or storage upload failed. Check server logs, ticket template URL, and that the ticket-images bucket accepts uploads from the service role.",
      };
    }
    const { data: after } = await admin
      .from("print_tickets")
      .select("ticket_image_url")
      .eq("id", printTicketId)
      .single();
    ticketImageUrl = (after?.ticket_image_url as string) ?? "";
  }

  if (!ticketImageUrl.trim()) {
    return { ok: false, message: "Ticket image URL missing after generation" };
  }

  return { ok: true, id: printTicketId, ticket_image_url: ticketImageUrl };
}

/**
 * @param sectionSlotIndex For `eventSeatId === null`: 1-based slot within section (required for new rows; defaults to 1 if omitted). Ignored when `eventSeatId` is set (stored as 0).
 */
export async function generateOne(
  supabase: SupabaseClient,
  eventId: string,
  eventSectionId: string,
  eventSeatId: string | null,
  sectionSlotIndex?: number
): Promise<GenerateOneResult> {
  try {
    let admin;
    try {
      admin = createAdminClient();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        message: `Server configuration: ${msg}. Set SUPABASE_SERVICE_ROLE_KEY for ticket image uploads.`,
      };
    }

    if (eventSeatId != null) {
      return generateOneSeatLinked(admin, eventId, eventSectionId, eventSeatId);
    }

    const slotForRow = Math.max(1, Math.floor(sectionSlotIndex ?? 1));

    let existingQuery = admin
      .from("print_tickets")
      .select("id, qr_data, encrypted_qr")
      .eq("event_id", eventId)
      .eq("event_section_id", eventSectionId)
      .is("event_seat_id", null)
      .eq("section_slot_index", slotForRow);

    const { data: existing, error: existingError } = await existingQuery.maybeSingle();
    if (existingError) {
      return {
        ok: false,
        message: `print_tickets lookup: ${existingError.message}`,
      };
    }

    let printTicketId: string;
    let qrData: string;
    let encryptedQrData: string;

    if (existing) {
      printTicketId = existing.id;
      qrData = existing.qr_data;
      encryptedQrData = existing.encrypted_qr ?? buildEncryptedQrFromQrData(qrData);
    } else {
      const { data: eventRow } = await supabase
        .from("events")
        .select("event_code")
        .eq("id", eventId)
        .single();

      const { data: sectionRow } = await supabase
        .from("event_sections")
        .select("section_code, seating_type")
        .eq("id", eventSectionId)
        .single();

      const st = (sectionRow as { seating_type?: string | null } | null)?.seating_type ?? "";
      const stNorm = st.toString().trim().toLowerCase();
      const rowLabel = stNorm === "standing" ? "ST" : "FS";
      const seatNumber = String(slotForRow);

      const eventCode = (eventRow as { event_code?: string | null } | null)?.event_code ?? "XXX";
      const sectionCode = (sectionRow as { section_code?: string | null } | null)?.section_code ?? "000";

      const saleStyleBase = formatQrData({
        eventCode,
        sectionCode,
        rowLabel,
        seatNumber,
      });

      qrData = await allocateUniquePrintQrData(admin, eventId, saleStyleBase);
      encryptedQrData = buildEncryptedQrFromQrData(qrData);

      const { data: inserted, error: insertError } = await admin
        .from("print_tickets")
        .insert({
          event_id: eventId,
          event_section_id: eventSectionId,
          event_seat_id: null,
          section_slot_index: slotForRow,
          qr_data: qrData,
          encrypted_qr: encryptedQrData,
        })
        .select("id, qr_data, encrypted_qr")
        .single();

      if (insertError || !inserted) {
        if (isUniqueViolation(insertError)) {
          const recovered = await resolvePrintTicketAfterInsertConflict(
            admin,
            eventId,
            eventSectionId,
            null,
            slotForRow,
            qrData
          );
          if (recovered) {
            printTicketId = recovered.id;
            qrData = recovered.qr_data;
            encryptedQrData = buildEncryptedQrFromQrData(qrData);
          } else {
            return {
              ok: false,
              message:
                insertError?.message ??
                "Failed to insert print_tickets row (duplicate key; no matching row to reuse)",
            };
          }
        } else {
          return {
            ok: false,
            message: insertError?.message ?? "Failed to insert print_tickets row",
          };
        }
      } else {
        printTicketId = inserted.id;
        if (typeof inserted.qr_data === "string" && inserted.qr_data.length > 0) {
          qrData = inserted.qr_data;
        }
        encryptedQrData =
          typeof inserted.encrypted_qr === "string" && inserted.encrypted_qr.length > 0
            ? inserted.encrypted_qr
            : buildEncryptedQrFromQrData(qrData);
      }
    }

    const url = await generateTicketImageForPrint({
      eventId,
      eventSectionId,
      eventSeatId: null,
      printTicketId,
      qrData: encryptedQrData,
      ticketNumberData: qrData,
      sectionSlotIndex: slotForRow,
    });

    if (!url) {
      return {
        ok: false,
        message:
          "Ticket image render or storage upload failed. Check server logs, ticket template URL, and that the ticket-images bucket accepts uploads from the service role.",
      };
    }

    const { error: updateError } = await admin
      .from("print_tickets")
      .update({ ticket_image_url: url })
      .eq("id", printTicketId);

    if (updateError) {
      return {
        ok: false,
        message: `print_tickets update: ${updateError.message}`,
      };
    }

    return { ok: true, id: printTicketId, ticket_image_url: url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[print-tickets] generateOne unexpected error:", msg, e);
    return {
      ok: false,
      message: `Unexpected error while generating print ticket: ${msg}`,
    };
  }
}
