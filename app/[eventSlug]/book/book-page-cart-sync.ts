import { useReservationStore, type ReservationItem } from "@/store/reservation-store";
import {
  consolidateReservationItems,
  reservationItemsAreEquivalent,
  reservationItemsFingerprint,
} from "@/lib/reservation-sync-payload";

type ReservationPayload = {
  reservation_cart_id?: string | null;
  event_id?: string;
  expires_at?: string | null;
  items?: {
    seat_id?: string;
    section_id?: string;
    add_on_id?: string;
    quantity: number;
  }[];
};

export function mapApiItemsToReservationItems(
  apiItems:
    | {
        seat_id?: string;
        section_id?: string;
        add_on_id?: string;
        quantity: number;
      }[]
    | undefined
): ReservationItem[] {
  const normalized: ReservationItem[] = [];
  for (const it of apiItems ?? []) {
    if (it.seat_id) normalized.push({ type: "seat", seat_id: it.seat_id });
    else if (it.add_on_id)
      normalized.push({
        type: "add_on",
        add_on_id: it.add_on_id,
        quantity: it.quantity ?? 1,
      });
    else if (it.section_id)
      normalized.push({
        type: "section",
        section_id: it.section_id,
        quantity: it.quantity ?? 1,
      });
  }
  return consolidateReservationItems(normalized);
}

type ApplyServerReservationPayloadArgs = {
  data: ReservationPayload;
  currentEventId?: string;
  normalizedItems: ReservationItem[];
  suppressStaleReservationMerge: boolean;
  setCart: (cartId: string, eventId: string, expiresAt: string) => void;
  setItems: (items: ReservationItem[]) => void;
  clear: () => void;
  setServerHydratedCartId: (cartId: string | null) => void;
  setLastSilentReservationFingerprint: (value: string) => void;
  setServerCartSeatIds: (value: Set<string>) => void;
};

export function applyServerReservationPayloadCore(
  args: ApplyServerReservationPayloadArgs
): boolean {
  const {
    data,
    currentEventId,
    normalizedItems,
    suppressStaleReservationMerge,
    setCart,
    setItems,
    clear,
    setServerHydratedCartId,
    setLastSilentReservationFingerprint,
    setServerCartSeatIds,
  } = args;

  if (!data?.reservation_cart_id) {
    setServerHydratedCartId(null);
    setLastSilentReservationFingerprint("");
    clear();
    setServerCartSeatIds(new Set());
    return true;
  }
  if (currentEventId && data.event_id && data.event_id !== currentEventId) {
    setServerHydratedCartId(null);
    setLastSilentReservationFingerprint("");
    clear();
    setServerCartSeatIds(new Set());
    return true;
  }

  const storeSnapshot = useReservationStore.getState();
  if (
    suppressStaleReservationMerge &&
    storeSnapshot.cartId &&
    data.reservation_cart_id === storeSnapshot.cartId &&
    !reservationItemsAreEquivalent(storeSnapshot.items, normalizedItems)
  ) {
    return false;
  }

  if (
    storeSnapshot.cartId === data.reservation_cart_id &&
    reservationItemsAreEquivalent(storeSnapshot.items, normalizedItems)
  ) {
    setServerHydratedCartId(data.reservation_cart_id);
    setLastSilentReservationFingerprint(
      reservationItemsFingerprint(normalizedItems)
    );
    const exp = data.expires_at ?? "";
    if (exp && exp !== storeSnapshot.expiresAt) {
      setCart(data.reservation_cart_id, data.event_id ?? currentEventId ?? "", exp);
    }
    return false;
  }

  setCart(
    data.reservation_cart_id,
    data.event_id ?? currentEventId ?? "",
    data.expires_at ?? ""
  );
  setItems(normalizedItems);
  setServerCartSeatIds(
    new Set(
      normalizedItems
        .filter((i): i is { type: "seat"; seat_id: string } => i.type === "seat")
        .map((i) => i.seat_id)
    )
  );
  setServerHydratedCartId(data.reservation_cart_id);
  setLastSilentReservationFingerprint(reservationItemsFingerprint(normalizedItems));
  return true;
}
