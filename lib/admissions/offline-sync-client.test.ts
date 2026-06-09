import { describe, expect, it } from "vitest";
import type { OfflinePendingOpV1 } from "./offline-pack-types";
import { okIdsFromSyncResults, outboxOpsToSyncPayload } from "./offline-sync-client";

const eventId = "00000000-0000-4000-8000-000000000001";

describe("outboxOpsToSyncPayload", () => {
  it("maps valid admit and release_add_on ops", () => {
    const ops: OfflinePendingOpV1[] = [
      {
        id: "a1",
        created_at: "2026-01-01T00:00:00.000Z",
        mode: "admit",
        qr_data: "ABC123",
      },
      {
        id: "r1",
        created_at: "2026-01-01T00:00:00.000Z",
        mode: "release_add_on",
        booking_add_on_id: "00000000-0000-4000-8000-000000000002",
        release_quantity: 2,
      },
    ];
    const { ops: valid, invalidOpIds } = outboxOpsToSyncPayload(ops, eventId);
    expect(invalidOpIds).toEqual([]);
    expect(valid).toHaveLength(2);
  });

  it("quarantines malformed rows instead of asserting missing fields", () => {
    const ops: OfflinePendingOpV1[] = [
      {
        id: "bad-admit",
        created_at: "2026-01-01T00:00:00.000Z",
        mode: "admit",
      },
      {
        id: "bad-addon",
        created_at: "2026-01-01T00:00:00.000Z",
        mode: "release_add_on",
        release_quantity: 0,
      },
      {
        id: "good",
        created_at: "2026-01-01T00:00:00.000Z",
        mode: "re_entry",
        qr_data: " QR ",
      },
    ];
    const { ops: valid, invalidOpIds } = outboxOpsToSyncPayload(ops, eventId);
    expect(invalidOpIds).toEqual(["bad-admit", "bad-addon"]);
    expect(valid).toEqual([{ id: "good", qr_data: "QR", mode: "re_entry" }]);
  });
});

describe("okIdsFromSyncResults", () => {
  it("returns empty set for an empty results array", () => {
    expect(okIdsFromSyncResults([])).toEqual(new Set());
  });
});
