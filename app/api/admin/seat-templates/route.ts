import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";
import { z } from "zod";
import { randomUUID } from "crypto";

async function canManageSeatTemplates() {
  const role = await getProfileRole();
  if (role === "super_admin" || role === "admin") return true;
  const userId = await getCurrentUserId();
  if (!userId) return false;
  return hasCapability(userId, "manage_events") || hasCapability(userId, "manage_seats");
}

async function copyImageToTemplate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  templateId: string,
  url: string,
  subpath: "overall" | "sections",
  index?: number
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const ext = contentType.split("/")[1] || "jpg";
  const path =
    subpath === "sections" && index !== undefined
      ? `templates/${templateId}/${subpath}/${index}/${randomUUID()}.${ext}`
      : `templates/${templateId}/${subpath}/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("seat-map-images")
    .upload(path, buffer, { contentType });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data } = supabase.storage.from("seat-map-images").getPublicUrl(path);
  return data.publicUrl;
}

const postSchema = z.object({
  venue_id: z.string().uuid(),
  custom_name: z.string().min(1).max(200),
  event_id: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const canManage = await canManageSeatTemplates();
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim().toLowerCase() || "";
  const venueId = searchParams.get("venue_id")?.trim() || null;

  const supabase = await createClient();

  let query = supabase
    .from("venue_seat_templates")
    .select("id, venue_id, custom_name, section_count, total_seats, created_at")
    .order("created_at", { ascending: false });

  if (venueId) {
    query = query.eq("venue_id", venueId);
  }

  const { data: templates, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!templates?.length) {
    return NextResponse.json([]);
  }

  const venueIds = [...new Set(templates.map((t) => t.venue_id))];
  const { data: venues } = await supabase
    .from("venues")
    .select("id, name")
    .in("id", venueIds);
  const venueMap = new Map((venues ?? []).map((v) => [v.id, v.name]));

  let results = templates.map((t) => ({
    id: t.id,
    venue_id: t.venue_id,
    venue_name: venueMap.get(t.venue_id) ?? "",
    custom_name: t.custom_name,
    display_name: `${venueMap.get(t.venue_id) ?? ""} - ${t.custom_name}`,
    section_count: t.section_count,
    total_seats: t.total_seats,
    created_at: t.created_at,
  }));

  if (q) {
    results = results.filter(
      (r) =>
        r.display_name.toLowerCase().includes(q) ||
        r.venue_name.toLowerCase().includes(q) ||
        r.custom_name.toLowerCase().includes(q)
    );
  }

  return NextResponse.json(results);
}

export async function POST(request: NextRequest) {
  const canManage = await canManageSeatTemplates();
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { venue_id, custom_name, event_id } = parsed.data;

  const supabase = await createClient();

  const { data: event, error: eventErr } = await supabase.rpc("get_admin_event_by_id", {
    p_id: event_id,
  });

  if (eventErr || !event) {
    return NextResponse.json({ error: "Event not found or access denied" }, { status: 404 });
  }

  if (event.venue_id !== venue_id) {
    return NextResponse.json({ error: "Event venue does not match" }, { status: 400 });
  }

  const { data: venue } = await supabase
    .from("venues")
    .select("id, name")
    .eq("id", venue_id)
    .single();
  if (!venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }

  const { data: sections } = await supabase
    .from("event_sections")
    .select("id, name, section_code, capacity, sort_order, seating_type, color, show_seat_selection, seat_layout_image_url, seat_layout_scale, seat_layout_opacity, column_direction")
    .eq("event_id", event_id)
    .order("sort_order")
    .order("name");

  const allSeats: Array<{
    event_section_id: string;
    row_label: string;
    seat_number: string;
    grid_x: number | null;
    grid_y: number | null;
  }> = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data: page } = await supabase
      .from("event_seats")
      .select("event_section_id, row_label, seat_number, grid_x, grid_y")
      .eq("event_id", event_id)
      .order("event_section_id")
      .order("row_label")
      .order("seat_number")
      .range(offset, offset + PAGE_SIZE - 1);
    const rows = page ?? [];
    allSeats.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const { data: eventRow } = await supabase
    .from("events")
    .select("seat_map_image_urls, early_bird_starts_at, early_bird_ends_at")
    .eq("id", event_id)
    .single();

  const [{ data: prices }, { data: earlyBird }] = await Promise.all([
    supabase.from("event_prices").select("section_id, price_cents").eq("event_id", event_id),
    supabase.from("early_bird_prices").select("section_id, discount_percent").eq("event_id", event_id),
  ]);

  const sectionIdToIndex = new Map<string, number>();
  (sections ?? []).forEach((s, i) => sectionIdToIndex.set(s.id, i));

  const templateId = randomUUID();
  const payloadSections: Array<{
    name: string;
    section_code: string | null;
    seating_type: string;
    color: string | null;
    show_seat_selection: boolean;
    column_direction: string | null;
    seat_layout_image_url: string | null;
    seat_layout_scale: number;
    seat_layout_opacity: number;
    capacity: number;
    seats: Array<{ row_label: string; seat_number: string; grid_x: number | null; grid_y: number | null }>;
  }> = [];
  let totalSeats = 0;

  for (let i = 0; i < (sections ?? []).length; i++) {
    const sec = sections![i];
    const secSeats = allSeats
      .filter((s) => s.event_section_id === sec.id)
      .map((s) => ({
        row_label: s.row_label,
        seat_number: s.seat_number,
        grid_x: s.grid_x,
        grid_y: s.grid_y,
      }));
    totalSeats += secSeats.length;

    let newLayoutUrl = sec.seat_layout_image_url ?? null;
    if (sec.seat_layout_image_url) {
      try {
        newLayoutUrl = await copyImageToTemplate(
          supabase,
          templateId,
          sec.seat_layout_image_url,
          "sections",
          i
        );
      } catch {
        newLayoutUrl = sec.seat_layout_image_url;
      }
    }

    payloadSections.push({
      name: sec.name,
      section_code: sec.section_code ?? null,
      seating_type: sec.seating_type ?? "assigned",
      color: sec.color ?? null,
      show_seat_selection: sec.show_seat_selection ?? true,
      column_direction: sec.column_direction ?? null,
      seat_layout_image_url: newLayoutUrl,
      seat_layout_scale: sec.seat_layout_scale ?? 1,
      seat_layout_opacity: sec.seat_layout_opacity ?? 0.5,
      capacity: secSeats.length > 0 ? secSeats.length : (sec.capacity ?? 0),
      seats: secSeats,
    });
  }

  const seatMapUrls = eventRow?.seat_map_image_urls ?? [];
  const newSeatMapUrls: string[] = [];
  for (let i = 0; i < seatMapUrls.length; i++) {
    const url = seatMapUrls[i];
    if (url && typeof url === "string") {
      try {
        const newUrl = await copyImageToTemplate(
          supabase,
          templateId,
          url,
          "overall"
        );
        newSeatMapUrls.push(newUrl);
      } catch {
        newSeatMapUrls.push(url);
      }
    }
  }

  const payloadPrices = (prices ?? []).map((p) => {
    const idx = sectionIdToIndex.get(p.section_id);
    return idx !== undefined ? { section_index: idx, price_cents: p.price_cents } : null;
  }).filter(Boolean) as Array<{ section_index: number; price_cents: number }>;

  const payloadEarlyBird = (earlyBird ?? []).map((eb) => {
    const idx = sectionIdToIndex.get(eb.section_id);
    return idx !== undefined ? { section_index: idx, discount_percent: eb.discount_percent ?? 0 } : null;
  }).filter(Boolean) as Array<{ section_index: number; discount_percent: number }>;

  const payload = {
    seat_map_image_urls: newSeatMapUrls,
    sections: payloadSections,
    prices: payloadPrices,
    early_bird: payloadEarlyBird,
    early_bird_starts_at: eventRow?.early_bird_starts_at ?? null,
    early_bird_ends_at: eventRow?.early_bird_ends_at ?? null,
  };

  const { data: { user } } = await supabase.auth.getUser();

  const { data: inserted, error: insertErr } = await supabase
    .from("venue_seat_templates")
    .insert({
      id: templateId,
      venue_id,
      custom_name,
      created_by: user?.id ?? null,
      section_count: payloadSections.length,
      total_seats: totalSeats,
      payload,
    })
    .select("id")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    id: inserted.id,
    name: `${venue.name} - ${custom_name}`,
  });
}
