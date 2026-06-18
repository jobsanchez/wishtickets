import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";
import {
  buildSeatSaleTicket,
  buildSectionSaleTicket,
  finalizeInventoryAllocationsForSaleTickets,
  TicketInventoryError,
} from "@/lib/ticket-inventory";
import { chunkArray } from "@/lib/array-chunks";

export const dynamic = "force-dynamic";
/** Large confirmations do chunked DB writes; allow headroom vs default serverless timeouts. */
export const maxDuration = 120;

async function canManageAssignments() {
  const role = await getProfileRole();
  if (role === "super_admin" || role === "admin" || role === "admissions_staff")
    return true;
  const userId = await getCurrentUserId();
  if (!userId) return false;
  return (
    hasCapability(userId, "manage_seats") ||
    hasCapability(userId, "manage_assignments")
  );
}

const DEFAULT_PRICE_CENTS = 50000;

type ConfirmSeatRow = { id: string; event_section_id: string | null };
type ConfirmSectionItemRow = { seat_id: string | null; section_id: string | null; quantity: number | null };
type ConfirmEventSectionRow = {
  id: string;
  section_code: string | null;
  seating_type: string | null;
  name: string | null;
};
type ConfirmSeatDataRow = {
  id: string;
  row_label: string | null;
  seat_number: string | null;
  event_section_id: string | null;
};
const POSTGREST_IN_CHUNK = 200;
const TICKET_INSERT_CHUNK = 200;

async function fetchSeatDataByIdsChunked(
  supabase: SupabaseClient,
  seatIds: string[]
): Promise<{ rows: ConfirmSeatDataRow[]; error: string | null }> {
  if (seatIds.length === 0) return { rows: [], error: null };
  const rows: ConfirmSeatDataRow[] = [];
  for (let i = 0; i < seatIds.length; i += POSTGREST_IN_CHUNK) {
    const slice = seatIds.slice(i, i + POSTGREST_IN_CHUNK);
    const { data, error } = await supabase
      .from("event_seats")
      .select("id, row_label, seat_number, event_section_id")
      .in("id", slice);
    if (error) return { rows: [], error: error.message };
    rows.push(...((data ?? []) as ConfirmSeatDataRow[]));
  }
  return { rows, error: null };
}

