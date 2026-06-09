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
  subpath: "overall" | "sections",
  sectionId?: string
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const ext = contentType.split("/")[1] || "jpg";
  const path =
    subpath === "sections" && sectionId
      ? `${eventId}/sections/${sectionId}/${randomUUID()}.${ext}`
      : `${eventId}/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("seat-map-images")
    .upload(path, buffer, { contentType });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data } = supabase.storage.from("seat-map-images").getPublicUrl(path);
  return data.publicUrl;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const denied = await forbiddenUnlessAnyEventSection(eventId, ["seating", "selector"]);
  if (denied) return denied;

  const body = await request.json();
  const templateId = body?.template_id;
  if (!templateId || typeof templateId !== "string") {
    return NextResponse.json({ error: "template_id required" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const confirm = searchParams.get("confirm") === "1";

  const supabase = await createClient();

  const { data: event, error: eventErr } = await supabase.rpc("get_admin_event_by_id", {
    p_id: eventId,
  });

  if (eventErr || !event) {
    return NextResponse.json({ error: "Event not found or access denied" }, { status: 404 });
  }

  if (!event.venue_id) {
    return NextResponse.json({ error: "Event has no venue" }, { status: 400 });
  }

  const { data: template, error: templateErr } = await supabase
    .from("venue_seat_templates")
    .select("id, payload")
    .eq("id", templateId)
    .single();

  if (templateErr || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const payload = template.payload as {
    seat_map_image_urls?: string[];
    sections?: Array<{
      name: string;
      section_code: string | null;
      seating_type: string;
      color: string | null;
      show_seat_selection: boolean;
      column_direction: string | null;
      seat_layout_image_url: string | null;
      seat_layout_scale: number;
      seat_layout_opacity: number;
      capacity?: number;
      seats: Array<{ row_label: string; seat_number: string; grid_x: number | null; grid_y: number | null }>;
    }>;
    prices?: Array<{ section_index: number; price_cents: number }>;
    early_bird?: Array<{ section_index: number; discount_percent?: number; price_cents?: number }>;
    early_bird_starts_at: string | null;
    early_bird_ends_at: string | null;
  };

  const sections = payload.sections ?? [];
  if (sections.length === 0) {
    return NextResponse.json({ error: "Template has no sections" }, { status: 400 });
  }

  const { count: existingSectionCount } = await supabase
    .from("event_sections")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);

  const { count: existingSeatCount } = await supabase
    .from("event_seats")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);

  const hasExisting = (existingSectionCount ?? 0) > 0 || (existingSeatCount ?? 0) > 0;

  if (hasExisting && !confirm) {
    return NextResponse.json({
      requires_confirmation: true,
      existing_section_count: existingSectionCount ?? 0,
      existing_seat_count: existingSeatCount ?? 0,
    });
  }

  await supabase.from("event_prices").delete().eq("event_id", eventId);
  await supabase.from("early_bird_prices").delete().eq("event_id", eventId);
  await supabase.from("event_seats").delete().eq("event_id", eventId);
  await supabase.from("event_sections").delete().eq("event_id", eventId);

  const sectionIdMap: string[] = [];
  const usedScanCodes = new Set<string>();

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const seatCount = sec.seats?.length ?? 0;
    const cap = seatCount > 0 ? seatCount : (sec.capacity ?? 0);
    const { data: newSec, error: secErr } = await supabase
      .from("event_sections")
      .insert({
        event_id: eventId,
        name: sec.name,
        section_code: sec.section_code,
        capacity: cap,
        sort_order: i,
        seating_type: sec.seating_type ?? "assigned",
        color: sec.color,
        show_seat_selection: sec.show_seat_selection ?? true,
        column_direction: sec.column_direction,
        seat_layout_scale: sec.seat_layout_scale ?? 1,
        seat_layout_opacity: sec.seat_layout_opacity ?? 0.5,
      })
      .select("id")
      .single();

    if (secErr || !newSec) {
      return NextResponse.json({ error: secErr?.message ?? "Failed to create section" }, { status: 500 });
    }
    sectionIdMap.push(newSec.id);

    if (sec.seat_layout_image_url) {
      try {
        const newUrl = await copyImageToEvent(
          supabase,
          eventId,
          sec.seat_layout_image_url,
          "sections",
          newSec.id
        );
        await supabase
          .from("event_sections")
          .update({ seat_layout_image_url: newUrl })
          .eq("id", newSec.id);
      } catch {
        await supabase
          .from("event_sections")
          .update({ seat_layout_image_url: sec.seat_layout_image_url })
          .eq("id", newSec.id);
      }
    }
  }

  const seatMapUrls = payload.seat_map_image_urls ?? [];
  const newSeatMapUrls: string[] = [];
  for (const url of seatMapUrls) {
    if (url && typeof url === "string") {
      try {
        const newUrl = await copyImageToEvent(supabase, eventId, url, "overall");
        newSeatMapUrls.push(newUrl);
      } catch {
        newSeatMapUrls.push(url);
      }
    }
  }

  await supabase
    .from("events")
    .update({
      seat_map_image_urls: newSeatMapUrls,
      early_bird_starts_at: payload.early_bird_starts_at,
      early_bird_ends_at: payload.early_bird_ends_at,
    })
    .eq("id", eventId);

  const { data: evForQr } = await supabase
    .from("events")
    .select("event_code")
    .eq("id", eventId)
    .single();
  const eventCodeForQr = (evForQr?.event_code ?? "").trim() || "XXX";

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const newSectionId = sectionIdMap[i];
    const seats = sec.seats ?? [];
    if (seats.length === 0) {
      const freeCap = sec.capacity ?? 0;
      if (freeCap > 0) {
        await supabase
          .from("event_sections")
          .update({ capacity: freeCap })
          .eq("id", newSectionId);
      }
      continue;
    }

    const sectionCodeForQr = sec.section_code ?? "000";
    const seatRows = seats.map((s) => {
      let code = generateScanCode();
      while (usedScanCodes.has(code)) code = generateScanCode();
      usedScanCodes.add(code);
      const rowLabel = s.row_label ?? "";
      const seatNumber = String(s.seat_number ?? "");
      return {
        event_id: eventId,
        event_section_id: newSectionId,
        row_label: rowLabel,
        seat_number: seatNumber,
        scan_code: code,
        encrypted_qr: deterministicEncryptedQrForNewSeat({
          eventCode: eventCodeForQr,
          sectionCode: sectionCodeForQr,
          rowLabel,
          seatNumber,
        }),
        grid_x: s.grid_x,
        grid_y: s.grid_y,
      };
    });

    const { error: seatsErr } = await supabase.from("event_seats").insert(seatRows);
    if (seatsErr) {
      return NextResponse.json({ error: seatsErr.message }, { status: 500 });
    }

    await supabase
      .from("event_sections")
      .update({ capacity: seats.length })
      .eq("id", newSectionId)
      .eq("event_id", eventId);
  }

  const prices = payload.prices ?? [];
  for (const p of prices) {
    const sectionId = sectionIdMap[p.section_index];
    if (!sectionId) continue;
    await supabase.from("event_prices").upsert(
      {
        event_id: eventId,
        section_id: sectionId,
        price_cents: p.price_cents,
      },
      { onConflict: "event_id,section_id" }
    );
  }

  const earlyBird = payload.early_bird ?? [];
  const priceByIndex = new Map((payload.prices ?? []).map((p) => [p.section_index, p.price_cents]));
  if (earlyBird.length > 0 && payload.early_bird_starts_at && payload.early_bird_ends_at) {
    for (const eb of earlyBird) {
      const sectionId = sectionIdMap[eb.section_index];
      if (!sectionId) continue;
      let discountPercent: number;
      if (eb.discount_percent != null) {
        discountPercent = Math.min(100, Math.max(0, eb.discount_percent));
      } else if (eb.price_cents != null) {
        const base = priceByIndex.get(eb.section_index) ?? 50000;
        discountPercent = base > 0
          ? Math.min(100, Math.max(0, Math.round(100 * (1 - eb.price_cents / base))))
          : 0;
      } else {
        continue;
      }
      await supabase.from("early_bird_prices").upsert(
        {
          event_id: eventId,
          section_id: sectionId,
          discount_percent: discountPercent,
        },
        { onConflict: "event_id,section_id" }
      );
    }
  }

  return NextResponse.json({ success: true });
}
