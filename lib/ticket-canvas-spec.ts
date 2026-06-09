/**
 * Ticket canvas: 2.5" × 5.5" at 300 DPI (portrait).
 * Legacy admin templates used 797 × 1500 px; persisted layout coordinates use schemaVersion to distinguish spaces.
 */

export const TICKET_WIDTH_INCHES = 2.5;
export const TICKET_HEIGHT_INCHES = 5.5;
export const TICKET_RENDER_DPI = 300;

export const TICKET_TEMPLATE_WIDTH_PX = Math.round(TICKET_WIDTH_INCHES * TICKET_RENDER_DPI); // 750
export const TICKET_TEMPLATE_HEIGHT_PX = Math.round(TICKET_HEIGHT_INCHES * TICKET_RENDER_DPI); // 1650
export const TICKET_TEMPLATE_JPEG_QUALITY = 90;

export const TICKET_TEMPLATE_MIN_WIDTH_PX = 300;
export const TICKET_TEMPLATE_MAX_WIDTH_PX = 3000;
export const TICKET_TEMPLATE_MIN_HEIGHT_PX = 600;
export const TICKET_TEMPLATE_MAX_HEIGHT_PX = 5000;
export const TICKET_TEMPLATE_MIN_JPEG_QUALITY = 40;
export const TICKET_TEMPLATE_MAX_JPEG_QUALITY = 100;
export const TICKET_TEMPLATE_MIN_DPI = 72;
export const TICKET_TEMPLATE_MAX_DPI = 1200;

/** Coordinate space for layouts / templates saved before the 750×1650 migration. */
export const LEGACY_TICKET_TEMPLATE_WIDTH_PX = 797;
export const LEGACY_TICKET_TEMPLATE_HEIGHT_PX = 1500;

/** Stored in DB with layout JSON when coordinates are already in 750×1650 space. */
export const TICKET_LAYOUT_SCHEMA_VERSION = 2 as const;

/** Supabase bucket + client + API limit for ticket template image uploads. */
export const TICKET_TEMPLATE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** `accept` for file inputs; admin requires JPEG templates only. */
export const TICKET_TEMPLATE_ACCEPT = "image/jpeg";

export function isTicketTemplateMimeType(type: string): boolean {
  return type === "image/jpeg";
}

export function clampTicketTemplateWidthPx(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return TICKET_TEMPLATE_WIDTH_PX;
  return Math.max(
    TICKET_TEMPLATE_MIN_WIDTH_PX,
    Math.min(TICKET_TEMPLATE_MAX_WIDTH_PX, Math.round(n))
  );
}

export function clampTicketTemplateHeightPx(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return TICKET_TEMPLATE_HEIGHT_PX;
  return Math.max(
    TICKET_TEMPLATE_MIN_HEIGHT_PX,
    Math.min(TICKET_TEMPLATE_MAX_HEIGHT_PX, Math.round(n))
  );
}

export function clampTicketJpegQuality(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return TICKET_TEMPLATE_JPEG_QUALITY;
  return Math.max(
    TICKET_TEMPLATE_MIN_JPEG_QUALITY,
    Math.min(TICKET_TEMPLATE_MAX_JPEG_QUALITY, Math.round(n))
  );
}

export function clampTicketDpi(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return TICKET_RENDER_DPI;
  return Math.max(
    TICKET_TEMPLATE_MIN_DPI,
    Math.min(TICKET_TEMPLATE_MAX_DPI, Math.round(n))
  );
}

export interface RegionPos {
  top: number;
  left: number;
  width?: number;
  height?: number;
  size?: number;
}

export interface TicketLayoutConfig {
  eventInfo: RegionPos;
  section: RegionPos;
  price: RegionPos;
  qr: RegionPos;
  ticketNumber: RegionPos;
  encryptedQr: RegionPos;
  website: RegionPos;
  qrSize?: number;
}

export type PersistedTicketLayout = TicketLayoutConfig & {
  schemaVersion?: number;
};

const SX = TICKET_TEMPLATE_WIDTH_PX / LEGACY_TICKET_TEMPLATE_WIDTH_PX;
const SY = TICKET_TEMPLATE_HEIGHT_PX / LEGACY_TICKET_TEMPLATE_HEIGHT_PX;

function scaleRegionForMigration(pos: RegionPos, isQr: boolean): RegionPos {
  if (isQr) {
    const s = pos.size ?? 120;
    return {
      top: Math.round(pos.top * SY),
      left: Math.round(pos.left * SX),
      size: Math.max(24, Math.round(s * Math.sqrt(SX * SY))),
    };
  }
  return {
    top: Math.round(pos.top * SY),
    left: Math.round(pos.left * SX),
    width: pos.width != null ? Math.max(1, Math.round(pos.width * SX)) : undefined,
    height: pos.height != null ? Math.max(1, Math.round(pos.height * SY)) : undefined,
  };
}

