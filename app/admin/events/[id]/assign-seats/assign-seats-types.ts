export interface Assignment {
  id: string;
  recipient_name: string;
  recipient_email?: string | null;
  status: string;
  booking_id: string | null;
  created_at: string;
  email_sent_count?: number;
  distribution_category?: string;
  expected_tickets?: number;
  generated_ticket_images?: number;
  section_ids?: string[];
  items: Array<{
    seat_id?: string;
    section_id?: string;
    quantity?: number;
    seat_label?: string;
  }> | null;
}

export type SectionZipStatus = {
  sectionId: string;
  status: "none" | "pending" | "processing" | "completed" | "failed";
  zipObjectPath: string | null;
  progressPct: number;
  currentStage: string;
  errorMessage: string | null;
  updatedAt: string | null;
};

export type AllocationAdjustSeat = {
  ticket_id: string;
  booking_id: string;
  seat_id: string | null;
  seat_label: string;
};

export type AllocationAdjustSection = {
  section_id: string;
  section_name: string;
  sold_count: number;
  sold_tickets: AllocationAdjustSeat[];
};

export type AllocationAdjustGroup = {
  group_key: string;
  group_label: string;
  sections: AllocationAdjustSection[];
};

export interface SeatInfo {
  id: string;
  row_label: string | null;
  seat_number: string | null;
  section_id: string | null;
  available: boolean;
  status?: string;
}

export interface SectionInfo {
  id: string;
  name: string;
  section_code?: string | null;
  section_group?: string | null;
  capacity: number;
  available: number;
  seating_type?: string;
  color?: string | null;
}
