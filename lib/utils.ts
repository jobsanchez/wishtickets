import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Returns "black" or "white" for optimal contrast on the given background color.
 * Light backgrounds -> black text; dark backgrounds -> white text.
 */
export function getContrastTextColor(bgColor: string | null | undefined): "black" | "white" {
  if (!bgColor || typeof bgColor !== "string") return "white";
  const hex = bgColor.trim();
  let r = 0,
    g = 0,
    b = 0;
  const hexMatch = hex.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (hexMatch) {
    let h = hexMatch[1];
    if (h.length === 3) h = h[0]! + h[0] + h[1]! + h[1] + h[2]! + h[2];
    if (h.length >= 6) {
      r = parseInt(h.slice(0, 2), 16) / 255;
      g = parseInt(h.slice(2, 4), 16) / 255;
      b = parseInt(h.slice(4, 6), 16) / 255;
    }
  } else {
    const rgbMatch = hex.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
      r = parseInt(rgbMatch[1]!, 10) / 255;
      g = parseInt(rgbMatch[2]!, 10) / 255;
      b = parseInt(rgbMatch[3]!, 10) / 255;
    }
  }
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.5 ? "black" : "white";
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Returns YouTube video ID if the given URL is a YouTube link, else null. */
export function getYouTubeVideoId(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  const shorts = trimmed.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i);
  if (shorts) return shorts[1]!;
  const match = trimmed.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1]! : null;
}

/** True when the teaser URL points at a YouTube Shorts page (vertical). */
export function isYouTubeShortsUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  return /youtube\.com\/shorts\//i.test(url.trim());
}

/** Returns YouTube embed URL if the given URL is a YouTube link, else null. */
export function getYouTubeEmbedUrl(url: string | null | undefined): string | null {
  const videoId = getYouTubeVideoId(url);
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

/** Returns Vimeo embed URL if the given URL is a Vimeo link, else null. */
export function getVimeoEmbedUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const match = trimmed.match(
    /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/
  );
  return match ? `https://player.vimeo.com/video/${match[1]}` : null;
}

/** Video type for dynamic teaser URLs. */
export type VideoEmbedType = "youtube" | "vimeo" | "direct";

function resolveSupabaseStorageVideoUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "";
  if (!base) return null;

  // Supports `storage://bucket/path/to/file.mp4` so we can store canonical storage refs.
  if (trimmed.startsWith("storage://")) {
    const withoutScheme = trimmed.slice("storage://".length);
    const slash = withoutScheme.indexOf("/");
    if (slash <= 0) return null;
    const bucket = withoutScheme.slice(0, slash);
    const objectPath = withoutScheme.slice(slash + 1);
    if (!bucket || !objectPath) return null;
    return `${base}/storage/v1/object/public/${bucket}/${objectPath}`;
  }

  // Supports absolute public storage path values.
  if (trimmed.startsWith("/storage/v1/object/public/")) {
    return `${base}${trimmed}`;
  }

  return null;
}

/** Resolves any video URL to embed info. Use for dynamic teaser_video_url. */
export function getVideoEmbedInfo(
  url: string | null | undefined
): { type: "youtube" | "vimeo"; embedUrl: string } | { type: "direct"; url: string } | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const yt = getYouTubeEmbedUrl(trimmed);
  if (yt) return { type: "youtube", embedUrl: yt };

  const vimeo = getVimeoEmbedUrl(trimmed);
  if (vimeo) return { type: "vimeo", embedUrl: vimeo };

  // Direct video (mp4/webm) URL or canonical Supabase storage reference.
  const resolvedDirect = resolveSupabaseStorageVideoUrl(trimmed);
  if (resolvedDirect) return { type: "direct", url: resolvedDirect };
  return null;
}
