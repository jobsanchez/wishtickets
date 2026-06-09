import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";
import { isFreeStandingSeatingType } from "@/lib/print-tickets/is-free-standing-section";
import { cappedFreeStandingSlotCount } from "@/lib/print-tickets/free-standing-slot-cap";
import { buildVirtualPrintSlotSeatId } from "@/lib/print-tickets/virtual-print-slot-id";

export const dynamic = "force-dynamic";
/** Large events (many sections / seats) need more than the default serverless budget on Netlify. */
export const maxDuration = 120;

/** PostgREST returns at most 1000 rows per request unless paginated. */
const PRINT_TICKETS_PAGE_SIZE = 1000;
const EVENT_SEATS_PAGE_SIZE = 1000;
/** Hard stop to avoid runaway loops if data is pathological. */
const PRINT_TICKETS_MAX_ROWS = 500_000;
const EVENT_SEATS_MAX_ROWS = 2_000_000;

type PrintTicketListRow = {
  id: string;
  event_section_id: string;
  event_seat_id: string | null;
  ticket_image_url: string | null;
  section_slot_index?: number | null;
};

type EventSectionRow = {
  id: string;
  name: string;
  section_code: string | null;
  section_group: string | null;
  color: string | null;
  seating_type: string;
  capacity: number | null;
};

type SeatItem = {
  id: string;
  row_label: string;
  seat_number: string;
  printTicket?: { id: string; ticket_image_url: string | null };
};

type SectionItem = {
  id: string;
  name: string;
  section_code: string | null;
  section_group: string | null;
  color: string | null;
  seating_type: string;
  section_capacity: number | null;
  seats: SeatItem[];
  summaryCounts?: { seatCount: number; generatedCount: number };
};

type EventSeatRow = {
  id: string;
  row_label: string | null;
  seat_number: string | null;
  event_section_id: string;
};

async function fetchAllPrintTicketsForEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  sectionId?: string
): Promise<{ rows: PrintTicketListRow[]; error: { message: string } | null }> {
  const rows: PrintTicketListRow[] = [];
  let from = 0;
  while (from < PRINT_TICKETS_MAX_ROWS) {
    let q = supabase
      .from("print_tickets")
      .select("id, event_section_id, event_seat_id, ticket_image_url, section_slot_index")
      .eq("event_id", eventId)
      .order("id", { ascending: true })
      .range(from, from + PRINT_TICKETS_PAGE_SIZE - 1);
    if (sectionId) q = q.eq("event_section_id", sectionId);
    const { data, error } = await q;
    if (error) {
      return { rows: [], error: { message: error.message } };
    }
    const chunk = (data ?? []) as PrintTicketListRow[];
    rows.push(...chunk);
    if (chunk.length < PRINT_TICKETS_PAGE_SIZE) break;
    from += PRINT_TICKETS_PAGE_SIZE;
  }
  return { rows, error: null };
}

function buildPrintTicketMaps(printTickets: PrintTicketListRow[]) {
  const ptBySeat = new Map<string, { id: string; ticket_image_url: string | null }>();
  const ptsBySectionNoSeat = new Map<
    string,
    Array<{ id: string; ticket_image_url: string | null; section_slot_index: number }>
  >();
  const generatedCountBySection = new Map<string, number>();

  for (const pt of printTickets ?? []) {
    const hasImage =
      typeof pt.ticket_image_url === "string" && pt.ticket_image_url.trim().length > 0;
    if (hasImage) {
      generatedCountBySection.set(
        pt.event_section_id,
        (generatedCountBySection.get(pt.event_section_id) ?? 0) + 1
      );
    }
    const entry = {
      id: pt.id,
      ticket_image_url: pt.ticket_image_url as string | null,
      section_slot_index: Math.max(
        0,
        Math.floor((pt as { section_slot_index?: number }).section_slot_index ?? 0)
      ),
    };
    if (pt.event_seat_id) {
      ptBySeat.set(pt.event_seat_id, { id: entry.id, ticket_image_url: entry.ticket_image_url });
    } else {
      const sid = pt.event_section_id;
      if (!ptsBySectionNoSeat.has(sid)) ptsBySectionNoSeat.set(sid, []);
      ptsBySectionNoSeat.get(sid)!.push(entry);
    }
  }
  for (const arr of ptsBySectionNoSeat.values()) {
    arr.sort((a, b) => a.section_slot_index - b.section_slot_index);
  }
  return { ptBySeat, ptsBySectionNoSeat, generatedCountBySection };
}

