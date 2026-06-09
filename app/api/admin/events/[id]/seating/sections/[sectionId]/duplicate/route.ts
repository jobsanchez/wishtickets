import { createClient } from "@/lib/supabase/server";
import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { randomUUID } from "crypto";
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

async function copyImageToEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  url: string,
  sectionId: string
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const ext = contentType.split("/")[1] || "jpg";
  const path = `${eventId}/sections/${sectionId}/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("seat-map-images").upload(path, buffer, { contentType });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data } = supabase.storage.from("seat-map-images").getPublicUrl(path);
  return data.publicUrl;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  const { id: eventId, sectionId: sourceSectionId } = await params;
  const denied = await forbiddenUnlessAnyEventSection(eventId, ["seating", "selector"]);
  if (denied) return denied;

  const supabase = await createClient();

  const { data: source, error: srcErr } = await supabase
    .from("event_sections")
    .select("*")
    .eq("id", sourceSectionId)
    .eq("event_id", eventId)
    .single();

  if (srcErr || !source) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  const { data: allSections } = await supabase
    .from("event_sections")
    .select("name, section_code")
    .eq("event_id", eventId);

  const existingCodes = new Set(
    (allSections ?? []).map((s) => String(s.section_code ?? "").trim().toUpperCase()).filter(Boolean)
  );

  const baseCode = String(source.section_code ?? "SEC").trim() || "SEC";
  let candidateCode = `${baseCode}-COPY`;
  let codeNum = 1;
  while (existingCodes.has(candidateCode.toUpperCase())) {
    codeNum++;
    candidateCode = `${baseCode}-COPY${codeNum}`;
  }
  existingCodes.add(candidateCode.toUpperCase());

  const existingNames = new Set((allSections ?? []).map((s) => s.name));
  const baseName = source.name;
  let newName = `${baseName} (copy)`;
  let nameNum = 1;
  while (existingNames.has(newName)) {
    nameNum++;
    newName = `${baseName} (copy ${nameNum})`;
  }

  const { data: maxSortRow } = await supabase
    .from("event_sections")
    .select("sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = ((maxSortRow?.sort_order as number | undefined) ?? -1) + 1;

  const insertPayload = {
    event_id: eventId,
    name: newName,
    section_code: candidateCode,
    section_group: source.section_group,
    capacity: 0,
    sort_order: nextSort,
    seating_type: source.seating_type ?? "assigned",
    color: source.color,
    show_seat_selection: source.show_seat_selection ?? true,
    column_direction: source.column_direction,
    seat_layout_scale: source.seat_layout_scale ?? 1,
    seat_layout_opacity: source.seat_layout_opacity ?? 0.5,
    seat_layout_canvas_id: source.seat_layout_canvas_id,
    seat_layout_image_url: null as string | null,
  };

  const { data: newSec, error: insErr } = await supabase
    .from("event_sections")
    .insert(insertPayload)
    .select(
      "id, name, section_code, section_group, capacity, sort_order, seating_type, color, show_seat_selection, column_direction, seat_layout_image_url"
    )
    .single();

  if (insErr || !newSec) {
    return NextResponse.json({ error: insErr?.message ?? "Failed to create section" }, { status: 500 });
  }

  const newSectionId = newSec.id;

  const layoutUrl =
    typeof source.seat_layout_image_url === "string" && source.seat_layout_image_url.length > 0
      ? source.seat_layout_image_url
      : null;
  if (layoutUrl) {
    try {
      const copiedUrl = await copyImageToEvent(supabase, eventId, layoutUrl, newSectionId);
      await supabase.from("event_sections").update({ seat_layout_image_url: copiedUrl }).eq("id", newSectionId);
      (newSec as { seat_layout_image_url?: string | null }).seat_layout_image_url = copiedUrl;
    } catch {
      await supabase.from("event_sections").update({ seat_layout_image_url: layoutUrl }).eq("id", newSectionId);
      (newSec as { seat_layout_image_url?: string | null }).seat_layout_image_url = layoutUrl;
    }
  }

  const PAGE_SIZE = 2000;
  const sourceSeats: Array<{
    row_label: string;
    seat_number: string;
    grid_x: number | null;
    grid_y: number | null;
  }> = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data: page, error: seatsReadErr } = await supabase
      .from("event_seats")
      .select("row_label, seat_number, grid_x, grid_y")
      .eq("event_section_id", sourceSectionId)
      .eq("event_id", eventId)
      .order("row_label")
      .order("seat_number")
      .range(offset, offset + PAGE_SIZE - 1);
    if (seatsReadErr) {
      await supabase.from("event_sections").delete().eq("id", newSectionId).eq("event_id", eventId);
      return NextResponse.json(
        { error: `Failed to read source seats: ${seatsReadErr.message}` },
        { status: 500 }
      );
    }
    const rows = page ?? [];
    sourceSeats.push(...rows);
    hasMore = rows.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  const { data: evForQr } = await supabase.from("events").select("event_code").eq("id", eventId).single();
  const eventCodeForQr = (evForQr?.event_code ?? "").trim() || "XXX";

  const { data: allScanCodes } = await supabase.from("event_seats").select("scan_code").eq("event_id", eventId);
  const usedScanCodes = new Set((allScanCodes ?? []).map((r) => r.scan_code).filter(Boolean) as string[]);

  const newSectionCodeForQr = newSec.section_code ?? "000";

  if (sourceSeats.length === 0) {
    const st = source.seating_type ?? "assigned";
    if (st === "free" || st === "standing") {
      const cap = typeof source.capacity === "number" ? source.capacity : 0;
      await supabase.from("event_sections").update({ capacity: cap }).eq("id", newSectionId).eq("event_id", eventId);
      (newSec as { capacity?: number }).capacity = cap;
    }

    await copyPricing(supabase, eventId, sourceSectionId, newSectionId);

    return NextResponse.json({ section: newSec, seats_copied: 0 });
  }

  type SeatInsert = {
    event_id: string;
    event_section_id: string;
    row_label: string;
    seat_number: string;
    scan_code: string;
    encrypted_qr: string;
    grid_x: number | null;
    grid_y: number | null;
    hold_description: null;
    status: "available";
  };

  const batch: SeatInsert[] = [];

  for (const s of sourceSeats) {
    let scanCode = generateScanCode();
    let attempts = 0;
    while (usedScanCodes.has(scanCode)) {
      scanCode = generateScanCode();
      attempts++;
      if (attempts > 200) {
        return NextResponse.json({ error: "Failed to generate unique scan codes" }, { status: 500 });
      }
    }
    usedScanCodes.add(scanCode);

    const rowLabel = String(s.row_label ?? "");
    const seatNumber = String(s.seat_number ?? "");
    batch.push({
      event_id: eventId,
      event_section_id: newSectionId,
      row_label: rowLabel,
      seat_number: seatNumber,
      scan_code: scanCode,
      encrypted_qr: deterministicEncryptedQrForNewSeat({
        eventCode: eventCodeForQr,
        sectionCode: newSectionCodeForQr,
        rowLabel,
        seatNumber,
      }),
      grid_x: s.grid_x,
      grid_y: s.grid_y,
      hold_description: null,
      status: "available",
    });
  }

  const chunkSize = 500;
  for (let i = 0; i < batch.length; i += chunkSize) {
    const slice = batch.slice(i, i + chunkSize);
    const { error: seatsErr } = await supabase.from("event_seats").insert(slice);
    if (seatsErr) {
      await supabase.from("event_sections").delete().eq("id", newSectionId).eq("event_id", eventId);
      return NextResponse.json({ error: seatsErr.message }, { status: 500 });
    }
  }

  await supabase
    .from("event_sections")
    .update({ capacity: batch.length })
    .eq("id", newSectionId)
    .eq("event_id", eventId);
  (newSec as { capacity?: number }).capacity = batch.length;

  await copyPricing(supabase, eventId, sourceSectionId, newSectionId);

  return NextResponse.json({ section: newSec, seats_copied: batch.length });
}

async function copyPricing(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  sourceSectionId: string,
  newSectionId: string
) {
  const { data: priceRow } = await supabase
    .from("event_prices")
    .select("price_cents")
    .eq("event_id", eventId)
    .eq("section_id", sourceSectionId)
    .maybeSingle();

  if (priceRow && typeof priceRow.price_cents === "number") {
    await supabase.from("event_prices").upsert(
      {
        event_id: eventId,
        section_id: newSectionId,
        price_cents: priceRow.price_cents,
      },
      { onConflict: "event_id,section_id" }
    );
  }

  const { data: ebRow } = await supabase
    .from("early_bird_prices")
    .select("discount_percent")
    .eq("event_id", eventId)
    .eq("section_id", sourceSectionId)
    .maybeSingle();

  if (ebRow && typeof ebRow.discount_percent === "number") {
    await supabase.from("early_bird_prices").upsert(
      {
        event_id: eventId,
        section_id: newSectionId,
        discount_percent: Math.min(100, Math.max(0, ebRow.discount_percent)),
      },
      { onConflict: "event_id,section_id" }
    );
  }
}
