import sharp from "sharp";
import opentype from "opentype.js";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateQRBuffer } from "@/lib/qr";
import { buildEncryptedQrFromQrData } from "@/lib/qr-data";
import { getSiteOrigin } from "@/lib/site-url";
import { formatEventDateTimeLong } from "@/lib/event-datetime";
import { BULK_PRINT_ZIP_MAX_TICKETS_PER_PART } from "@/lib/print-tickets/bulk-zip-email";
import {
  clampTicketDpi,
  clampTicketJpegQuality,
  clampTicketTemplateHeightPx,
  clampTicketTemplateWidthPx,
  TICKET_TEMPLATE_JPEG_QUALITY,
  TICKET_TEMPLATE_WIDTH_PX,
  TICKET_TEMPLATE_HEIGHT_PX,
  TICKET_RENDER_DPI,
  DEFAULT_TICKET_LAYOUT as DEFAULT_LAYOUT,
  resolveTicketLayoutFromPersistence,
  type RegionPos,
  type TicketLayoutConfig,
} from "@/lib/ticket-canvas-spec";

export type { RegionPos, TicketLayoutConfig } from "@/lib/ticket-canvas-spec";
const BUCKET = "ticket-images";
const PRINT_FOLDER_PREFIX = "print-by-section";

/** Supabase public object URL path segment before `bucket/object...`. */
const PUBLIC_STORAGE_MARKER = "/storage/v1/object/public/";

/**
 * Load ticket template bytes. For this project's Supabase public storage URLs,
 * uses the admin Storage API (no same-origin fetch to `/api/image-proxy`), so
 * parallel `/api/admin/print-tickets/generate` calls do not deadlock the dev server.
 * Other URLs are fetched directly (e.g. external CDN templates).
 */
/** One download per URL per process; parallel ticket renders share the same inflight promise. */
const templateBufferByUrl = new Map<string, Promise<Buffer | null>>();

