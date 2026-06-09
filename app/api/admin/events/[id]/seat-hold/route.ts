import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";

type SeatStatus = "available" | "reserved" | "sold" | "hold";
const PAGE_SIZE = 1000;

async function getAllEventSeats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string
) {
  const rows: Array<{
    id: string;
    event_section_id: string;
    row_label: string | null;
    seat_number: string | null;
    status: SeatStatus;
    hold_description: string | null;
    hold_batch_id: string | null;
  }> = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: page } = await supabase
      .from("event_seats")
      .select("id, event_section_id, row_label, seat_number, status, hold_description, hold_batch_id")
      .eq("event_id", eventId)
      .order("event_section_id")
      .order("row_label")
      .order("seat_number")
      .range(offset, offset + PAGE_SIZE - 1);

    const chunk = (page ?? []) as typeof rows;
    rows.push(...chunk);
    hasMore = chunk.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  return rows;
}

async function getBlockedSeatIds(supabase: Awaited<ReturnType<typeof createClient>>, eventId: string) {
  const { data: bookingIds } = await supabase
    .from("bookings")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "confirmed");
  const bidList = (bookingIds ?? []).map((b) => b.id);

  let bookedSeatIds: string[] = [];
  if (bidList.length > 0) {
    const { data: tk } = await supabase
      .from("tickets")
      .select("seat_id")
      .in("booking_id", bidList)
      .not("seat_id", "is", null);
    bookedSeatIds = (tk ?? []).map((t) => t.seat_id as string);
  }

  const { data: cartIds } = await supabase
    .from("reservation_carts")
    .select("id")
    .eq("event_id", eventId)
    .gt("expires_at", new Date().toISOString());
  const cidList = (cartIds ?? []).map((c) => c.id);

  let cartHeldSeatIds: string[] = [];
  if (cidList.length > 0) {
    const { data: ri } = await supabase
      .from("reservation_items")
      .select("seat_id")
      .in("cart_id", cidList)
      .not("seat_id", "is", null);
    cartHeldSeatIds = (ri ?? []).map((r) => r.seat_id as string);
  }

  const { data: pendingBookingIds } = await supabase
    .from("bookings")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "pending");
  const pendingIds = (pendingBookingIds ?? []).map((b) => b.id);

  let pendingHeldSeatIds: string[] = [];
  if (pendingIds.length > 0) {
    const { data: pendingTickets } = await supabase
      .from("tickets")
      .select("seat_id")
      .in("booking_id", pendingIds)
      .not("seat_id", "is", null);
    pendingHeldSeatIds = (pendingTickets ?? []).map((r) => r.seat_id as string);
  }

  const { data: adminReservedSeats } = await supabase
    .from("event_seats")
    .select("id")
    .eq("event_id", eventId)
    .or("assignment_id.not.is.null,status.eq.reserved,status.eq.sold");

  return new Set([
    ...bookedSeatIds,
    ...cartHeldSeatIds,
    ...pendingHeldSeatIds,
    ...((adminReservedSeats ?? []).map((s) => s.id)),
  ]);
}

