export type InventoryRow = {
  id: string;
  event_id: string;
  event_section_id: string;
  event_seat_id: string | null;
  section_slot_index: number;
  qr_data: string;
  encrypted_qr: string | null;
  ticket_image_url: string | null;
  allocated_ticket_id: string | null;
};

export type SectionInventorySummary = {
  section_id: string;
  seats_count: number;
  inventory_count: number;
  images_count: number;
  allocated_count: number;
};

export type EnsureInventoryResult = {
  created: number;
  existing: number;
  print_ticket_ids: string[];
  skipped_allocated: number;
};

export type AllocateInventoryResult = {
  print_ticket_id: string;
  qr_data: string;
  /** Set only when print_tickets.encrypted_qr is present; derive from qr_data otherwise. */
  encrypted_qr?: string;
  ticket_image_url: string | null;
  event_seat_id: string | null;
  event_section_id: string;
};

export class TicketInventoryError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "TicketInventoryError";
    this.code = code;
    this.status = status;
  }
}
