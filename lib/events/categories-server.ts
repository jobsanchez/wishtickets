import { getTodayManilaDateKey } from "@/lib/event-public-visibility";
import { createPublicAnonClient } from "@/lib/supabase/public-anon";

export type EventCategoryOption = { value: string; label: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeCategoryRows(data: unknown): EventCategoryOption[] {
  if (!Array.isArray(data)) return [];
  const out: EventCategoryOption[] = [];
  for (const row of data) {
    if (!isRecord(row)) continue;
    const value = row.value;
    const label = row.label;
    const v = typeof value === "string" ? value : typeof label === "string" ? label : "";
    const l = typeof label === "string" ? label : typeof value === "string" ? value : "";
    if (!v && !l) continue;
    out.push({ value: v || l, label: l || v });
  }
  return out;
}

async function fetchEventCategoriesRpc(): Promise<EventCategoryOption[]> {
  const supabase = createPublicAnonClient();
  if (!supabase) return [];
  const todayManila = getTodayManilaDateKey();
  const { data, error } = await supabase
    .from("events")
    .select("category")
    .eq("status", "published")
    .gte("public_list_visible_until", todayManila)
    .not("category", "is", null);
  if (error) {
    console.error("[fetchEventCategoriesRpc]", error.message);
    return [];
  }

  const seen = new Set<string>();
  const categories = (Array.isArray(data) ? data : [])
    .map((row) => {
      const value = isRecord(row) && typeof row.category === "string" ? row.category.trim() : "";
      return value;
    })
    .filter((value) => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.localeCompare(b));

  return normalizeCategoryRows(categories.map((value) => ({ value, label: value })));
}

/** Same RPC as GET /api/events/categories — always fresh (no Next data cache). */
export async function getEventCategoriesForHome(): Promise<EventCategoryOption[]> {
  return fetchEventCategoriesRpc();
}
