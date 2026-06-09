import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BULK_PRINT_ZIP_MAX_TICKETS_PER_PART,
  ZIP_BYTES_PER_FILE_SLOP,
  getZipPartUncompressedBudgetBytes,
} from "@/lib/print-tickets/bulk-zip-email";
import { fetchPrintTicketsForEmailByIds } from "@/lib/print-tickets/fetch-print-tickets-for-email-by-ids";
import { loadPrintTicketEmailPngBuffer } from "@/lib/print-tickets/load-print-ticket-email-png";
import type { PrintTicketEmailRow } from "@/lib/print-tickets/run-print-tickets-email-from-rows";

export type PrintZipBudgetBatch = {
  ticketIds: string[];
  ticketRows: PrintTicketEmailRow[];
  pngBuffers: Buffer[];
};

/**
 * From `orderedTicketIds[startIndex]`, load PNGs in order and return the longest prefix that fits
 * one ZIP part: uncompressed byte budget (default ~50 MiB) and at most `BULK_PRINT_ZIP_MAX_TICKETS_PER_PART` tickets.
 */
export async function collectNextPrintTicketsForZipBudget(
  supabase: SupabaseClient,
  opts: {
    orderedTicketIds: readonly string[];
    startIndex: number;
    budgetBytes?: number;
  }
): Promise<PrintZipBudgetBatch> {
  const { orderedTicketIds, startIndex } = opts;
  const budget = opts.budgetBytes ?? getZipPartUncompressedBudgetBytes();

  const remainingIds = orderedTicketIds.slice(Math.max(0, startIndex));
  if (remainingIds.length === 0) {
    return { ticketIds: [], ticketRows: [], pngBuffers: [] };
  }

  const { rows: fetched, error } = await fetchPrintTicketsForEmailByIds(supabase, [...remainingIds]);
  if (error) {
    throw new Error(error);
  }

  const byId = new Map(fetched.map((r) => [r.id, { ...r } as PrintTicketEmailRow]));

  const ticketIds: string[] = [];
  const ticketRows: PrintTicketEmailRow[] = [];
  const pngBuffers: Buffer[] = [];
  let sum = 0;

  for (const id of remainingIds) {
    const row = byId.get(id);
    if (!row) continue;

    const buf = await loadPrintTicketEmailPngBuffer(supabase, row);
    const need = buf.byteLength + ZIP_BYTES_PER_FILE_SLOP;

    if (need > budget) {
      if (ticketIds.length === 0) {
        ticketIds.push(id);
        ticketRows.push(row);
        pngBuffers.push(buf);
      }
      break;
    }

    if (sum + need > budget && ticketIds.length > 0) {
      break;
    }

    ticketIds.push(id);
    ticketRows.push(row);
    pngBuffers.push(buf);
    sum += need;

    if (ticketIds.length >= BULK_PRINT_ZIP_MAX_TICKETS_PER_PART) {
      break;
    }
  }

  return { ticketIds, ticketRows, pngBuffers };
}
