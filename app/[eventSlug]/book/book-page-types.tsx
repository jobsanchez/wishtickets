import type { ReactNode } from "react";
import type { ReservationItem } from "@/store/reservation-store";

export const DEFAULT_PRICE_CENTS = 0;

export interface SectionInfo {
  id: string;
  name: string;
  section_code?: string | null;
  section_group?: string | null;
  section_group_name?: string | null;
  capacity: number;
  available: number;
  seating_type?: "assigned" | "free" | "standing";
  color?: string | null;
  column_direction?: string | null;
  show_seat_selection?: boolean;
  seat_layout_canvas_id?: string | null;
  background_image_url?: string | null;
  background_scale?: number;
  background_opacity?: number;
}

export interface CanvasInfo {
  id: string;
  image_url: string | null;
  scale: number;
  opacity: number;
  section_ids: string[];
}

export type AvailabilitySeatRow = {
  id: string;
  row_label: string | null;
  seat_number: string | null;
  section_id: string | null;
  available: boolean;
  status?: string;
  grid_x?: number | null;
  grid_y?: number | null;
};

export type AvailabilityDebugMeta = {
  branch: string | null;
  requestId: string | null;
};

export class AvailabilityHttpError extends Error {
  status: number;
  retryable: boolean;
  code: string | null;
  debug: AvailabilityDebugMeta;
  constructor(
    message: string,
    status: number,
    code?: string | null,
    debug?: AvailabilityDebugMeta
  ) {
    super(message);
    this.name = "AvailabilityHttpError";
    this.status = status;
    this.retryable = status === 408 || status === 429 || status >= 500;
    this.code = typeof code === "string" && code.trim() ? code : null;
    this.debug = debug ?? { branch: null, requestId: null };
  }
}

export function sanitizeStatusText(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

const KNOWN_EVENT_STATUSES = new Set([
  "draft",
  "published",
  "postponed",
  "cancelled",
  "archived",
]);

export function normalizeBookPageEventStatus(raw: unknown): string {
  const sanitized = sanitizeStatusText(raw).toLowerCase();
  if (!sanitized) return "draft";
  if (KNOWN_EVENT_STATUSES.has(sanitized)) return sanitized;
  return "draft";
}

export function normalizeCanvasSectionIds(
  sectionIds: string[] | undefined | null
): string[] {
  const orderedUnique: string[] = [];
  const seen = new Set<string>();
  for (const id of sectionIds ?? []) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    orderedUnique.push(id);
  }
  return orderedUnique;
}

export function normalizeSeatingType(
  t: string | null | undefined
): "assigned" | "free" | "standing" {
  const x = (t ?? "assigned").trim().toLowerCase();
  if (x === "free") return "free";
  if (x === "standing") return "standing";
  return "assigned";
}

export function sectionSwatchColor(section: { color?: string | null }): string {
  if (section.color && /^#[0-9a-fA-F]{3,8}$/.test(section.color)) {
    return section.color.toLowerCase();
  }
  return "#22c55e";
}

export function formatSectionPricePhp(
  sectionId: string,
  priceCentsBySectionId: Record<string, number>,
  basePriceCentsBySectionId: Record<string, number>
): ReactNode {
  if (priceCentsBySectionId[sectionId] == null) {
    return <span className="text-foreground-muted">Updating price...</span>;
  }
  const base = basePriceCentsBySectionId[sectionId];
  const price = priceCentsBySectionId[sectionId] ?? DEFAULT_PRICE_CENTS;
  const fmt = (cents: number) =>
    (cents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
  if (base != null) {
    return (
      <>
        <span className="line-through opacity-75">{fmt(base)}</span>{" "}
        <span>{fmt(price)}</span>
        <span className="ml-1 text-xs text-foreground-muted">(Early bird)</span>
      </>
    );
  }
  return fmt(price);
}

export function computeSubtotalFromItems(
  items: ReservationItem[],
  priceCentsBySectionId: Record<string, number>,
  seats: { id: string; section_id: string | null }[],
  addOnPriceById: Record<string, number> = {}
): number {
  let sum = 0;
  for (const item of items) {
    if (item.type === "seat") {
      const seat = seats.find((s) => s.id === item.seat_id);
      const sectionId = seat?.section_id ?? null;
      const cents = sectionId
        ? (priceCentsBySectionId[sectionId] ?? DEFAULT_PRICE_CENTS)
        : DEFAULT_PRICE_CENTS;
      sum += cents;
    } else if (item.type === "section") {
      const cents =
        priceCentsBySectionId[item.section_id] ?? DEFAULT_PRICE_CENTS;
      sum += cents * item.quantity;
    } else {
      const cents = addOnPriceById[item.add_on_id] ?? 0;
      sum += cents * item.quantity;
    }
  }
  return sum;
}
