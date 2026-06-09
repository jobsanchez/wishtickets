import type {
  AdmissionsOfflinePackV1,
  OfflinePackTicketV1,
  OfflinePendingOpV1,
} from "./offline-pack-types";
import {
  parseTicketScanSourceMode,
  ticketMatchesScanValue,
} from "./ticket-scan-source";

export type OfflineScanMode = "admit" | "re_entry" | "validate";

export type LocalTicketState = {
  admitted_at: string | null;
  re_entry_allowed: boolean;
};

export type LocalAddOnState = {
  quantity: number;
  released_quantity: number;
};

function addOnsForPayload(
  t: OfflinePackTicketV1,
  addOnOverlay: Map<string, LocalAddOnState>
): Array<Record<string, unknown>> {
  return (t.add_ons ?? []).map((row) => {
    const quantity = Math.max(0, Number(row.quantity ?? 0));
    const state = addOnOverlay.get(row.id);
    const released = Math.max(
      0,
      Math.min(quantity, Number(state?.released_quantity ?? row.released_quantity ?? 0))
    );
    const unit = Math.max(0, Number(row.unit_price_cents ?? 0));
    return {
      id: row.id,
      title: row.title ?? "Add-on",
      quantity,
      released_quantity: released,
      remaining_quantity: Math.max(0, quantity - released),
      unit_price_cents: unit,
      line_total_cents: quantity * unit,
      fully_released: released >= quantity,
    };
  });
}

function basePayload(
  t: OfflinePackTicketV1,
  addOnOverlay: Map<string, LocalAddOnState>
): Record<string, unknown> {
  return {
    section: t.section,
    section_group: t.section_group,
    section_display_name: t.section_display_name,
    row: t.row,
    seatNumber: t.seatNumber,
    seating_type: t.seating_type,
    buyer_name: t.buyer_name,
    buyer_email: t.buyer_email,
    special_request_type: t.special_request_type,
    special_request_details: t.special_request_details,
    add_ons: addOnsForPayload(t, addOnOverlay),
  };
}

/**
 * Map QR (ticket or print alias) to the pack row; mirrors live resolution for event-scoped data.
 */
export function resolvePackTicket(
  pack: AdmissionsOfflinePackV1,
  qrRaw: string
): OfflinePackTicketV1 | null {
  const n = qrRaw.trim();
  if (!n) return null;
  const mode = parseTicketScanSourceMode(pack.scan_source_mode);
  const direct = pack.tickets.find(
    (x) => ticketMatchesScanValue(mode, n, x.encrypted_qr, x.qr_data)
  );
  if (direct) return direct;
  const alias = pack.print_qr_aliases.find(
    (a) => ticketMatchesScanValue(mode, n, a.encrypted_qr, a.qr_data)
  );
  if (!alias) return null;
  return pack.tickets.find((x) => x.ticket_id === alias.ticket_id) ?? null;
}

export function buildInitialOverlay(
  pack: AdmissionsOfflinePackV1
): Map<string, LocalTicketState> {
  const m = new Map<string, LocalTicketState>();
  for (const t of pack.tickets) {
    m.set(t.ticket_id, {
      admitted_at: t.admitted_at,
      re_entry_allowed: t.re_entry_allowed,
    });
  }
  return m;
}

export function replayOutboxOnOverlay(
  pack: AdmissionsOfflinePackV1,
  outbox: OfflinePendingOpV1[]
): Map<string, LocalTicketState> {
  const m = buildInitialOverlay(pack);
  for (const op of outbox) {
    if (op.mode === "release_add_on" || !op.ticket_id) continue;
    const cur = m.get(op.ticket_id);
    if (!cur) continue;
    if (op.mode === "re_entry") {
      m.set(op.ticket_id, {
        admitted_at: cur.admitted_at,
        re_entry_allowed: true,
      });
      continue;
    }
    const admitted = !!cur.admitted_at;
    const reEntry = cur.re_entry_allowed === true;
    if (!admitted) {
      m.set(op.ticket_id, {
        admitted_at: op.created_at,
        re_entry_allowed: false,
      });
    } else if (admitted && reEntry) {
      m.set(op.ticket_id, {
        admitted_at: cur.admitted_at,
        re_entry_allowed: false,
      });
    }
  }
  return m;
}

export function replayAddOnOutboxOverlay(
  pack: AdmissionsOfflinePackV1,
  outbox: OfflinePendingOpV1[]
): Map<string, LocalAddOnState> {
  const m = new Map<string, LocalAddOnState>();
  for (const t of pack.tickets) {
    for (const addOn of t.add_ons ?? []) {
      if (!m.has(addOn.id)) {
        m.set(addOn.id, {
          quantity: Math.max(0, Number(addOn.quantity ?? 0)),
          released_quantity: Math.max(
            0,
            Math.min(Number(addOn.quantity ?? 0), Number(addOn.released_quantity ?? 0))
          ),
        });
      }
    }
  }
  for (const op of outbox) {
    if (op.mode !== "release_add_on" || !op.booking_add_on_id) continue;
    const cur = m.get(op.booking_add_on_id);
    if (!cur) continue;
    const releaseQty = Math.max(0, Math.floor(Number(op.release_quantity ?? 0)));
    if (releaseQty <= 0) continue;
    m.set(op.booking_add_on_id, {
      ...cur,
      released_quantity: Math.min(cur.quantity, cur.released_quantity + releaseQty),
    });
  }
  return m;
}

