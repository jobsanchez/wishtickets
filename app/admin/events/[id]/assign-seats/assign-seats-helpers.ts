import type { CSSProperties } from "react";
import type {
  AllocationAdjustSeat,
  Assignment,
  SeatInfo,
  SectionInfo,
} from "./assign-seats-types";

export function formatMmSs(totalSec: number): string {
  const m = Math.floor(Math.max(0, totalSec) / 60);
  const s = Math.max(0, totalSec) % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Rough upper bound for parallel prep + SMTP (same scale as print-ticket bulk send). */
export function estimateManualDistributionSendSeconds(ticketCount: number): number {
  const n = Math.max(1, ticketCount);
  return Math.max(45, Math.ceil(n * 2.2) + 75);
}

export function isAbortError(e: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      e instanceof DOMException &&
      e.name === "AbortError") ||
    (e instanceof Error && e.name === "AbortError")
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function allocationSeatSortKey(label: string): [string, number, string] {
  const raw = (label ?? "").trim();
  const match = raw.match(/^(.*?)(\d+)\s*$/);
  if (!match) return [raw.toLowerCase(), Number.MAX_SAFE_INTEGER, raw.toLowerCase()];
  const prefix = (match[1] ?? "").trim().toLowerCase();
  const n = Number.parseInt(match[2] ?? "", 10);
  return [prefix, Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER, raw.toLowerCase()];
}

export function sortAllocationSeatsChronological(
  seats: AllocationAdjustSeat[]
): AllocationAdjustSeat[] {
  return [...seats].sort((a, b) => {
    const [ap, an, ar] = allocationSeatSortKey(a.seat_label);
    const [bp, bn, br] = allocationSeatSortKey(b.seat_label);
    if (ap !== bp) return ap.localeCompare(bp, undefined, { sensitivity: "base" });
    if (an !== bn) return an - bn;
    return ar.localeCompare(br, undefined, { sensitivity: "base" });
  });
}

/** Tickets in this distribution (seats + section quantities); matches summary line logic */
export function assignmentTicketCount(a: Assignment): number {
  return a.items?.reduce((s, i) => s + (i.seat_id ? 1 : i.quantity ?? 1), 0) ?? 0;
}

export function assignmentExpectedTickets(a: Assignment): number {
  return typeof a.expected_tickets === "number" && a.expected_tickets > 0
    ? a.expected_tickets
    : assignmentTicketCount(a);
}

export function assignmentGeneratedTicketImages(a: Assignment): number {
  return typeof a.generated_ticket_images === "number" && a.generated_ticket_images >= 0
    ? a.generated_ticket_images
    : 0;
}

function sectionNameLookup(sections: SectionInfo[]): Map<string, string> {
  return new Map(sections.map((s) => [s.id, s.name]));
}

/** Aggregate ticket counts by section display name for assignment items. */
function addItemsToSectionCounts(
  items: Assignment["items"],
  seatsById: Map<string, SeatInfo>,
  sectionNameById: Map<string, string>,
  counts: Map<string, number>
): void {
  for (const item of items ?? []) {
    const n = item.seat_id ? 1 : item.quantity ?? 1;
    let sectionId = item.section_id ?? null;
    if (!sectionId && item.seat_id) {
      sectionId = seatsById.get(item.seat_id)?.section_id ?? null;
    }
    let displayName: string;
    if (sectionId) {
      displayName = sectionNameById.get(sectionId) ?? "Unknown section";
    } else {
      const raw = (item.seat_label ?? "").trim();
      displayName = raw ? (raw.split(/\s+/)[0] ?? "Other") : "Other";
    }
    counts.set(displayName, (counts.get(displayName) ?? 0) + n);
  }
}

export function sectionCountRowsForAssignment(
  a: Assignment,
  seatsById: Map<string, SeatInfo>,
  sections: SectionInfo[]
): { rows: Array<{ section: string; count: number }>; total: number } {
  const sectionNameById = sectionNameLookup(sections);
  const counts = new Map<string, number>();
  addItemsToSectionCounts(a.items, seatsById, sectionNameById, counts);
  const total = assignmentTicketCount(a);
  const rows = [...counts.entries()]
    .sort(([sa], [sb]) => sa.localeCompare(sb, undefined, { sensitivity: "base" }))
    .map(([section, count]) => ({ section, count }));
  return { rows, total };
}

export function mergeSectionCountRowsForAssignments(
  assignmentList: Assignment[],
  seatsById: Map<string, SeatInfo>,
  sections: SectionInfo[]
): { rows: Array<{ section: string; count: number }>; total: number } {
  const sectionNameById = sectionNameLookup(sections);
  const counts = new Map<string, number>();
  for (const a of assignmentList) {
    addItemsToSectionCounts(a.items, seatsById, sectionNameById, counts);
  }
  const total = assignmentList.reduce((s, a) => s + assignmentTicketCount(a), 0);
  const rows = [...counts.entries()]
    .sort(([sa], [sb]) => sa.localeCompare(sb, undefined, { sensitivity: "base" }))
    .map(([section, count]) => ({ section, count }));
  return { rows, total };
}

export function normalizeHexColor(color?: string | null): string | null {
  if (!color) return null;
  const c = color.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(c) || /^#[0-9a-fA-F]{6}$/.test(c)) {
    return c;
  }
  return null;
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "transparent";
  const raw = normalized.slice(1);
  const expanded =
    raw.length === 3 ? raw.split("").map((ch) => `${ch}${ch}`).join("") : raw;
  const n = Number.parseInt(expanded, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getSectionCardStyle(color?: string | null): CSSProperties | undefined {
  const hex = normalizeHexColor(color);
  if (!hex) return undefined;
  return {
    borderColor: hex,
    backgroundColor: hexToRgba(hex, 0.14),
  };
}
