import type { OfflinePendingOpV1 } from "./offline-pack-types";

/** Keep each sync request small enough for Netlify serverless timeouts. */
export const OFFLINE_SYNC_BATCH_SIZE = 50;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SyncOpPayload =
  | {
      id: string;
      qr_data: string;
      mode: "admit" | "re_entry";
    }
  | {
      id: string;
      mode: "release_add_on";
      booking_add_on_id: string;
      release_quantity: number;
      event_id: string;
    };

export type OutboxSyncPartition = {
  ops: SyncOpPayload[];
  /** Malformed or stale outbox rows that cannot be sent to the API. */
  invalidOpIds: string[];
};

export function outboxOpsToSyncPayload(
  ops: OfflinePendingOpV1[],
  eventId: string
): OutboxSyncPartition {
  const valid: SyncOpPayload[] = [];
  const invalidOpIds: string[] = [];

  for (const o of ops) {
    if (!o.id) continue;

    if (o.mode === "release_add_on") {
      const bookingAddOnId = o.booking_add_on_id?.trim();
      const releaseQty = o.release_quantity;
      if (
        bookingAddOnId &&
        UUID_RE.test(bookingAddOnId) &&
        typeof releaseQty === "number" &&
        Number.isInteger(releaseQty) &&
        releaseQty >= 1
      ) {
        valid.push({
          id: o.id,
          mode: o.mode,
          booking_add_on_id: bookingAddOnId,
          release_quantity: releaseQty,
          event_id: eventId,
        });
      } else {
        invalidOpIds.push(o.id);
      }
      continue;
    }

    if (o.mode === "admit" || o.mode === "re_entry") {
      const qrData = o.qr_data?.trim();
      if (qrData) {
        valid.push({ id: o.id, qr_data: qrData, mode: o.mode });
      } else {
        invalidOpIds.push(o.id);
      }
      continue;
    }

    invalidOpIds.push(o.id);
  }

  return { ops: valid, invalidOpIds };
}

export type SyncResultRow = {
  id?: string;
  httpStatus?: number;
  body?: { ok?: boolean; deduped?: boolean };
};

export function okIdsFromSyncResults(results: SyncResultRow[] | undefined): Set<string> {
  const okIds = new Set<string>();
  if (!Array.isArray(results)) return okIds;
  for (const r of results) {
    const id = typeof r?.id === "string" ? r.id : null;
    const httpStatus = typeof r?.httpStatus === "number" ? r.httpStatus : 0;
    const body = r?.body ?? {};
    const success =
      body.deduped === true || (httpStatus >= 200 && httpStatus < 300 && body.ok !== false);
    if (id && success) okIds.add(id);
  }
  return okIds;
}
