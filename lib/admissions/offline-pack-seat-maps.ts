/**
 * Batched seat/section resolution for admissions offline pack. Keeps `GET /api/admissions/offline-pack`
 * within serverless time limits; replacing this with per-ticket DB calls will reintroduce gateway 502s
 * on large events. See `buildAdmissionsOfflinePack` header.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SeatInfo } from "@/lib/admissions/admission-scan-server";

const ID_CHUNK = 150;

type EventSectionRow = {
  name: string | null;
  section_code: string | null;
  section_group: string | null;
  seating_type: string | null;
};

type EventSeatRow = {
  id: string;
  row_label: string | null;
  seat_number: string | null;
  event_section_id: string | null;
};

type LegacySeatRow = {
  id: string;
  row_label: string | null;
  seat_number: string | null;
  section_id: string | null;
};

type VenueSectionRow = {
  name: string | null;
  section_code: string | null;
};

export type OfflinePackSeatMaps = {
  eventSeatById: Map<string, EventSeatRow>;
  legacySeatById: Map<string, LegacySeatRow>;
  eventSectionById: Map<string, EventSectionRow>;
  venueSectionById: Map<string, VenueSectionRow>;
};

function missingSectionGroupColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code;
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "PGRST204" ||
    code === "42703" ||
    msg.includes("section_group") ||
    msg.includes("does not exist")
  );
}

async function batchFetchEventSections(
  admin: SupabaseClient,
  ids: string[]
): Promise<Map<string, EventSectionRow>> {
  const out = new Map<string, EventSectionRow>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const slice = unique.slice(i, i + ID_CHUNK);
    const full = await admin
      .from("event_sections")
      .select("id, name, section_code, section_group, seating_type")
      .in("id", slice);
    if (full.error && missingSectionGroupColumn(full.error)) {
      const basic = await admin
        .from("event_sections")
        .select("id, name, section_code, seating_type")
        .in("id", slice);
      if (basic.error) {
        throw new Error(basic.error.message);
      }
      for (const row of (basic.data ?? []) as Array<EventSectionRow & { id: string }>) {
        out.set(row.id, { ...row, section_group: null });
      }
    } else if (full.error) {
      throw new Error(full.error.message);
    } else {
      for (const row of (full.data ?? []) as Array<EventSectionRow & { id: string }>) {
        out.set(row.id, row as EventSectionRow);
      }
    }
  }
  return out;
}

async function batchFetchByInChunk<T extends { id: string }>(
  admin: SupabaseClient,
  table: "event_seats" | "seats",
  ids: string[],
  select: string
): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const slice = unique.slice(i, i + ID_CHUNK);
    const { data, error } = await admin.from(table).select(select).in("id", slice);
    if (error) {
      throw new Error(error.message);
    }
    for (const row of (data ?? []) as unknown as T[]) {
      out.set(row.id, row);
    }
  }
  return out;
}

async function batchFetchVenueSections(
  admin: SupabaseClient,
  ids: string[]
): Promise<Map<string, VenueSectionRow>> {
  const out = new Map<string, VenueSectionRow>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const slice = unique.slice(i, i + ID_CHUNK);
    const { data, error } = await admin
      .from("sections")
      .select("id, name, section_code")
      .in("id", slice);
    if (error) {
      throw new Error(error.message);
    }
    for (const row of (data ?? []) as Array<VenueSectionRow & { id: string }>) {
      out.set(row.id, row);
    }
  }
  return out;
}

/**
 * Prefetch seat and section rows for offline pack building (replaces per-ticket getSeatInfo round trips).
 */
