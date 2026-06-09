import type { OfflinePendingOpV1 } from "./offline-pack-types";

/** Keep each sync request small enough for Netlify serverless timeouts. */
export const OFFLINE_SYNC_BATCH_SIZE = 50;

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

export function outboxOpsToSyncPayload(
  ops: OfflinePendingOpV1[],
  eventId: string
): SyncOpPayload[] {
  return ops.map((o) =>
    o.mode === "release_add_on"
      ? {
          id: o.id,
          mode: o.mode,
          booking_add_on_id: o.booking_add_on_id!,
          release_quantity: o.release_quantity!,
          event_id: eventId,
        }
      : { id: o.id, qr_data: o.qr_data!, mode: o.mode }
  );
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
