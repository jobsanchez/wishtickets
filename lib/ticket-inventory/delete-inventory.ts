import type { SupabaseClient as AdminSupabaseClient } from "@supabase/supabase-js";
import { resolveTicketImageStorageObjectPath } from "@/lib/print-tickets/folder-links";
import { TicketInventoryError } from "@/lib/ticket-inventory/types";

const TICKET_IMAGES_BUCKET = "ticket-images";
const ROW_CHUNK = 200;
const STORAGE_REMOVE_CHUNK = 100;

export type DeleteInventoryResult = {
  deleted: number;
  skipped_allocated: number;
  storage_removed: number;
  section_ids: string[];
};

/**
 * Remove unallocated `print_tickets` rows (and their storage PNGs) for section(s).
 * Allocated / sold inventory is never deleted.
 */
export async function deleteInventoryForSections(
  admin: AdminSupabaseClient,
  eventId: string,
  sectionIds: string[]
): Promise<DeleteInventoryResult> {
  const uniqueSectionIds = [...new Set(sectionIds.filter(Boolean))];
  if (uniqueSectionIds.length === 0) {
    return { deleted: 0, skipped_allocated: 0, storage_removed: 0, section_ids: [] };
  }

  const { data: ownedSections, error: secErr } = await admin
    .from("event_sections")
    .select("id")
    .eq("event_id", eventId)
    .in("id", uniqueSectionIds);
  if (secErr) throw new Error(secErr.message);
  const allowedIds = (ownedSections ?? []).map((s) => s.id as string);
  if (allowedIds.length === 0) {
    throw new TicketInventoryError("No matching sections for this event", "sections_not_found", 404);
  }

  const rows: Array<{ id: string; ticket_image_url: string | null; allocated_ticket_id: string | null }> =
    [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("print_tickets")
      .select("id, ticket_image_url, allocated_ticket_id")
      .eq("event_id", eventId)
      .in("event_section_id", allowedIds)
      .range(from, from + ROW_CHUNK - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as Array<{
      id: string;
      ticket_image_url: string | null;
      allocated_ticket_id: string | null;
    }>;
    rows.push(...chunk);
    if (chunk.length < ROW_CHUNK) break;
    from += ROW_CHUNK;
  }

  const toDelete = rows.filter((r) => !r.allocated_ticket_id);
  const skipped_allocated = rows.length - toDelete.length;
  if (toDelete.length === 0) {
    return {
      deleted: 0,
      skipped_allocated,
      storage_removed: 0,
      section_ids: allowedIds,
    };
  }

  const storagePaths = new Set<string>();
  for (const row of toDelete) {
    const path = resolveTicketImageStorageObjectPath(row.ticket_image_url ?? "");
    if (path) storagePaths.add(path);
  }

  const ids = toDelete.map((r) => r.id);
  for (let i = 0; i < ids.length; i += ROW_CHUNK) {
    const chunk = ids.slice(i, i + ROW_CHUNK);
    const { error } = await admin.from("print_tickets").delete().in("id", chunk);
    if (error) throw new Error(error.message);
  }

  let storage_removed = 0;
  const pathList = [...storagePaths];
  for (let i = 0; i < pathList.length; i += STORAGE_REMOVE_CHUNK) {
    const chunk = pathList.slice(i, i + STORAGE_REMOVE_CHUNK);
    const { data, error } = await admin.storage.from(TICKET_IMAGES_BUCKET).remove(chunk);
    if (error) throw new Error(error.message);
    const reported = Array.isArray(data) ? data.length : 0;
    storage_removed += reported > 0 ? reported : chunk.length;
  }

  return {
    deleted: ids.length,
    skipped_allocated,
    storage_removed,
    section_ids: allowedIds,
  };
}