/** Default overlay positions in the legacy 797×1500 coordinate space. */
export const LEGACY_TICKET_LAYOUT_DEFAULT: TicketLayoutConfig = {
  eventInfo: { top: 804, left: 0, width: 797, height: 268 },
  section: { top: 1093, left: 43, width: 372, height: 86 },
  price: { top: 1195, left: 43, width: 200, height: 40 },
  qr: { top: 1093, left: 531, size: 120 },
  ticketNumber: { top: 1232, left: 531, width: 160, height: 43 },
  encryptedQr: { top: 1288, left: 531, width: 160, height: 43 },
  website: { top: 1420, left: 174, width: 450, height: 28 },
};

export function migrateTicketLayoutFromLegacy797x1500(layout: TicketLayoutConfig): TicketLayoutConfig {
  return {
    eventInfo: scaleRegionForMigration(layout.eventInfo, false),
    section: scaleRegionForMigration(layout.section, false),
    price: scaleRegionForMigration(layout.price, false),
    qr: scaleRegionForMigration(
      {
        ...layout.qr,
        size: layout.qr.size ?? layout.qrSize ?? LEGACY_TICKET_LAYOUT_DEFAULT.qr.size,
      },
      true
    ),
    ticketNumber: scaleRegionForMigration(layout.ticketNumber, false),
    encryptedQr: scaleRegionForMigration(layout.encryptedQr, false),
    website: scaleRegionForMigration(layout.website, false),
  };
}

/** Default overlay positions for 750×1650 canvas. */
export const DEFAULT_TICKET_LAYOUT: TicketLayoutConfig =
  migrateTicketLayoutFromLegacy797x1500(LEGACY_TICKET_LAYOUT_DEFAULT);

const REQUIRED_KEYS = ["eventInfo", "section", "qr", "ticketNumber"] as const;

function hasTopLeft(obj: unknown): obj is { top: number; left: number } {
  return (
    !!obj &&
    typeof obj === "object" &&
    typeof (obj as { top?: unknown }).top === "number" &&
    typeof (obj as { left?: unknown }).left === "number"
  );
}

function readRegion(
  raw: Record<string, unknown>,
  key: keyof TicketLayoutConfig,
  defaults: TicketLayoutConfig
): RegionPos {
  const def = defaults[key] as RegionPos;
  const val = raw[key];
  if (!hasTopLeft(val)) {
    return { ...def };
  }
  const v = val as Record<string, unknown>;
  const out: RegionPos = { top: v.top as number, left: v.left as number };
  if (typeof v.width === "number") out.width = v.width;
  else if (def.width != null) out.width = def.width;
  if (typeof v.height === "number") out.height = v.height;
  else if (def.height != null) out.height = def.height;
  if (typeof v.size === "number") out.size = v.size;
  else if (def.size != null) out.size = def.size;
  else if (key === "qr" && typeof raw.qrSize === "number") out.size = raw.qrSize as number;
  return out;
}

function buildLayoutFromUnknown(
  raw: Record<string, unknown>,
  fillDefaults: TicketLayoutConfig
): TicketLayoutConfig | null {
  if (!REQUIRED_KEYS.every((k) => hasTopLeft(raw[k]))) return null;
  return {
    eventInfo: readRegion(raw, "eventInfo", fillDefaults),
    section: readRegion(raw, "section", fillDefaults),
    price: readRegion(raw, "price", fillDefaults),
    qr: readRegion(raw, "qr", fillDefaults),
    ticketNumber: readRegion(raw, "ticketNumber", fillDefaults),
    encryptedQr: readRegion(raw, "encryptedQr", fillDefaults),
    website: readRegion(raw, "website", fillDefaults),
  };
}

/**
 * Normalize persisted layout: new schema uses 750×1650 coordinates; older rows are scaled from 797×1500.
 */
export function resolveTicketLayoutFromPersistence(raw: unknown): TicketLayoutConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_TICKET_LAYOUT;
  const c = raw as Record<string, unknown>;
  const sv = c.schemaVersion;

  if (sv === TICKET_LAYOUT_SCHEMA_VERSION || sv === String(TICKET_LAYOUT_SCHEMA_VERSION)) {
    const filled = buildLayoutFromUnknown(c, DEFAULT_TICKET_LAYOUT);
    return filled ?? DEFAULT_TICKET_LAYOUT;
  }

  const filledLegacy = buildLayoutFromUnknown(c, LEGACY_TICKET_LAYOUT_DEFAULT);
  if (!filledLegacy) return DEFAULT_TICKET_LAYOUT;
  return migrateTicketLayoutFromLegacy797x1500(filledLegacy);
}
