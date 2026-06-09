import type { SupabaseClient as AdminSupabaseClient } from "@supabase/supabase-js";
import type { SectionInventorySummary } from "@/lib/ticket-inventory/types";

const PAGE = 1000;

function hasImage(url: string | null | undefined): boolean {
  return typeof url === "string" && url.trim().length > 0;
}

/**
 * Per-section ticket inventory counts for Seat Configurator UI.
 */
export async function getEventInventorySummaries(
  admin: AdminSupabaseClient,
  eventId: string,
  sectionIds: string[]
): Promise<Map<string, SectionInventorySummary>> {
  const out = new Map<string, SectionInventorySummary>();
  const uniqueSectionIds = [...new Set(sectionIds.filter(Boolean))];
  for (const sid of uniqueSectionIds) {
    out.set(sid, {
      section_id: sid,
      seats_count: 0,
      inventory_count: 0,
      images_count: 0,
      allocated_count: 0,
    });
  }

  if (uniqueSectionIds.length === 0) return out;

  const seatsCountBySection = new Map<string, number>();
  for (const sectionId of uniqueSectionIds) {
    const { count, error } = await admin
      .from("event_seats")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("event_section_id", sectionId);
    if (!error && count != null) {
      seatsCountBySection.set(sectionId, count);
      const row = out.get(sectionId);
      if (row) row.seats_count = count;
    }
  }

  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("print_tickets")
      .select(
        "event_section_id, ticket_image_url, allocated_ticket_id, event_seat_id"
      )
      .eq("event_id", eventId)
      .in("event_section_id", uniqueSectionIds)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    for (const pt of chunk) {
      const sid = pt.event_section_id as string;
      const row = out.get(sid);
      if (!row) continue;
      row.inventory_count += 1;
      if (hasImage(pt.ticket_image_url as string | null)) row.images_count += 1;
      if (pt.allocated_ticket_id) row.allocated_count += 1;
    }
    if (chunk.length < PAGE) break;
    from += PAGE;
  }

  return out;
}

export async function sectionHasAllocatedInventory(
  admin: AdminSupabaseClient,
  eventId: string,
  sectionIds: string[]
): Promise<{ hasAllocated: boolean; allocatedCount: number }> {
  const uniqueSectionIds = [...new Set(sectionIds.filter(Boolean))];
  if (uniqueSectionIds.length === 0) {
    return { hasAllocated: false, allocatedCount: 0 };
  }

  const { count, error } = await admin
    .from("print_tickets")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .in("event_section_id", uniqueSectionIds)
    .not("allocated_ticket_id", "is", null);

  if (error) throw new Error(error.message);
  const allocatedCount = count ?? 0;
  return { hasAllocated: allocatedCount > 0, allocatedCount };
}
