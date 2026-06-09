/**
 * Section accent colors for buyer UI (open seating rows, etc.).
 * Mirrors admin palette defaults — many sections have null `color` in DB until
 * an admin explicitly saves from the color picker.
 */

const ACCENT_FALLBACK_PALETTE = [
  "#e63946",
  "#f97316",
  "#facc15",
  "#84cc16",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#a855f7",
  "#ec4899",
] as const;

function hashStringToUint(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Accepts #RGB, #RRGGBB, #RRGGBBAA, or bare 3/6/8 hex; returns lowercase #RRGGBB or #RRGGBBAA. */
export function normalizeSectionHexForCss(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || /^null$/i.test(raw)) return null;
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  const body = withHash.slice(1);
  if (!/^[0-9a-fA-F]+$/i.test(body)) return null;
  if (body.length === 3) {
    const r = body[0]! + body[0]!;
    const g = body[1]! + body[1]!;
    const b = body[2]! + body[2]!;
    return `#${r}${g}${b}`.toLowerCase();
  }
  if (body.length === 6 || body.length === 8) {
    return `#${body.toLowerCase()}`;
  }
  return null;
}

/**
 * Hex for borders/tints: persisted section color when valid, else a stable
 * palette entry from `sectionId` so open-seating rows stay distinct.
 */
export function resolveSectionAccentHex(color: unknown, sectionId: string): string {
  const normalized = normalizeSectionHexForCss(color);
  if (normalized) return normalized;
  const idx = hashStringToUint(sectionId) % ACCENT_FALLBACK_PALETTE.length;
  return ACCENT_FALLBACK_PALETTE[idx]!;
}
