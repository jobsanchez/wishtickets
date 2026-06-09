import { getAdminClientIfAvailable } from "@/lib/supabase/admin";
import { createPublicAnonClient } from "@/lib/supabase/public-anon";
import type { HomeBannerSlide } from "@/lib/events/event-grid-types";

type RpcRow = {
  banner_id: string;
  event_slug: string;
  event_title: string;
  image_url: string;
};

function interleaveBannerRowsByEvent(rows: RpcRow[]): RpcRow[] {
  const grouped = new Map<string, RpcRow[]>();
  for (const row of rows) {
    const existing = grouped.get(row.event_slug);
    if (existing) {
      existing.push(row);
    } else {
      grouped.set(row.event_slug, [row]);
    }
  }

  const queues = Array.from(grouped.values());
  const output: RpcRow[] = [];

  let hasItems = true;
  while (hasItems) {
    hasItems = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        output.push(next);
        hasItems = true;
      }
    }
  }

  return output;
}

export async function getHomeBannerSlidesForCarousel(): Promise<HomeBannerSlide[]> {
  const supabase = getAdminClientIfAvailable() ?? createPublicAnonClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc("get_home_banner_carousel_rows");
    if (error) {
      console.error("[getHomeBannerSlidesForCarousel]", error.message);
      return [];
    }
    const rows = (data ?? []) as RpcRow[];
    const interleavedRows = interleaveBannerRowsByEvent(rows);
    return interleavedRows.map((r) => ({
      bannerId: r.banner_id,
      eventSlug: r.event_slug,
      eventTitle: r.event_title,
      imageUrl: r.image_url,
    }));
  } catch (e) {
    console.error("[getHomeBannerSlidesForCarousel]", e);
    return [];
  }
}
