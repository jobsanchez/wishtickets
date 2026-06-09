import { createClient } from "@/lib/supabase/server";
import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { deterministicEncryptedQrForNewSeat } from "@/lib/event-seats/seat-encrypted-qr";

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function generateScanCode(): string {
  const bytes = crypto.randomBytes(4);
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += CHARS[bytes[i]! % 36];
  }
  return s;
}


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
    .select("id, seating_type, section_code")
    .eq("id", sectionId)
    .eq("event_id", eventId)
    .single();

  if (!section) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }
  if (section.seating_type !== "assigned") {
    return NextResponse.json(
      { error: "Row-level add column is only available for assigned seating." },
      { status: 400 }
    );
  }

  const { data: rowSeats, error: rowError } = await supabase
    .from("event_seats")
    .select("seat_number")
    .eq("event_id", eventId)
    .eq("event_section_id", sectionId)
    .eq("row_label", rowLabel);

  if (rowError) {
    return NextResponse.json({ error: rowError.message }, { status: 500 });
  }
  if (!rowSeats || rowSeats.length === 0) {
    return NextResponse.json({ error: "Row not found in this section." }, { status: 404 });
  }

  const sorted = [...rowSeats].sort((a, b) =>
    sortSeatNumbers(a.seat_number ?? "", b.seat_number ?? "")
  );
  const maxSeatNumber = sorted.reduce((max, s) => {
    const n = Number.parseInt(s.seat_number ?? "", 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  const newSeatNumber = String(maxSeatNumber + 1);

  const { data: allSeats, error: allError } = await supabase
    .from("event_seats")
    .select("scan_code")
    .eq("event_id", eventId);
  if (allError) {
    return NextResponse.json({ error: allError.message }, { status: 500 });
  }
  const usedCodes = new Set((allSeats ?? []).map((s) => s.scan_code));
  let scanCode = generateScanCode();
  while (usedCodes.has(scanCode)) {
    scanCode = generateScanCode();
  }

  const { data: eventRow } = await supabase
    .from("events")
    .select("event_code")
    .eq("id", eventId)
    .single();
  const eventCode = (eventRow?.event_code ?? "").trim() || "XXX";
  const sectionCode = (section as { section_code?: string | null }).section_code ?? "000";

  const { error: insertError } = await supabase.from("event_seats").insert({
    event_id: eventId,
    event_section_id: sectionId,
    row_label: rowLabel,
    seat_number: newSeatNumber,
    scan_code: scanCode,
    encrypted_qr: deterministicEncryptedQrForNewSeat({
      eventCode,
      sectionCode,
      rowLabel: rowLabel,
      seatNumber: newSeatNumber,
    }),
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
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
    seat_number: newSeatNumber,
  });
}

