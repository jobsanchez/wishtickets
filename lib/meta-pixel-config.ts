/** `app_config` key for Meta (Facebook) Pixel site tag. */
export const META_PIXEL_APP_CONFIG_KEY = "meta_pixel" as const;

export type MetaPixelAppConfig = {
  enabled: boolean;
  pixel_id: string;
};

export const DEFAULT_META_PIXEL_APP_CONFIG: MetaPixelAppConfig = {
  enabled: false,
  pixel_id: "",
};

const PIXEL_ID_MAX_LEN = 32;

/** Keep only digits; Facebook Pixel IDs are numeric strings. */
export function normalizeMetaPixelId(raw: unknown): string {
  const s =
    typeof raw === "number" && Number.isFinite(raw)
      ? String(Math.trunc(raw))
      : typeof raw === "string"
        ? raw
        : "";
  return s.replace(/\D/g, "").slice(0, PIXEL_ID_MAX_LEN);
}

/** Parse jsonb / unknown into a safe MetaPixelAppConfig. */
export function parseMetaPixelAppConfig(value: unknown): MetaPixelAppConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_META_PIXEL_APP_CONFIG };
  }
  const o = value as Record<string, unknown>;
  const enabled = o.enabled === true;
  const pixel_id = normalizeMetaPixelId(o.pixel_id);
  return { enabled, pixel_id };
}

export function normalizeMetaPixelPatchBody(body: unknown): MetaPixelAppConfig | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  if (typeof o.enabled !== "boolean") return null;
  const pixel_id = normalizeMetaPixelId(o.pixel_id);
  return { enabled: o.enabled, pixel_id };
}
