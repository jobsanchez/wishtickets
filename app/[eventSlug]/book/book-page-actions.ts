import type { QueryClient } from "@tanstack/react-query";
import type { Event } from "@/lib/types";

type ReservationMePayload = {
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

type RefreshSeatsArgs = {
  eventSlug: string;
  isInitialBookDataLoading: boolean;
  isGuest: boolean | null;
  queryClient: QueryClient;
  applyServerReservationPayload: (data: ReservationMePayload) => boolean;
  setIsRefreshing: (next: boolean) => void;
  toastSuccess: (message: string) => void;
  toastError: (message: string) => void;
  resetStaleReservationMergeGuard: () => void;
};

export async function refreshSeatsAndPricing(args: RefreshSeatsArgs): Promise<void> {
  const {
    eventSlug,
    isInitialBookDataLoading,
    isGuest,
    queryClient,
    applyServerReservationPayload,
    setIsRefreshing,
    toastSuccess,
    toastError,
    resetStaleReservationMergeGuard,
  } = args;
  if (!eventSlug.trim()) return;
  if (isInitialBookDataLoading) return;
  resetStaleReservationMergeGuard();
  setIsRefreshing(true);
  try {
    await queryClient.refetchQueries({ queryKey: ["event", eventSlug] });
    const freshEvent = queryClient.getQueryData<Event>(["event", eventSlug]);
    const evId =
      (typeof freshEvent?.id === "string" ? freshEvent.id.trim() : "") || "";

    if (evId) {
      await queryClient.cancelQueries({ queryKey: ["availability", evId] });
      await queryClient.cancelQueries({ queryKey: ["event-prices", evId] });
      await queryClient.refetchQueries({ queryKey: ["event-prices", evId] });
      await queryClient.refetchQueries({ queryKey: ["availability", evId] });
    }

    const latestEvent = queryClient.getQueryData<Event>(["event", eventSlug]);
    const idForCart =
      (typeof latestEvent?.id === "string" ? latestEvent.id.trim() : "") ||
      (typeof freshEvent?.id === "string" ? freshEvent.id.trim() : "") ||
      "";

    if (idForCart && isGuest === false) {
      const res = await fetch(`/api/reservations/me?event_id=${idForCart}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (res.ok) {
        const data = await res.json();
        applyServerReservationPayload(data);
      }
    }

    if (evId) {
      toastSuccess("Seats and timer refreshed.");
    } else {
      toastSuccess(
        "Event details refreshed. If seats still don't load, try again in a moment."
      );
    }
  } catch {
    toastError("Failed to refresh.");
  } finally {
    setIsRefreshing(false);
  }
}
