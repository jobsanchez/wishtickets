import type { SupabaseClient as AdminSupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { buildEncryptedQrFromQrData, formatQrData } from "@/lib/qr-data";
import { ensureSeatEncryptedQrForSale } from "@/lib/event-seats/seat-encrypted-qr";
import {
  eventRequiresTicketInventory,
  getNextUnallocatedInventoryForSection,
  getUnallocatedInventoryForSeat,
} from "@/lib/ticket-inventory/allocate";
import { TicketInventoryError } from "@/lib/ticket-inventory/types";

export type SaleTicketRow = {
  id: string;
  booking_id: string;
  seat_id: string | null;
  section_id: string | null;
  quantity: number;
  qr_data: string;
  encrypted_qr: string;
  qr_image_url: string | null;
  ticket_image_url: string | null;
  print_ticket_id?: string | null;
  recipient_name?: string;
};

type SeatMintContext = {
  eventCode: string;
  sectionCode: string;
  rowLabel: string;
  seatNumber: string;
};

type BuildSeatTicketOpts = {
  bookingId: string;
  seatId: string;
  eventId: string;
  recipientName?: string;
  mintContext?: SeatMintContext | null;
  registerUniqueQr?: (base: string) => string;
};

/**
 * Build a buyer ticket row from inventory when available; otherwise mint (legacy fallback).
 */
export async function buildSeatSaleTicket(
  admin: AdminSupabaseClient,
  opts: BuildSeatTicketOpts
): Promise<SaleTicketRow> {
  const ticketId = randomUUID();
  const requireInventory = await eventRequiresTicketInventory(admin, opts.eventId);
  const inventory = await getUnallocatedInventoryForSeat(admin, opts.eventId, opts.seatId);

  if (inventory) {
    return {
      id: ticketId,
      booking_id: opts.bookingId,
      seat_id: opts.seatId,
      section_id: null,
      quantity: 1,
      qr_data: inventory.qr_data,
      encrypted_qr: inventory.encrypted_qr,
      qr_image_url: null,
      ticket_image_url: inventory.ticket_image_url,
      print_ticket_id: inventory.print_ticket_id,
      ...(opts.recipientName ? { recipient_name: opts.recipientName } : {}),
    };
  }

  if (requireInventory) {
    throw new TicketInventoryError(
      "Generate tickets in Seat Configurator before selling this seat.",
      "inventory_required",
      400
    );
  }

  const ctx = opts.mintContext;
  const register = opts.registerUniqueQr ?? ((b: string) => b);
  let qrData: string;
  let encrypted_qr: string;

  if (ctx?.eventCode) {
    qrData = register(
      formatQrData({
        eventCode: ctx.eventCode,
        sectionCode: ctx.sectionCode,
        rowLabel: ctx.rowLabel,
        seatNumber: ctx.seatNumber,
      })
    );
    encrypted_qr = await ensureSeatEncryptedQrForSale(admin, opts.seatId, {
      eventCode: ctx.eventCode,
      sectionCode: ctx.sectionCode,
      rowLabel: ctx.rowLabel,
      seatNumber: ctx.seatNumber,
    });
  } else {
    qrData = `WT-${opts.bookingId}-${opts.seatId}`;
    encrypted_qr = buildEncryptedQrFromQrData(qrData);
  }

  return {
    id: ticketId,
    booking_id: opts.bookingId,
    seat_id: opts.seatId,
    section_id: null,
    quantity: 1,
    qr_data: qrData,
    encrypted_qr,
    qr_image_url: null,
    ticket_image_url: null,
    ...(opts.recipientName ? { recipient_name: opts.recipientName } : {}),
  };
}

type BuildSectionTicketOpts = {
  bookingId: string;
  eventId: string;
  sectionId: string;
  slotIndex: number;
  seatingType: string;
  sectionCode: string;
  eventCode: string;
  registerUniqueQr?: (base: string) => string;
  recipientName?: string;
};

export async function buildSectionSaleTicket(
  admin: AdminSupabaseClient,
  opts: BuildSectionTicketOpts
): Promise<SaleTicketRow> {
  const ticketId = randomUUID();
  const requireInventory = await eventRequiresTicketInventory(admin, opts.eventId);
  const inventory = await getNextUnallocatedInventoryForSection(
    admin,
    opts.eventId,
    opts.sectionId
  );

  if (inventory) {
    return {
      id: ticketId,
      booking_id: opts.bookingId,
      seat_id: inventory.event_seat_id,
      section_id: inventory.event_seat_id ? null : opts.sectionId,
      quantity: 1,
      qr_data: inventory.qr_data,
      encrypted_qr: inventory.encrypted_qr,
      qr_image_url: null,
      ticket_image_url: inventory.ticket_image_url,
      print_ticket_id: inventory.print_ticket_id,
      ...(opts.recipientName ? { recipient_name: opts.recipientName } : {}),
    };
  }

  if (requireInventory) {
    throw new TicketInventoryError(
      "Generate tickets in Seat Configurator before selling this section.",
      "inventory_required",
      400
    );
  }

  const register = opts.registerUniqueQr ?? ((b: string) => b);
  const rowLabel = opts.seatingType === "standing" ? "ST" : "FS";
  const qrData = opts.eventCode
    ? register(
        formatQrData({
          eventCode: opts.eventCode,
          sectionCode: opts.sectionCode,
          rowLabel,
          seatNumber: String(opts.slotIndex),
        })
      )
    : register(`WT-${opts.bookingId}-${opts.sectionId}-${opts.slotIndex}-${randomUUID().slice(0, 8)}`);

  return {
    id: ticketId,
    booking_id: opts.bookingId,
    seat_id: null,
    section_id: opts.sectionId,
    quantity: 1,
    qr_data: qrData,
    encrypted_qr: buildEncryptedQrFromQrData(qrData),
    qr_image_url: null,
    ticket_image_url: null,
    ...(opts.recipientName ? { recipient_name: opts.recipientName } : {}),
  };
}