export async function loadOfflinePackSeatMaps(
  admin: SupabaseClient,
  ticketList: Array<{ section_id: string | null; seat_id: string | null; quantity: number }>
): Promise<OfflinePackSeatMaps> {
  const seatIds = [...new Set(ticketList.map((t) => t.seat_id).filter((id): id is string => !!id))];

  const eventSeatById = await batchFetchByInChunk<EventSeatRow>(
    admin,
    "event_seats",
    seatIds,
    "id, row_label, seat_number, event_section_id"
  );

  const legacySeatIds = seatIds.filter((id) => !eventSeatById.has(id));
  const legacySeatById = await batchFetchByInChunk<LegacySeatRow>(
    admin,
    "seats",
    legacySeatIds,
    "id, row_label, seat_number, section_id"
  );

  const sectionOnlyIds = [
    ...new Set(
      ticketList
        .filter((t) => !t.seat_id && t.section_id)
        .map((t) => t.section_id as string)
    ),
  ];
  const eventSectionIdsFromSeats = [
    ...new Set(
      [...eventSeatById.values()]
        .map((es) => es.event_section_id)
        .filter((id): id is string => !!id)
    ),
  ];
  const eventSectionIdCandidates = [...new Set([...sectionOnlyIds, ...eventSectionIdsFromSeats])];
  const eventSectionById = await batchFetchEventSections(admin, eventSectionIdCandidates);

  const venueSectionIdsFromLegacy = [
    ...new Set(
      [...legacySeatById.values()]
        .map((s) => s.section_id)
        .filter((id): id is string => !!id)
    ),
  ];
  const sectionOnlyNeedingVenue = sectionOnlyIds.filter((id) => !eventSectionById.has(id));
  const venueSectionIdCandidates = [...new Set([...venueSectionIdsFromLegacy, ...sectionOnlyNeedingVenue])];
  const venueSectionById = await batchFetchVenueSections(admin, venueSectionIdCandidates);

  return { eventSeatById, legacySeatById, eventSectionById, venueSectionById };
}

/**
 * Mirror `getSeatInfo` using prefetched maps (no I/O).
 */
export function seatInfoFromOfflineMaps(
  t: { section_id: string | null; seat_id: string | null; quantity: number },
  maps: OfflinePackSeatMaps
): SeatInfo {
  const { eventSeatById, legacySeatById, eventSectionById, venueSectionById } = maps;
  let section = "";
  let section_group = "";
  let section_display_name = "";
  let row = "";
  let seatNumber = "";
  let seating_type: "assigned" | "free" | "standing" = "assigned";

  if (t.seat_id) {
    const es = eventSeatById.get(t.seat_id);
    if (es) {
      const rowRaw = es.row_label ?? "";
      const seatRaw = es.seat_number ?? "";
      const sectionId = es.event_section_id;
      const sec = sectionId ? eventSectionById.get(sectionId) ?? null : null;
      section = sec ? (sec.section_code ?? sec.name ?? "") : "";
      section_display_name = sec?.name?.trim() ?? "";
      section_group = (sec?.section_group as string | null)?.trim() ?? "";
      const st = String(sec?.seating_type ?? "assigned").toLowerCase();
      if (st === "free") {
        seating_type = "free";
        row = "";
        seatNumber = "";
      } else if (st === "standing") {
        seating_type = "standing";
        row = "";
        seatNumber = "";
      } else {
        seating_type = "assigned";
        row = rowRaw;
        seatNumber = seatRaw;
      }
    } else {
      const s = legacySeatById.get(t.seat_id);
      if (s) {
        row = s.row_label ?? "";
        seatNumber = s.seat_number ?? "";
        const sec = s.section_id ? venueSectionById.get(s.section_id) ?? null : null;
        section = sec ? (sec.section_code ?? sec.name ?? "") : "";
        section_display_name = sec?.name?.trim() ?? "";
        section_group = "";
        seating_type = "assigned";
      }
    }
  } else if (t.section_id) {
    const es = eventSectionById.get(t.section_id) ?? null;
    if (es) {
      section = es.section_code ?? es.name ?? "";
      section_display_name = es.name?.trim() ?? "";
      section_group = (es.section_group as string | null)?.trim() ?? "";
      const st = String(es.seating_type ?? "assigned").toLowerCase();
      if (st === "free") {
        seating_type = "free";
        row = "";
        seatNumber = "";
      } else if (st === "standing") {
        seating_type = "standing";
        row = "";
        seatNumber = "";
      } else {
        seating_type = "assigned";
        row = "-";
        seatNumber = t.quantity > 0 ? `x${t.quantity}` : "-";
      }
    } else {
      const sec = venueSectionById.get(t.section_id) ?? null;
      if (sec) {
        section = sec.section_code ?? sec.name ?? "";
        section_display_name = sec.name?.trim() ?? "";
        section_group = "";
        seating_type = "assigned";
        row = "-";
        seatNumber = t.quantity > 0 ? `x${t.quantity}` : "-";
      }
    }
  }
  return { section, section_group, section_display_name, row, seatNumber, seating_type };
}
