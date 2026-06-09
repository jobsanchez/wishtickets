import type { SupabaseClient } from "@supabase/supabase-js";
import { isFreeStandingSeatingType } from "@/lib/print-tickets/is-free-standing-section";
import type { PrintTicketEmailRow } from "@/lib/print-tickets/run-print-tickets-email-from-rows";

export type LoadSectionPrintTicketsForEmailResult =
  | { ok: true; rows: PrintTicketEmailRow[] }
  | { ok: false; kind: "db"; message: string }
  | { ok: false; kind: "no_seats" }
  | { ok: false; kind: "no_print_tickets" };

export async function loadPrintTicketRowsForSectionEmail(
  supabase: SupabaseClient,
  eventId: string,
  eventSectionId: string
): Promise<LoadSectionPrintTicketsForEmailResult> {
  const { data: sectionMeta } = await supabase
    .from("event_sections")
    .select("seating_type")
    .eq("id", eventSectionId)
    .single();

  const isFreeStanding = isFreeStandingSeatingType(sectionMeta?.seating_type);

  if (isFreeStanding) {
    const { data: printTickets, error } = await supabase
      .from("print_tickets")
      .select(
        "id, event_id, event_section_id, event_seat_id, ticket_image_url, qr_data, encrypted_qr, section_slot_index"
      )
      .eq("event_id", eventId)
      .eq("event_section_id", eventSectionId)
      .is("event_seat_id", null)
      .order("section_slot_index", { ascending: true });

    if (error) return { ok: false, kind: "db", message: error.message };
    const rows = (printTickets ?? []) as PrintTicketEmailRow[];
    if (rows.length === 0) return { ok: false, kind: "no_print_tickets" };
    return { ok: true, rows };
  }

  const { data: seats } = await supabase
    .from("event_seats")
    .select("id")
    .eq("event_section_id", eventSectionId)
    .order("row_label")
    .order("seat_number");

  const seatIds = (seats ?? []).map((s) => s.id);
  if (seatIds.length === 0) {
    return { ok: false, kind: "no_seats" };
  }

  const { data: printTickets, error } = await supabase
    .from("print_tickets")
    .select(
      "id, event_id, event_section_id, event_seat_id, ticket_image_url, qr_data, encrypted_qr, section_slot_index"
    )
    .eq("event_id", eventId)
    .eq("event_section_id", eventSectionId)
    .in("event_seat_id", seatIds);

  if (error) return { ok: false, kind: "db", message: error.message };
  const rows = (printTickets ?? []) as PrintTicketEmailRow[];
  if (rows.length === 0) return { ok: false, kind: "no_print_tickets" };
  return { ok: true, rows };
}