async function fetchAssignedSeatCountsBySection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assignedSectionIds: string[]
): Promise<{ map: Map<string, number>; error: { message: string } | null }> {
  const map = new Map<string, number>();
  if (assignedSectionIds.length === 0) return { map, error: null };

  let from = 0;
  while (from < EVENT_SEATS_MAX_ROWS) {
    const { data, error } = await supabase
      .from("event_seats")
      .select("event_section_id")
      .in("event_section_id", assignedSectionIds)
      .order("id", { ascending: true })
      .range(from, from + EVENT_SEATS_PAGE_SIZE - 1);
    if (error) {
      return { map: new Map(), error: { message: error.message } };
    }
    const chunk = (data ?? []) as { event_section_id: string }[];
    for (const row of chunk) {
      const sid = row.event_section_id;
      if (!sid) continue;
      map.set(sid, (map.get(sid) ?? 0) + 1);
    }
    if (chunk.length < EVENT_SEATS_PAGE_SIZE) break;
    from += EVENT_SEATS_PAGE_SIZE;
  }
  return { map, error: null };
}

async function fetchAssignedSeatsFullForSections(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assignedSectionIds: string[]
): Promise<{ bySection: Map<string, EventSeatRow[]>; error: { message: string } | null }> {
  const seatsBySectionId = new Map<string, EventSeatRow[]>();
  if (assignedSectionIds.length === 0) return { bySection: seatsBySectionId, error: null };

  let from = 0;
  while (from < EVENT_SEATS_MAX_ROWS) {
    const { data, error } = await supabase
      .from("event_seats")
      .select("id, row_label, seat_number, event_section_id")
      .in("event_section_id", assignedSectionIds)
      .order("id", { ascending: true })
      .range(from, from + EVENT_SEATS_PAGE_SIZE - 1);
    if (error) {
      return { bySection: new Map(), error: { message: error.message } };
    }
    const chunk = (data ?? []) as EventSeatRow[];
    for (const es of chunk) {
      const sid = es.event_section_id;
      if (!sid) continue;
      let bucket = seatsBySectionId.get(sid);
      if (!bucket) {
        bucket = [];
        seatsBySectionId.set(sid, bucket);
      }
      bucket.push(es);
    }
    if (chunk.length < EVENT_SEATS_PAGE_SIZE) break;
    from += EVENT_SEATS_PAGE_SIZE;
  }
  for (const arr of seatsBySectionId.values()) {
    arr.sort((a, b) => {
      const r = (a.row_label ?? "").localeCompare(b.row_label ?? "", undefined, {
        numeric: true,
      });
      if (r !== 0) return r;
      return (a.seat_number ?? "").localeCompare(b.seat_number ?? "", undefined, {
        numeric: true,
      });
    });
  }
  return { bySection: seatsBySectionId, error: null };
}

