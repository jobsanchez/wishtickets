import { useQuery } from "@tanstack/react-query";
import type { Event } from "@/lib/types";
import {
  fetchAvailabilityAllSeatsWithRetry,
  fetchAvailabilityFullWithRetry,
  fetchAvailabilityManifestWithRetry,
} from "./book-page-availability";

/** Skip focus refetch when the tab is hidden (reduces idle background API calls). */
function refetchOnWindowFocusWhenVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

const BOOK_GC_TIME_MS = 5 * 60_000;
const BOOK_MANIFEST_STALE_MS = 30_000;
const BOOK_PRICES_ADDONS_STALE_MS = 30_000;
const BOOK_SEATS_STALE_MS = 8_000;

export function useBookEventQuery(eventSlug: string, initialEvent?: Event | null) {
  const hasInitialEvent = !!initialEvent;
  return useQuery<Event>({
    queryKey: ["event", eventSlug],
    queryFn: async () => {
      const res = await fetch(`/api/events?slug=${eventSlug}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Event not found");
      const list = await res.json();
      return Array.isArray(list) ? list[0] : list;
    },
    enabled: !!eventSlug,
    initialData: initialEvent ?? undefined,
    staleTime: hasInitialEvent ? 30_000 : 0,
    gcTime: BOOK_GC_TIME_MS,
    refetchOnMount: hasInitialEvent ? false : true,
    refetchOnWindowFocus: refetchOnWindowFocusWhenVisible,
    refetchOnReconnect: true,
  });
}

export function useBookAddOnsQuery(eventIdForAvailability: string) {
  return useQuery({
    queryKey: ["event-add-ons", eventIdForAvailability],
    queryFn: async () => {
      const id = eventIdForAvailability;
      if (!id) return [];
      const res = await fetch(`/api/events/${id}/add-ons`, { cache: "no-store" });
      if (!res.ok) return [];
      const j = await res.json();
      return Array.isArray(j?.items) ? j.items : [];
    },
    enabled: !!eventIdForAvailability,
    staleTime: BOOK_PRICES_ADDONS_STALE_MS,
    gcTime: BOOK_GC_TIME_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: refetchOnWindowFocusWhenVisible,
    refetchOnReconnect: true,
  });
}

export function useBookAvailabilityManifestQuery(eventIdForAvailability: string) {
  return useQuery({
    queryKey: ["availability", eventIdForAvailability, "manifest"],
    queryFn: () => fetchAvailabilityManifestWithRetry(eventIdForAvailability),
    enabled: !!eventIdForAvailability,
    staleTime: BOOK_MANIFEST_STALE_MS,
    gcTime: BOOK_GC_TIME_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: refetchOnWindowFocusWhenVisible,
    refetchOnReconnect: true,
  });
}

export function useBookAvailabilitySeatsQuery(
  eventIdForAvailability: string,
  assignedSectionIdsForSeats: string[],
  assignedSectionIdsForSeatsKey: string
) {
  return useQuery({
    queryKey: ["availability", eventIdForAvailability, "seats", assignedSectionIdsForSeatsKey],
    queryFn: () =>
      fetchAvailabilityAllSeatsWithRetry(eventIdForAvailability, assignedSectionIdsForSeats),
    enabled: !!eventIdForAvailability,
    staleTime: BOOK_SEATS_STALE_MS,
    gcTime: BOOK_GC_TIME_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: refetchOnWindowFocusWhenVisible,
    refetchOnReconnect: true,
  });
}

export function useBookAvailabilityFullRecoveryQuery(
  eventIdForAvailability: string,
  hasSeatManifestMismatch: boolean
) {
  return useQuery({
    queryKey: ["availability", eventIdForAvailability, "full-recovery"],
    queryFn: () => fetchAvailabilityFullWithRetry(eventIdForAvailability),
    enabled: !!eventIdForAvailability && hasSeatManifestMismatch,
    staleTime: 0,
    gcTime: BOOK_GC_TIME_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: refetchOnWindowFocusWhenVisible,
    refetchOnReconnect: true,
  });
}

export function useBookPricesQuery(eventIdForAvailability: string) {
  return useQuery<{
    prices: { section_id: string; price_cents: number; base_price_cents?: number }[];
  }>({
    queryKey: ["event-prices", eventIdForAvailability],
    queryFn: async () => {
      const res = await fetch(`/api/events/${eventIdForAvailability}/prices?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load prices");
      return res.json();
    },
    enabled: !!eventIdForAvailability,
    staleTime: BOOK_PRICES_ADDONS_STALE_MS,
    gcTime: BOOK_GC_TIME_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: refetchOnWindowFocusWhenVisible,
    refetchOnReconnect: true,
  });
}