async function loadTemplateImageBufferUncached(
  templateImageUrl: string
): Promise<Buffer | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const isProjectPublicObject =
    Boolean(supabaseUrl) &&
    templateImageUrl.startsWith(supabaseUrl) &&
    templateImageUrl.includes(PUBLIC_STORAGE_MARKER);

  if (isProjectPublicObject) {
    try {
      const pathname = new URL(templateImageUrl).pathname;
      const markerIdx = pathname.indexOf(PUBLIC_STORAGE_MARKER);
      if (markerIdx === -1) return null;
      const rest = pathname.slice(markerIdx + PUBLIC_STORAGE_MARKER.length);
      const slash = rest.indexOf("/");
      if (slash <= 0) return null;
      const bucket = decodeURIComponent(rest.slice(0, slash));
      const objectPath = decodeURIComponent(rest.slice(slash + 1));
      if (!bucket || !objectPath) return null;

      const admin = createAdminClient();
      const { data, error } = await admin.storage.from(bucket).download(objectPath);
      if (error || !data) {
        console.warn("[ticket-image] template storage download failed:", error?.message);
        return null;
      }
      return Buffer.from(await data.arrayBuffer());
    } catch (e) {
      console.warn("[ticket-image] template storage download error:", e);
      return null;
    }
  }

  try {
    const res = await fetch(templateImageUrl, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function loadTemplateImageBuffer(templateImageUrl: string): Promise<Buffer | null> {
  let inflight = templateBufferByUrl.get(templateImageUrl);
  if (!inflight) {
    inflight = loadTemplateImageBufferUncached(templateImageUrl);
    templateBufferByUrl.set(templateImageUrl, inflight);
  }
  const buf = await inflight;
  return buf && buf.length > 0 ? Buffer.from(buf) : null;
}

/** Roboto Latin TTF – used for text-to-path so Sharp/librsvg needs no system fonts. */
const FONT_URL =
  "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5Q.ttf";

/** Immutable TTF bytes (fetch once). Do not cache parsed `Font` — opentype.js is not safe for concurrent use on one instance (detached ArrayBuffer). */
let cachedFontBytes: Uint8Array | null = null;
let fontBytesLoading: Promise<Uint8Array> | null = null;

async function ensureFontBytes(): Promise<Uint8Array> {
  if (cachedFontBytes) return cachedFontBytes;
  if (!fontBytesLoading) {
    fontBytesLoading = (async () => {
      const res = await fetch(FONT_URL, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
      const buf = await res.arrayBuffer();
      // Own copy — fetch/undici may reuse or detach pooled buffers; cache must stay valid.
      const view = new Uint8Array(buf);
      const bytes = new Uint8Array(view.length);
      bytes.set(view);
      cachedFontBytes = bytes;
      return bytes;
    })().finally(() => {
      fontBytesLoading = null;
    });
  }
  return fontBytesLoading;
}

/**
 * Each call returns a new Font. opentype.parse may detach the buffer passed in, so we always
 * parse a fresh ArrayBuffer copy and never slice/cache the same buffer we give to parse.
 */
async function loadFont(): Promise<opentype.Font> {
  const bytes = await ensureFontBytes();
  const parseBuf = new ArrayBuffer(bytes.length);
  new Uint8Array(parseBuf).set(bytes);
  const font = opentype.parse(parseBuf);
  if (!font) throw new Error("Font parse failed");
  return font;
}

type OpentypeFont = opentype.Font;

function textToPathElements(
  font: OpentypeFont,
  lines: string[],
  opts: {
    x: number;
    firstLineY: number;
    fontSize: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    align?: "left" | "center";
    lineHeight?: number;
  }
): string {
  const {
    x,
    firstLineY,
    fontSize,
    fill = "#1a1a1a",
    stroke,
    strokeWidth = 0,
    align = "left",
    lineHeight = 1.2,
  } = opts;
  const paths: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim() || " ";
    const lineX = align === "center" ? x - font.getAdvanceWidth(line, fontSize) / 2 : x;
    const lineY = firstLineY + i * fontSize * lineHeight;
    const path = font.getPath(line, lineX, lineY, fontSize);
    const strokeAttr =
      stroke && strokeWidth > 0
        ? ` stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"`
        : "";
    paths.push(`<path d="${path.toPathData(2)}" fill="${fill}"${strokeAttr}/>`);
  }
  return paths.join("");
}

function slugifyPathSegment(input: string, fallback: string): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s.length > 0 ? s : fallback;
}

/** Safe single segment for storage object names (keeps case for section codes like `LPatron`). */
function sanitizePrintFilenamePart(raw: string, maxLen: number): string {
  const s = raw
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
  return s.length > 0 ? s : "x";
}

function partFolderFromPartitionIndex(partitionIndex?: number | null): string {
  const slot = typeof partitionIndex === "number" && Number.isFinite(partitionIndex)
    ? Math.max(1, Math.floor(partitionIndex))
    : 1;
  const part = Math.floor((slot - 1) / BULK_PRINT_ZIP_MAX_TICKETS_PER_PART) + 1;
  return `part-${part}`;
}

/**
 * Object key without extension: `print-by-section/{eventSlug}/{sectionSlug}/part-{n}/{basename}`.
 * Seated: `{sectionCode}-{row}-{seat}`; free/standing: `{sectionCode}-free-001` or `-stand-001`, or `-free-{id8}` when slot unknown.
 */
function buildPrintTicketImageStorageKey(opts: {
  sectionCode: string;
  seatingType: string | null | undefined;
  eventSeatId: string | null;
  rowLabel: string;
  seatNumber: string;
  sectionSlotIndex?: number | null;
  partitionIndex?: number | null;
  printTicketId: string;
  eventSlug: string;
  sectionSlug: string;
}): string {
  const sec = sanitizePrintFilenamePart(opts.sectionCode || "sec", 32);
  let base: string;
  if (opts.eventSeatId) {
    const row = sanitizePrintFilenamePart(opts.rowLabel || "-", 32);
    const seat = sanitizePrintFilenamePart(opts.seatNumber || "-", 32);
    base = `${sec}-${row}-${seat}`;
  } else {
    const kind = opts.seatingType === "standing" ? "stand" : "free";
    if (opts.sectionSlotIndex != null && opts.sectionSlotIndex >= 1) {
      base = `${sec}-${kind}-${String(opts.sectionSlotIndex).padStart(3, "0")}`;
    } else {
      const short = opts.printTicketId.replace(/-/g, "").slice(0, 8);
      base = `${sec}-${kind}-${short}`;
    }
  }
  const maxBase = 140;
  if (base.length > maxBase) {
    const short = opts.printTicketId.replace(/-/g, "").slice(0, 8);
    base = `${base.slice(0, Math.max(1, maxBase - 9))}-${short}`;
  }
  const partFolder = partFolderFromPartitionIndex(opts.partitionIndex);
  return `${PRINT_FOLDER_PREFIX}/${opts.eventSlug}/${opts.sectionSlug}/${partFolder}/${base}`;
}

function getLayoutSize(layout: TicketLayoutConfig, key: keyof TicketLayoutConfig): { w: number; h: number } {
  const pos = layout[key] as RegionPos | undefined;
  if (!pos) {
    const def = DEFAULT_LAYOUT[key] as RegionPos;
    return { w: def?.width ?? 200, h: def?.height ?? 40 };
  }
  if (key === "qr") {
    const s = pos.size ?? layout.qrSize ?? 120;
    return { w: s, h: s };
  }
  const def = DEFAULT_LAYOUT[key] as RegionPos;
  return {
    w: pos.width ?? def?.width ?? 350,
    h: pos.height ?? def?.height ?? 80,
  };
}

export interface TicketImageParams {
  eventTitle: string;
  venueName: string;
  eventStart: string; // ISO string
  sectionCode: string;
  sectionName: string;
  /** From `event_sections.section_group`; when set, rendered under the Section heading (above the section name). */
  sectionGroup?: string | null;
  seatLabel: string; // "Row X Seat Y" | "Free Seating" | "Standing"
  priceCents?: number; // ticket price in centavos (PHP)
  complementary?: boolean; // when true, render price as PHP 0.00
  qrData: string;
  ticketNumber: string; // qr_data for CTRL display
  encryptedQr?: string | null; // encrypted_qr for display (fallbacks handled by caller)
  templateImageUrl?: string | null;
  layoutConfig?: TicketLayoutConfig | null;
  renderConfig?: TicketRenderConfig;
}

type TicketCodeMappingInput = {
  qrPayloadCandidate?: string | null;
  ctrlCandidate?: string | null;
  encryptedCandidate?: string | null;
};

type TicketCodeMapping = {
  qrPayload: string;
  ctrlText: string;
  encryptedText: string;
};

function normalizeCodeValue(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

function resolveTicketCodeMapping({
  qrPayloadCandidate,
  ctrlCandidate,
  encryptedCandidate,
}: TicketCodeMappingInput): TicketCodeMapping {
  const ctrlRaw = normalizeCodeValue(ctrlCandidate);
  const encryptedRaw = normalizeCodeValue(encryptedCandidate);
  const qrRaw = normalizeCodeValue(qrPayloadCandidate);

  const encryptedText =
    encryptedRaw || (ctrlRaw ? buildEncryptedQrFromQrData(ctrlRaw) : qrRaw);
  const qrPayload = encryptedText || (qrRaw ? buildEncryptedQrFromQrData(qrRaw) : "");
  const ctrlText = ctrlRaw || "—";

  if (!qrPayload) {
    throw new Error("Missing ticket QR payload");
  }
  if (!encryptedText) {
    throw new Error("Missing encrypted ticket code");
  }

  return { qrPayload, ctrlText, encryptedText };
}

export interface TicketRenderConfig {
  width: number;
  height: number;
  jpegQuality: number;
  dpi: number;
}

export interface ResolvedTicketTemplate {
  templateImageUrl: string | null;
  layoutConfig: TicketLayoutConfig | null;
  renderConfig: TicketRenderConfig;
}

async function getResolvedTicketTemplateInner(
  eventRow: { ticket_template_image_url?: string | null } | null
): Promise<ResolvedTicketTemplate> {
  const eventUrl = eventRow?.ticket_template_image_url ?? null;

  try {
    const adminClient = createAdminClient();
    const { data } = await adminClient
      .from("app_config")
      .select("key, value")
      .in("key", [
        "global_ticket_template_url",
        "global_ticket_layout_config",
        "global_ticket_width_px",
        "global_ticket_height_px",
        "global_ticket_jpeg_quality",
        "global_ticket_dpi",
      ]);
    const map = new Map<string, unknown>();
    for (const row of data ?? []) {
      map.set(row.key, row.value);
    }
    const globalUrl = map.get("global_ticket_template_url");
    const globalLayoutRaw = map.get("global_ticket_layout_config");
    const widthRaw = map.get("global_ticket_width_px");
    const heightRaw = map.get("global_ticket_height_px");
    const jpegQualityRaw = map.get("global_ticket_jpeg_quality");
    const dpiRaw = map.get("global_ticket_dpi");
    const resolvedUrl = eventUrl ?? (typeof globalUrl === "string" ? globalUrl : null) ?? null;
    const resolvedLayout =
      globalLayoutRaw != null ? resolveTicketLayoutFromPersistence(globalLayoutRaw) : null;
    const renderConfig: TicketRenderConfig = {
      width: clampTicketTemplateWidthPx(widthRaw),
      height: clampTicketTemplateHeightPx(heightRaw),
      jpegQuality: clampTicketJpegQuality(jpegQualityRaw),
      dpi: clampTicketDpi(dpiRaw),
    };
    console.log("[ticket-image] resolved ticket template", {
      eventHasTemplate: !!eventUrl,
      usingGlobalTemplate: !eventUrl && !!resolvedUrl,
      templateImageUrl: resolvedUrl,
      hasLayoutConfig: !!resolvedLayout,
      renderConfig,
    });
    return {
      templateImageUrl: resolvedUrl,
      layoutConfig: resolvedLayout,
      renderConfig,
    };
  } catch (err) {
    console.warn("[ticket-image] getResolvedTicketTemplate failed, falling back to event-only config", {
      error: err instanceof Error ? err.message : String(err),
      eventHasTemplate: !!eventUrl,
    });
    return {
      templateImageUrl: eventUrl,
      layoutConfig: null,
      renderConfig: {
        width: TICKET_TEMPLATE_WIDTH_PX,
        height: TICKET_TEMPLATE_HEIGHT_PX,
        jpegQuality: TICKET_TEMPLATE_JPEG_QUALITY,
        dpi: TICKET_RENDER_DPI,
      },
    };
  }
}

/** In-flight + resolved coalescing: parallel ticket renders for one event share one `app_config` read. */
const resolvedTemplateByEventKey = new Map<string, Promise<ResolvedTicketTemplate>>();

function cacheKeyForResolvedTemplate(
  eventRow: {
    id?: string;
    ticket_template_image_url?: string | null;
  } | null
): string {
  const id = eventRow?.id ?? "unknown";
  const u = eventRow?.ticket_template_image_url ?? "";
  return `${id}::${u}`;
}

/**
 * Resolve ticket background URL (event override, else global default) and overlay layout (always global).
 */
export async function getResolvedTicketTemplate(
  eventRow: {
    id?: string;
    ticket_template_image_url?: string | null;
    ticket_layout_config?: unknown;
  } | null
): Promise<ResolvedTicketTemplate> {
  const key = cacheKeyForResolvedTemplate(eventRow);
  let inflight = resolvedTemplateByEventKey.get(key);
  if (!inflight) {
    inflight = getResolvedTicketTemplateInner(eventRow);
    resolvedTemplateByEventKey.set(key, inflight);
  }
  return inflight;
}

/**
 * Wrap text to fit within maxWidth, splitting into lines. If more than maxLines,
 * reduce font size and retry. Returns lines and final font size for SVG.
 * Uses ~0.55em per char for Helvetica bold as heuristic.
 */
function wrapText(
  text: string,
  maxWidthPx: number,
  maxLines: number,
  initialFontSize: number,
  minFontSize = 10
): { lines: string[]; fontSize: number } {
  let fontSize = initialFontSize;
  let lines: string[] = [];

  while (fontSize >= minFontSize) {
    const pxPerChar = fontSize * 0.55;
    const maxCharsPerLine = Math.max(8, Math.floor(maxWidthPx / pxPerChar));
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return { lines: [""], fontSize };

    lines = [];
    let currentLine = "";

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (candidate.length <= maxCharsPerLine) {
        currentLine = candidate;
      } else {
        if (currentLine) lines.push(currentLine);
        if (word.length > maxCharsPerLine) {
          const chunks = word.match(new RegExp(`.{1,${maxCharsPerLine}}`, "g")) ?? [word];
          lines.push(...chunks.slice(0, -1));
          currentLine = chunks[chunks.length - 1];
        } else {
          currentLine = word;
        }
      }
    }
    if (currentLine) lines.push(currentLine);

    if (lines.length <= maxLines) break;
    fontSize = Math.max(minFontSize, fontSize - 2);
  }

  return { lines, fontSize };
}

const SECTION_PANEL_LABEL_FS = 16;
const SECTION_PANEL_VALUE_LH = 1.2;

/**
 * Paths for the section region box: one "Section:" block (group + section name as stacked values), then "Seat:".
 * When `sectionGroup` is empty, only the section name appears under Section.
 */
function buildSectionPanelPaths(
  font: OpentypeFont,
  params: Pick<TicketImageParams, "sectionGroup" | "sectionName" | "sectionCode" | "seatLabel">,
  sectionValueW: number
): string {
  const pad = 10;
  const labelGap = SECTION_PANEL_LABEL_FS * 1.12;
  const blockGap = 8;
  const labelToValuesGap = blockGap;
  const betweenGroupAndSectionGap = 4;
  const maxValLines = 2;
  const valueFsInitial = 20;
  /** Extra air between the last Section value line and the "Seat:" label (~one blank line at value font size). */
  const gapSectionValuesToSeatHeading =
    Math.round(valueFsInitial * SECTION_PANEL_VALUE_LH) + 16;

  const groupStr = params.sectionGroup?.trim() ?? "";
  const hasGroup = groupStr.length > 0;
  const sectionDisplay = params.sectionName || params.sectionCode || "—";

  const groupWrap = hasGroup ? wrapText(groupStr, sectionValueW, maxValLines, valueFsInitial) : null;
  const sectionWrap = wrapText(sectionDisplay, sectionValueW, maxValLines, valueFsInitial);
  const seatWrap = wrapText(params.seatLabel, sectionValueW, maxValLines, valueFsInitial);

  function baselineAfterLines(firstLineY: number, lineCount: number, fontSize: number): number {
    if (lineCount <= 0) return firstLineY;
    return firstLineY + lineCount * fontSize * SECTION_PANEL_VALUE_LH;
  }

  function afterValueBlockEnd(firstBaseline: number, lines: string[], fontSize: number): number {
    if (lines.length === 0) return firstBaseline;
    const lastBaseline =
      firstBaseline + (lines.length - 1) * fontSize * SECTION_PANEL_VALUE_LH;
    return lastBaseline + fontSize * 0.28 + blockGap;
  }

  const yLabel = pad + SECTION_PANEL_LABEL_FS * 0.85;
  let paths = "";

  const ySectionHeading = yLabel;
  const ySectionFirstVal = ySectionHeading + labelGap + labelToValuesGap;
  paths += textToPathElements(font, ["Section:"], {
    x: 12,
    firstLineY: ySectionHeading,
    fontSize: SECTION_PANEL_LABEL_FS,
    fill: "#555",
  });

  let yVal = ySectionFirstVal;
  if (hasGroup && groupWrap) {
    paths += textToPathElements(font, groupWrap.lines, {
      x: 12,
      firstLineY: yVal,
      fontSize: groupWrap.fontSize,
      lineHeight: SECTION_PANEL_VALUE_LH,
    });
    yVal = baselineAfterLines(yVal, groupWrap.lines.length, groupWrap.fontSize) + betweenGroupAndSectionGap;
  }

  paths += textToPathElements(font, sectionWrap.lines, {
    x: 12,
    firstLineY: yVal,
    fontSize: sectionWrap.fontSize,
    lineHeight: SECTION_PANEL_VALUE_LH,
  });

  const ySeatHeading =
    afterValueBlockEnd(yVal, sectionWrap.lines, sectionWrap.fontSize) + gapSectionValuesToSeatHeading;
  const ySeatVal = ySeatHeading + labelGap + labelToValuesGap;
  paths +=
    textToPathElements(font, ["Seat:"], {
      x: 12,
      firstLineY: ySeatHeading,
      fontSize: SECTION_PANEL_LABEL_FS,
      fill: "#555",
    }) +
    textToPathElements(font, seatWrap.lines, {
      x: 12,
      firstLineY: ySeatVal,
      fontSize: seatWrap.fontSize,
      lineHeight: SECTION_PANEL_VALUE_LH,
    });

  return paths;
}

/** Clean ticket base: light green + dusty rose border, no baked-in text. Use instead of a missing template to avoid placeholder text. */
function scaleLayoutToCanvas(layout: TicketLayoutConfig, width: number, height: number): TicketLayoutConfig {
  const sx = width / TICKET_TEMPLATE_WIDTH_PX;
  const sy = height / TICKET_TEMPLATE_HEIGHT_PX;
  return {
    eventInfo: {
      ...layout.eventInfo,
      top: Math.round(layout.eventInfo.top * sy),
      left: Math.round(layout.eventInfo.left * sx),
      width: layout.eventInfo.width != null ? Math.max(1, Math.round(layout.eventInfo.width * sx)) : undefined,
      height: layout.eventInfo.height != null ? Math.max(1, Math.round(layout.eventInfo.height * sy)) : undefined,
    },
    section: {
      ...layout.section,
      top: Math.round(layout.section.top * sy),
      left: Math.round(layout.section.left * sx),
      width: layout.section.width != null ? Math.max(1, Math.round(layout.section.width * sx)) : undefined,
      height: layout.section.height != null ? Math.max(1, Math.round(layout.section.height * sy)) : undefined,
    },
    price: {
      ...layout.price,
      top: Math.round(layout.price.top * sy),
      left: Math.round(layout.price.left * sx),
      width: layout.price.width != null ? Math.max(1, Math.round(layout.price.width * sx)) : undefined,
      height: layout.price.height != null ? Math.max(1, Math.round(layout.price.height * sy)) : undefined,
    },
    qr: {
      ...layout.qr,
      top: Math.round(layout.qr.top * sy),
      left: Math.round(layout.qr.left * sx),
      size: layout.qr.size != null ? Math.max(1, Math.round(layout.qr.size * Math.sqrt(sx * sy))) : undefined,
    },
    ticketNumber: {
      ...layout.ticketNumber,
      top: Math.round(layout.ticketNumber.top * sy),
      left: Math.round(layout.ticketNumber.left * sx),
      width: layout.ticketNumber.width != null ? Math.max(1, Math.round(layout.ticketNumber.width * sx)) : undefined,
      height:
        layout.ticketNumber.height != null
          ? Math.max(1, Math.round(layout.ticketNumber.height * sy))
          : undefined,
    },
    encryptedQr: {
      ...layout.encryptedQr,
      top: Math.round(layout.encryptedQr.top * sy),
      left: Math.round(layout.encryptedQr.left * sx),
      width: layout.encryptedQr.width != null ? Math.max(1, Math.round(layout.encryptedQr.width * sx)) : undefined,
      height:
        layout.encryptedQr.height != null
          ? Math.max(1, Math.round(layout.encryptedQr.height * sy))
          : undefined,
    },
    website: {
      ...layout.website,
      top: Math.round(layout.website.top * sy),
      left: Math.round(layout.website.left * sx),
      width: layout.website.width != null ? Math.max(1, Math.round(layout.website.width * sx)) : undefined,
      height: layout.website.height != null ? Math.max(1, Math.round(layout.website.height * sy)) : undefined,
    },
    qrSize:
      layout.qrSize != null
        ? Math.max(1, Math.round(layout.qrSize * Math.sqrt(sx * sy)))
        : undefined,
  };
}

/** Clean ticket base: light green + dusty rose border, no baked-in text. Use instead of a missing template to avoid placeholder text. */
function createCleanTicketBase(width: number, height: number): sharp.Sharp {
  const borderW = 24;
  const innerW = width - borderW * 2;
  const innerH = height - borderW * 2;
  const svg = `
    <svg width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="#c9a0a0"/>
      <rect x="${borderW}" y="${borderW}" width="${innerW}" height="${innerH}" fill="#e8f5e9" rx="4"/>
    </svg>
  `;
  return sharp(Buffer.from(svg)).resize(width, height);
}

/** Email attachment extension from a full-ticket storage/public URL (JPEG vs legacy PNG). */
export function ticketAttachmentExtFromImageUrl(url: string | null | undefined): "jpg" | "png" {
  const p = (url ?? "").split(/[?#]/)[0]!.toLowerCase();
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "jpg";
  return "png";
}

/** MIME type when proxying a full-ticket object URL and upstream omitted Content-Type. */
export function ticketImageContentTypeFromUrl(url: string | null | undefined): string {
  return ticketAttachmentExtFromImageUrl(url) === "jpg" ? "image/jpeg" : "image/png";
}

/**
 * Generate a full ticket JPEG (750×1650) and upload to Supabase.
 * Returns the public URL, or null on failure.
 */
export async function generateAndUploadTicketImage(
  ticketId: string,
  params: TicketImageParams
): Promise<string | null> {
  try {
    const renderConfig = params.renderConfig ?? {
      width: TICKET_TEMPLATE_WIDTH_PX,
      height: TICKET_TEMPLATE_HEIGHT_PX,
      jpegQuality: TICKET_TEMPLATE_JPEG_QUALITY,
      dpi: TICKET_RENDER_DPI,
    };
    const width = clampTicketTemplateWidthPx(renderConfig.width);
    const height = clampTicketTemplateHeightPx(renderConfig.height);
    const jpegQuality = clampTicketJpegQuality(renderConfig.jpegQuality);
    const dpi = clampTicketDpi(renderConfig.dpi);
    let base: sharp.Sharp;

    if (params.templateImageUrl) {
      try {
        const logKey = ticketId.includes("/") ? "storageObjectKey" : "ticketId";
        console.log("[ticket-image] loading template image", {
          [logKey]: ticketId,
          templateImageUrl: params.templateImageUrl,
        });
        const buf = await loadTemplateImageBuffer(params.templateImageUrl);
        if (buf && buf.length > 0) {
          base = sharp(buf).resize(width, height);
        } else {
          throw new Error("Template load returned empty buffer");
        }
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        console.warn("[ticket-image] Template fetch failed, using clean base:", msg);
        base = createCleanTicketBase(width, height);
      }
    } else {
      base = createCleanTicketBase(width, height);
    }

    const layout = scaleLayoutToCanvas(params.layoutConfig ?? DEFAULT_LAYOUT, width, height);
    const eventInfoSize = getLayoutSize(layout, "eventInfo");
    const sectionSize = getLayoutSize(layout, "section");
    const priceSize = getLayoutSize(layout, "price");
    const qrSize = getLayoutSize(layout, "qr").w;
    const ticketNumSize = getLayoutSize(layout, "ticketNumber");
    const encryptedQrSize = getLayoutSize(layout, "encryptedQr");
    const websiteSize = getLayoutSize(layout, "website");

    const priceDisplay = params.complementary
      ? (0).toLocaleString("en-PH", { style: "currency", currency: "PHP" })
      : params.priceCents != null
        ? (params.priceCents / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" })
        : "—";

    const codeMapping = resolveTicketCodeMapping({
      qrPayloadCandidate: params.qrData,
      ctrlCandidate: params.ticketNumber,
      encryptedCandidate: params.encryptedQr ?? null,
    });

    const qrBuffer = await generateQRBuffer(codeMapping.qrPayload);
    const qrResized = await sharp(qrBuffer)
      .resize(qrSize, qrSize)
      .png()
      .toBuffer();

    const eventTitle = (params.eventTitle || "EVENT").toUpperCase().slice(0, 60);
    const venueName = (params.venueName || "VENUE").toUpperCase().slice(0, 60);
    const dateTime = formatEventDateTimeLong(params.eventStart);

    const ew = eventInfoSize.w;
    const eh = eventInfoSize.h;
    const boxH = Math.floor(eh / 3);
    const boxW = Math.floor(ew * 0.8);
    const boxX = Math.floor(ew * 0.1);
    const cx = ew / 2;
    const eventBoxFont = 24;

    const font = await loadFont();
    const titleWrap = wrapText(eventTitle, boxW, 2, eventBoxFont);
    const venueWrap = wrapText(venueName, boxW, 2, eventBoxFont);
    const dateWrap = wrapText(dateTime, boxW, 2, eventBoxFont);

    function eventBoxBaseline(boxIndex: number, lines: string[], fontSize: number): number {
      const boxTop = boxIndex * boxH;
      const n = lines.length;
      return boxTop + boxH / 2 - (n - 1) * fontSize * 0.6 + fontSize * 0.4;
    }

    const eventInfoPaths =
      textToPathElements(font, titleWrap.lines, {
        x: cx,
        firstLineY: eventBoxBaseline(0, titleWrap.lines, titleWrap.fontSize),
        fontSize: titleWrap.fontSize,
        align: "center",
      }) +
      textToPathElements(font, venueWrap.lines, {
        x: cx,
        firstLineY: eventBoxBaseline(1, venueWrap.lines, venueWrap.fontSize),
        fontSize: venueWrap.fontSize,
        align: "center",
      }) +
      textToPathElements(font, dateWrap.lines, {
        x: cx,
        firstLineY: eventBoxBaseline(2, dateWrap.lines, dateWrap.fontSize),
        fontSize: dateWrap.fontSize,
        align: "center",
      });

    const eventInfoSvg = `
      <svg width="${ew}" height="${eh}" xmlns="http://www.w3.org/2000/svg">
        <style>.box { fill: rgba(255,255,255,0.98); stroke: rgba(0,0,0,0.2); stroke-width: 1; }</style>
        <rect class="box" x="${boxX}" y="0" width="${boxW}" height="${boxH - 2}" rx="4"/>
        <rect class="box" x="${boxX}" y="${boxH}" width="${boxW}" height="${boxH - 2}" rx="4"/>
        <rect class="box" x="${boxX}" y="${boxH * 2}" width="${boxW}" height="${boxH - 2}" rx="4"/>
        ${eventInfoPaths}
      </svg>
    `;

    const sw = sectionSize.w;
    const sh = sectionSize.h;
    const sectionValueW = sw - 24;

    const sectionPaths = buildSectionPanelPaths(font, {
      sectionGroup: params.sectionGroup,
      sectionName: params.sectionName,
      sectionCode: params.sectionCode,
      seatLabel: params.seatLabel,
    }, sectionValueW);

    const sectionSvg = `
      <svg width="${sw}" height="${sh}" xmlns="http://www.w3.org/2000/svg">
        <style>.box { fill: rgba(255,255,255,0.98); stroke: rgba(0,0,0,0.2); stroke-width: 1; }</style>
        <rect class="box" x="0" y="0" width="${sw}" height="${sh}" rx="4"/>
        ${sectionPaths}
      </svg>
    `;

    const pw = priceSize.w;
    const ph = priceSize.h;
    const priceWrap = wrapText(priceDisplay, pw - 8, 1, 18);

    const pricePaths =
      textToPathElements(font, ["Price"], { x: 8, firstLineY: ph * 0.32, fontSize: 12, fill: "#555" }) +
      textToPathElements(font, priceWrap.lines, { x: 8, firstLineY: ph * 0.78, fontSize: priceWrap.fontSize });

    const priceSvg = `
      <svg width="${pw}" height="${ph}" xmlns="http://www.w3.org/2000/svg">
        <style>.box { fill: rgba(255,255,255,0.98); stroke: rgba(0,0,0,0.2); stroke-width: 1; }</style>
        <rect class="box" x="0" y="0" width="${pw}" height="${ph}" rx="4"/>
        ${pricePaths}
      </svg>
    `;

    const tw = ticketNumSize.w;
    const th = ticketNumSize.h;
    const ticketNumText = `CTRL: ${codeMapping.ctrlText}`.slice(0, 32);
    const ticketNumWrap = wrapText(ticketNumText, tw - 8, 2, 20);
    const ticketNumY =
      th / 2 - (ticketNumWrap.lines.length - 1) * ticketNumWrap.fontSize * 0.6 + ticketNumWrap.fontSize * 0.4;

    const ticketNumPaths = textToPathElements(font, ticketNumWrap.lines, {
      x: tw / 2,
      firstLineY: ticketNumY,
      fontSize: ticketNumWrap.fontSize,
      align: "center",
    });

    const ticketNumSvg = `
      <svg width="${tw}" height="${th}" xmlns="http://www.w3.org/2000/svg">
        <style>.box { fill: rgba(255,255,255,0.98); stroke: rgba(0,0,0,0.2); stroke-width: 1; }</style>
        <rect class="box" x="0" y="0" width="${tw}" height="${th}" rx="4"/>
        ${ticketNumPaths}
      </svg>
    `;

    const encryptedQrText = codeMapping.encryptedText.slice(0, 16);
    const eqw = encryptedQrSize.w;
    const eqh = encryptedQrSize.h;
    /** ~1.3× prior defaults (20 / 10) for readability under the QR. */
    const encryptedQrWrap = wrapText(encryptedQrText, eqw - 8, 2, 26, 13);
    const encryptedQrY =
      eqh / 2 -
      (encryptedQrWrap.lines.length - 1) * encryptedQrWrap.fontSize * 0.6 +
      encryptedQrWrap.fontSize * 0.4;

    const encryptedQrPaths = textToPathElements(font, encryptedQrWrap.lines, {
      x: eqw / 2,
      firstLineY: encryptedQrY,
      fontSize: encryptedQrWrap.fontSize,
      stroke: "#1a1a1a",
      strokeWidth: 0.65,
      align: "center",
    });

    const encryptedQrSvg = `
      <svg width="${eqw}" height="${eqh}" xmlns="http://www.w3.org/2000/svg">
        <style>.box { fill: rgba(255,255,255,0.98); stroke: rgba(0,0,0,0.2); stroke-width: 1; }</style>
        <rect class="box" x="0" y="0" width="${eqw}" height="${eqh}" rx="4"/>
        ${encryptedQrPaths}
      </svg>
    `;

    const websiteUrl = getSiteOrigin();
    const websiteW = websiteSize.w;
    const websiteH = websiteSize.h;
    const websiteFontSize = 18;
    const websitePaths = textToPathElements(font, [websiteUrl], {
      x: websiteW / 2,
      firstLineY: websiteH / 2 - websiteFontSize * 0.35,
      fontSize: websiteFontSize,
      align: "center",
      fill: "#555",
    });
    const websiteSvg = `
      <svg width="${websiteW}" height="${websiteH}" xmlns="http://www.w3.org/2000/svg">
        ${websitePaths}
      </svg>
    `;

    const eventInfoBuf = Buffer.from(eventInfoSvg);
    const sectionBuf = Buffer.from(sectionSvg);
    const priceBuf = Buffer.from(priceSvg);
    const ticketNumBuf = Buffer.from(ticketNumSvg);
    const encryptedQrBuf = Buffer.from(encryptedQrSvg);
    const websiteBuf = Buffer.from(websiteSvg);

    const pricePos = (layout.price ?? DEFAULT_LAYOUT.price) as RegionPos;
    const websitePos = (layout.website ?? DEFAULT_LAYOUT.website) as RegionPos;
    const composites: { input: Buffer; top: number; left: number }[] = [
      { input: eventInfoBuf, top: layout.eventInfo.top, left: layout.eventInfo.left },
      { input: sectionBuf, top: layout.section.top, left: layout.section.left },
      { input: priceBuf, top: pricePos.top, left: pricePos.left },
      { input: qrResized, top: layout.qr.top, left: layout.qr.left },
      { input: ticketNumBuf, top: layout.ticketNumber.top, left: layout.ticketNumber.left },
      { input: encryptedQrBuf, top: layout.encryptedQr.top, left: layout.encryptedQr.left },
      { input: websiteBuf, top: websitePos.top, left: websitePos.left },
    ];
    const output = await base
      .composite(composites)
      .withMetadata({ density: dpi })
      .jpeg({ quality: jpegQuality, mozjpeg: true })
      .toBuffer();

    const adminClient = createAdminClient();
    const path = `${ticketId}.jpg`;

    const { error } = await adminClient.storage
      .from(BUCKET)
      .upload(path, output, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (error) {
      console.error("[ticket-image] Upload failed:", error.message, {
        bucket: BUCKET,
        path,
        code: (error as { code?: string })?.code,
      });
      return null;
    }

    const { data } = adminClient.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[ticket-image] Error:", err.message, err.stack);
    return null;
  }
}

/**
 * Generate ticket image for an existing ticket by ID (on-demand).
 * Fetches ticket, booking, event, venue, section/seat data and calls generateAndUploadTicketImage.
 * Updates the ticket with ticket_image_url when successful.
 * Returns the URL or null.
 */
export async function generateTicketImageForTicketId(
  ticketId: string,
  opts?: { storagePath?: string }
): Promise<string | null> {
  const adminClient = createAdminClient();

  const { data: ticket } = await adminClient
    .from("tickets")
    .select("id, qr_data, encrypted_qr, seat_id, section_id, booking_id, is_complementary")
    .eq("id", ticketId)
    .single();

  if (!ticket) {
    console.error("[ticket-image] generateTicketImageForTicketId: ticket not found", {
      ticketId,
    });
    return null;
  }

  const qrPayload = ticket?.encrypted_qr ?? ticket?.qr_data ?? null;
  if (!qrPayload) {
    console.error("[ticket-image] generateTicketImageForTicketId: missing ticket encrypted_qr/qr_data", {
      ticketId,
      foundTicket: !!ticket,
    });
    return null;
  }

  const { data: booking } = await adminClient
    .from("bookings")
    .select("event_id")
    .eq("id", ticket.booking_id)
    .single();

  if (!booking?.event_id) {
    console.error("[ticket-image] generateTicketImageForTicketId: booking missing event_id", {
      ticketId,
      bookingId: ticket.booking_id,
    });
    return null;
  }

  const { data: eventRow } = await adminClient
    .from("events")
    .select(
      "id, title, event_start, venue_id, ticket_template_image_url, early_bird_starts_at, early_bird_ends_at"
    )
    .eq("id", booking.event_id)
    .single();

  if (!eventRow) {
    console.error("[ticket-image] generateTicketImageForTicketId: event not found", {
      ticketId,
      eventId: booking.event_id,
    });
    return null;
  }

  const [{ data: venueRow }, { data: seat }] = await Promise.all([
    eventRow.venue_id
      ? adminClient.from("venues").select("name").eq("id", eventRow.venue_id).single()
      : Promise.resolve({ data: null as { name?: string } | null }),
    ticket.seat_id
      ? adminClient
          .from("event_seats")
          .select("row_label, seat_number, event_section_id")
          .eq("id", ticket.seat_id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const venueName = (venueRow as { name?: string } | null)?.name ?? "TBA";

  let sectionCode = "—";
  let sectionName = "—";
  let sectionGroup: string | null = null;
  let seatLabel = "General";
  let sectionId: string | null = ticket.section_id;

  if (ticket.seat_id) {
    if (seat?.event_section_id) {
      sectionId = seat.event_section_id;
      const { data: sec } = await adminClient
        .from("event_sections")
        .select("section_code, name, seating_type, section_group")
        .eq("id", seat.event_section_id)
        .single();
      sectionCode = sec?.section_code ?? "—";
      sectionName = sec?.name ?? sec?.section_code ?? "—";
      const g = sec?.section_group?.trim();
      sectionGroup = g ? g : null;
      if (sec?.seating_type === "standing") {
        seatLabel = "Standing";
      } else if (sec?.seating_type === "free") {
        seatLabel = "Free Seating";
      } else {
        seatLabel = `Row ${seat.row_label ?? "-"} Seat ${seat.seat_number ?? "-"}`;
      }
    }
  } else if (ticket.section_id) {
    const { data: sec } = await adminClient
      .from("event_sections")
      .select("section_code, name, seating_type, section_group")
      .eq("id", ticket.section_id)
      .single();
    sectionCode = sec?.section_code ?? "—";
    sectionName = sec?.name ?? sec?.section_code ?? "—";
    const g = sec?.section_group?.trim();
    sectionGroup = g ? g : null;
    seatLabel =
      sec?.seating_type === "standing" ? "Standing" : "Free Seating";
  }

  const isComplementary = (ticket as { is_complementary?: boolean })?.is_complementary ?? false;

  let priceCents: number | undefined;
  if (!isComplementary && sectionId) {
    const [{ data: basePrice }, { data: earlyBird }] = await Promise.all([
      adminClient
        .from("event_prices")
        .select("price_cents")
        .eq("event_id", booking.event_id)
        .eq("section_id", sectionId)
        .single(),
      adminClient
        .from("early_bird_prices")
        .select("discount_percent")
        .eq("event_id", booking.event_id)
        .eq("section_id", sectionId)
        .single(),
    ]);
    const now = new Date().toISOString();
    const useEarlyBird =
      eventRow.early_bird_starts_at != null &&
      eventRow.early_bird_ends_at != null &&
      now >= eventRow.early_bird_starts_at &&
      now <= eventRow.early_bird_ends_at;
    const baseCents = basePrice?.price_cents ?? 50000;
    if (useEarlyBird && earlyBird?.discount_percent != null) {
      priceCents = Math.floor((baseCents * (100 - earlyBird.discount_percent)) / 100);
    } else {
      priceCents = baseCents;
    }
  }

  const resolved = await getResolvedTicketTemplate(eventRow);
  const storagePath =
    typeof opts?.storagePath === "string" && opts.storagePath.trim().length > 0
      ? opts.storagePath.trim()
      : ticketId;

  const codeMapping = resolveTicketCodeMapping({
    qrPayloadCandidate: ticket?.encrypted_qr ?? ticket?.qr_data ?? null,
    ctrlCandidate: ticket?.qr_data ?? null,
    encryptedCandidate: ticket?.encrypted_qr ?? null,
  });

  const url = await generateAndUploadTicketImage(storagePath, {
    eventTitle: eventRow?.title ?? "Event",
    venueName,
    eventStart: eventRow?.event_start ?? new Date().toISOString(),
    sectionCode,
    sectionName,
    sectionGroup,
    seatLabel,
    priceCents: isComplementary ? undefined : priceCents,
    complementary: isComplementary,
    qrData: codeMapping.qrPayload,
    ticketNumber: codeMapping.ctrlText,
    encryptedQr: codeMapping.encryptedText,
    templateImageUrl: resolved.templateImageUrl,
    layoutConfig: resolved.layoutConfig ?? undefined,
    renderConfig: resolved.renderConfig,
  });

  if (url) {
    await adminClient
      .from("tickets")
      .update({ ticket_image_url: url })
      .eq("id", ticketId);
  } else {
    console.error("[ticket-image] generateTicketImageForTicketId: render/upload returned null", {
      ticketId,
      bookingId: ticket.booking_id,
      eventId: booking.event_id,
      seatId: ticket.seat_id,
      sectionId: ticket.section_id,
    });
  }

  return url;
}

export interface GenerateTicketImageForPrintParams {
  eventId: string;
  eventSectionId: string;
  eventSeatId: string | null;
  printTicketId: string;
  /** If provided, use this qr_data (must match what is stored in print_tickets). */
  qrData?: string;
  /** If provided, use this for the Ticket Number box (qr_data / CTRL display). */
  ticketNumberData?: string;
  /** 1-based free/standing slot when `eventSeatId` is null (shown on ticket art). */
  sectionSlotIndex?: number;
}

/**
 * Generate ticket image for a print-only ticket (no sale/reservation).
 * Uploads under `print-by-section/{event}/{section}/` with basename `{sectionCode}-{row}-{seat}.jpg` (or free/stand variants).
 * Returns the uploaded URL or null.
 */
export async function generateTicketImageForPrint({
  eventId,
  eventSectionId,
  eventSeatId,
  printTicketId,
  qrData: providedQrData,
  ticketNumberData,
  sectionSlotIndex,
}: GenerateTicketImageForPrintParams): Promise<string | null> {
  const adminClient = createAdminClient();
  const { data: printTicketRow } = await adminClient
    .from("print_tickets")
    .select("section_slot_index")
    .eq("id", printTicketId)
    .single();

  const { data: eventRow } = await adminClient
    .from("events")
    .select("title, slug, event_start, venue_id, event_code, ticket_template_image_url")
    .eq("id", eventId)
    .single();

  if (!eventRow) return null;

  const { data: venueRow } = eventRow.venue_id
    ? await adminClient.from("venues").select("name").eq("id", eventRow.venue_id).single()
    : { data: null };
  const venueName = (venueRow as { name?: string } | null)?.name ?? "TBA";

  const { data: sectionRow } = await adminClient
    .from("event_sections")
    .select("section_code, name, seating_type, section_group")
    .eq("id", eventSectionId)
    .single();

  if (!sectionRow) return null;

  const sectionCode = sectionRow.section_code ?? "000";
  const sectionName = sectionRow.name ?? sectionRow.section_code ?? "—";
  const sectionGroupRaw = sectionRow.section_group?.trim();
  const sectionGroup = sectionGroupRaw ? sectionGroupRaw : null;

  let rowLabel = "-";
  let seatNumber = "-";
  let seatLabel: string;

  if (eventSeatId) {
    const { data: seatRow } = await adminClient
      .from("event_seats")
      .select("row_label, seat_number")
      .eq("id", eventSeatId)
      .single();
    if (seatRow) {
      rowLabel = seatRow.row_label ?? "-";
      seatNumber = seatRow.seat_number ?? "-";
      seatLabel = `Row ${rowLabel} Seat ${seatNumber}`;
    } else {
      seatLabel = "—";
    }
  } else {
    const base =
      sectionRow.seating_type === "standing" ? "Standing" : "Free Seating";
    seatLabel =
      sectionSlotIndex != null && sectionSlotIndex >= 1
        ? `${base} — #${sectionSlotIndex}`
        : base;
  }

  const codeMapping = resolveTicketCodeMapping({
    qrPayloadCandidate: providedQrData ?? null,
    ctrlCandidate: ticketNumberData ?? null,
    encryptedCandidate: null,
  });

  let priceCents: number | undefined;
  const [{ data: basePrice }, { data: earlyBird }] = await Promise.all([
    adminClient
      .from("event_prices")
      .select("price_cents")
      .eq("event_id", eventId)
      .eq("section_id", eventSectionId)
      .single(),
    adminClient
      .from("early_bird_prices")
      .select("discount_percent")
      .eq("event_id", eventId)
      .eq("section_id", eventSectionId)
      .single(),
  ]);
  const now = new Date().toISOString();
  const { data: eventData } = await adminClient
    .from("events")
    .select("early_bird_starts_at, early_bird_ends_at")
    .eq("id", eventId)
    .single();
  const useEarlyBird =
    eventData?.early_bird_starts_at != null &&
    eventData?.early_bird_ends_at != null &&
    now >= eventData.early_bird_starts_at &&
    now <= eventData.early_bird_ends_at;
  const baseCents = basePrice?.price_cents ?? 50000;
  if (useEarlyBird && earlyBird?.discount_percent != null) {
    priceCents = Math.floor((baseCents * (100 - earlyBird.discount_percent)) / 100);
  } else {
    priceCents = baseCents;
  }

  const resolved = await getResolvedTicketTemplate(eventRow);
  const eventSlug = slugifyPathSegment(
    (eventRow as { slug?: string | null }).slug ?? eventRow.title ?? "event",
    "event"
  );
  const sectionSlug = slugifyPathSegment(sectionCode || sectionName || "section", "section");
  const storagePath = buildPrintTicketImageStorageKey({
    sectionCode,
    seatingType: sectionRow.seating_type,
    eventSeatId,
    rowLabel,
    seatNumber,
    sectionSlotIndex,
    partitionIndex:
      typeof printTicketRow?.section_slot_index === "number" && printTicketRow.section_slot_index >= 1
        ? Math.floor(printTicketRow.section_slot_index)
        : sectionSlotIndex,
    printTicketId,
    eventSlug,
    sectionSlug,
  });

  return generateAndUploadTicketImage(storagePath, {
    eventTitle: eventRow.title ?? "Event",
    venueName,
    eventStart: eventRow.event_start ?? new Date().toISOString(),
    sectionCode,
    sectionName,
    sectionGroup,
    seatLabel,
    priceCents,
    complementary: false,
    qrData: codeMapping.qrPayload,
    ticketNumber: codeMapping.ctrlText,
    encryptedQr: codeMapping.encryptedText,
    templateImageUrl: resolved.templateImageUrl,
    layoutConfig: resolved.layoutConfig ?? undefined,
    renderConfig: resolved.renderConfig,
  });
}
