import { create } from "zustand";

export type ReservationItem =
  | { type: "seat"; seat_id: string }
  | { type: "section"; section_id: string; quantity: number }
  | { type: "add_on"; add_on_id: string; quantity: number };

export type CartSummary = {
  subtotal_cents: number;
  item_count?: number;
  early_bird_active?: boolean;
};

/** Summary tied to a reservation cart UUID so stale prefetch cannot apply to another cart. */
export type ScopedCartSummary = CartSummary & { for_cart_id: string };

export function cartSummaryForActiveCart(
  scoped: ScopedCartSummary | null,
  cartId: string | null
): CartSummary | null {
  if (!scoped || !cartId || scoped.for_cart_id !== cartId) return null;
  const { for_cart_id: _, ...rest } = scoped;
  return rest;
}

interface ReservationState {
  cartId: string | null;
  eventId: string | null;
  items: ReservationItem[];
  expiresAt: string | null;
  cartSummary: ScopedCartSummary | null;
  setCart: (cartId: string, eventId: string, expiresAt: string) => void;
  setItems: (items: ReservationItem[]) => void;
  setCartSummary: (for_cart_id: string, summary: CartSummary) => void;
  addSeat: (seatId: string) => void;
  removeSeat: (seatId: string) => void;
  setSectionQuantity: (sectionId: string, quantity: number) => void;
  setAddOnQuantity: (addOnId: string, quantity: number, maxQty?: number) => void;
  clear: () => void;
  release: () => void;
}

export const useReservationStore = create<ReservationState>((set, get) => ({
  cartId: null,
  eventId: null,
  items: [],
  expiresAt: null,
  cartSummary: null,

  setCart: (cartId, eventId, expiresAt) =>
    set((state) => ({
      cartId,
      eventId,
      expiresAt,
      cartSummary:
        state.cartSummary && state.cartSummary.for_cart_id === cartId
          ? state.cartSummary
          : null,
    })),

  setItems: (items) => set({ items }),

  setCartSummary: (for_cart_id, summary) =>
    set({ cartSummary: { ...summary, for_cart_id } }),

  addSeat: (seatId) => {
    const { items } = get();
    if (items.some((i) => i.type === "seat" && i.seat_id === seatId)) return;
    set({
      items: [...items, { type: "seat", seat_id: seatId }],
    });
  },

  removeSeat: (seatId) =>
    set({
      items: get().items.filter(
        (i) => !(i.type === "seat" && i.seat_id === seatId)
      ),
    }),

  setSectionQuantity: (sectionId, quantity) => {
    const { items } = get();
    const rest = items.filter(
      (i) => !(i.type === "section" && i.section_id === sectionId)
    );
    if (quantity <= 0) {
      set({ items: rest });
      return;
    }
    set({ items: [...rest, { type: "section", section_id: sectionId, quantity }] });
  },

  setAddOnQuantity: (addOnId, quantity, maxQty) => {
    const { items } = get();
    const rest = items.filter(
      (i) => !(i.type === "add_on" && i.add_on_id === addOnId)
    );
    const cap =
      maxQty !== undefined ? Math.min(maxQty, Math.max(0, quantity)) : Math.max(0, quantity);
    if (cap <= 0) {
      set({ items: rest });
      return;
    }
    set({ items: [...rest, { type: "add_on", add_on_id: addOnId, quantity: cap }] });
  },

  clear: () =>
    set({ cartId: null, eventId: null, items: [], expiresAt: null, cartSummary: null }),

  release: () => set({ cartId: null, expiresAt: null, cartSummary: null }),
}));
