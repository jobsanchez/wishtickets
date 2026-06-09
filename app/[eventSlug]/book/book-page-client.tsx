"use client";

import {
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useState,
  useRef,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { Event } from "@/lib/types";
import { SeatSelector, type SeatInfo } from "@/components/seat-picker/seat-selector";
import { SectionPicker } from "@/components/seat-picker/section-picker";
import { InlineCart } from "@/components/booking/inline-cart";
import { AddOnsCarousel } from "@/components/booking/add-ons-carousel";
import { ReservationTimer } from "@/components/booking/reservation-timer";
import { CartExpiredDialog } from "@/components/booking/cart-expired-dialog";
import { CartStayLongerDialog } from "@/components/booking/cart-stay-longer-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GuestSignupDialog } from "@/components/guest-signup-dialog";
import { useReservationStore } from "@/store/reservation-store";
import { createClient } from "@/lib/supabase/client";
import { useEventAvailabilityRealtime } from "@/hooks/use-event-availability-realtime";
import { notifyReservationExpired } from "@/lib/reservation-expire-client";
import { toast } from "@/lib/toast";
import {
  FLOATING_PROGRESS_PRESETS,
} from "@/components/ui/floating-progress";
import { RouteLoading } from "@/components/ui/route-loading";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReservationItem } from "@/store/reservation-store";
import {
  buildReservationSyncPayload,
  reservationItemsFingerprint,
} from "@/lib/reservation-sync-payload";
import {
  useBookAddOnsQuery,
  useBookAvailabilityFullRecoveryQuery,
  useBookAvailabilityManifestQuery,
  useBookAvailabilitySeatsQuery,
  useBookEventQuery,
  useBookPricesQuery,
} from "./book-page-queries";
import {
  getAssignedSectionIdsForSeats,
  getAssignedSectionIdsKey,
  getHasSeatManifestMismatch,
} from "./book-page-derived";
import {
  applyServerReservationPayloadCore,
  mapApiItemsToReservationItems,
} from "./book-page-cart-sync";
import { refreshSeatsAndPricing } from "./book-page-actions";
import { BookProgressOverlay } from "./components/BookProgressOverlay";
import { BookHeaderActions } from "./components/BookHeaderActions";
import { BookSeatPlanPanel } from "./components/BookSeatPlanPanel";
import { BookSeatExperience } from "./components/BookSeatExperience";
import { BookEmptyState } from "./components/BookEmptyState";
import {
  AvailabilityHttpError,
  type AvailabilitySeatRow,
  type CanvasInfo,
  computeSubtotalFromItems,
  formatSectionPricePhp,
  normalizeBookPageEventStatus,
  normalizeCanvasSectionIds,
  normalizeSeatingType,
  sanitizeStatusText,
  sectionSwatchColor,
  type SectionInfo,
} from "./book-page-types";

