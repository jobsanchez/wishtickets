import {
  resolveSectionGroup,
  type SectionMaps,
} from "@/lib/reports-section-grouping";

export interface DailyOnlineSalesSeries {
  key: string;
  name: string;
  color: string | null;
  sort_order: number;
}

export interface DailyOnlineSalesDay {
  date: string;
  date_label: string;
  [stackKey: string]: string | number;
}

export interface DailyOnlineSalesByGroup {
  days: DailyOnlineSalesDay[];
  series: DailyOnlineSalesSeries[];
}

const MANILA_TZ = "Asia/Manila";

function toManilaDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatDateLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString("en-PH", {
    timeZone: MANILA_TZ,
    month: "short",
    day: "numeric",
  });
}

function stackKeyForIndex(index: number): string {
  return `g_${index}`;
}

type TicketFact = {
  booking_id: string;
  qty: number;
  assign?: { distribution_category?: string | null; id?: string } | null;
  resolvedSectionId: string | null;
  is_complementary: boolean;
};

export function buildDailyOnlineSalesByGroup(params: {
  bookingCreatedAt: Map<string, string>;
  ticketFacts: TicketFact[];
  dominantSectionByBooking: Map<string, string>;
  sectionNameById: Map<string, string>;
  sectionGroupMaps: SectionMaps;
}): DailyOnlineSalesByGroup {
  const seriesMeta = new Map<
    string,
    { key: string; name: string; color: string | null; sort_order: number }
  >();
  const countsByDay = new Map<string, Map<string, number>>();

  for (const fact of params.ticketFacts) {
    if (fact.assign?.distribution_category === "complementary") continue;
    if (fact.assign?.distribution_category === "sales") continue;
    if (fact.is_complementary) continue;

    const createdAt = params.bookingCreatedAt.get(fact.booking_id);
    if (!createdAt) continue;
    const dateKey = toManilaDateKey(createdAt);
    if (!dateKey) continue;

    const sectionId =
      fact.resolvedSectionId ?? params.dominantSectionByBooking.get(fact.booking_id) ?? null;
    const sectionName = sectionId ? params.sectionNameById.get(sectionId) : undefined;
    const group = resolveSectionGroup(params.sectionGroupMaps, sectionId, sectionName);

    let meta = seriesMeta.get(group.label);
    if (!meta) {
      const index = seriesMeta.size;
      meta = {
        key: stackKeyForIndex(index),
        name: group.label,
        color: group.color,
        sort_order: group.sortOrder,
      };
      seriesMeta.set(group.label, meta);
    }

    const dayMap = countsByDay.get(dateKey) ?? new Map<string, number>();
    dayMap.set(meta.key, (dayMap.get(meta.key) ?? 0) + fact.qty);
    countsByDay.set(dateKey, dayMap);
  }

  const series = [...seriesMeta.values()].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  );

  const days: DailyOnlineSalesDay[] = [...countsByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => {
      const row: DailyOnlineSalesDay = {
        date,
        date_label: formatDateLabel(date),
      };
      for (const s of series) {
        row[s.key] = counts.get(s.key) ?? 0;
      }
      return row;
    });

  return { days, series };
}