async function buildSeatHoldPayload(supabase: Awaited<ReturnType<typeof createClient>>, eventId: string) {
  const { data: sections } = await supabase
    .from("event_sections")
    .select("id, name, section_code, section_group, sort_order, color")
    .eq("event_id", eventId)
    .order("sort_order")
    .order("name");

  const seats = await getAllEventSeats(supabase, eventId);

  const blockedSet = await getBlockedSeatIds(supabase, eventId);
  const soldSet = new Set((seats ?? []).filter((s) => s.status === "sold").map((s) => s.id));
  const holdSet = new Set((seats ?? []).filter((s) => s.status === "hold").map((s) => s.id));

  const seatRows = seats.map((seat) => {
    let status: SeatStatus = "available";
    if (soldSet.has(seat.id)) status = "sold";
    else if (holdSet.has(seat.id)) status = "hold";
    else if (blockedSet.has(seat.id)) status = "reserved";
    return {
      id: seat.id,
      event_section_id: seat.event_section_id,
      row_label: seat.row_label,
      seat_number: seat.seat_number,
      status,
      hold_description: seat.hold_description,
      hold_batch_id: seat.hold_batch_id,
    };
  });

  const holdsByBatch = new Map<
    string,
    {
      batch_id: string;
      description: string | null;
      count: number;
      sections: Map<string, { section_id: string; section_name: string; count: number }>;
    }
  >();

  const sectionNameById = new Map(
    (sections ?? []).map((s) => [s.id, s.name ?? s.section_code ?? "—"])
  );

  for (const seat of seats) {
    if (seat.status !== "hold" || !seat.hold_batch_id) continue;
    const existing = holdsByBatch.get(seat.hold_batch_id);
    if (!existing) {
      holdsByBatch.set(seat.hold_batch_id, {
        batch_id: seat.hold_batch_id,
        description: seat.hold_description ?? null,
        count: 1,
        sections: new Map(),
      });
      const secName = sectionNameById.get(seat.event_section_id) ?? "—";
      const justCreated = holdsByBatch.get(seat.hold_batch_id)!;
      justCreated.sections.set(seat.event_section_id, {
        section_id: seat.event_section_id,
        section_name: secName,
        count: 1,
      });
    } else {
      existing.count += 1;
      const sectionBucket = existing.sections.get(seat.event_section_id);
      if (!sectionBucket) {
        existing.sections.set(seat.event_section_id, {
          section_id: seat.event_section_id,
          section_name: sectionNameById.get(seat.event_section_id) ?? "—",
          count: 1,
        });
      } else {
        sectionBucket.count += 1;
      }
    }
  }

  const holdBatches = Array.from(holdsByBatch.values()).map((batch) => ({
    batch_id: batch.batch_id,
    description: batch.description,
    count: batch.count,
    sections: Array.from(batch.sections.values()).sort((a, b) =>
      a.section_name.localeCompare(b.section_name)
    ),
  }));

  return {
    sections: sections ?? [],
    seats: seatRows,
    hold_batches: holdBatches,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const denied = await forbiddenUnlessEventSection(eventId, "seatHold");
  if (denied) return denied;

  const supabase = await createClient();
  const payload = await buildSeatHoldPayload(supabase, eventId);
  return NextResponse.json(payload);
}

const updateSeatHoldSchema = z.object({
  seat_ids: z.array(z.string().uuid()),
  description: z.string().trim().max(120).optional().default(""),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const denied = await forbiddenUnlessEventSection(eventId, "seatHold");
  if (denied) return denied;

  const parsed = updateSeatHoldSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { seat_ids, description } = parsed.data;
  const selectedSeatIds = Array.from(new Set(seat_ids));

  const supabase = await createClient();

  const allSeatRows = await getAllEventSeats(supabase, eventId);

  const allSeatIdSet = new Set((allSeatRows ?? []).map((s) => s.id));
  const invalidSeatIds = selectedSeatIds.filter((id) => !allSeatIdSet.has(id));
  if (invalidSeatIds.length > 0) {
    return NextResponse.json(
      { error: "One or more selected seats do not belong to this event." },
      { status: 400 }
    );
  }

  const blockedSet = await getBlockedSeatIds(supabase, eventId);
  const conflictIds = selectedSeatIds.filter((id) => blockedSet.has(id));
  if (conflictIds.length > 0) {
    return NextResponse.json(
      {
        error: "Some selected seats are already sold, distributed, reserved, or blocked.",
        conflict_seat_ids: conflictIds,
      },
      { status: 409 }
    );
  }

  const currentHoldIds = allSeatRows
    .filter((row) => row.status === "hold")
    .map((row) => row.id);
  const currentHoldSet = new Set(currentHoldIds);
  const toHold = selectedSeatIds.filter((id) => !currentHoldSet.has(id));

  if (selectedSeatIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one seat to create a hold batch." },
      { status: 400 }
    );
  }

  if (toHold.length === 0) {
    return NextResponse.json(
      { error: "Selected seats are already part of existing hold batches." },
      { status: 400 }
    );
  }

  if (description.trim().length === 0) {
    return NextResponse.json(
      { error: "Description is required when creating new seat holds." },
      { status: 400 }
    );
  }

  if (toHold.length > 0) {
    const batchId = crypto.randomUUID();
    const { error: holdErr } = await supabase
      .from("event_seats")
      .update({
        status: "hold",
        assignment_id: null,
        hold_batch_id: batchId,
        hold_description: description.trim(),
        hold_created_at: new Date().toISOString(),
      })
      .eq("event_id", eventId)
      .in("id", toHold);
    if (holdErr) {
      return NextResponse.json(
        { error: holdErr.message ?? "Failed to mark seat holds." },
        { status: 500 }
      );
    }
  }

  const payload = await buildSeatHoldPayload(supabase, eventId);
  return NextResponse.json(payload);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const denied = await forbiddenUnlessEventSection(eventId, "seatHold");
  if (denied) return denied;

  const batchId = request.nextUrl.searchParams.get("batch_id");
  if (!batchId) {
    return NextResponse.json({ error: "batch_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_seats")
    .update({
      status: "available",
      hold_batch_id: null,
      hold_description: null,
      hold_created_at: null,
    })
    .eq("event_id", eventId)
    .eq("status", "hold")
    .eq("hold_batch_id", batchId);

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to release hold batch." },
      { status: 500 }
    );
  }

  const payload = await buildSeatHoldPayload(supabase, eventId);
  return NextResponse.json(payload);
}
