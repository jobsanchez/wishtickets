import type { SupabaseClient as AdminSupabaseClient } from "@supabase/supabase-js";
import {
  AllocateInventoryResult,
  TicketInventoryError,
} from "@/lib/ticket-inventory/types";
import { ensureInventoryForSeats } from "@/lib/ticket-inventory/ensure-inventory";

function rowToAllocateResult(row: {
  id: string;
  qr_data: string;
  encrypted_qr: string | null;
  ticket_image_url: string | null;
  event_seat_id: string | null;
  event_section_id: string;
}): AllocateInventoryResult {
  return {
    print_ticket_id: row.id,
    qr_data: row.qr_data,
    encrypted_qr: (row.encrypted_qr ?? row.qr_data).trim(),
    ticket_image_url: row.ticket_image_url,
    event_seat_id: row.event_seat_id,
    event_section_id: row.event_section_id,
  };
}

/**
 * Load unallocated inventory for a specific seat, optionally creating it first.
 */
export async function getUnallocatedInventoryForSeat(
  admin: AdminSupabaseClient,
  eventId: string,
  seatId: string,
  options?: { createIfMissing?: boolean }
): Promise<AllocateInventoryResult | null> {
  const { data: row } = await admin
    .from("print_tickets")
    .select(
      "id, qr_data, encrypted_qr, ticket_image_url, event_seat_id, event_section_id, allocated_ticket_id"
    )
    .eq("event_id", eventId)
    .eq("event_seat_id", seatId)
    .is("allocated_ticket_id", null)
    .maybeSingle();

  if (row) return rowToAllocateResult(row);

  if (options?.createIfMissing) {
    await ensureInventoryForSeats(admin, eventId, [seatId]);
    const { data: after } = await admin
      .from("print_tickets")
      .select(
        "id, qr_data, encrypted_qr, ticket_image_url, event_seat_id, event_section_id, allocated_ticket_id"
      )
      .eq("event_id", eventId)
      .eq("event_seat_id", seatId)
      .is("allocated_ticket_id", null)
      .maybeSingle();
    if (after) return rowToAllocateResult(after);
  }

  return null;
}

/**
 * Pick next unallocated inventory row for a free/standing section (seat-linked rows).
 */
export async function getNextUnallocatedInventoryForSection(
  admin: AdminSupabaseClient,
  eventId: string,
  sectionId: string
): Promise<AllocateInventoryResult | null> {
  const { data: rows } = await admin
    .from("print_tickets")
    .select(
      "id, qr_data, encrypted_qr, ticket_image_url, event_seat_id, event_section_id, section_slot_index"
    )
    .eq("event_id", eventId)
    .eq("event_section_id", sectionId)
    .is("allocated_ticket_id", null)
    .order("section_slot_index", { ascending: true })
    .order("event_seat_id", { ascending: true })
    .limit(1);

  const row = rows?.[0];
  if (!row) return null;
  return rowToAllocateResult(row);
}

/**
 * Mark inventory as allocated to a sold ticket row.
 */
export async function markInventoryAllocated(
  admin: AdminSupabaseClient,
  printTicketId: string,
  ticketId: string
): Promise<void> {
  const { data, error } = await admin
    .from("print_tickets")
    .update({
      allocated_ticket_id: ticketId,
      allocated_at: new Date().toISOString(),
    })
    .eq("id", printTicketId)
    .is("allocated_ticket_id", null)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new TicketInventoryError(
      "Ticket inventory was already allocated by another sale",
      "inventory_already_allocated",
      409
    );
  }
}

/**
 * Clear allocation when a sold ticket is released (seat QR not rotated).
 */
export async function clearInventoryAllocation(
  admin: AdminSupabaseClient,
  printTicketId: string
): Promise<void> {
  await admin
    .from("print_tickets")
    .update({ allocated_ticket_id: null, allocated_at: null })
    .eq("id", printTicketId);
}

export async function clearInventoryAllocationForTicket(
  admin: AdminSupabaseClient,
  ticketId: string
): Promise<void> {
  await admin
    .from("print_tickets")
    .update({ allocated_ticket_id: null, allocated_at: null })
    .eq("allocated_ticket_id", ticketId);
}

/**
 * After `tickets` rows are inserted, link inventory (FK requires ticket id to exist first).
 */
export async function finalizeInventoryAllocationsForSaleTickets(
  admin: AdminSupabaseClient,
  rows: Array<{ id: string; print_ticket_id?: string | null; ticket_image_url?: string | null }>
): Promise<void> {
  for (const row of rows) {
    const printTicketId = row.print_ticket_id?.trim();
    if (!printTicketId) continue;
    await markInventoryAllocated(admin, printTicketId, row.id);

    const hasImage =
      typeof row.ticket_image_url === "string" && row.ticket_image_url.trim().length > 0;
    if (hasImage) continue;

    const { data: inv } = await admin
      .from("print_tickets")
      .select("ticket_image_url")
      .eq("id", printTicketId)
      .maybeSingle();
    const invUrl = (inv?.ticket_image_url as string | null)?.trim();
    if (invUrl) {
      await admin.from("tickets").update({ ticket_image_url: invUrl }).eq("id", row.id);
    }
  }
}

export async function eventRequiresTicketInventory(
  admin: AdminSupabaseClient,
  eventId: string
): Promise<boolean> {
  const { data } = await admin
    .from("events")
    .select("require_ticket_inventory")
    .eq("id", eventId)
    .single();
  return (data as { require_ticket_inventory?: boolean } | null)?.require_ticket_inventory === true;
}