export type OfflineScanOutcome = {
  httpStatus: number;
  body: Record<string, unknown>;
  /** When an op should be queued for sync (not for validate-only). */
  outbox: OfflinePendingOpV1 | null;
};

type SidebarRow = {
  code: string;
  at: Date;
  section: string;
  row: string;
  seatNumber: string;
};

/** Rebuilds admitted / re-entry sidebars from a pack and pending outbox (mirrors /api/admissions/records as closely as possible). */
export function buildOfflineSidebarLists(
  pack: AdmissionsOfflinePackV1,
  outbox: OfflinePendingOpV1[]
): { admitted: SidebarRow[]; grantedReEntry: SidebarRow[] } {
  const admitByCode = new Map<string, SidebarRow>();
  for (const t of pack.tickets) {
    if (t.admitted_at) {
      admitByCode.set(t.qr_data, {
        code: t.qr_data,
        at: new Date(t.admitted_at),
        section: t.section,
        row: t.row,
        seatNumber: t.seatNumber,
      });
    }
  }
  for (const op of outbox) {
    if (op.mode !== "admit") continue;
    if (!op.ticket_id) continue;
    const trow = pack.tickets.find((x) => x.ticket_id === op.ticket_id);
    if (!trow) continue;
    const entry: SidebarRow = {
      code: trow.qr_data,
      at: new Date(op.created_at),
      section: trow.section,
      row: trow.row,
      seatNumber: trow.seatNumber,
    };
    const prev = admitByCode.get(trow.qr_data);
    if (!prev || entry.at.getTime() >= prev.at.getTime()) {
      admitByCode.set(trow.qr_data, entry);
    }
  }
  const admitted = Array.from(admitByCode.values()).sort(
    (a, b) => b.at.getTime() - a.at.getTime()
  );
  const grantedReEntry: SidebarRow[] = [];
  for (const op of outbox) {
    if (op.mode !== "re_entry") continue;
    if (!op.ticket_id) continue;
    const trow = pack.tickets.find((x) => x.ticket_id === op.ticket_id);
    if (!trow) continue;
    grantedReEntry.push({
      code: trow.qr_data,
      at: new Date(op.created_at),
      section: trow.section,
      row: trow.row,
      seatNumber: trow.seatNumber,
    });
  }
  grantedReEntry.sort((a, b) => b.at.getTime() - a.at.getTime());
  return { admitted, grantedReEntry };
}

/**
 * Offline scan: mirror `runAdmissionScan` state transitions on top of `state` for `t`.
 */
export function applyOfflineScan(
  t: OfflinePackTicketV1,
  state: LocalTicketState,
  addOnOverlay: Map<string, LocalAddOnState>,
  qr_data: string,
  mode: OfflineScanMode
): OfflineScanOutcome {
  const admitted = !!state.admitted_at;
  const reEntryAllowed = state.re_entry_allowed === true;
  const now = new Date().toISOString();

  if (mode === "validate") {
    return {
      httpStatus: 200,
      body: {
        ok: true,
        validate_only: true,
        ticket_id: t.ticket_id,
        admitted,
        re_entry_granted: reEntryAllowed,
        ...basePayload(t, addOnOverlay),
      },
      outbox: null,
    };
  }

  if (mode === "re_entry") {
    if (!admitted) {
      return {
        httpStatus: 200,
        body: {
          ok: false,
          code: "ticket_not_admitted_yet",
          error: "Ticket not admitted yet",
          ...basePayload(t, addOnOverlay),
        },
        outbox: null,
      };
    }
    if (reEntryAllowed) {
      return {
        httpStatus: 200,
        body: {
          ok: false,
          code: "re_entry_already_granted",
          error: "Re-entry already granted",
          ...basePayload(t, addOnOverlay),
        },
        outbox: null,
      };
    }
    return {
      httpStatus: 200,
      body: {
        ok: true,
        re_entry: true,
        ticket_id: t.ticket_id,
        ...basePayload(t, addOnOverlay),
      },
      outbox: {
        id: crypto.randomUUID(),
        created_at: now,
        qr_data,
        ticket_id: t.ticket_id,
        mode: "re_entry",
      },
    };
  }

  /* admit */
  if (admitted) {
    if (reEntryAllowed) {
      return {
        httpStatus: 200,
        body: {
          ok: true,
          ticket_id: t.ticket_id,
          re_entry_used: true,
          ...basePayload(t, addOnOverlay),
        },
        outbox: {
          id: crypto.randomUUID(),
          created_at: now,
          qr_data,
          ticket_id: t.ticket_id,
          mode: "admit",
        },
      };
    }
    return {
      httpStatus: 200,
      body: {
        ok: true,
        already_admitted: true,
        ticket_id: t.ticket_id,
        ...basePayload(t, addOnOverlay),
      },
      outbox: null,
    };
  }

  return {
    httpStatus: 200,
    body: {
      ok: true,
      ticket_id: t.ticket_id,
      ...basePayload(t, addOnOverlay),
    },
    outbox: {
      id: crypto.randomUUID(),
      created_at: now,
      qr_data,
      ticket_id: t.ticket_id,
      mode: "admit",
    },
  };
}
