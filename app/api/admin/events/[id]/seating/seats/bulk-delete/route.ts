import { createClient } from "@/lib/supabase/server";
import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";


const schema = z.object({
  event_section_id: z.string().uuid(),
  seat_ids: z.array(z.string().uuid()).min(1),
});

function sortSeatNumbers(a: string, b: string): number {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const denied = await forbiddenUnlessAnyEventSection(eventId, ["seating", "selector"]);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const sectionId = parsed.data.event_section_id;
  const seatIds = [...new Set(parsed.data.seat_ids)];
  const supabase = await createClient();

  const { data: section, error: sectionError } = await supabase
    .from("event_sections")
    .select("id")
    .eq("id", sectionId)
    .eq("event_id", eventId)
    .single();
  if (sectionError || !section) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  const { data: targetSeats, error: targetError } = await supabase
    .from("event_seats")
    .select("id, row_label, status")
    .eq("event_id", eventId)
    .eq("event_section_id", sectionId)
    .in("id", seatIds);
  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 500 });
  }

  if (!targetSeats || targetSeats.length !== seatIds.length) {
    return NextResponse.json(
      { error: "Some selected seats were not found in this section." },
      { status: 400 }
    );
  }

  const blockedSeats = targetSeats.filter((s) => s.status !== "available");
  if (blockedSeats.length > 0) {
    return NextResponse.json(
      {
        error: "Only available seats can be permanently deleted.",
        blocked_count: blockedSeats.length,
      },
      { status: 409 }
    );
  }

  const affectedRows = new Set(targetSeats.map((s) => s.row_label));
  const { data: deletedRows, error: deleteError } = await supabase
    .from("event_seats")
    .delete()
    .eq("event_id", eventId)
    .eq("event_section_id", sectionId)
    .in("id", seatIds)
    .select("id");
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }
  const deletedCount = deletedRows?.length ?? 0;

  const { data: remainingSeats, error: remainingError } = await supabase
    .from("event_seats")
    .select("id, row_label, seat_number")
    .eq("event_id", eventId)
    .eq("event_section_id", sectionId);
  if (remainingError) {
    return NextResponse.json({ error: remainingError.message }, { status: 500 });
  }

  const rows = new Map<string, Array<{ id: string; seat_number: string }>>();
  for (const seat of remainingSeats ?? []) {
    const row = seat.row_label ?? "";
    const list = rows.get(row) ?? [];
    list.push({ id: seat.id, seat_number: seat.seat_number ?? "" });
    rows.set(row, list);
  }

  let renumberedRows = 0;
  const updates: Array<{ id: string; seat_number: string }> = [];
  for (const [rowLabel, rowSeats] of rows) {
    rowSeats.sort((a, b) => sortSeatNumbers(a.seat_number, b.seat_number));
    let changedInRow = false;
    for (let i = 0; i < rowSeats.length; i++) {
      const nextSeatNumber = String(i + 1);
      if (rowSeats[i]!.seat_number !== nextSeatNumber) {
        changedInRow = true;
        updates.push({ id: rowSeats[i]!.id, seat_number: nextSeatNumber });
      }
    }
    if (changedInRow || affectedRows.has(rowLabel)) {
      renumberedRows += 1;
    }
  }

  if (updates.length > 0) {
    const updateOps = updates.map((u) =>
      supabase
        .from("event_seats")
        .update({ seat_number: u.seat_number })
        .eq("id", u.id)
        .eq("event_id", eventId)
        .eq("event_section_id", sectionId)
    );
    const updateResults = await Promise.all(updateOps);
    const failed = updateResults.find((r) => r.error);
    if (failed?.error) {
      return NextResponse.json({ error: failed.error.message }, { status: 500 });
    }
  }

  const newCapacity = (remainingSeats ?? []).length;
  const { error: capError } = await supabase
    .from("event_sections")
    .update({ capacity: newCapacity })
    .eq("id", sectionId)
    .eq("event_id", eventId);
  if (capError) {
    return NextResponse.json({ error: capError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    deleted: deletedCount,
    renumbered_rows: renumberedRows,
    new_capacity: newCapacity,
  });
}

