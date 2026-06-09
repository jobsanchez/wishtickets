import type { OfflinePackSeatMaps } from "@/lib/admissions/offline-pack-seat-maps";

type EventSectionRow = {
  id: string;
  name: string | null;
  section_code: string | null;
};

/**
 * Resolve a ticket to an event_sections.id for VSS / reports breakdown.
 */
export function resolveTicketEventSectionId(params: {
  section_id: string | null;
  seat_id: string | null;
  seatMaps: OfflinePackSeatMaps;
  sectionByEventSeat: Map<string, string>;
  eventSections: EventSectionRow[];
}): string | null {
  const { section_id, seat_id, seatMaps, sectionByEventSeat, eventSections } = params;
  const eventSectionIds = new Set(eventSections.map((s) => s.id));

  const tryId = (id: string | null | undefined): string | null => {
    if (!id) return null;
    if (eventSectionIds.has(id)) return id;
    if (seatMaps.eventSectionById.has(id)) return id;
    const matched = matchVenueSectionToEvent(id, seatMaps, eventSections);
    return matched;
  };

  const fromSection = tryId(section_id);
  if (fromSection) return fromSection;

  if (seat_id) {
    const fromEventSeat = sectionByEventSeat.get(seat_id) ?? null;
    if (fromEventSeat && eventSectionIds.has(fromEventSeat)) return fromEventSeat;

    const es = seatMaps.eventSeatById.get(seat_id);
    if (es?.event_section_id && eventSectionIds.has(es.event_section_id)) {
      return es.event_section_id;
    }

    const legacy = seatMaps.legacySeatById.get(seat_id);
    if (legacy?.section_id) {
      return tryId(legacy.section_id);
    }
  }

  return null;
}

function matchVenueSectionToEvent(
  sectionId: string,
  seatMaps: OfflinePackSeatMaps,
  eventSections: EventSectionRow[]
): string | null {
  if (seatMaps.eventSectionById.has(sectionId)) {
    return sectionId;
  }
  const venue = seatMaps.venueSectionById.get(sectionId);
  if (!venue) return null;

  const code = (venue.section_code ?? "").trim().toLowerCase();
  const name = (venue.name ?? "").trim().toLowerCase();
  for (const es of eventSections) {
    const esCode = (es.section_code ?? "").trim().toLowerCase();
    const esName = (es.name ?? "").trim().toLowerCase();
    if (code && esCode && code === esCode) return es.id;
    if (name && esName && name === esName) return es.id;
  }
  return null;
}
