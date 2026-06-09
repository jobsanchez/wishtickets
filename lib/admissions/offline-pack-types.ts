import type { TicketScanSourceMode } from "./ticket-scan-source";

/**
 * Shared types for the admissions offline pack (v1) — safe to import in client and server.
 */
export const OFFLINE_PACK_VERSION = 1 as const;

export type OfflinePackTicketV1 = {
  ticket_id: string;
  booking_id: string;
  /** Preferred encrypted scan code for new tickets; fallback to qr_data when absent. */
  encrypted_qr?: string | null;
  qr_data: string;
  admitted_at: string | null;
  re_entry_allowed: boolean;
  /** Seat / UI fields (match scan API top-level names where possible) */
  section: string;
  section_group: string;
  section_display_name: string;
  row: string;
  seatNumber: string;
  seating_type: "assigned" | "free" | "standing";
  buyer_name: string | null;
  buyer_email: string | null;
  special_request_type: string | null;
  special_request_details: string | null;
  add_ons: Array<{
    id: string;
    title: string;
    quantity: number;
    released_quantity: number;
    unit_price_cents: number;
  }>;
};

export type OfflinePrintAliasV1 = {
  /** Preferred encrypted scan code for print-ticket rows; fallback to qr_data when absent. */
  encrypted_qr?: string | null;
  qr_data: string;
  ticket_id: string;
};

export type AdmissionsOfflinePackV1 = {
  pack_version: typeof OFFLINE_PACK_VERSION;
  generated_at: string;
  event_id: string;
  event_title: string;
  /** Admissions code (same session); stored only on device. */
  admissions_code: string;
  scan_source_mode?: TicketScanSourceMode;
  tickets: OfflinePackTicketV1[];
  /** Print-ticket QR rows that map to a ticket in this event (same as live scan). */
  print_qr_aliases: OfflinePrintAliasV1[];
  /** Rows in `tickets` included in `tickets` (one pack entry per row). */
  ticket_count: number;
  /** Sum of max(1, quantity) per ticket row; differs from ticket_count only when quantity is greater than 1 on some rows. */
  ticket_quantity_total?: number;
};

export type OfflinePendingOpV1 = {
  id: string;
  created_at: string;
  qr_data?: string;
  /** Needed to replay state without re-resolving QR. */
  ticket_id?: string;
  mode: "admit" | "re_entry" | "release_add_on";
  booking_add_on_id?: string;
  release_quantity?: number;
};

export const ADMISSIONS_IDB = "wtp-admissions-offline";
export const IDB_PACK_STORE = "pack";
export const IDB_OUTBOX_STORE = "outbox";
export const IDB_KEY_CURRENT = "current";

/** Fallback when IndexedDB is missing or fails (e.g. quota) — subject to ~5MB typical limit. */
export const ADMISSIONS_LS_PACK_KEY = "wtp-admissions-offline-pack-v1";
export const ADMISSIONS_LS_OUTBOX_KEY = "wtp-admissions-offline-outbox-v1";
/** Last-resort fallback if localStorage is blocked: session-scoped storage. */
export const ADMISSIONS_SS_PACK_KEY = "wtp-admissions-offline-pack-session-v1";
export const ADMISSIONS_SS_OUTBOX_KEY = "wtp-admissions-offline-outbox-session-v1";
