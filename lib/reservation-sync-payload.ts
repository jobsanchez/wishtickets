import type { ReservationItem } from "@/store/reservation-store";

/**
 * Merge duplicate seats / section lines / add-on lines into a canonical cart shape.
 * Duplicate `{ section_id, quantity: 1 }` payload rows each allocate separately on the server,
 * which inflated counts when client state accidentally held repeats.
 */
export function consolidateReservationItems(items: ReservationItem[]): ReservationItem[] {
  const seats = new Set<string>();
  const sectionQty = new Map<string, number>();
  const addOnQty = new Map<string, number>();
  for (const i of items) {
    if (i.type === "seat") seats.add(i.seat_id);
    else if (i.type === "section") {
      sectionQty.set(
        i.section_id,
        (sectionQty.get(i.section_id) ?? 0) + Math.max(0, i.quantity)
      );
    } else {
      addOnQty.set(
        i.add_on_id,
        (addOnQty.get(i.add_on_id) ?? 0) + Math.max(0, i.quantity)
      );
    }
  }
  const out: ReservationItem[] = [];
  for (const seat_id of [...seats].sort()) out.push({ type: "seat", seat_id });
  for (const [section_id, quantity] of [...sectionQty.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    if (quantity > 0) out.push({ type: "section", section_id, quantity });
  }
  for (const [add_on_id, quantity] of [...addOnQty.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    if (quantity > 0) out.push({ type: "add_on", add_on_id, quantity });
  }
  return out;
}

function canonicalReservationItemsJson(items: ReservationItem[]): string {
  return JSON.stringify(consolidateReservationItems(items));
}

/** Deep-ish equality for avoiding Zustand churn when `/me` matches local picks. */
export function reservationItemsAreEquivalent(a: ReservationItem[], b: ReservationItem[]): boolean {
  return canonicalReservationItemsJson(a) === canonicalReservationItemsJson(b);
}

/** Stable signature for skipping redundant silent reservation POSTs when lines unchanged. */
export function reservationItemsFingerprint(items: ReservationItem[]): string {
  return canonicalReservationItemsJson(items);
}

/** Body shape for POST /api/reservations and PATCH /api/reservations/:id */
export function buildReservationSyncPayload(items: ReservationItem[]) {
  return consolidateReservationItems(items).map((i) => {
    if (i.type === "seat") return { seat_id: i.seat_id };
    if (i.type === "section") return { section_id: i.section_id, quantity: i.quantity };
    return { add_on_id: i.add_on_id, quantity: i.quantity };
  });
}