/**
 * Confirms manual distribution: booking + ticket rows from Seat Configurator inventory only.
 * Pre-generated inventory must include rendered ticket images; no on-demand image generation.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: assignmentId } = await params;
  if (!(await canManageAssignments())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminDb = createAdminClient();

  const { data: assignment, error: assignError } = await adminDb
    .from("admin_seat_assignments")
    .select("id, event_id, recipient_name, status, distribution_category")
    .eq("id", assignmentId)
    .single();

  if (assignError || !assignment || assignment.status !== "reserved") {
    return NextResponse.json(
      { error: "Manual distribution not found or already confirmed" },
      { status: 400 }
    );
  }

  const { data: seats } = await adminDb
    .from("event_seats")
    .select("id, event_section_id")
    .eq("assignment_id", assignmentId);

  const { data: assignmentItems } = await adminDb
    .from("admin_assignment_items")
    .select("seat_id, section_id, quantity")
    .eq("assignment_id", assignmentId)
    .or("seat_id.not.is.null,section_id.not.is.null");

  const seatRows = (seats ?? []) as ConfirmSeatRow[];
  const assignmentItemRows = (assignmentItems ?? []) as ConfirmSectionItemRow[];
  const seatIdsFromItems = assignmentItemRows
    .map((row) => row.seat_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const seatIdSet = new Set<string>([
    ...seatRows.map((s) => s.id),
    ...seatIdsFromItems,
  ]);
  const sectionItemRows = assignmentItemRows.filter(
    (row) => typeof row.section_id === "string" && row.section_id.length > 0
  );
  const hasSeats = seatIdSet.size > 0;
  const hasSectionItems = sectionItemRows.length > 0;

  if (!hasSeats && !hasSectionItems) {
    return NextResponse.json(
      { error: "No seats or section items in manual distribution" },
      { status: 400 }
    );
  }

  const { data: eventPrices } = await adminDb
    .from("event_prices")
    .select("section_id, price_cents")
    .eq("event_id", assignment.event_id);
  const priceMap = new Map<string, number>();
  const priceRows = (eventPrices ?? []) as { section_id: string; price_cents: number }[];
  for (const p of priceRows) {
    priceMap.set(p.section_id, p.price_cents);
  }

  const seatRowsById = new Map<string, ConfirmSeatRow>(
    seatRows.map((row) => [row.id, row])
  );
  let totalCents = 0;
  for (const seatId of seatIdSet) {
    const sectionId = seatRowsById.get(seatId)?.event_section_id ?? null;
    totalCents += sectionId
      ? (priceMap.get(sectionId) ?? DEFAULT_PRICE_CENTS)
      : DEFAULT_PRICE_CENTS;
  }
  for (const item of sectionItemRows) {
    const price = item.section_id ? (priceMap.get(item.section_id) ?? DEFAULT_PRICE_CENTS) : DEFAULT_PRICE_CENTS;
    totalCents += price * (item.quantity ?? 1);
  }
  if (totalCents === 0) {
    const seatCount = seatIdSet.size;
    const sectionQty = sectionItemRows.reduce((sum, row) => sum + (row.quantity ?? 0), 0);
    totalCents = DEFAULT_PRICE_CENTS * (seatCount + sectionQty);
  }

  const { data: booking, error: bookingError } = await adminDb
    .from("bookings")
    .insert({
      user_id: null,
      event_id: assignment.event_id,
      status: "confirmed",
      total_cents: totalCents,
    })
    .select("id")
    .single();

  if (bookingError || !booking) {
    return NextResponse.json(
      { error: bookingError?.message ?? "Failed to create booking" },
      { status: 500 }
    );
  }

  const { data: eventRow } = await adminDb
    .from("events")
    .select("event_code")
    .eq("id", assignment.event_id)
    .single();
  const eventCode = eventRow?.event_code ?? "";

  const seatIdsFromSeats = [...seatIdSet];
  const { rows: seatDataRows, error: seatDataErr } = await fetchSeatDataByIdsChunked(
    adminDb,
    seatIdsFromSeats
  );
  if (seatDataErr) {
    await adminDb.from("bookings").delete().eq("id", booking.id);
    return NextResponse.json(
      { error: seatDataErr ?? "Failed to load assigned seats for confirmation" },
      { status: 500 }
    );
  }
  if (seatIdsFromSeats.length > 0 && seatDataRows.length === 0) {
    await adminDb.from("bookings").delete().eq("id", booking.id);
    return NextResponse.json(
      { error: "Failed to resolve assigned seats; confirmation aborted to avoid zero-ticket booking" },
      { status: 500 }
    );
  }
  const sectionIdsFromSeats = [
    ...new Set(seatDataRows.map((s) => s.event_section_id).filter((id): id is string => !!id)),
  ];
  const sectionIdsFromItems = sectionItemRows.map((i) => i.section_id);
  const allSectionIds = [
    ...new Set([...sectionIdsFromSeats, ...sectionIdsFromItems]),
  ];
  const { data: eventSectionData } =
    allSectionIds.length > 0
      ? await adminDb
          .from("event_sections")
          .select("id, section_code, seating_type, name")
          .in("id", allSectionIds)
      : { data: [] };
  const eventSectionRows = (eventSectionData ?? []) as ConfirmEventSectionRow[];
  const sectionMap = new Map(
    eventSectionRows.map((s) => [
      s.id,
      {
        sectionCode: s.section_code ?? "SEC",
        sectionName: s.name ?? s.section_code ?? "—",
        rowLabel: s.seating_type === "standing" ? "ST" : "FS",
        seatingType: s.seating_type ?? "assigned",
      },
    ])
  );

  const seatDataMap = new Map(
    seatDataRows.map((s) => [
      s.id,
      {
        sectionCode: sectionMap.get(s.event_section_id ?? "")?.sectionCode ?? "SEC",
        sectionName: sectionMap.get(s.event_section_id ?? "")?.sectionName ?? "—",
        rowLabel: s.row_label ?? "-",
        seatNumber: s.seat_number ?? "-",
      },
    ])
  );

  const isComplementary = (assignment as { distribution_category?: string })?.distribution_category === "complementary";

  const ticketRows: Array<{
    id: string;
    booking_id: string;
    seat_id: string | null;
    section_id: string | null;
    quantity: number;
    qr_data: string;
    encrypted_qr: string;
    qr_image_url: string | null;
    ticket_image_url: string | null;
    print_ticket_id?: string | null;
    recipient_name: string;
    is_complementary: boolean;
  }> = [];

  const totalTicketsTarget =
    seatIdSet.size + sectionItemRows.reduce((sum, row) => sum + Math.max(0, row.quantity ?? 0), 0);

  try {
    for (const seat of seatDataRows) {
      const data = seatDataMap.get(seat.id);
      const row = await buildSeatSaleTicket(adminDb, {
        bookingId: booking.id,
        seatId: seat.id,
        eventId: assignment.event_id,
        recipientName: assignment.recipient_name,
        requireInventory: true,
        requireInventoryImage: true,
        mintContext:
          eventCode && data
            ? {
                eventCode,
                sectionCode: data.sectionCode,
                rowLabel: data.rowLabel,
                seatNumber: data.seatNumber,
              }
            : null,
      });
      ticketRows.push({
        ...row,
        section_id: seat.event_section_id,
        recipient_name: assignment.recipient_name,
        is_complementary: isComplementary,
      });
    }

    for (const item of sectionItemRows) {
      const sectionInfo = sectionMap.get(item.section_id ?? "");
      const sectionCode = sectionInfo?.sectionCode ?? "SEC";
      const seatingType = sectionInfo?.seatingType ?? "assigned";
      const qty = item.quantity ?? 1;
      for (let n = 1; n <= qty; n++) {
        const row = await buildSectionSaleTicket(adminDb, {
          bookingId: booking.id,
          eventId: assignment.event_id,
          sectionId: item.section_id!,
          slotIndex: n,
          seatingType,
          sectionCode,
          eventCode,
          recipientName: assignment.recipient_name,
          requireInventory: true,
          requireInventoryImage: true,
        });
        ticketRows.push({
          ...row,
          recipient_name: assignment.recipient_name,
          is_complementary: isComplementary,
        });
      }
    }
  } catch (e) {
    await adminDb.from("bookings").delete().eq("id", booking.id);
    if (e instanceof TicketInventoryError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  for (const insertChunk of chunkArray(ticketRows, TICKET_INSERT_CHUNK)) {
    const { error: ticketsError } = await adminDb.from("tickets").insert(insertChunk);
    if (ticketsError) {
      await adminDb.from("tickets").delete().eq("booking_id", booking.id);
      await adminDb.from("bookings").delete().eq("id", booking.id);
      return NextResponse.json(
        { error: ticketsError.message ?? "Failed to create tickets" },
        { status: 500 }
      );
    }
  }

  try {
    await finalizeInventoryAllocationsForSaleTickets(adminDb, ticketRows);
  } catch (e) {
    await adminDb.from("tickets").delete().eq("booking_id", booking.id);
    await adminDb.from("bookings").delete().eq("id", booking.id);
    if (e instanceof TicketInventoryError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const seatIdsConfirmed = seatDataRows.map((s) => s.id);
  if (seatIdsConfirmed.length > 0) {
    for (const idChunk of chunkArray(seatIdsConfirmed, POSTGREST_IN_CHUNK)) {
      const { error: soldErr } = await adminDb
        .from("event_seats")
        .update({ status: "sold", assignment_id: null })
        .in("id", idChunk);
      if (soldErr) {
        return NextResponse.json(
          { error: soldErr.message ?? "Failed to mark seats as sold" },
          { status: 500 }
        );
      }
    }
  }

  const { error: assignUpdateError } = await adminDb
    .from("admin_seat_assignments")
    .update({ status: "confirmed", booking_id: booking.id })
    .eq("id", assignmentId);

  if (assignUpdateError) {
    return NextResponse.json(
      { error: assignUpdateError.message ?? "Failed to update manual distribution" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    booking_id: booking.id,
    totalTickets: totalTicketsTarget,
    ticket_ids: ticketRows.map((t) => t.id),
  });
}
