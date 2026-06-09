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


/** Excel-style row label: 0->A, 1->B, ..., 26->AA */
function rowLabel(index: number): string {
  let s = "";
  let n = index;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/** Parse row label to index: A->0, B->1, ..., AA->26 */
function rowIndexFromLabel(label: string): number {
  let index = 0;
  for (let i = 0; i < label.length; i++) {
    index = index * 26 + (label.charCodeAt(i) - 64);
  }
  return index - 1;
}

const schema = z.object({
  event_section_id: z.string().uuid(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const denied = await forbiddenUnlessAnyEventSection(id, ["seating", "selector"]);
  if (denied) return denied;

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: section } = await supabase
    .from("event_sections")
    .select("id, section_code")
    .eq("id", parsed.data.event_section_id)
    .eq("event_id", id)
    .single();

  if (!section) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  const { data: existingSeats } = await supabase
    .from("event_seats")
    .select("row_label, seat_number")
    .eq("event_section_id", parsed.data.event_section_id)
    .eq("event_id", id);

  if (!existingSeats || existingSeats.length === 0) {
    return NextResponse.json(
      { error: "Section has no seats. Generate seats first." },
      { status: 400 }
    );
  }

  const rowLabels = [...new Set(existingSeats.map((s) => s.row_label))].sort(
    (a, b) => (a.length !== b.length ? a.length - b.length : a.localeCompare(b))
  );
  const lastRow = rowLabels[rowLabels.length - 1];
  const nextRowIndex = rowIndexFromLabel(lastRow) + 1;
  const newRowLabel = rowLabel(nextRowIndex);

  const columns = [...new Set(existingSeats.map((s) => s.seat_number))].sort(
    (a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    }
  );

  const { data: otherSeats } = await supabase
    .from("event_seats")
    .select("scan_code")
    .eq("event_id", id);
  const usedCodes = new Set((otherSeats ?? []).map((s) => s.scan_code));

  const { data: eventRow } = await supabase
    .from("events")
    .select("event_code")
    .eq("id", id)
    .single();
  const eventCode = (eventRow?.event_code ?? "").trim() || "XXX";
  const sectionCode = (section as { section_code?: string | null }).section_code ?? "000";

  const seatRows = columns.map((col) => {
    let code = generateScanCode();
    while (usedCodes.has(code)) {
      code = generateScanCode();
    }
    usedCodes.add(code);
    return {
      event_id: id,
      event_section_id: parsed.data.event_section_id,
      row_label: newRowLabel,
      seat_number: col,
      scan_code: code,
      encrypted_qr: deterministicEncryptedQrForNewSeat({
        eventCode,
        sectionCode,
        rowLabel: newRowLabel,
        seatNumber: col,
      }),
    };
  });

  const { error } = await supabase.from("event_seats").insert(seatRows);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const newCapacity = existingSeats.length + seatRows.length;
  await supabase
    .from("event_sections")
    .update({ capacity: newCapacity })
    .eq("id", parsed.data.event_section_id)
    .eq("event_id", id);

  return NextResponse.json({
    success: true,
    count: seatRows.length,
    row_label: newRowLabel,
  });
}
