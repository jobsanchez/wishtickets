import { createClient } from "@/lib/supabase/server";
import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { deterministicEncryptedQrForNewSeat } from "@/lib/event-seats/seat-encrypted-qr";


/** Excel-style row label: 0->A, 1->B, ..., 25->Z, 26->AA, ... */
function rowLabel(index: number): string {
  let s = "";
  let n = index;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function generateScanCode(): string {
  const bytes = crypto.randomBytes(4);
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += CHARS[bytes[i]! % 36];
  }
  return s;
}

const generateSchema = z.object({
  event_section_id: z.string().uuid(),
  num_rows: z.number().int().min(1).max(1000).optional(),
  num_columns: z.number().int().min(1).max(1000).optional(),
  capacity: z.number().int().min(1).max(10000).optional(),
  column_direction: z.enum(["left-to-right", "right-to-left"]).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const denied = await forbiddenUnlessAnyEventSection(id, ["seating", "selector"]);
  if (denied) return denied;

  const body = await request.json();
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: section } = await supabase
    .from("event_sections")
    .select("id, seating_type, capacity, section_code")
    .eq("id", parsed.data.event_section_id)
    .eq("event_id", id)
    .single();

  if (!section) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  const seatingType = section.seating_type ?? "assigned";
  const isFreeStanding = seatingType === "free" || seatingType === "standing";

  const seatRows: Array<{
    event_id: string;
    event_section_id: string;
    row_label: string;
    seat_number: string;
    scan_code: string;
    encrypted_qr: string;
  }> = [];

  if (isFreeStanding) {
    const capacity = parsed.data.capacity ?? section.capacity ?? 0;
    if (capacity < 1) {
      return NextResponse.json(
        { error: "Capacity must be at least 1 for free/standing sections" },
        { status: 400 }
      );
    }
    const rowLabelFs = seatingType === "free" ? "FS" : "ST";
    const existingScanCodes = new Set<string>();
    for (let i = 1; i <= capacity; i++) {
      let scanCode = generateScanCode();
      let attempts = 0;
      while (existingScanCodes.has(scanCode)) {
        scanCode = generateScanCode();
        attempts++;
        if (attempts > 100) {
          return NextResponse.json(
            { error: "Failed to generate unique scan codes" },
            { status: 500 }
          );
        }
      }
      existingScanCodes.add(scanCode);

      seatRows.push({
        event_id: id,
        event_section_id: parsed.data.event_section_id,
        row_label: rowLabelFs,
        seat_number: String(i),
        scan_code: scanCode,
        encrypted_qr: "",
      });
    }
  } else {
    const numRows = parsed.data.num_rows ?? 3;
    const numColumns = parsed.data.num_columns ?? 5;
    const direction = parsed.data.column_direction ?? "left-to-right";
    const rows = Array.from({ length: numRows }, (_, i) => rowLabel(i));
    const columns =
      direction === "right-to-left"
        ? Array.from({ length: numColumns }, (_, i) => String(numColumns - i))
        : Array.from({ length: numColumns }, (_, i) => String(i + 1));
    const existingScanCodes = new Set<string>();

    for (const row of rows) {
      for (const col of columns) {
        let scanCode = generateScanCode();
        let attempts = 0;
        while (existingScanCodes.has(scanCode)) {
          scanCode = generateScanCode();
          attempts++;
          if (attempts > 100) {
            return NextResponse.json(
              { error: "Failed to generate unique scan codes" },
              { status: 500 }
            );
          }
        }
        existingScanCodes.add(scanCode);

        seatRows.push({
          event_id: id,
          event_section_id: parsed.data.event_section_id,
          row_label: row,
          seat_number: col,
          scan_code: scanCode,
          encrypted_qr: "",
        });
      }
    }
  }

  const { data: eventRow } = await supabase
    .from("events")
    .select("event_code")
    .eq("id", id)
    .single();

  let eventCodeForQr = (eventRow?.event_code ?? "").trim();
  if (!eventCodeForQr) {
    eventCodeForQr = generateScanCode();
    const { error: updateErr } = await supabase
      .from("events")
      .update({ event_code: eventCodeForQr })
      .eq("id", id);
    if (updateErr) {
      return NextResponse.json(
        { error: "Failed to set event code", details: updateErr.message },
        { status: 500 }
      );
    }
  }

  const sectionCodeForQr = (section as { section_code?: string | null }).section_code ?? "000";
  for (const row of seatRows) {
    row.encrypted_qr = deterministicEncryptedQrForNewSeat({
      eventCode: eventCodeForQr,
      sectionCode: sectionCodeForQr,
      rowLabel: row.row_label,
      seatNumber: row.seat_number,
    });
  }

  const { data: otherSectionSeats } = await supabase
    .from("event_seats")
    .select("scan_code")
    .eq("event_id", id)
    .neq("event_section_id", parsed.data.event_section_id);

  const usedCodes = new Set((otherSectionSeats ?? []).map((s) => s.scan_code));

  for (const row of seatRows) {
    while (usedCodes.has(row.scan_code)) {
      row.scan_code = generateScanCode();
    }
    usedCodes.add(row.scan_code);
  }

  const { error: deleteError } = await supabase
    .from("event_seats")
    .delete()
    .eq("event_section_id", parsed.data.event_section_id)
    .eq("event_id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error } = await supabase.from("event_seats").insert(seatRows);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const batchCount = seatRows.length;
  const direction = parsed.data.column_direction ?? "left-to-right";
  const { error: updateErr } = await supabase
    .from("event_sections")
    .update({
      capacity: batchCount,
      column_direction: direction,
    })
    .eq("id", parsed.data.event_section_id)
    .eq("event_id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, count: batchCount });
}
