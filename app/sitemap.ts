import type { MetadataRoute } from "next";
import { createPublicAnonClient } from "@/lib/supabase/public-anon";

function siteBase(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

/** Public marketing routes (same as main nav / legal). */
const STATIC_PATHS: {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}[] = [
  { path: "", changeFrequency: "daily", priority: 1 },
  { path: "/about", changeFrequency: "weekly", priority: 0.8 },
  { path: "/contact", changeFrequency: "weekly", priority: 0.8 },
  { path: "/privacy-policy", changeFrequency: "monthly", priority: 0.5 },
  { path: "/terms-of-use", changeFrequency: "monthly", priority: 0.5 },
];

type EventRow = { slug?: string | null; updated_at?: string | null };

const EVENT_PAGE_SIZE = 100;
const EVENT_PAGE_CAP = 40;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteBase();
  if (!base) return [];

  const now = new Date();
  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map(({ path, changeFrequency, priority }) => ({
    url: path === "" ? base : `${base}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));

  const supabase = createPublicAnonClient();
  if (!supabase) return entries;

  const slugSeen = new Set<string>();

  for (let page = 0; page < EVENT_PAGE_CAP; page++) {
    const { data, error } = await supabase.rpc("get_upcoming_events", {
      p_category: null,
      p_search: null,
      p_limit: EVENT_PAGE_SIZE,
      p_offset: page * EVENT_PAGE_SIZE,
    });

    if (error) break;

    const rows = Array.isArray(data) ? (data as EventRow[]) : [];
    if (rows.length === 0) break;

    for (const ev of rows) {
      const slug = typeof ev.slug === "string" ? ev.slug.trim() : "";
      if (!slug || slugSeen.has(slug)) continue;
      slugSeen.add(slug);
      const updated = ev.updated_at ? new Date(ev.updated_at) : now;
      entries.push({
        url: `${base}/${encodeURIComponent(slug)}`,
        lastModified: updated,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    if (rows.length < EVENT_PAGE_SIZE) break;
  }

  return entries;
}