const RESERVATION_CHANNEL = "wish-reservation";
/** Guard against transient empty availability snapshots during polling/refetch races. */
const AVAILABILITY_STICKY_SNAPSHOT_MS = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSeatNumber(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;
  const digits = value.match(/\d+/)?.[0];
  if (!digits) return Number.NaN;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function rowSortValue(label: string | null | undefined): string {
  return (label ?? "~").trim().toUpperCase();
}

function getSectionGroupTitleParts(
  sections: SectionInfo[]
): Array<{ label: string; color: string | null }> {
  if (sections.length === 0) return [{ label: "Reserved Seating", color: null }];

  const grouped = new Map<string, { label: string; colors: string[] }>();
  for (const section of sections) {
    const explicit =
      (typeof section.section_group_name === "string" &&
      section.section_group_name.trim().length > 0
        ? section.section_group_name
        : section.section_group) ?? "";
    const inferredFromName = (() => {
      const source = (section.name || section.section_code || "").trim();
      if (!source) return "";
      const firstToken = source.split(/\s+/)[0]?.trim() ?? "";
      if (!firstToken || !/^[a-z0-9]+$/i.test(firstToken)) return "";
      return firstToken.length <= 3
        ? firstToken.toUpperCase()
        : firstToken.charAt(0).toUpperCase() + firstToken.slice(1).toLowerCase();
    })();
    const label =
      (typeof explicit === "string" && explicit.trim().length > 0
        ? explicit.trim()
        : inferredFromName) ||
      section.name ||
      section.section_code ||
      section.id;
    const key = label.toLowerCase();
    const color = sectionSwatchColor(section).toLowerCase();
    const existing = grouped.get(key);
    if (existing) {
      existing.colors.push(color);
    } else {
      grouped.set(key, { label, colors: [color] });
    }
  }

  if (grouped.size === 0) return [{ label: "Reserved Seating", color: null }];
  return Array.from(grouped.values()).map(({ label, colors }) => {
    const unique = new Set(colors);
    return {
      label,
      color: unique.size === 1 ? colors[0] ?? null : null,
    };
  });
}

interface BookPageClientProps {
  eventSlug: string;
  initialEventId?: string;
  initialEvent?: Event | null;
  reservationTtlMinutes?: number;
}

export default function BookPageClient({
  eventSlug,
  initialEventId = "",
  initialEvent = null,
  reservationTtlMinutes = 15,
}: BookPageClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    cartId,
    eventId,
    items,
    expiresAt,
    setCart,
    setItems,
    addSeat,
    removeSeat,
    setSectionQuantity,
    setAddOnQuantity,
    clear,
  } = useReservationStore();

  const [isClearing, setIsClearing] = useState(false);
  const [isProceedingToCheckout, setIsProceedingToCheckout] = useState(false);
  const [cartExpiredDialogOpen, setCartExpiredDialogOpen] = useState(false);
  const [cartStayLongerDialogOpen, setCartStayLongerDialogOpen] = useState(false);
  const [isExtendingCart, setIsExtendingCart] = useState(false);
  const [guestSignupOpen, setGuestSignupOpen] = useState(false);
  const [isGuest, setIsGuest] = useState<boolean | null>(null);
  const [serverAuthUserId, setServerAuthUserId] = useState<string | null>(null);
  const [serverAuthChecked, setServerAuthChecked] = useState(false);
  const hasInitializedExpandedSeatCardsRef = useRef(false);
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(new Set());
  const [isSeatPlanExpanded, setIsSeatPlanExpanded] = useState(false);
  const [isReservedSeatingExpanded, setIsReservedSeatingExpanded] = useState(false);
  const [isOpenSeatingExpanded, setIsOpenSeatingExpanded] = useState(false);
  const [backConfirmOpen, setBackConfirmOpen] = useState(false);
  const [isBackPending, startBackTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoSelectResetSignal, setAutoSelectResetSignal] = useState(0);
  const [autoSelectChoiceOpen, setAutoSelectChoiceOpen] = useState(false);
  const [pendingAutoSelect, setPendingAutoSelect] = useState<{
    sectionId: string;
    sectionName: string;
    quantity: number;
    existingSeatIds: string[];
    replaceSeatIds: string[];
  } | null>(null);
  const isExtendingCartRef = useRef(false);
  const cartStayLongerDialogOpenRef = useRef(false);
  /** Seat IDs last confirmed on the server (for reconciling local picks vs other users' holds). */
  const serverCartSeatIdsRef = useRef<Set<string>>(new Set());
  /**
   * Cart id for which local line items were last aligned with the server (GET me/cart or sync success).
   * Empty local items + cartId set without this ref matching would otherwise trigger a DELETE and
   * wipe the reservation (e.g. BroadcastChannel updated only cart metadata, or hydration order).
   */
  const serverHydratedCartIdRef = useRef<string | null>(null);
  const eventIdLiveRef = useRef<string | undefined>(undefined);
  const eventMismatchHandledRef = useRef(false);
  /** Collapse rapid BroadcastChannel / TTL heartbeat signals into one `/me` pass (was thrashing manifest). */
  const reservationBroadcastRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Skip silent POST when cart lines match last successful sync (stops allocate churn loops). */
  const lastSilentReservationFingerprintRef = useRef<string>("");
  /**
   * After a local cart edit, ignore `/me` + BroadcastChannel payloads that still reflect the
   * pre-sync server cart until POST /api/reservations succeeds (prevents quantity “bounce back”).
   */
  const suppressStaleReservationMergeRef = useRef(false);

  const markLocalReservationMutation = useCallback(() => {
    suppressStaleReservationMergeRef.current = true;
  }, []);

  useEffect(() => {
    if (!cartId) {
      serverHydratedCartIdRef.current = null;
      lastSilentReservationFingerprintRef.current = "";
    }
  }, [cartId]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user: u }, error }) => {
      if (cancelled) return;
      if (error?.message?.includes("Invalid Refresh Token")) {
        await supabase.auth.signOut({ scope: "local" });
      }
      setIsGuest(!u);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsGuest(!session?.user);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncServerAuth = async () => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { user?: { id?: string } | null } | null;
        if (cancelled) return;
        const id = body?.user?.id ?? null;
        setServerAuthUserId(id);
        setServerAuthChecked(true);
        setIsGuest(!id);
      } catch {
        if (!cancelled) setServerAuthChecked(true);
      }
    };

    void syncServerAuth();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void syncServerAuth();
    };
    const onFocus = () => void syncServerAuth();
    const onPageShow = () => void syncServerAuth();
    const onOnline = () => void syncServerAuth();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  useEffect(() => {
    isExtendingCartRef.current = isExtendingCart;
  }, [isExtendingCart]);

  useEffect(() => {
    cartStayLongerDialogOpenRef.current = cartStayLongerDialogOpen;
  }, [cartStayLongerDialogOpen]);

  const { data: event, isLoading: eventLoading } = useBookEventQuery(eventSlug, initialEvent);
  const seatPlanImageUrls = useMemo(() => {
    const live = Array.isArray(event?.seat_map_image_urls)
      ? event.seat_map_image_urls.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
      : [];
    if (live.length > 0) return live;
    const initial = Array.isArray(initialEvent?.seat_map_image_urls)
      ? initialEvent.seat_map_image_urls.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
      : [];
    return initial;
  }, [event?.seat_map_image_urls, initialEvent?.seat_map_image_urls]);

  // Use server-resolved event id as early key so dependent queries can start in parallel.
  const eventIdForAvailability = (event?.id ?? initialEventId ?? "").trim();

  useEffect(() => {
    if (!event?.id) lastSilentReservationFingerprintRef.current = "";
  }, [event?.id]);

  const { data: addOnsCatalog = [], isLoading: addOnsLoading } =
    useBookAddOnsQuery(eventIdForAvailability);

  const normalizedAddOnCatalog = useMemo(() => {
    type Raw = {
      id?: string;
      title?: string;
      image_url?: string;
      price_cents?: number;
      stock_quantity?: number;
      max_qty_per_cart?: number;
      sold_out?: boolean;
    };
    const list = Array.isArray(addOnsCatalog) ? addOnsCatalog : [];
    return list
      .map((raw: Raw) => {
        const stock = Math.max(0, Math.floor(Number(raw.stock_quantity) || 0));
        const cap = Math.max(1, Math.min(9999, Number(raw.max_qty_per_cart) || 10));
        const id = typeof raw.id === "string" ? raw.id : "";
        if (!id) return null;
        return {
          id,
          title: raw.title ?? "",
          image_url: raw.image_url ?? "",
          price_cents: Math.max(0, Number(raw.price_cents) || 0),
          stock_quantity: stock,
          max_qty_per_cart: cap,
          sold_out: raw.sold_out === true || stock <= 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }, [addOnsCatalog]);

  useEffect(() => {
    eventIdLiveRef.current = event?.id;
  }, [event?.id]);

  useEffect(() => {
    if (!event?.id || !eventId) {
      eventMismatchHandledRef.current = false;
      return;
    }
    if (eventId === event.id) {
      eventMismatchHandledRef.current = false;
      return;
    }
    if (eventMismatchHandledRef.current) return;
    eventMismatchHandledRef.current = true;
    clear();
    toast.error("Cart was reset because it belonged to a different event.");
    void queryClient.invalidateQueries({ queryKey: ["availability", event.id] });
  }, [event?.id, eventId, clear, queryClient]);

  useEffect(() => {
    serverHydratedCartIdRef.current = null;
  }, [event?.id]);

  const applyServerReservationPayload = useCallback(
    (
      data: {
        reservation_cart_id?: string | null;
        event_id?: string;
        expires_at?: string | null;
        items?: {
          seat_id?: string;
          section_id?: string;
          add_on_id?: string;
          quantity: number;
        }[];
      }
    ): boolean =>
      applyServerReservationPayloadCore({
        data,
        currentEventId: event?.id,
        normalizedItems: mapApiItemsToReservationItems(data.items),
        suppressStaleReservationMerge: suppressStaleReservationMergeRef.current,
        setCart,
        setItems,
        clear,
        setServerHydratedCartId: (cartId) => {
          serverHydratedCartIdRef.current = cartId;
        },
        setLastSilentReservationFingerprint: (value) => {
          lastSilentReservationFingerprintRef.current = value;
        },
        setServerCartSeatIds: (next) => {
          serverCartSeatIdsRef.current = next;
        },
      }),
    [setCart, setItems, clear, event?.id]
  );

  useEffect(() => {
    if (eventLoading || !event?.id) return;
    if (seatPlanImageUrls.length > 0) {
      setIsSeatPlanExpanded(true);
    }
  }, [eventLoading, event?.id, seatPlanImageUrls.length]);

  // Fetch user's cart on load (profile-based; no localStorage)
  useEffect(() => {
    if (!event?.id || isGuest !== false) return;
    let cancelled = false;
    fetch(`/api/reservations/me?event_id=${event.id}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        applyServerReservationPayload(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [event?.id, isGuest, applyServerReservationPayload]);

  useEventAvailabilityRealtime(eventIdForAvailability || undefined);

  const {
    data: availabilityManifestData,
    isLoading: manifestAvailabilityLoading,
    isFetching: manifestAvailabilityFetching,
    isError: manifestAvailabilityQueryError,
    error: manifestAvailabilityError,
  } = useBookAvailabilityManifestQuery(eventIdForAvailability);

  const assignedSectionIdsForSeats = useMemo(() => {
    return getAssignedSectionIdsForSeats(availabilityManifestData?.sections ?? []);
  }, [availabilityManifestData?.sections]);

  const assignedSectionIdsForSeatsKey = useMemo(
    () => getAssignedSectionIdsKey(assignedSectionIdsForSeats),
    [assignedSectionIdsForSeats]
  );

  const {
    data: availabilitySeatsData,
    isLoading: seatsAvailabilityLoading,
    isFetching: seatsAvailabilityFetching,
    isError: seatsAvailabilityQueryError,
    error: seatsAvailabilityError,
  } = useBookAvailabilitySeatsQuery(
    eventIdForAvailability,
    assignedSectionIdsForSeats,
    assignedSectionIdsForSeatsKey
  );

  const hasSeatManifestMismatch = useMemo(() => {
    return getHasSeatManifestMismatch(
      availabilityManifestData?.sections ?? [],
      availabilitySeatsData?.seats ?? []
    );
  }, [availabilityManifestData?.sections, availabilitySeatsData?.seats]);

  const { data: availabilityFullRecoveryData } = useBookAvailabilityFullRecoveryQuery(
    eventIdForAvailability,
    hasSeatManifestMismatch
  );

  const refetchAvailability = useCallback(async () => {
    if (!eventIdForAvailability) return;
    await queryClient.refetchQueries({
      queryKey: ["availability", eventIdForAvailability],
    });
  }, [eventIdForAvailability, queryClient]);

  const availability = useMemo(() => {
    const source = hasSeatManifestMismatch && availabilityFullRecoveryData
      ? availabilityFullRecoveryData
      : availabilityManifestData;
    if (!source) return undefined;
    return {
      sections: source.sections,
      canvases: source.canvases,
      seats:
        hasSeatManifestMismatch && availabilityFullRecoveryData
          ? availabilityFullRecoveryData.seats
          : (availabilitySeatsData?.seats ?? []),
    };
  }, [
    availabilityManifestData,
    availabilitySeatsData?.seats,
    hasSeatManifestMismatch,
    availabilityFullRecoveryData,
  ]);

  const lastKnownGoodSectionsRef = useRef<{
    eventId: string;
    at: number;
    sections: SectionInfo[];
    canvases: CanvasInfo[];
  } | null>(null);
  const lastKnownGoodSeatsRef = useRef<{
    eventId: string;
    at: number;
    seats: AvailabilitySeatRow[];
  } | null>(null);

  const stableAvailability = useMemo(() => {
    if (!availability || !eventIdForAvailability) return availability;
    if (availability.sections.length > 0) {
      lastKnownGoodSectionsRef.current = {
        eventId: eventIdForAvailability,
        at: Date.now(),
        sections: availability.sections,
        canvases: availability.canvases,
      };
    }
    if (availability.seats.length > 0) {
      lastKnownGoodSeatsRef.current = {
        eventId: eventIdForAvailability,
        at: Date.now(),
        seats: availability.seats,
      };
    }
    const sectionSnapshot = lastKnownGoodSectionsRef.current;
    const seatSnapshot = lastKnownGoodSeatsRef.current;
    const now = Date.now();

    const canUseSectionSnapshot =
      !!sectionSnapshot &&
      sectionSnapshot.eventId === eventIdForAvailability &&
      now - sectionSnapshot.at <= AVAILABILITY_STICKY_SNAPSHOT_MS;
    const canUseSeatSnapshot =
      !!seatSnapshot &&
      seatSnapshot.eventId === eventIdForAvailability &&
      now - seatSnapshot.at <= AVAILABILITY_STICKY_SNAPSHOT_MS;

    const effectiveSections =
      availability.sections.length > 0
        ? availability.sections
        : canUseSectionSnapshot
          ? sectionSnapshot.sections
          : availability.sections;
    const effectiveCanvases =
      availability.sections.length > 0
        ? availability.canvases
        : canUseSectionSnapshot
          ? sectionSnapshot.canvases
          : availability.canvases;
    const effectiveSeats =
      availability.seats.length > 0
        ? availability.seats
        : canUseSeatSnapshot
          ? seatSnapshot.seats
          : availability.seats;

    return {
      sections: effectiveSections,
      canvases: effectiveCanvases,
      seats: effectiveSeats,
    };
  }, [availability, eventIdForAvailability]);

  const availabilityLoading =
    manifestAvailabilityLoading ||
    seatsAvailabilityLoading;

  const availabilityFetching =
    manifestAvailabilityFetching ||
    seatsAvailabilityFetching;

  const availabilityError =
    manifestAvailabilityQueryError || seatsAvailabilityQueryError;

  const hasConfirmedNoSeating = useMemo(() => {
    const isNoSeating = (err: unknown) =>
      err instanceof AvailabilityHttpError && err.code === "no_seating";
    return isNoSeating(manifestAvailabilityError) || isNoSeating(seatsAvailabilityError);
  }, [manifestAvailabilityError, seatsAvailabilityError]);

  const { data: pricesData, isLoading: pricesLoading } =
    useBookPricesQuery(eventIdForAvailability);

  const isInitialBookDataLoading =
    availabilityLoading ||
    pricesLoading ||
    addOnsLoading;

  const priceCentsBySectionId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of pricesData?.prices ?? []) {
      map[p.section_id] = p.price_cents;
    }
    return map;
  }, [pricesData?.prices]);

  const basePriceCentsBySectionId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of pricesData?.prices ?? []) {
      if (p.base_price_cents != null) map[p.section_id] = p.base_price_cents;
    }
    return map;
  }, [pricesData?.prices]);

  const seats = useMemo(() => stableAvailability?.seats ?? [], [stableAvailability?.seats]);
  const sections: SectionInfo[] = useMemo(
    () => stableAvailability?.sections ?? [],
    [stableAvailability?.sections]
  );
  const assignedSections = sections.filter(
    (s) => normalizeSeatingType(s.seating_type) === "assigned"
  );
  const assignedSectionIds = useMemo(
    () => new Set(assignedSections.map((s) => s.id)),
    [assignedSections]
  );
  const assignedSeats = seats.filter((seat) =>
    seat.section_id != null && assignedSectionIds.has(seat.section_id)
  );
  const mapSections = assignedSections.filter((s) => s.show_seat_selection !== false);
  const gridSections = assignedSections.filter((s) => s.show_seat_selection === false);
  const mapSectionIds = useMemo(() => new Set(mapSections.map((s) => s.id)), [mapSections]);
  const gridSectionIds = useMemo(() => new Set(gridSections.map((s) => s.id)), [gridSections]);
  const mapSeats = assignedSeats.filter((seat) =>
    seat.section_id != null && mapSectionIds.has(seat.section_id)
  );
  const gridSeats = assignedSeats.filter((seat) =>
    seat.section_id != null && gridSectionIds.has(seat.section_id)
  );
  const mapSeatsBySectionId = useMemo(() => {
    const grouped = new Map<string, AvailabilitySeatRow[]>();
    for (const seat of mapSeats) {
      const sectionId = seat.section_id;
      if (!sectionId) continue;
      const existing = grouped.get(sectionId);
      if (existing) {
        existing.push(seat);
      } else {
        grouped.set(sectionId, [seat]);
      }
    }
    return grouped;
  }, [mapSeats]);
  const gridSeatsBySectionId = useMemo(() => {
    const grouped = new Map<string, AvailabilitySeatRow[]>();
    for (const seat of gridSeats) {
      const sectionId = seat.section_id;
      if (!sectionId) continue;
      const existing = grouped.get(sectionId);
      if (existing) {
        existing.push(seat);
      } else {
        grouped.set(sectionId, [seat]);
      }
    }
    return grouped;
  }, [gridSeats]);

  useEffect(() => {
    if (!cartId && items.length === 0) {
      serverCartSeatIdsRef.current = new Set();
    }
  }, [cartId, items.length]);

  useEffect(() => {
    const list = availability?.seats;
    if (!list?.length) return;
    const seatById = new Map(list.map((s) => [s.id, s]));
    const toRemove: string[] = [];
    for (const item of items) {
      if (item.type !== "seat") continue;
      const s = seatById.get(item.seat_id);
      if (!s) continue;
      const st = s.status ?? (s.available ? "available" : "sold");
      if (!s.available && (st === "reserved" || st === "sold" || st === "hold")) {
        if (!serverCartSeatIdsRef.current.has(item.seat_id)) {
          toRemove.push(item.seat_id);
        }
      }
    }
    if (toRemove.length === 0) return;
    for (const id of toRemove) {
      removeSeat(id);
    }
    toast.error("One or more seats are no longer available.");
  }, [availability?.seats, items, removeSeat]);

  const canvases: CanvasInfo[] = useMemo(
    () =>
      (stableAvailability?.canvases ?? []).map((c) => ({
        ...c,
        section_ids: normalizeCanvasSectionIds(c.section_ids),
      })),
    [stableAvailability?.canvases]
  );
  const sectionsInCanvases = useMemo(
    () => new Set(canvases.flatMap((c) => c.section_ids ?? [])),
    [canvases]
  );
  const mapDisplayGroups = useMemo(() => {
    const groups: Array<{
      type: "canvas" | "section";
      sections: SectionInfo[];
      bgImage: string | null | undefined;
      bgScale: number;
      bgOpacity: number;
    }> = [];

    if (canvases.length > 0) {
      for (const canvas of canvases) {
        const sectionIds = normalizeCanvasSectionIds(canvas.section_ids);
        const sectionById = new Map(mapSections.map((s) => [s.id, s]));
        const canvasSections = sectionIds
          .map((id) => sectionById.get(id))
          .filter((s): s is SectionInfo => !!s);
        if (canvasSections.length > 0) {
          groups.push({
            type: "canvas",
            sections: canvasSections,
            bgImage: canvas.image_url?.trim() || undefined,
            bgScale: canvas.scale ?? 1,
            bgOpacity: canvas.opacity ?? 0.5,
          });
        }
      }
      for (const sec of mapSections) {
        if (!sectionsInCanvases.has(sec.id)) {
          groups.push({
            type: "section",
            sections: [sec],
            bgImage:
              (sec as SectionInfo).background_image_url?.trim() ||
              event?.seat_layout_image_url,
            bgScale: (sec as SectionInfo).background_scale ?? event?.seat_layout_scale ?? 1,
            bgOpacity: (sec as SectionInfo).background_opacity ?? event?.seat_layout_opacity ?? 0.5,
          });
        }
      }
    } else {
      const sectionsWithCanvas = mapSections.filter(
        (s) => (s as SectionInfo).seat_layout_canvas_id != null
      );
      const groupedByCanvasId = new Map<string | null, SectionInfo[]>();
      for (const sec of sectionsWithCanvas) {
        const cid = (sec as SectionInfo).seat_layout_canvas_id ?? null;
        if (!groupedByCanvasId.has(cid)) groupedByCanvasId.set(cid, []);
        groupedByCanvasId.get(cid)!.push(sec);
      }
      const seenSectionIds = new Set<string>();
      for (const [, canvasSections] of groupedByCanvasId) {
        if (canvasSections.length > 0) {
          const first = canvasSections[0]!;
          groups.push({
            type: "canvas",
            sections: canvasSections,
            bgImage:
              first.background_image_url?.trim() || event?.seat_layout_image_url,
            bgScale: first.background_scale ?? event?.seat_layout_scale ?? 1,
            bgOpacity: first.background_opacity ?? event?.seat_layout_opacity ?? 0.5,
          });
          canvasSections.forEach((s) => seenSectionIds.add(s.id));
        }
      }
      for (const sec of mapSections) {
        if (!seenSectionIds.has(sec.id)) {
          groups.push({
            type: "section",
            sections: [sec],
            bgImage:
              (sec as SectionInfo).background_image_url?.trim() ||
              event?.seat_layout_image_url,
            bgScale: (sec as SectionInfo).background_scale ?? event?.seat_layout_scale ?? 1,
            bgOpacity: (sec as SectionInfo).background_opacity ?? event?.seat_layout_opacity ?? 0.5,
          });
        }
      }
    }
    return groups;
  }, [canvases, mapSections, sectionsInCanvases, event?.seat_layout_image_url, event?.seat_layout_scale, event?.seat_layout_opacity]);

  const visibleMapDisplayGroups = useMemo(
    () => {
      if (mapSeats.length === 0 && mapDisplayGroups.length > 0) {
        // Render configured groups even before seat rows fully hydrate to avoid false empty-state flicker.
        return mapDisplayGroups;
      }
      return mapDisplayGroups.filter((group) => {
        return group.sections.some(
          (sec) => (mapSeatsBySectionId.get(sec.id)?.length ?? 0) > 0
        );
      });
    },
    [mapDisplayGroups, mapSeats, mapSeatsBySectionId]
  );

  const visibleGridSections = useMemo(
    () => {
      if (gridSeats.length === 0 && gridSections.length > 0) {
        return gridSections;
      }
      return gridSections.filter(
        (sec) => (gridSeatsBySectionId.get(sec.id)?.length ?? 0) > 0
      );
    },
    [gridSections, gridSeats, gridSeatsBySectionId]
  );

  useEffect(() => {
    hasInitializedExpandedSeatCardsRef.current = false;
  }, [eventIdForAvailability]);

  useEffect(() => {
    if (!eventIdForAvailability) return;
    if (availabilityLoading || availabilityError) return;
    if (hasInitializedExpandedSeatCardsRef.current) return;

    const hasVisibleCards =
      visibleMapDisplayGroups.length > 0 || visibleGridSections.length > 0;
    if (!hasVisibleCards) return;
    hasInitializedExpandedSeatCardsRef.current = true;
    setExpandedSectionIds(new Set());
  }, [
    eventIdForAvailability,
    availabilityLoading,
    availabilityError,
    visibleMapDisplayGroups,
    visibleGridSections,
  ]);

  const hasAssignedSeats = assignedSeats.length > 0;
  const freeStandingSections = sections.filter((s) => {
    const n = normalizeSeatingType(s.seating_type);
    return n === "free" || n === "standing";
  });
  const hasFreeSeating = freeStandingSections.length > 0;
  const hasRenderableAssignedLayout =
    mapSections.length > 0 || gridSections.length > 0;
  /** Map/grid assigned seats or open free/standing sections — heading sits above all of these. */
  const showSeatExperienceHeading =
    hasRenderableAssignedLayout || hasFreeSeating;
  const hasManifestSections = sections.length > 0;
  const hasSeatRowsWithSectionIds = seats.some((s) => typeof s.section_id === "string" && s.section_id.length > 0);
  const hasConfiguredSections = hasManifestSections || hasSeatRowsWithSectionIds;
  /** Draft and published events are bookable when opened via slug; listing stays published-only. */
  const eventStatusSanitized = sanitizeStatusText(event?.status);
  const eventStatusKey = normalizeBookPageEventStatus(event?.status);
  const isBookableEvent =
    eventStatusKey === "published" || eventStatusKey === "draft";
  const isExplicitlyNonBookableStatus =
    eventStatusKey === "postponed" ||
    eventStatusKey === "cancelled" ||
    eventStatusKey === "archived";
  const shouldAllowSeatSelectionFlow =
    isBookableEvent || !isExplicitlyNonBookableStatus;
  const isDraftPreview = eventStatusKey === "draft";
  const eventStatusLabel = eventStatusSanitized || eventStatusKey || "draft";
  const isDefinitelyGuest = serverAuthChecked ? !serverAuthUserId : isGuest === true;
  const [availabilityRetryingNoData, setAvailabilityRetryingNoData] = useState(false);
  const seatDiagnostic = useMemo(() => {
    if (!event?.id) {
      return { code: "ok", text: "" } as const;
    }
    if (availabilityError) {
      return {
        code: "availability_fetch_error",
        text: "Seat diagnostics: availability fetch failed. Check network/API health.",
      } as const;
    }
    if (isDefinitelyGuest) {
      return {
        code: "auth_guest",
        text: "Seat diagnostics: viewing as guest. Selection requires sign-in.",
      } as const;
    }
    if (!shouldAllowSeatSelectionFlow) {
      return {
        code: "event_not_bookable",
        text: "Seat diagnostics: event status currently blocks seat sales.",
      } as const;
    }
    if (!hasManifestSections && hasSeatRowsWithSectionIds) {
      return {
        code: "manifest_sections_missing",
        text: "Seat diagnostics: seats are present but section manifest is empty. Try Refresh Seats; if it persists, check availability manifest API/migration state.",
      } as const;
    }
    if (!hasAssignedSeats && !hasFreeSeating && hasConfiguredSections) {
      return {
        code: "empty_inventory",
        text: "Seat diagnostics: sections exist but currently no available seat inventory.",
      } as const;
    }
    if (!hasAssignedSeats && !hasFreeSeating && !hasConfiguredSections) {
      if (!hasConfirmedNoSeating && isBookableEvent) {
        return {
          code: "awaiting_seat_data",
          text: "Seat diagnostics: waiting for stable availability payload; retrying transient empty responses.",
        } as const;
      }
      return {
        code: "no_sections_configured",
        text: "Seat diagnostics: no event sections/seat map configured yet.",
      } as const;
    }
    return {
      code: "ok",
      text: "",
    } as const;
  }, [
    availabilityError,
    isDefinitelyGuest,
    shouldAllowSeatSelectionFlow,
    hasAssignedSeats,
    hasFreeSeating,
    hasConfiguredSections,
    hasManifestSections,
    hasSeatRowsWithSectionIds,
    hasConfirmedNoSeating,
    isBookableEvent,
    event?.id,
  ]);

  const seatDiagnosticLogKeyRef = useRef<string>("");
  const shouldShowEmptySeatFallback =
    !availabilityLoading &&
    !availabilityError &&
    !availabilityRetryingNoData &&
    !isRefreshing &&
    !availabilityFetching &&
    !hasAssignedSeats &&
    !hasFreeSeating &&
    !hasRenderableAssignedLayout;
  const shouldShowDraftSeatFetchNotice =
    isDraftPreview &&
    !hasAssignedSeats &&
    !hasFreeSeating &&
    (availabilityLoading ||
      availabilityFetching ||
      availabilityRetryingNoData ||
      shouldShowEmptySeatFallback);

  useEffect(() => {
    const shouldLog = !!event?.id && seatDiagnostic.code !== "ok" && (availabilityError || shouldShowEmptySeatFallback);
    if (!shouldLog) return;
    const key = `${event?.id ?? "unknown"}:${seatDiagnostic.code}`;
    if (seatDiagnosticLogKeyRef.current === key) return;
    seatDiagnosticLogKeyRef.current = key;
    console.warn("[book-page] seat-diagnostic", {
      eventId: event?.id ?? null,
      eventSlug,
      diagnostic: seatDiagnostic.code,
      availabilityError,
      isGuest,
      serverAuthChecked,
      hasConfiguredSections,
      sectionsCount: sections.length,
      seatsCount: seats.length,
      hasAssignedSeats,
      hasFreeSeating,
    });
  }, [
    availabilityError,
    hasAssignedSeats,
    hasFreeSeating,
    seatDiagnostic.code,
    event?.id,
    eventSlug,
    isGuest,
    serverAuthChecked,
    hasConfiguredSections,
    sections.length,
    seats.length,
    shouldShowEmptySeatFallback,
  ]);

  // useLayoutEffect: when the first fetch finishes with empty seats+sections, we must set
  // availabilityRetryingNoData before paint. A plain useEffect runs after paint and caused a
  // one-frame flash of "No seat map configured…" before "Checking latest…" appeared.
  useLayoutEffect(() => {
    if (!eventIdForAvailability) return;
    if (availabilityLoading || availabilityError) {
      setAvailabilityRetryingNoData(false);
      return;
    }
    if (seats.length > 0 || sections.length > 0) {
      setAvailabilityRetryingNoData(false);
      return;
    }

    let cancelled = false;
    setAvailabilityRetryingNoData(true);
    void (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        await sleep(700 + attempt * 450);
        if (cancelled) return;
        await refetchAvailability();
        if (cancelled) return;
        const man =
          queryClient.getQueryData<{ sections: SectionInfo[] }>([
            "availability",
            eventIdForAvailability,
            "manifest",
          ]) ?? null;
        const nextSections = man?.sections ?? [];
        const seatRows = queryClient.getQueriesData<{ seats: AvailabilitySeatRow[] }>({
          queryKey: ["availability", eventIdForAvailability, "seats"],
        }).flatMap(([, body]) => body?.seats ?? []);
        const nextSeats = seatRows;
        if (nextSeats.length > 0 || nextSections.length > 0) {
          setAvailabilityRetryingNoData(false);
          return;
        }
      }
      if (!cancelled) setAvailabilityRetryingNoData(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    eventIdForAvailability,
    availabilityLoading,
    availabilityError,
    seats.length,
    sections.length,
    refetchAvailability,
    queryClient,
  ]);

  const selectedSeatIds = useMemo(
    () => new Set(items.filter((i) => i.type === "seat").map((i) => i.seat_id)),
    [items]
  );
  const selectedSections = new Map(
    items
      .filter((i) => i.type === "section")
      .map((i) => [i.section_id, i.quantity] as const)
  );

  const pickBestSeatCluster = useCallback(
    (sectionId: string, quantity: number, excludeSeatIds?: Set<string>) => {
      type Candidate = {
        seatIds: string[];
        contiguousPenalty: number;
        gapPenalty: number;
        rowKey: string;
        rowSortIndex: number;
        startSeat: number;
      };

      const availableSeats = seats
        .filter((seat) => {
          if (seat.section_id !== sectionId) return false;
          if (excludeSeatIds?.has(seat.id)) return false;
          const status = String(seat.status ?? (seat.available ? "available" : "sold")).toLowerCase();
          if (status === "reserved" || status === "sold" || status === "hold") return false;
          return seat.available === true;
        })
        .map((seat) => ({
          seat,
          rowKey: rowSortValue(seat.row_label),
          seatNumber: parseSeatNumber(seat.seat_number),
        }));

      if (availableSeats.length < quantity) return null;

      const rowEntries = new Map<string, typeof availableSeats>();
      for (const item of availableSeats) {
        const existing = rowEntries.get(item.rowKey);
        if (existing) existing.push(item);
        else rowEntries.set(item.rowKey, [item]);
      }

      const orderedRows = Array.from(rowEntries.entries()).sort(([a], [b]) =>
        a.localeCompare(b, undefined, { numeric: true })
      );
      const candidates: Candidate[] = [];

      orderedRows.forEach(([rowKey, rowSeats], rowSortIndex) => {
        rowSeats.sort((a, b) => {
          const aNum = Number.isFinite(a.seatNumber) ? a.seatNumber : Number.MAX_SAFE_INTEGER;
          const bNum = Number.isFinite(b.seatNumber) ? b.seatNumber : Number.MAX_SAFE_INTEGER;
          if (aNum !== bNum) return aNum - bNum;
          return a.seat.id.localeCompare(b.seat.id);
        });
        if (rowSeats.length < quantity) return;
        for (let start = 0; start <= rowSeats.length - quantity; start += 1) {
          const window = rowSeats.slice(start, start + quantity);
          let contiguousPenalty = 0;
          let gapPenalty = 0;
          for (let idx = 1; idx < window.length; idx += 1) {
            const prev = window[idx - 1]!;
            const current = window[idx]!;
            if (!Number.isFinite(prev.seatNumber) || !Number.isFinite(current.seatNumber)) {
              contiguousPenalty += 1;
              gapPenalty += 10;
              continue;
            }
            const diff = current.seatNumber - prev.seatNumber;
            if (diff !== 1) contiguousPenalty += 1;
            if (diff > 1) gapPenalty += diff - 1;
          }
          const startSeat = Number.isFinite(window[0]!.seatNumber) ? window[0]!.seatNumber : Number.MAX_SAFE_INTEGER;
          candidates.push({
            seatIds: window.map((entry) => entry.seat.id),
            contiguousPenalty,
            gapPenalty,
            rowKey,
            rowSortIndex,
            startSeat,
          });
        }
      });

      if (candidates.length === 0) return null;
      candidates.sort((a, b) => {
        if (a.contiguousPenalty !== b.contiguousPenalty) return a.contiguousPenalty - b.contiguousPenalty;
        if (a.gapPenalty !== b.gapPenalty) return a.gapPenalty - b.gapPenalty;
        if (a.rowSortIndex !== b.rowSortIndex) return a.rowSortIndex - b.rowSortIndex;
        if (a.startSeat !== b.startSeat) return a.startSeat - b.startSeat;
        return a.rowKey.localeCompare(b.rowKey);
      });
      return candidates[0]!.seatIds;
    },
    [seats]
  );

  const autoSelectSectionSeats = useCallback(
    (sectionId: string, quantity: number): boolean => {
      if (isDefinitelyGuest) {
        setGuestSignupOpen(true);
        return false;
      }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
        toast.error("Select a quantity from 1 to 10.");
        return false;
      }

      const section = sections.find((item) => item.id === sectionId);
      const sectionName = section?.name || section?.section_code || sectionId;
      const replaceSeatIds = pickBestSeatCluster(sectionId, quantity);
      if (!replaceSeatIds) {
        toast.error(`Not enough available seats in ${sectionName} for quantity ${quantity}.`);
        return false;
      }

      const existingSeatIds = items
        .filter((item): item is Extract<ReservationItem, { type: "seat" }> => item.type === "seat")
        .map((item) => item.seat_id)
        .filter((seatId) => {
          const seat = seats.find((entry) => entry.id === seatId);
          return seat?.section_id === sectionId;
        });

      if (existingSeatIds.length > 0) {
        setPendingAutoSelect({
          sectionId,
          sectionName,
          quantity,
          existingSeatIds,
          replaceSeatIds,
        });
        setAutoSelectChoiceOpen(true);
        return false;
      }

      markLocalReservationMutation();
      for (const seatId of replaceSeatIds) addSeat(seatId);
      toast.success(`Added ${replaceSeatIds.length} seat${replaceSeatIds.length > 1 ? "s" : ""} from ${sectionName}.`);
      setAutoSelectResetSignal((prev) => prev + 1);
      return true;
    },
    [
      addSeat,
      isDefinitelyGuest,
      items,
      markLocalReservationMutation,
      pickBestSeatCluster,
      sections,
      seats,
    ]
  );

  const handleAutoSelectReplace = useCallback(() => {
    if (!pendingAutoSelect) return;
    markLocalReservationMutation();
    for (const seatId of pendingAutoSelect.existingSeatIds) removeSeat(seatId);
    for (const seatId of pendingAutoSelect.replaceSeatIds) addSeat(seatId);
    toast.success(
      `Selected ${pendingAutoSelect.replaceSeatIds.length} seat${
        pendingAutoSelect.replaceSeatIds.length > 1 ? "s" : ""
      } in ${pendingAutoSelect.sectionName}.`
    );
    setPendingAutoSelect(null);
    setAutoSelectChoiceOpen(false);
    setAutoSelectResetSignal((prev) => prev + 1);
  }, [addSeat, markLocalReservationMutation, pendingAutoSelect, removeSeat]);

  const handleAutoSelectAppend = useCallback(() => {
    if (!pendingAutoSelect) return;
    const excluded = new Set(pendingAutoSelect.existingSeatIds);
    const appendSeatIds = pickBestSeatCluster(
      pendingAutoSelect.sectionId,
      pendingAutoSelect.quantity,
      excluded
    );
    if (!appendSeatIds) {
      toast.error(
        `Not enough additional seats in ${pendingAutoSelect.sectionName} to append ${pendingAutoSelect.quantity}.`
      );
      return;
    }
    markLocalReservationMutation();
    for (const seatId of appendSeatIds) addSeat(seatId);
    toast.success(
      `Appended ${appendSeatIds.length} seat${appendSeatIds.length > 1 ? "s" : ""} in ${pendingAutoSelect.sectionName}.`
    );
    setPendingAutoSelect(null);
    setAutoSelectChoiceOpen(false);
    setAutoSelectResetSignal((prev) => prev + 1);
  }, [addSeat, markLocalReservationMutation, pendingAutoSelect, pickBestSeatCluster]);

  const toggleSeat = useCallback(
    (seatId: string, available: boolean) => {
      if (!available) return;
      if (selectedSeatIds.has(seatId)) {
        markLocalReservationMutation();
        removeSeat(seatId);
        serverCartSeatIdsRef.current.delete(seatId);
        return;
      }
      if (isDefinitelyGuest) {
        setGuestSignupOpen(true);
        return;
      }
      markLocalReservationMutation();
      addSeat(seatId);
      serverCartSeatIdsRef.current.add(seatId);
    },
    [removeSeat, addSeat, selectedSeatIds, isDefinitelyGuest, markLocalReservationMutation]
  );

  const totalCount =
    items.filter((i) => i.type === "seat").length +
    items
      .filter((i) => i.type === "section")
      .reduce((sum, i) => sum + i.quantity, 0);

  /** Latest cart lines for reservation POST — avoids churning `syncCartToServer` identity each render. */
  const cartSyncItemsRef = useRef(items);
  const cartSyncTotalRef = useRef(totalCount);
  cartSyncItemsRef.current = items;
  cartSyncTotalRef.current = totalCount;

  const addOnsById = useMemo(() => {
    const m: Record<string, { title: string; price_cents: number }> = {};
    for (const a of normalizedAddOnCatalog) {
      m[a.id] = { title: a.title, price_cents: a.price_cents };
    }
    return m;
  }, [normalizedAddOnCatalog]);

  const addOnStockById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of normalizedAddOnCatalog) {
      m[a.id] = a.stock_quantity;
    }
    return m;
  }, [normalizedAddOnCatalog]);

  const addOnPurchaseMaxById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of normalizedAddOnCatalog) {
      m[a.id] = Math.min(a.stock_quantity, a.max_qty_per_cart);
    }
    return m;
  }, [normalizedAddOnCatalog]);

  const addOnPriceMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of normalizedAddOnCatalog) {
      m[a.id] = a.price_cents;
    }
    return m;
  }, [normalizedAddOnCatalog]);

  const quantityByIdForCarousel = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of items) {
      if (i.type === "add_on") m[i.add_on_id] = i.quantity;
    }
    return m;
  }, [items]);

  useEffect(() => {
    if (totalCount > 0) return;
    const { items: cur, setItems: si } = useReservationStore.getState();
    if (!cur.some((i) => i.type === "add_on")) return;
    si(cur.filter((i) => i.type !== "add_on"));
  }, [totalCount]);

  const handleAddOnQty = useCallback(
    (addOnId: string, quantity: number, maxStock: number) => {
      if (quantity > 0 && totalCount <= 0) {
        toast.error("Select at least one ticket before adding add-ons.");
        return;
      }
      markLocalReservationMutation();
      setAddOnQuantity(addOnId, quantity, maxStock);
    },
    [setAddOnQuantity, totalCount, markLocalReservationMutation]
  );

  type SyncCartResult =
    | { ok: true; reservation_cart_id: string; expires_at: string }
    | { ok: false };

  const syncCartToServer = useCallback(
    async (opts?: { silent?: boolean; signal?: AbortSignal }): Promise<SyncCartResult> => {
      if (!event?.id) return { ok: false };
      const silent = opts?.silent ?? false;
      const totalNow = cartSyncTotalRef.current;
      const itemsNow = cartSyncItemsRef.current;
      if (totalNow === 0) {
        if (!silent) toast.error("Select at least one seat or section quantity.");
        return { ok: false };
      }
      if (silent) {
        const fp = reservationItemsFingerprint(itemsNow);
        const st = useReservationStore.getState();
        if (
          fp &&
          fp === lastSilentReservationFingerprintRef.current &&
          st.cartId &&
          st.cartId === serverHydratedCartIdRef.current
        ) {
          suppressStaleReservationMergeRef.current = false;
          return {
            ok: true,
            reservation_cart_id: st.cartId,
            expires_at:
              st.expiresAt ??
              new Date(Date.now() + 5 * 60_000).toISOString(),
          };
        }
      }
      const payload = {
        event_id: event.id,
        items: buildReservationSyncPayload(itemsNow),
      };
      try {
        const res = await fetch("/api/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
          signal: opts?.signal,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 401) toast.error("Please sign in to reserve seats.");
          else if (res.status === 409) {
            toast.error(
              typeof data.error === "string"
                ? data.error
                : "One or more seats are no longer available."
            );
            await queryClient.invalidateQueries({
              queryKey: ["availability", event.id],
            });
            const me = await fetch(
              `/api/reservations/me?event_id=${event.id}`,
              { cache: "no-store", credentials: "same-origin" }
            );
            if (me.ok) {
              const meData = await me.json();
              suppressStaleReservationMergeRef.current = false;
              applyServerReservationPayload(meData);
            }
          } else if (res.status >= 500 && event?.id) {
            // Transient server failures can occur during overlapping sync writes.
            // Rehydrate from /me and continue if the server cart is still valid.
            const me = await fetch(`/api/reservations/me?event_id=${event.id}`, {
              cache: "no-store",
              credentials: "same-origin",
            });
            if (me.ok) {
              const meData = await me.json();
              suppressStaleReservationMergeRef.current = false;
              applyServerReservationPayload(meData);
              const serverItems = Array.isArray(meData?.items) ? meData.items : [];
              const serverTicketCount = serverItems.reduce((sum: number, it: { seat_id?: string; section_id?: string; quantity?: number }) => {
                if (it?.seat_id) return sum + 1;
                if (it?.section_id) return sum + Math.max(0, Number(it.quantity ?? 0));
                return sum;
              }, 0);
              if (serverTicketCount > 0 && typeof meData?.reservation_cart_id === "string") {
                return {
                  ok: true,
                  reservation_cart_id: meData.reservation_cart_id,
                  expires_at:
                    typeof meData?.expires_at === "string"
                      ? meData.expires_at
                      : (useReservationStore.getState().expiresAt ??
                        new Date(Date.now() + 5 * 60_000).toISOString()),
                };
              }
            }
            toast.error(data.error ?? "Failed to reserve");
          } else toast.error(data.error ?? "Failed to reserve");
          return { ok: false };
        }
        const data = await res.json();
        setCart(data.reservation_cart_id, event.id, data.expires_at);
        serverHydratedCartIdRef.current = data.reservation_cart_id;
        lastSilentReservationFingerprintRef.current =
          reservationItemsFingerprint(itemsNow);
        suppressStaleReservationMergeRef.current = false;
        const latestItems = useReservationStore.getState().items;
        serverCartSeatIdsRef.current = new Set(
          latestItems
            .filter((i) => i.type === "seat")
            .map((i) => i.seat_id)
        );
        if (typeof BroadcastChannel !== "undefined") {
          new BroadcastChannel(RESERVATION_CHANNEL).postMessage({
            type: "update",
            cartId: data.reservation_cart_id,
            eventId: event.id,
            expiresAt: data.expires_at,
          });
        }
        if (!silent) toast.success("Seats reserved.");
        queryClient.invalidateQueries({ queryKey: ["availability", event.id] });
        return {
          ok: true,
          reservation_cart_id: data.reservation_cart_id as string,
          expires_at: data.expires_at as string,
        };
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return { ok: false };
        throw err;
      }
    },
    [event?.id, setCart, queryClient, applyServerReservationPayload]
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncAbortRef = useRef<AbortController | null>(null);
  /** Aborts cart-summary prefetch when proceeding again or unmounting. */
  const prefetchCartSummaryAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      prefetchCartSummaryAbortRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!event?.id) return;
    syncAbortRef.current?.abort();
    const controller = new AbortController();
    syncAbortRef.current = controller;
    const runSync = () => {
      if (items.length === 0 && cartId) {
        if (serverHydratedCartIdRef.current !== cartId) {
          void (async () => {
            try {
              const res = await fetch(`/api/reservations/${cartId}`, {
                credentials: "same-origin",
                signal: controller.signal,
              });
              if (res.status === 404) {
                serverHydratedCartIdRef.current = null;
                clear();
                queryClient.invalidateQueries({
                  queryKey: ["availability", event?.id ?? eventId ?? ""],
                });
                return;
              }
              if (!res.ok) return;
              const data = await res.json();
              if (
                data.event_id &&
                eventIdLiveRef.current &&
                data.event_id !== eventIdLiveRef.current
              ) {
                serverHydratedCartIdRef.current = null;
                clear();
                queryClient.invalidateQueries({
                  queryKey: ["availability", event?.id ?? eventId ?? ""],
                });
                return;
              }
              const normalized = mapApiItemsToReservationItems(data.items);
              if (normalized.length > 0) {
                suppressStaleReservationMergeRef.current = false;
                applyServerReservationPayload({
                  reservation_cart_id: data.reservation_cart_id,
                  event_id: data.event_id,
                  expires_at: data.expires_at,
                  items: data.items ?? [],
                });
                queryClient.invalidateQueries({
                  queryKey: ["availability", event?.id ?? eventId ?? ""],
                });
                return;
              }
              serverHydratedCartIdRef.current = cartId;
              await fetch(`/api/reservations/${cartId}`, {
                method: "DELETE",
                credentials: "same-origin",
              });
              clear();
              queryClient.invalidateQueries({
                queryKey: ["availability", event?.id ?? eventId ?? ""],
              });
            } catch (e) {
              if (e instanceof Error && e.name === "AbortError") return;
            }
          })();
          return;
        }
        fetch(`/api/reservations/${cartId}`, {
          method: "DELETE",
          credentials: "same-origin",
        })
          .then(() => {
            queryClient.invalidateQueries({
              queryKey: ["availability", event?.id ?? eventId ?? ""],
            });
          })
          .catch(() => {});
        clear();
        return;
      }
      if (items.length > 0 && totalCount > 0) {
        syncCartToServer({ silent: true, signal: controller.signal });
      }
    };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(runSync, 520);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      syncAbortRef.current?.abort();
    };
  }, [items, totalCount, event?.id, eventId, cartId, syncCartToServer, clear, queryClient, applyServerReservationPayload]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(RESERVATION_CHANNEL);
    ch.onmessage = (e: MessageEvent) => {
      const { type, eventId: evId } = e.data ?? {};
      if (type !== "create" && type !== "update") return;
      if (!evId || evId !== eventIdLiveRef.current) return;
      if (reservationBroadcastRefetchTimerRef.current) {
        clearTimeout(reservationBroadcastRefetchTimerRef.current);
      }
      reservationBroadcastRefetchTimerRef.current = setTimeout(() => {
        reservationBroadcastRefetchTimerRef.current = null;
        void (async () => {
          const res = await fetch(`/api/reservations/me?event_id=${evId}`, {
            cache: "no-store",
            credentials: "same-origin",
          });
          if (!res.ok) return;
          const payload = await res.json();
          const cartLinesChanged = applyServerReservationPayload(payload);
          if (cartLinesChanged) {
            await queryClient.invalidateQueries({
              queryKey: ["availability", evId],
            });
          }
        })();
      }, 400);
    };
    return () => {
      ch.close();
      if (reservationBroadcastRefetchTimerRef.current) {
        clearTimeout(reservationBroadcastRefetchTimerRef.current);
        reservationBroadcastRefetchTimerRef.current = null;
      }
    };
  }, [applyServerReservationPayload, queryClient]);

  const handleExpired = useCallback(() => {
    if (isExtendingCartRef.current) return;
    const expiredCartId = cartId;
    clear();
    queryClient.invalidateQueries({ queryKey: ["availability", event?.id ?? eventId ?? ""] });
    setCartExpiredDialogOpen(true);
    setCartStayLongerDialogOpen(false);
    void notifyReservationExpired(expiredCartId);
  }, [cartId, clear, queryClient, event?.id, eventId]);

  const handleLowTimeWarn = useCallback(() => {
    if (isExtendingCartRef.current) return;
    if (cartStayLongerDialogOpenRef.current) return;
    setCartStayLongerDialogOpen(true);
  }, []);

  const handleDeclineExtend = useCallback(() => {
    if (isExtendingCartRef.current) return;
    setCartStayLongerDialogOpen(false);
    handleExpired();
  }, [handleExpired]);

  const handleExtendCart = useCallback(async () => {
    const evId = event?.id ?? eventId ?? "";
    if (!evId || totalCount === 0) return;

    setIsExtendingCart(true);
    isExtendingCartRef.current = true;

    try {
      const extendRes = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extend: true,
          event_id: evId,
          items: buildReservationSyncPayload(items),
        }),
      });

      if (!extendRes.ok) {
        if (extendRes.status === 404) {
          // Cart already released/expired.
          setCartStayLongerDialogOpen(false);
          setIsExtendingCart(false);
          isExtendingCartRef.current = false;
          handleExpired();
          return;
        }
        if (extendRes.status === 409) {
          const errData = await extendRes.json().catch(() => ({}));
          toast.error(
            typeof errData.error === "string"
              ? errData.error
              : "One or more seats are no longer available."
          );
          await queryClient.invalidateQueries({
            queryKey: ["availability", evId],
          });
          const me = await fetch(`/api/reservations/me?event_id=${evId}`, {
          cache: "no-store",
            credentials: "same-origin",
          });
          if (me.ok) {
            const meData = await me.json();
            suppressStaleReservationMergeRef.current = false;
            applyServerReservationPayload(meData);
          }
          setCartStayLongerDialogOpen(false);
          return;
        }
        const errData = await extendRes.json().catch(() => ({}));
        toast.error(errData.error ?? "Failed to extend reservation time.");
        setCartStayLongerDialogOpen(false);
        return;
      }

      const extendData = await extendRes.json().catch(() => ({}));
      if (extendData?.expires_at) {
        const newCartId = extendData.reservation_cart_id ?? cartId;
        if (newCartId) {
          setCart(newCartId, evId, extendData.expires_at);
          serverHydratedCartIdRef.current = newCartId;
        }
        const latestAfterExtend = useReservationStore.getState().items;
        serverCartSeatIdsRef.current = new Set(
          latestAfterExtend
            .filter((i) => i.type === "seat")
            .map((i) => i.seat_id)
        );
        if (typeof BroadcastChannel !== "undefined") {
          new BroadcastChannel(RESERVATION_CHANNEL).postMessage({
            type: "update",
            cartId: extendData.reservation_cart_id ?? cartId,
            eventId: evId,
            expiresAt: extendData.expires_at,
          });
        }
      }

      setCartStayLongerDialogOpen(false);
      toast.success("Reservation time extended.");
      queryClient.invalidateQueries({ queryKey: ["availability", evId] });
    } catch {
      setCartStayLongerDialogOpen(false);
      // Let the existing countdown/expiry handling clear the cart.
    } finally {
      setIsExtendingCart(false);
      isExtendingCartRef.current = false;
    }
  }, [
    event?.id,
    eventId,
    totalCount,
    items,
    cartId,
    setCart,
    handleExpired,
    queryClient,
    applyServerReservationPayload,
  ]);

  const handleRefreshSeats = useCallback(async () => {
    await refreshSeatsAndPricing({
      eventSlug,
      isInitialBookDataLoading,
      isGuest,
      queryClient,
      applyServerReservationPayload,
      setIsRefreshing,
      toastSuccess: (message) => toast.success(message),
      toastError: (message) => toast.error(message),
      resetStaleReservationMergeGuard: () => {
        suppressStaleReservationMergeRef.current = false;
      },
    });
  }, [eventSlug, isGuest, queryClient, applyServerReservationPayload, isInitialBookDataLoading]);

  useEffect(() => {
    if (!cartId || !eventId || !expiresAt || eventId !== event?.id) return;
    const check = () => {
      const msUntilExpiry = new Date(expiresAt).getTime() - Date.now();
      if (msUntilExpiry <= 0) {
        handleExpired();
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, [cartId, eventId, expiresAt, event?.id, handleExpired]);

  // NOTE: previously a half-TTL heartbeat auto-extended `expires_at`, which made the
  // visible countdown silently snap back to 15:00 every ~7.5 minutes. The cart timer is
  // now strictly user-driven: the 2-minute warning dialog (`CartStayLongerDialog`) is the
  // only path to a fresh TTL — declining lets the countdown reach zero, which clears the
  // cart and flips `has_active_cart` to false through `handleExpired`.

  const handleRemoveSeat = useCallback(
    (seatId: string) => {
      markLocalReservationMutation();
      removeSeat(seatId);
      serverCartSeatIdsRef.current.delete(seatId);
    },
    [removeSeat, markLocalReservationMutation]
  );

  const handleSectionQtyChange = useCallback(
    (sectionId: string, newQty: number) => {
      const sec = sections.find((s) => s.id === sectionId);
      const current = items.find(
        (i) => i.type === "section" && i.section_id === sectionId
      );
      const currentQty = current?.type === "section" ? current.quantity : 0;
      if (isDefinitelyGuest && newQty > currentQty) {
        setGuestSignupOpen(true);
        return;
      }
      const maxQty = (sec?.available ?? 0) + currentQty;
      const qty = Math.max(0, Math.min(maxQty, newQty));
      markLocalReservationMutation();
      setSectionQuantity(sectionId, qty);
    },
    [items, sections, setSectionQuantity, isDefinitelyGuest, markLocalReservationMutation]
  );

  const handleClearCart = useCallback(async () => {
    suppressStaleReservationMergeRef.current = false;
    syncAbortRef.current?.abort();
    if (cartId) {
      setIsClearing(true);
      try {
        await fetch(`/api/reservations/${cartId}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
      } finally {
        setIsClearing(false);
      }
    }
    clear();
    toast.success("Seats released.");
  }, [cartId, clear]);

  const handleProceedToCheckout = useCallback(async () => {
    if (!event?.slug || totalCount === 0) return;
    if (isDefinitelyGuest) {
      setGuestSignupOpen(true);
      return;
    }
    setIsProceedingToCheckout(true);
    try {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      syncAbortRef.current?.abort();

      const syncResult = await syncCartToServer({ silent: false });
      if (!syncResult.ok) {
        return;
      }
      const cid = syncResult.reservation_cart_id;

      const computedSubtotal = computeSubtotalFromItems(
        items,
        priceCentsBySectionId,
        seats,
        addOnPriceMap
      );
      const addOnUnits = items
        .filter((i): i is Extract<ReservationItem, { type: "add_on" }> => i.type === "add_on")
        .reduce((s, i) => s + i.quantity, 0);
      const totalCountCheckout = totalCount + addOnUnits;
      useReservationStore.getState().setCartSummary(cid, {
        subtotal_cents: computedSubtotal,
        item_count: totalCountCheckout,
      });

      prefetchCartSummaryAbortRef.current?.abort();
      const prefetchAc = new AbortController();
      prefetchCartSummaryAbortRef.current = prefetchAc;
      const PREFETCH_DEADLINE_MS = 2800;
      const deadlineId =
        typeof window !== "undefined"
          ? window.setTimeout(() => prefetchAc.abort(), PREFETCH_DEADLINE_MS)
          : 0;
      try {
        const res = await fetch(
          `/api/events/${event.id}/cart-summary?cart_id=${cid}`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: prefetchAc.signal,
          }
        );
        if (res.ok) {
          const data = await res.json();
          const state = useReservationStore.getState();
          if (state.cartId === cid && !prefetchAc.signal.aborted) {
            state.setCartSummary(cid, data);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          /* timeout or abort */
        }
        // Ignore; checkout has client-computed fallback
      } finally {
        if (deadlineId) window.clearTimeout(deadlineId);
      }

      try {
        const checkoutUrl = `/${event.slug}/checkout?cartId=${encodeURIComponent(cid)}&eventId=${encodeURIComponent(event.id)}`;
        await router.push(checkoutUrl);
      } catch {
        toast.error("Could not open checkout. Try again.");
      }
    } catch {
      /* navigation or unexpected */
    } finally {
      setIsProceedingToCheckout(false);
    }
  }, [
    event?.id,
    event?.slug,
    items,
    totalCount,
    addOnPriceMap,
    priceCentsBySectionId,
    seats,
    syncCartToServer,
    isDefinitelyGuest,
    router,
  ]);

  const hasActiveReservation = totalCount > 0 && !!expiresAt;

  const handleBackClick = useCallback(() => {
    if (hasActiveReservation) {
      setBackConfirmOpen(true);
      return;
    }
    startBackTransition(() => {
      router.push("/");
    });
  }, [hasActiveReservation, router, startBackTransition]);

  const isSeatLoadBlocking = availabilityLoading || isRefreshing;

  const bookProgress = useMemo(() => {
    if (isProceedingToCheckout) {
      return {
        message: "Proceeding to checkout…",
        subtitle: "Seat selection",
        detail: "Validating your cart and preparing the payment step.",
      };
    }
    if (isExtendingCart) {
      return {
        message: "Extending your reservation…",
        subtitle: "Seat selection",
        detail: "Adding time so you can finish choosing seats.",
      };
    }
    if (isBackPending) {
      return {
        message: "Opening events…",
        subtitle: "Navigation",
        detail: FLOATING_PROGRESS_PRESETS.navigation.detail,
      };
    }
    if (isSeatLoadBlocking) {
      return {
        message: isRefreshing ? "Refreshing seats…" : "Loading seats…",
        subtitle: "Seat selection",
        detail: isRefreshing
          ? "Loading latest seat availability and section pricing."
          : "Fetching seat availability and section layout.",
      };
    }
    return {
      message: "Working…",
      subtitle: "Seat selection",
      detail: undefined,
    };
  }, [isProceedingToCheckout, isExtendingCart, isBackPending, isSeatLoadBlocking, isRefreshing]);

  if (eventLoading || !event) {
    if (eventLoading) {
      return (
        <RouteLoading
          message="Loading event…"
          subtitle="Preparing the seat map and ticket options."
        />
      );
    }
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="glass rounded-xl p-8 text-center text-foreground-muted">
          Event not found.
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <BookProgressOverlay
        active={isProceedingToCheckout || isBackPending || isExtendingCart || isSeatLoadBlocking}
        message={bookProgress.message}
        subtitle={bookProgress.subtitle}
        detail={bookProgress.detail}
      />
      <CartExpiredDialog
        open={cartExpiredDialogOpen}
        onOpenChange={setCartExpiredDialogOpen}
      />
      <CartStayLongerDialog
        open={cartStayLongerDialogOpen}
        onOpenChange={setCartStayLongerDialogOpen}
        onStayLonger={handleExtendCart}
        onDecline={handleDeclineExtend}
        isExtending={isExtendingCart}
      />
      <ConfirmDialog
        open={backConfirmOpen}
        onOpenChange={setBackConfirmOpen}
        title="Leave while reservation is active?"
        description="Your reserved seats and timer will continue counting down while you browse other events. Do you still want to go back to events?"
        cancelLabel="Stay here"
        confirmLabel="Continue to events"
        titleClassName="text-[var(--wish-orange)]"
        cancelVariant="success"
        onConfirm={() => startBackTransition(() => router.push("/"))}
      />
      <GuestSignupDialog
        open={guestSignupOpen}
        onOpenChange={setGuestSignupOpen}
        redirectTo={`/${eventSlug}/book`}
      />
      <Dialog
        open={autoSelectChoiceOpen}
        onOpenChange={(open) => {
          setAutoSelectChoiceOpen(open);
          if (!open) setPendingAutoSelect(null);
        }}
      >
        <DialogContent className="sm:max-w-md" hideClose>
          <DialogHeader>
            <DialogTitle>Select seats for {pendingAutoSelect?.sectionName ?? "section"}</DialogTitle>
            <DialogDescription>
              You already have selected seats in this section. Do you want to replace them or append
              {` ${pendingAutoSelect?.quantity ?? 0}`} more seats?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setAutoSelectChoiceOpen(false);
                setPendingAutoSelect(null);
              }}
            >
              Cancel
            </Button>
            <Button type="button" variant="outline" onClick={handleAutoSelectReplace}>
              Select New Seats
            </Button>
            <Button type="button" onClick={handleAutoSelectAppend}>
              Append to Current
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="mb-8">
        <BookHeaderActions
          isBackPending={isBackPending}
          isRefreshing={isRefreshing}
          availabilityFetching={availabilityFetching}
          eventSlug={eventSlug}
          isInitialBookDataLoading={isInitialBookDataLoading}
          onBack={handleBackClick}
          onRefresh={() => void handleRefreshSeats()}
        />
        <h1 className="text-2xl font-bold text-foreground mt-2">{event.title}</h1>
        <p className="text-foreground-muted text-sm">
          Select your seats below. Your cart appears under the selections.
        </p>
        {shouldShowDraftSeatFetchNotice ? (
          <div
            className="mt-4 rounded-lg border px-4 py-3 text-sm
              border-amber-500/50 bg-amber-500/10 text-amber-950
              dark:border-amber-400/50 dark:bg-amber-950/75 dark:text-yellow-400"
            role="status"
          >
            <strong className="font-semibold text-amber-900 dark:text-yellow-300">
              System is fetching seats.
            </strong>{" "}
            Come back in a few minutes.
          </div>
        ) : null}
      </div>

      <BookSeatPlanPanel
        imageUrls={seatPlanImageUrls}
        isExpanded={isSeatPlanExpanded}
        onToggle={() => setIsSeatPlanExpanded((prev) => !prev)}
      />

      <div className="space-y-6">
        <BookEmptyState
          show={availabilityLoading}
          message={
            manifestAvailabilityLoading
              ? "Loading sections and layouts..."
              : "Loading seat availability..."
          }
        />
        {!availabilityLoading && availabilityError && (
          <div className="glass-light rounded-xl border border-[var(--glass-border)] p-6 text-foreground-muted">
            {shouldAllowSeatSelectionFlow ? (
              <>
                Unable to load seat availability. Please try{" "}
                <button
                  type="button"
                  className="text-foreground underline underline-offset-2 hover:no-underline"
                  onClick={() => void refetchAvailability()}
                >
                  refreshing
                </button>{" "}
                or reloading the page.
              </>
            ) : (
              <>
                Seat selection is not available while this event is &ldquo;{eventStatusLabel}
                &rdquo;. Check back once tickets go on sale, or contact the organizer.
              </>
            )}
            {seatDiagnostic.code !== "ok" ? (
              <p className="mt-3 text-xs text-foreground-muted/80">{seatDiagnostic.text}</p>
            ) : null}
          </div>
        )}
        {!availabilityLoading && !availabilityError && (
          <BookSeatExperience showHeading={showSeatExperienceHeading}>
            {visibleMapDisplayGroups.length > 0 || visibleGridSections.length > 0 ? (
              <div className="glass-light overflow-hidden rounded-xl border border-[var(--glass-border)]">
                <button
                  type="button"
                  onClick={() => setIsReservedSeatingExpanded((prev) => !prev)}
                  className="flex w-full min-h-16 items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--glass-light-bg)] transition-colors"
                  aria-expanded={isReservedSeatingExpanded}
                >
                  <span className="text-lg font-semibold text-foreground">Reserved Seating</span>
                  {isReservedSeatingExpanded ? (
                    <ChevronDown className="h-5 w-5 text-foreground-muted shrink-0" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-foreground-muted shrink-0" />
                  )}
                </button>
                {isReservedSeatingExpanded ? (
                  <div className="space-y-4 border-t border-[var(--glass-border)] p-4">
                  {visibleMapDisplayGroups.map((group) => {
              const groupSeats = group.sections.flatMap(
                (section) => mapSeatsBySectionId.get(section.id) ?? []
              );
              const availableCount = group.sections.reduce(
                (sum, sec) => sum + Math.max(0, Number((sec as SectionInfo).available ?? 0)),
                0
              );
              const isSoldOut = availableCount <= 0;
              const groupKey = group.sections.map((s) => s.id).join(",");
              const isExpanded = expandedSectionIds.has(group.sections[0]!.id) ||
                group.sections.some((s) => expandedSectionIds.has(s.id));
              const toggleSection = () => {
                setExpandedSectionIds((prev) => {
                  const next = new Set(prev);
                  const anyExpanded = group.sections.some((s) => next.has(s.id));
                  if (anyExpanded) group.sections.forEach((s) => next.delete(s.id));
                  else group.sections.forEach((s) => next.add(s.id));
                  return next;
                });
              };
              /** Empty-string canvas URLs must not hide the event fallback (`??` skips `""`). */
              const bgImage =
                (group.bgImage?.trim() || event?.seat_layout_image_url) ?? null;
              const bgScale = group.bgScale ?? event?.seat_layout_scale ?? 1;
              const bgOpacity = group.bgOpacity ?? event?.seat_layout_opacity ?? 0.5;
              const groupTitleParts = getSectionGroupTitleParts(group.sections);
              return (
                <div
                  key={groupKey}
                  className="relative glass-light rounded-xl border border-[var(--glass-border)] overflow-hidden"
                >
                  {isSoldOut && (
                    <div
                      role="status"
                      aria-label="Sold out"
                      className="absolute top-2 right-2 z-10 px-4 py-1.5 rounded pointer-events-none -rotate-6 bg-amber-400/95 border border-red-600"
                    >
                      <span className="text-sm font-bold uppercase tracking-wide text-red-600">
                        Sold Out
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={toggleSection}
                    className="flex w-full min-h-16 items-center justify-between gap-3 p-4 text-left hover:bg-[var(--glass-light-bg)] transition-colors"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex flex-1 flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                      <span className="text-lg font-semibold min-w-0 max-w-full break-words">
                        {groupTitleParts.map((part, partIdx) => (
                          <span key={`${groupKey}-title-${part.label}-${partIdx}`}>
                            <span style={{ color: part.color ?? "var(--foreground)" }}>
                              {part.label}
                            </span>
                            {partIdx < groupTitleParts.length - 1 ? (
                              <span className="text-foreground-muted"> • </span>
                            ) : null}
                          </span>
                        ))}
                      </span>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-foreground-muted shrink-0" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-foreground-muted shrink-0" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="p-6 pt-2 border-t border-[var(--glass-border)]">
                      <details className="group mt-2 mb-4 rounded-lg border border-[var(--wish-orange)]/80 bg-background/30 open:bg-background/40">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                          <span>Pricing & availability by section</span>
                          <ChevronDown className="h-4 w-4 shrink-0 text-foreground-muted transition-transform duration-200 group-open:rotate-180" />
                        </summary>
                        <ul className="space-y-2.5 border-t border-[var(--glass-border)] px-3 py-3 text-sm">
                          {group.sections.map((sec) => {
                            const name = sec.name || sec.section_code || sec.id;
                            const remaining = Math.max(0, Number(sec.available ?? 0));
                            return (
                              <li key={sec.id} className="flex items-start gap-3">
                                <span
                                  className="mt-0.5 h-5 w-5 shrink-0 rounded border border-black/20"
                                  style={{ backgroundColor: sectionSwatchColor(sec) }}
                                  aria-hidden
                                />
                                <span className="min-w-0 leading-snug">
                                  <span className="font-medium text-foreground">{name}</span>
                                  <span className="text-foreground-muted"> — </span>
                                  <span className="text-foreground">
                                    {formatSectionPricePhp(
                                      sec.id,
                                      priceCentsBySectionId,
                                      basePriceCentsBySectionId
                                    )}
                                  </span>
                                  <span className="text-foreground-muted"> — </span>
                                  <span className="text-foreground-muted">
                                    {remaining}
                                  </span>
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                      <SeatSelector
                        seats={groupSeats as SeatInfo[]}
                        selectedIds={selectedSeatIds}
                        onToggle={toggleSeat}
                        onAutoSelectSectionSeats={autoSelectSectionSeats}
                        autoSelectResetSignal={autoSelectResetSignal}
                        sections={group.sections}
                        backgroundImage={bgImage}
                        backgroundScale={bgScale}
                        backgroundOpacity={bgOpacity}
                        displayMode="map"
                      />
                    </div>
                  )}
                </div>
              );
                  })}
                  {visibleGridSections.map((sec, idx) => {
              const sectionSeats = gridSeatsBySectionId.get(sec.id) ?? [];
              const availableCount = Math.max(0, Number((sec as SectionInfo).available ?? 0));
              const isSoldOut = availableCount <= 0;
              const isExpanded = expandedSectionIds.has(sec.id);
              const sectionTitleColor = sectionSwatchColor(sec);
              const toggleSection = () => {
                setExpandedSectionIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(sec.id)) next.delete(sec.id);
                  else next.add(sec.id);
                  return next;
                });
              };
              return (
                <div
                  key={sec.id}
                  className="relative glass-light rounded-xl border border-[var(--glass-border)] overflow-hidden"
                >
                  {isSoldOut && (
                    <div
                      role="status"
                      aria-label="Sold out"
                      className="absolute top-2 right-2 z-10 px-4 py-1.5 rounded pointer-events-none -rotate-6 bg-amber-400/95 border border-red-600"
                    >
                      <span className="text-sm font-bold uppercase tracking-wide text-red-600">
                        Sold Out
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={toggleSection}
                    className="flex w-full min-h-16 items-center justify-between gap-3 p-4 text-left hover:bg-[var(--glass-light-bg)] transition-colors"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                      {idx === 0 && mapSeats.length === 0 ? (
                        <span className="text-lg font-semibold text-foreground shrink-0">
                          Section seating
                        </span>
                      ) : null}
                      <span
                        className="text-lg font-semibold min-w-0"
                        style={{ color: sectionTitleColor }}
                      >
                        {sec.name || sec.section_code}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-foreground-muted">
                          {basePriceCentsBySectionId[sec.id] != null &&
                          priceCentsBySectionId[sec.id] != null ? (
                            <>
                              <span className="line-through opacity-75">
                                {((basePriceCentsBySectionId[sec.id] ?? 0) / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" })}
                              </span>{" "}
                              <span>
                                {((priceCentsBySectionId[sec.id] ?? 0) / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" })}
                              </span>
                              <span className="ml-1 text-xs">(Early bird)</span>
                            </>
                          ) : (
                            formatSectionPricePhp(
                              sec.id,
                              priceCentsBySectionId,
                              basePriceCentsBySectionId
                            )
                          )}
                        </span>
                      </div>
                      {idx === 0 && mapSeats.length === 0 ? (
                        <span className="w-full basis-full text-xs sm:text-sm text-foreground-muted leading-snug">
                          <span className="font-medium text-foreground/90">Legend:</span>{" "}
                          Section color = available · Dark Gray = reserved / Sold · Black = Tech Hold
                        </span>
                      ) : null}
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-foreground-muted shrink-0" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-foreground-muted shrink-0" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="p-6 pt-2 border-t border-[var(--glass-border)]">
                      <div
                        className="mt-2 mb-4 rounded-lg border border-[var(--glass-border)] bg-background/30 px-3 py-3 text-sm"
                        role="group"
                        aria-label="Section pricing and availability"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="mt-0.5 h-5 w-5 shrink-0 rounded border border-black/20"
                            style={{ backgroundColor: sectionSwatchColor(sec) }}
                            aria-hidden
                          />
                          <span className="min-w-0 leading-snug">
                            <span className="font-medium text-foreground">
                              {sec.name || sec.section_code || sec.id}
                            </span>
                            <span className="text-foreground-muted"> — </span>
                            <span className="text-foreground">
                          {formatSectionPricePhp(
                                sec.id,
                                priceCentsBySectionId,
                                basePriceCentsBySectionId
                              )}
                            </span>
                            <span className="text-foreground-muted"> — </span>
                            <span className="text-foreground-muted">
                              {availableCount}
                            </span>
                          </span>
                        </div>
                      </div>
                      <SeatSelector
                        seats={sectionSeats as SeatInfo[]}
                        selectedIds={selectedSeatIds}
                        onToggle={toggleSeat}
                        onAutoSelectSectionSeats={autoSelectSectionSeats}
                        autoSelectResetSignal={autoSelectResetSignal}
                        sections={[sec]}
                        backgroundImage={
                          sec.background_image_url?.trim() ||
                          event?.seat_layout_image_url ||
                          null
                        }
                        backgroundScale={sec.background_scale ?? event?.seat_layout_scale ?? 1}
                        backgroundOpacity={sec.background_opacity ?? event?.seat_layout_opacity ?? 0.5}
                        displayMode="grid"
                      />
                    </div>
                  )}
                </div>
              );
                  })}
                </div>
                ) : null}
              </div>
            ) : null}
            {hasFreeSeating ? (
              <div className="glass-light rounded-xl border border-[var(--glass-border)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsOpenSeatingExpanded((prev) => !prev)}
                  className="flex w-full min-h-16 items-center justify-between gap-3 p-4 text-left hover:bg-[var(--glass-light-bg)] transition-colors"
                  aria-expanded={isOpenSeatingExpanded}
                >
                  <span className="text-lg font-semibold text-foreground">Free Seating</span>
                  {isOpenSeatingExpanded ? (
                    <ChevronDown className="h-5 w-5 text-foreground-muted shrink-0" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-foreground-muted shrink-0" />
                  )}
                </button>
                {isOpenSeatingExpanded ? (
                  <div className="border-t border-[var(--glass-border)] px-6 pt-6 pb-6">
                    <SectionPicker
                      sections={freeStandingSections}
                      selected={selectedSections}
                      onChange={handleSectionQtyChange}
                      priceCentsBySectionId={priceCentsBySectionId}
                      basePriceCentsBySectionId={basePriceCentsBySectionId}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </BookSeatExperience>
        )}
          {shouldShowEmptySeatFallback && (
            <div className="glass-light rounded-xl border border-[var(--glass-border)] p-6 text-foreground-muted">
              {isExplicitlyNonBookableStatus ? (
                <>
                  Seat selection is not open while this event is currently
                  &nbsp;&ldquo;{eventStatusLabel}&rdquo;. Contact the organizer if you expected
                  tickets to be on sale.
                </>
              ) : seatDiagnostic.code === "manifest_sections_missing" ? (
                <>
                  Seat data loaded, but section metadata is missing for this event right now.
                  Please tap Refresh Seats. If this keeps happening, re-open the page and check
                  availability manifest API/migration state.
                </>
              ) : hasConfiguredSections ? (
                <>
                  Sections exist for this event, but no seats are available to pick yet. In admin,
                  open Seat Selector Setup and generate or assign seats for each section, then try
                  Refresh Seats. Contact the organizer if tickets should already be on sale.
                </>
              ) : hasConfirmedNoSeating ? (
                <>No seat map configured for this event. Contact the organizer.</>
              ) : (
                <>System is fetching seats. Come back in a few minutes.</>
              )}
              {seatDiagnostic.code !== "ok" ? (
                <p className="mt-3 text-xs text-foreground-muted/80">{seatDiagnostic.text}</p>
              ) : null}
            </div>
          )}
          {!availabilityLoading &&
            !availabilityError &&
            availabilityRetryingNoData && (
              <div className="glass-light rounded-xl border border-[var(--glass-border)] p-6 text-foreground-muted">
                Checking latest seat availability...
              </div>
            )}

          {shouldAllowSeatSelectionFlow &&
            !availabilityLoading &&
            !availabilityError &&
            normalizedAddOnCatalog.length > 0 ? (
              <AddOnsCarousel
                addOns={normalizedAddOnCatalog}
                quantityById={quantityByIdForCarousel}
                onQuantityChange={handleAddOnQty}
                canAddWithoutTickets={totalCount > 0}
              />
            ) : null}

        <ReservationTimer
          hasItems={totalCount > 0}
          expiresAt={expiresAt}
          onExpired={handleExpired}
          warnSecondsList={[120]}
          onWarn={handleLowTimeWarn}
          ttlMinutes={reservationTtlMinutes}
        />
        <InlineCart
          seats={seats}
          sections={sections}
          items={items}
          priceCentsBySectionId={priceCentsBySectionId}
          basePriceCentsBySectionId={basePriceCentsBySectionId}
          addOnsById={addOnsById}
          addOnStockById={addOnStockById}
          addOnPurchaseMaxById={addOnPurchaseMaxById}
          expiresAt={expiresAt}
          onRemoveSeat={handleRemoveSeat}
          onSectionQtyChange={handleSectionQtyChange}
          onAddOnQtyChange={handleAddOnQty}
          onClearCart={handleClearCart}
          onProceedToCheckout={handleProceedToCheckout}
          onExpired={handleExpired}
          isClearing={isClearing}
          isProceedingToCheckout={isProceedingToCheckout}
        />
      </div>
    </div>
  );
}
