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
        id: "bad-addon-uuid",
        created_at: "2026-01-01T00:00:00.000Z",
        mode: "release_add_on",
        booking_add_on_id: "not-a-uuid",
        release_quantity: 1,
      },
      {
        id: "good",
        created_at: "2026-01-01T00:00:00.000Z",
        mode: "re_entry",
        qr_data: " QR ",
      },
    ];
    const { ops: valid, invalidOpIds } = outboxOpsToSyncPayload(ops, eventId);
    expect(invalidOpIds).toEqual(["bad-admit", "bad-addon", "bad-addon-uuid"]);
    expect(valid).toEqual([{ id: "good", qr_data: "QR", mode: "re_entry" }]);
  });
});

describe("okIdsFromSyncResults", () => {
  it("returns empty set for an empty results array", () => {
    expect(okIdsFromSyncResults([])).toEqual(new Set());
  });

  it("returns empty set when results is undefined", () => {
    expect(okIdsFromSyncResults(undefined)).toEqual(new Set());
  });

  it("includes ops with 2xx status and body.ok true", () => {
    const results = [{ id: "ok1", httpStatus: 200, body: { ok: true } }];
    expect(okIdsFromSyncResults(results)).toEqual(new Set(["ok1"]));
  });

  it("includes deduped ops as success", () => {
    const results = [{ id: "dedup1", httpStatus: 500, body: { ok: false, deduped: true } }];
    expect(okIdsFromSyncResults(results)).toEqual(new Set(["dedup1"]));
  });

  it("excludes failing ops", () => {
    const results = [
      { id: "fail-http", httpStatus: 500, body: { ok: false } },
      { id: "fail-body", httpStatus: 200, body: { ok: false } },
    ];
    expect(okIdsFromSyncResults(results)).toEqual(new Set());
  });

  it("returns only successful ids from a mixed batch", () => {
    const results = [
      { id: "ok1", httpStatus: 200, body: { ok: true } },
      { id: "dedup1", httpStatus: 409, body: { deduped: true } },
      { id: "fail1", httpStatus: 500, body: { ok: false } },
    ];
    expect(okIdsFromSyncResults(results)).toEqual(new Set(["ok1", "dedup1"]));
  });
});
