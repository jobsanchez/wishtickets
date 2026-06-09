import { normalizeSeatingType, type AvailabilitySeatRow, type SectionInfo } from "./book-page-types";

export function getAssignedSectionIdsForSeats(sections: SectionInfo[]): string[] {
  return sections
    .filter((s) => normalizeSeatingType(s.seating_type) === "assigned")
    .map((s) => s.id);
}

export function getAssignedSectionIdsKey(ids: string[]): string {
  return ids.length > 0 ? [...ids].sort().join("|") : "all";
}

export function getHasSeatManifestMismatch(
  sections: SectionInfo[],
  seats: AvailabilitySeatRow[]
): boolean {
  if (sections.length === 0 || seats.length === 0) return false;
  const sectionIds = new Set(sections.map((s) => s.id));
  const seatSectionIds = new Set(
    seats
      .map((s) => (typeof s.section_id === "string" ? s.section_id : ""))
      .filter(Boolean)
  );
  if (seatSectionIds.size === 0) return false;
  for (const sid of seatSectionIds) {
    if (sectionIds.has(sid)) return false;
  }
  return true;
}
