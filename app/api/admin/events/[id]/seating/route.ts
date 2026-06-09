import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const denied = await forbiddenUnlessAnyEventSection(id, ["seating", "selector"]);
  if (denied) return denied;
  const includeSeatsParam = request.nextUrl.searchParams.get("includeSeats");
  const includeSeats =
    includeSeatsParam == null ||
    (includeSeatsParam !== "0" && includeSeatsParam.toLowerCase() !== "false");
  const sectionIdsParam = request.nextUrl.searchParams.get("sectionIds");
  const sectionIdsFilter = new Set(
    (sectionIdsParam ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
  );

  const supabase = await createClient();

  const { data: sections } = await supabase
    .from("event_sections")
    .select("id, name, section_code, section_group, capacity, sort_order, seating_type, color, show_seat_selection, seat_layout_image_url, seat_layout_scale, seat_layout_opacity, seat_layout_canvas_id, column_direction")
    .eq("event_id", id)
    .order("sort_order")
    .order("name");

  const { data: canvases } = await supabase
    .from("event_layout_canvases")
    .select("id, event_id, image_url, scale, opacity, sort_order")
    .eq("event_id", id)
    .order("sort_order")
    .order("id");

  const PAGE_SIZE = 1000;
  const allSeats: Array<{
    id: string;
    event_section_id: string;
    row_label: string;
    seat_number: string;
    grid_x: number | null;
    grid_y: number | null;
    hold_description: string | null;
  }> = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: page } = await supabase
      .from("event_seats")
      .select("id, event_section_id, row_label, seat_number, grid_x, grid_y, hold_description")
      .eq("event_id", id)
      .order("event_section_id")
      .order("row_label")
      .order("seat_number")
      .range(offset, offset + PAGE_SIZE - 1);

    const rows = page ?? [];
    allSeats.push(...rows);
    hasMore = rows.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  const { data: eventRow } = await supabase
    .from("events")
    .select("seat_layout_image_url, seat_layout_scale, seat_layout_opacity")
    .eq("id", id)
    .single();

  // Compute remaining seats per section (total - booked - reserved - admin reserved)
  const remainingBySection = new Map<string, number>();
  let soldSet = new Set<string>();
  let reservedSet = new Set<string>();
  let holdSet = new Set<string>();

  if ((sections ?? []).length > 0) {
    const { data: bookingIds } = await supabase
      .from("bookings")
      .select("id")
      .eq("event_id", id)
      .eq("status", "confirmed");
    const bidList = (bookingIds ?? []).map((b) => b.id);

    const { data: cartIds } = await supabase
      .from("reservation_carts")
      .select("id")
      .eq("event_id", id)
      .gt("expires_at", new Date().toISOString());
    const cidList = (cartIds ?? []).map((c) => c.id);

    let bookedSeatIds: string[] = [];
    if (bidList.length > 0) {
      const { data: tk } = await supabase
        .from("tickets")
        .select("seat_id")
        .in("booking_id", bidList)
        .not("seat_id", "is", null);
      bookedSeatIds = (tk ?? []).map((t) => t.seat_id as string);
    }

    let reservedSeatIds: string[] = [];
    if (cidList.length > 0) {
      const { data: ri } = await supabase
        .from("reservation_items")
        .select("seat_id")
        .in("cart_id", cidList)
        .not("seat_id", "is", null);
      reservedSeatIds = (ri ?? []).map((r) => r.seat_id as string);
    }

    const { data: adminReservedSeats } = await supabase
      .from("event_seats")
      .select("id")
      .eq("event_id", id)
      .or("assignment_id.not.is.null,status.eq.reserved,status.eq.hold");
    const adminReservedIds = new Set((adminReservedSeats ?? []).map((s) => s.id));

    const { data: holdSeatsFromDb } = await supabase
      .from("event_seats")
      .select("id")
      .eq("event_id", id)
      .eq("status", "hold");
    holdSet = new Set((holdSeatsFromDb ?? []).map((s) => s.id));

    const { data: soldSeatsFromDb } = await supabase
      .from("event_seats")
      .select("id")
      .eq("event_id", id)
      .eq("status", "sold");
    const soldSeatIdsFromDb = new Set((soldSeatsFromDb ?? []).map((s) => s.id));

    soldSet = new Set([
      ...bookedSeatIds,
      ...Array.from(soldSeatIdsFromDb),
    ]);
    reservedSet = new Set([...reservedSeatIds, ...adminReservedIds]);
    const taken = new Set([...soldSet, ...reservedSet, ...holdSet]);

    for (const sec of sections ?? []) {
      const sectionSeats = allSeats.filter((s) => s.event_section_id === sec.id);
      const total = sectionSeats.length || (sec.capacity ?? 0);
      const takenCount = sectionSeats.length > 0
        ? sectionSeats.filter((s) => taken.has(s.id)).length
        : 0;
      remainingBySection.set(sec.id, Math.max(0, total - takenCount));
    }
  }

  const sectionsWithRemaining = (sections ?? []).map((sec) => ({
    ...sec,
    remaining: remainingBySection.get(sec.id) ?? (sec.capacity ?? 0),
  }));

  type SeatStatus = "available" | "reserved" | "sold" | "hold";
  const seatsWithStatus = allSeats.map((seat) => {
    let status: SeatStatus = "available";
    if (soldSet.has(seat.id)) status = "sold";
    else if (holdSet.has(seat.id)) status = "hold";
    else if (reservedSet.has(seat.id)) status = "reserved";
    return { ...seat, status };
  });
  const seatsPayload = includeSeats
    ? seatsWithStatus.filter((seat) =>
        sectionIdsFilter.size > 0 ? sectionIdsFilter.has(seat.event_section_id) : true
      )
    : [];

  const sectionIdsByCanvas = new Map<string, string[]>();
  for (const sec of sectionsWithRemaining) {
    const cid = (sec as { seat_layout_canvas_id?: string }).seat_layout_canvas_id;
    if (cid) {
      const list = sectionIdsByCanvas.get(cid) ?? [];
      list.push(sec.id);
      sectionIdsByCanvas.set(cid, list);
    }
  }
  const canvasesWithSections = (canvases ?? []).map((c) => ({
    ...c,
    sectionIds: sectionIdsByCanvas.get(c.id) ?? [],
  }));

  return NextResponse.json({
    sections: sectionsWithRemaining,
    seats: seatsPayload,
    canvases: canvasesWithSections,
    layout: {
      imageUrl: eventRow?.seat_layout_image_url ?? null,
      scale: eventRow?.seat_layout_scale ?? 1,
      opacity: eventRow?.seat_layout_opacity ?? 0.5,
    },
  });
}
