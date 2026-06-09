import { createClient } from "@/lib/supabase/server";
import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  event_section_id: z.string().uuid(),
  row_label: z.string().min(1),
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
  const rowLabel = parsed.data.row_label.trim();
  const supabase = await createClient();

  const { data: section } = await supabase
    .from("event_sections")
    .select("id, seating_type")
    .eq("id", sectionId)
    .eq("event_id", eventId)
    .single();

  if (!section) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }
  if (section.seating_type !== "assigned") {
    return NextResponse.json(
      { error: "Row-level remove column is only available for assigned seating." },
      { status: 400 }
    );
  }

  const { data: rowSeats, error: rowError } = await supabase
    .from("event_seats")
    .select("id, seat_number")
    .eq("event_id", eventId)
    .eq("event_section_id", sectionId)
    .eq("row_label", rowLabel);

  if (rowError) {
    return NextResponse.json({ error: rowError.message }, { status: 500 });
  }
  if (!rowSeats || rowSeats.length === 0) {
    return NextResponse.json({ error: "Row not found in this section." }, { status: 404 });
  }
  if (rowSeats.length <= 1) {
    return NextResponse.json(
      { error: "Cannot remove columns — keep at least one seat in each row." },
      { status: 400 }
    );
  }

  const sorted = [...rowSeats].sort((a, b) =>
    sortSeatNumbers(String(a.seat_number ?? ""), String(b.seat_number ?? ""))
  );
  const toRemove = sorted[sorted.length - 1];
  if (!toRemove?.id) {
    return NextResponse.json({ error: "Failed to resolve seat to remove" }, { status: 500 });
  }

  const { error: deleteError } = await supabase
    .from("event_seats")
    .delete()
    .eq("id", toRemove.id)
    .eq("event_id", eventId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { count: seatCount, error: countError } = await supabase
    .from("event_seats")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("event_section_id", sectionId);

  if (!countError) {
    await supabase
      .from("event_sections")
      .update({ capacity: seatCount ?? 0 })
      .eq("id", sectionId)
      .eq("event_id", eventId);
  }

  return NextResponse.json({
    success: true,
    count: 1,
    row_label: rowLabel,
    seat_number: toRemove.seat_number,
  });
}