function buildSectionItem(
  sec: EventSectionRow,
  ptBySeat: Map<string, { id: string; ticket_image_url: string | null }>,
  ptsBySectionNoSeat: Map<
    string,
    Array<{ id: string; ticket_image_url: string | null; section_slot_index: number }>
  >,
  seatsBySectionId: Map<string, EventSeatRow[]>
): SectionItem {
  const isAssigned = !isFreeStandingSeatingType(sec.seating_type);

  let seats: SeatItem[] = [];
  if (isAssigned) {
    const eventSeats = seatsBySectionId.get(sec.id) ?? [];
    seats = eventSeats.map((es) => {
      const pt = ptBySeat.get(es.id);
      return {
        id: es.id,
        row_label: es.row_label ?? "",
        seat_number: es.seat_number ?? "",
        ...(pt && { printTicket: pt }),
      };
    });
  } else {
    const slotRows = ptsBySectionNoSeat.get(sec.id) ?? [];
    const ptBySlot = new Map<
      number,
      { id: string; ticket_image_url: string | null; section_slot_index: number }
    >();
    for (const pt of slotRows) {
      const slotIdx = Math.max(1, Math.floor(pt.section_slot_index));
      if (!ptBySlot.has(slotIdx)) ptBySlot.set(slotIdx, pt);
    }
    const cap = sec.capacity;
    const capNum = typeof cap === "number" && Number.isFinite(cap) ? Math.floor(cap) : 0;
    const n = cappedFreeStandingSlotCount(capNum);
    seats = [];
    for (let slot = 1; slot <= n; slot++) {
      const pt = ptBySlot.get(slot);
      if (pt) {
        seats.push({
          id: pt.id,
          row_label: "Ticket",
          seat_number: String(slot),
          printTicket: { id: pt.id, ticket_image_url: pt.ticket_image_url },
        });
      } else {
        seats.push({
          id: buildVirtualPrintSlotSeatId(sec.id, slot),
          row_label: "Ticket",
          seat_number: String(slot),
        });
      }
    }
  }

  const cap = sec.capacity;
  const section_capacity =
    typeof cap === "number" && Number.isFinite(cap) ? Math.floor(cap) : null;

  return {
    id: sec.id,
    name: sec.name,
    section_code: sec.section_code ?? null,
    section_group: sec.section_group ?? null,
    color: sec.color ?? null,
    seating_type: sec.seating_type ?? "assigned",
    section_capacity: isAssigned ? null : section_capacity,
    seats,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const denied = await forbiddenUnlessEventSection(eventId, "printTickets");
  if (denied) return denied;

  const url = request.nextUrl;
  const summaryOnly =
    url.searchParams.get("summary") === "1" ||
    url.searchParams.get("summary") === "true";
  const sectionIdFilter = (url.searchParams.get("sectionId") ?? "").trim();

  const supabase = await createClient();

  let sectionsQuery = supabase
    .from("event_sections")
    .select("id, name, section_code, section_group, color, seating_type, capacity")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  if (sectionIdFilter) {
    sectionsQuery = sectionsQuery.eq("id", sectionIdFilter);
  }

  const { data: sections, error: sectionsError } = await sectionsQuery;

  if (sectionsError) {
    return NextResponse.json({ error: sectionsError.message }, { status: 500 });
  }

  if (sectionIdFilter && (!sections || sections.length === 0)) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  const sectionRows = (sections ?? []) as EventSectionRow[];

  const { rows: printTicketsRaw, error: ptError } = await fetchAllPrintTicketsForEvent(
    supabase,
    eventId,
    sectionIdFilter || undefined
  );

  const printTickets = ptError ? [] : printTicketsRaw;
  const printTicketsWarning = ptError
    ? `Print ticket rows could not be loaded (${ptError.message}). Apply pending DB migrations or check RLS.`
    : undefined;

  const { ptBySeat, ptsBySectionNoSeat, generatedCountBySection } =
    buildPrintTicketMaps(printTickets);

  const assignedSectionIds = sectionRows
    .filter((s) => !isFreeStandingSeatingType(s.seating_type))
    .map((s) => s.id);

  if (summaryOnly) {
    const { map: seatCounts, error: countErr } = await fetchAssignedSeatCountsBySection(
      supabase,
      assignedSectionIds
    );
    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }

    const result: SectionItem[] = sectionRows.map((sec) => {
      const isAssigned = !isFreeStandingSeatingType(sec.seating_type);
      const cap = sec.capacity;
      const capNum = typeof cap === "number" && Number.isFinite(cap) ? Math.floor(cap) : 0;
      const seatCount = isAssigned
        ? (seatCounts.get(sec.id) ?? 0)
        : cappedFreeStandingSlotCount(capNum);
      const generatedCount = generatedCountBySection.get(sec.id) ?? 0;
      return {
        id: sec.id,
        name: sec.name,
        section_code: sec.section_code ?? null,
        section_group: sec.section_group ?? null,
        color: sec.color ?? null,
        seating_type: sec.seating_type ?? "assigned",
        section_capacity: isAssigned ? null : capNum,
        seats: [],
        summaryCounts: { seatCount, generatedCount },
      };
    });

    return NextResponse.json({
      summary: true as const,
      sections: result,
      ...(printTicketsWarning ? { warning: printTicketsWarning } : {}),
    });
  }

  const { bySection: seatsBySectionId, error: seatsErr } =
    await fetchAssignedSeatsFullForSections(supabase, assignedSectionIds);
  if (seatsErr) {
    return NextResponse.json({ error: seatsErr.message }, { status: 500 });
  }

  const result: SectionItem[] = sectionRows.map((sec) =>
    buildSectionItem(sec, ptBySeat, ptsBySectionNoSeat, seatsBySectionId)
  );

  return NextResponse.json({
    sections: result,
    ...(printTicketsWarning ? { warning: printTicketsWarning } : {}),
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const denied = await forbiddenUnlessEventSection(eventId, "printTickets");
  if (denied) return denied;

  const supabase = await createClient();

  const { data: deleted, error } = await supabase
    .from("print_tickets")
    .delete()
    .eq("event_id", eventId)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: deleted?.length ?? 0 });
}
