import type { SupabaseClient as AdminSupabaseClient } from "@supabase/supabase-js";
import { generateTicketImageForPrint } from "@/lib/ticket-image";
import { getPrintTicketGenConcurrency, runPool } from "@/lib/print-tickets/run-pool";

export type GenerateInventoryImagesResult = {
  images_generated: number;
  failed: number;
};

/**
 * Render PNGs for print_tickets rows that lack ticket_image_url.
 */
export async function generateInventoryImages(
  admin: AdminSupabaseClient,
  printTicketIds: string[],
  options?: { beforeEachWave?: () => boolean | Promise<boolean> }
): Promise<GenerateInventoryImagesResult> {
  const uniqueIds = [...new Set(printTicketIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { images_generated: 0, failed: 0 };
  }

  const rows: Array<{
    id: string;
    event_id: string;
    event_section_id: string;
    event_seat_id: string | null;
    section_slot_index: number;
    qr_data: string;
    encrypted_qr: string | null;
    ticket_image_url: string | null;
  }> = [];

  const CHUNK = 200;
  for (let i = 0; i < uniqueIds.length; i += CHUNK) {
    const slice = uniqueIds.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("print_tickets")
      .select(
        "id, event_id, event_section_id, event_seat_id, section_slot_index, qr_data, encrypted_qr, ticket_image_url"
      )
      .in("id", slice);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as typeof rows));
  }

  const needImage = rows.filter(
    (r) => !r.ticket_image_url || String(r.ticket_image_url).trim() === ""
  );

  let images_generated = 0;
  let failed = 0;
  const conc = getPrintTicketGenConcurrency();

  await runPool(
    needImage,
    conc,
    async (pt) => {
      const slot =
        pt.event_seat_id == null
          ? Math.max(1, Math.floor(pt.section_slot_index ?? 1))
          : undefined;
      const encrypted = (pt.encrypted_qr ?? "").trim() || pt.qr_data;
      const url = await generateTicketImageForPrint({
        eventId: pt.event_id,
        eventSectionId: pt.event_section_id,
        eventSeatId: pt.event_seat_id,
        printTicketId: pt.id,
        qrData: encrypted,
        ticketNumberData: pt.qr_data,
        sectionSlotIndex: slot,
      });
      if (url) {
        const { error: updateError } = await admin
          .from("print_tickets")
          .update({ ticket_image_url: url })
          .eq("id", pt.id);
        if (updateError) {
          console.error("[generateInventoryImages] print_tickets update failed:", {
            printTicketId: pt.id,
            error: updateError.message,
          });
          failed += 1;
        } else {
          images_generated += 1;
        }
      } else {
        failed += 1;
      }
    },
    { beforeEachWave: options?.beforeEachWave }
  );

  return { images_generated, failed };
}
