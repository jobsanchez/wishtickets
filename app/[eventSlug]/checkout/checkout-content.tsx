"use client";

import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import {
  Accessibility,
  Clock,
  CreditCard,
  Landmark,
  QrCode,
  Tag,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SPECIAL_REQUEST_LABELS,
  SPECIAL_REQUEST_TYPES,
  type SpecialRequestType,
} from "@/lib/special-request";
import { FloatingProgressBar } from "@/components/ui/floating-progress";
import {
  cartSummaryForActiveCart,
  useReservationStore,
} from "@/store/reservation-store";
import { buildReservationSyncPayload } from "@/lib/reservation-sync-payload";
import { notifyReservationExpired } from "@/lib/reservation-expire-client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CartStayLongerDialog } from "@/components/booking/cart-stay-longer-dialog";
import { ReturnAndRefundPolicyDialog } from "@/components/legal/return-and-refund-policy-dialog";
import {
  computeChargedCentsForBucket,
  type PaymongoPaymentBucket,
  type PaymongoProcessingFeesConfig,
} from "@/lib/paymongo-processing-fees";
import {
  clearPendingPaymongoBooking,
  readPendingPaymongoBooking,
  writePendingPaymongoBooking,
} from "@/lib/paymongo-pending-booking";

/** Keeps Radix Select controlled until buyer picks a bucket (`PaymongoPaymentBucket` ids never equal this). */
const CHECKOUT_PAYMENT_BUCKET_UNSET = "__checkout_payment_bucket_unset__";

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
}

interface CheckoutContentProps {
  eventSlug: string;
  initialCartId?: string;
  initialEventId?: string;
  initialSummary?: { subtotal_cents: number; item_count?: number; early_bird_active?: boolean };
}

function paymentBucketMeta(bucket: PaymongoPaymentBucket): {
  label: string;
  Icon: typeof QrCode;
  logos: Array<
    | { key: string; label: string; className: string; imageSrc?: never; imageAlt?: never }
    | { key: string; label: string; className?: never; imageSrc: string; imageAlt: string }
  >;
  selectedSummary: string;
} {
  switch (bucket) {
    case "qrph":
      return {
        label: "QR PH",
        Icon: QrCode,
        selectedSummary: "QRPh",
        logos: [
          {
            key: "qrph",
            label: "QRPh",
            imageSrc: "/brands/qrph-logo.png",
            imageAlt: "QR Ph",
          },
        ],
      };
    case "ewallet":
      return {
        label: "E-Wallet",
        Icon: WalletCards,
        selectedSummary: "GCash/Maya",
        logos: [
          { key: "gcash", label: "G", className: "bg-[#2563eb] text-white" },
          { key: "grabpay", label: "Grab", className: "bg-[#16a34a] text-white" },
          {
            key: "maya",
            label: "Maya",
            imageSrc: "/brands/maya-logo.png",
            imageAlt: "Maya",
          },
        ],
      };
    case "card":
      return {
        label: "Cards (Visa / Mastercard)",
        Icon: CreditCard,
        selectedSummary: "Visa/MC",
        logos: [
          { key: "visa", label: "VISA", className: "bg-[#1e3a8a] text-white" },
          {
            key: "mc",
            label: "Mastercard",
            imageSrc: "/brands/mastercard-logo.png",
            imageAlt: "Mastercard",
          },
        ],
      };
    case "banks":
      return {
        label: "Direct debit / banks",
        Icon: Landmark,
        selectedSummary: "BPI/UBP",
        logos: [
          { key: "bpi", label: "BPI", className: "bg-[#991b1b] text-white" },
          { key: "ubp", label: "UBP", className: "bg-[#ea580c] text-white" },
        ],
      };
  }
}

function renderPaymentBucketLogos(bucket: PaymongoPaymentBucket, mode: "full" | "compact" = "full") {
  const meta = paymentBucketMeta(bucket);
  if (mode === "compact") {
    return (
      <span
        className="inline-flex h-5 items-center justify-center rounded bg-white/10 px-1.5 text-[10px] font-semibold leading-none text-foreground-muted"
        aria-label={meta.selectedSummary}
        title={meta.selectedSummary}
      >
        {meta.selectedSummary}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {meta.logos.map((logo) => (
        logo.imageSrc ? (
          <span
            key={`${bucket}-${logo.key}`}
            className="inline-flex h-5 items-center justify-center overflow-hidden rounded-sm bg-white px-1"
            aria-label={logo.imageAlt}
            title={logo.label}
          >
            <Image
              src={logo.imageSrc}
              alt={logo.imageAlt}
              width={56}
              height={20}
              className="h-4 w-auto object-contain"
            />
          </span>
        ) : (
          <span
            key={`${bucket}-${logo.key}`}
            className={`inline-flex h-5 min-w-7 items-center justify-center rounded px-1.5 text-[10px] font-semibold leading-none ${logo.className}`}
            aria-label={logo.label}
            title={logo.label}
          >
            {logo.label}
          </span>
        )
      ))}
    </span>
  );
}

export default function CheckoutContent({
  eventSlug,
  initialCartId,
  initialEventId,
  initialSummary,
}: CheckoutContentProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const cartIdFromSearch = searchParams?.get("cartId") ?? null;
  const eventIdFromSearch = searchParams?.get("eventId") ?? null;
  const resumeBookingIdFromSearch = searchParams?.get("resumeBooking") ?? null;
  const {
    cartId: storeCartId,
    eventId: storeEventId,
    items,
    expiresAt,
    cartSummary: storeCartSummary,
    clear,
    setCart,
    setItems,
  } = useReservationStore();
  /** Prefer URL / SSR ids over store so we don't flash "No reservation" before searchParams hydrate. */
  const routeEventId =
    eventIdFromSearch ?? initialEventId ?? storeEventId ?? null;
  const activeCartId =
    cartIdFromSearch ?? initialCartId ?? storeCartId ?? null;
  const resumeBookingId =
    typeof resumeBookingIdFromSearch === "string" && resumeBookingIdFromSearch.trim().length > 0
      ? resumeBookingIdFromSearch.trim()
      : null;

  const [loading, setLoading] = useState(false);
  /** Extend-then-checkout flows: drives accurate overlay copy (not "email" during PayMongo prep). */
  const [checkoutFlowPhase, setCheckoutFlowPhase] = useState<
    "extending" | "checkout" | null
  >(null);
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);
  const [specialRequestType, setSpecialRequestType] = useState<
    SpecialRequestType | ""
  >("");
  const [specialRequestDetails, setSpecialRequestDetails] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromos, setAppliedPromos] = useState<
    { code: string; discount_cents: number }[]
  >([]);
  const [onSiteDialogOpen, setOnSiteDialogOpen] = useState(false);
  const [notStackableDialogOpen, setNotStackableDialogOpen] = useState(false);
  const [onSiteCustomer, setOnSiteCustomer] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
  });
  const [onSiteSubmitting, setOnSiteSubmitting] = useState(false);
  const [cancelCheckoutOpen, setCancelCheckoutOpen] = useState(false);
  const [prePaymongoOpen, setPrePaymongoOpen] = useState(false);
  const [refundPolicyDialogOpen, setRefundPolicyDialogOpen] = useState(false);
  const [cartStayLongerDialogOpen, setCartStayLongerDialogOpen] = useState(false);
  const [isExtendingCart, setIsExtendingCart] = useState(false);
  const [paymentBucket, setPaymentBucket] = useState<PaymongoPaymentBucket | null>(null);
  /** After checkout/resession succeeds, mirrors server/PayMongo amounts so UI matches the hosted page. */
  const [paymentPricingOverride, setPaymentPricingOverride] = useState<{
    net: number;
    charged: number;
  } | null>(null);
  const isExtendingCartRef = useRef(false);
  const cartStayLongerDialogOpenRef = useRef(false);
  const warnedThresholdsRef = useRef<Set<number>>(new Set());
  const reservationGoneHandledRef = useRef(false);
  const mismatchHandledRef = useRef(false);
  const paymentStatusPollInFlightRef = useRef(false);
  /** Retries when the server reports an empty cart but local selection still has tickets. */
  const cartSummaryMismatchRetriesRef = useRef(0);

  const scopedStoreSummaryData = useMemo(
    () => cartSummaryForActiveCart(storeCartSummary, activeCartId ?? null),
    [storeCartSummary, activeCartId]
  );

  useEffect(() => {
    reservationGoneHandledRef.current = false;
  }, [activeCartId]);

  useEffect(() => {
    cartSummaryMismatchRetriesRef.current = 0;
  }, [activeCartId, routeEventId]);

  const redirectIfReservationGone = useCallback(() => {
    if (reservationGoneHandledRef.current) return;
    reservationGoneHandledRef.current = true;
    clear();
    toast.error("Your reservation has expired.");
    router.replace(`/${eventSlug}/book`);
  }, [clear, router, eventSlug]);

  const { data: checkoutEvent } = useQuery<{ id?: string }>({
    queryKey: ["checkout-event-by-slug", eventSlug],
    queryFn: async () => {
      const res = await fetch(`/api/events?slug=${encodeURIComponent(eventSlug)}`, {
        cache: "no-store",
      });
      if (!res.ok) return {};
      const payload = await res.json();
      const eventObj = Array.isArray(payload) ? payload[0] : payload;
      return typeof eventObj === "object" && eventObj ? (eventObj as { id?: string }) : {};
    },
    enabled: !!eventSlug,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: "always",
  });

  const resolvedEventId =
    typeof checkoutEvent?.id === "string" && checkoutEvent.id.trim().length > 0
      ? checkoutEvent.id
      : null;
  const eventId = resolvedEventId ?? routeEventId;

  useEffect(() => {
    if (!resolvedEventId || !routeEventId) {
      mismatchHandledRef.current = false;
      return;
    }
    if (resolvedEventId === routeEventId) {
      mismatchHandledRef.current = false;
      return;
    }
    if (mismatchHandledRef.current) return;
    mismatchHandledRef.current = true;
    clearPendingPaymongoBooking();
    clear();
    toast.error("Checkout was reset because the cart did not match this event.");
    router.replace(`/${eventSlug}/book`);
  }, [resolvedEventId, routeEventId, clear, router, eventSlug]);

  useEffect(() => {
    isExtendingCartRef.current = isExtendingCart;
  }, [isExtendingCart]);

  useEffect(() => {
    cartStayLongerDialogOpenRef.current = cartStayLongerDialogOpen;
  }, [cartStayLongerDialogOpen]);

  const redirectToPaymongoCheckout = useCallback((url: string) => {
    window.location.assign(url);
  }, []);

  useEffect(() => {
    if (!eventId) return;
    const paymongoBookingId = readPendingPaymongoBooking(eventId);
    if (!paymongoBookingId) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const pollBookingStatus = async () => {
      if (cancelled || paymentStatusPollInFlightRef.current) return;
      paymentStatusPollInFlightRef.current = true;
      try {
        const res = await fetch(
          `/api/bookings/${paymongoBookingId}/status?t=${Date.now()}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { status?: string };
        if (data.status === "confirmed") {
          clearPendingPaymongoBooking();
          clear();
          router.replace(`/${eventSlug}/confirmation/${paymongoBookingId}?fromPayment=1`);
          return;
        }
        if (data.status === "failed") {
          clearPendingPaymongoBooking();
          toast.error("Payment failed or expired. Please try again.");
          return;
        }
      } catch {
        /* next poll */
      } finally {
        paymentStatusPollInFlightRef.current = false;
      }

      if (!cancelled) {
        timeoutId = setTimeout(pollBookingStatus, 3000);
      }
    };

    timeoutId = setTimeout(pollBookingStatus, 2000);
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [
    eventId,
    eventSlug,
    clear,
    router,
  ]);

  // Hydrate store from cart when we have cartId but store lacks eventId (refresh/new tab, direct link without eventId)
  useEffect(() => {
    if (!activeCartId || storeEventId) return;
    const ac = new AbortController();
    let cancelled = false;
    fetch(`/api/reservations/${activeCartId}`, {
      credentials: "same-origin",
      signal: ac.signal,
    })
      .then((res) => {
        if (cancelled) return null;
        if (res.status === 404) {
          redirectIfReservationGone();
          return null;
        }
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data?.event_id) return;
        setCart(data.reservation_cart_id, data.event_id, data.expires_at);
        const apiItems = (data.items ?? []) as { seat_id?: string; section_id?: string; quantity: number }[];
        const mapped: Parameters<typeof setItems>[0] = apiItems.map((i) =>
          i.seat_id ? { type: "seat" as const, seat_id: i.seat_id } : { type: "section" as const, section_id: i.section_id!, quantity: i.quantity ?? 1 }
        );
        setItems(mapped);
        const hid = data.reservation_cart_id as string | undefined;
        if (hid) {
          void queryClient.invalidateQueries({
            queryKey: ["cart-summary", data.event_id, hid],
          });
        }
        if (!eventIdFromSearch && data.event_id) {
          const url = new URL(window.location.href);
          url.searchParams.set("eventId", data.event_id);
          router.replace(url.pathname + url.search, { scroll: false });
        }
      })
      .catch((err) => {
        if (cancelled || err?.name === "AbortError") return;
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [
    activeCartId,
    storeEventId,
    eventIdFromSearch,
    redirectIfReservationGone,
    setCart,
    setItems,
    router,
    queryClient,
  ]);

  useEffect(() => {
    if (!activeCartId || !eventId) return;
    const ac = new AbortController();
    let cancelled = false;
    fetch(`/api/reservations/${activeCartId}`, {
      credentials: "same-origin",
      signal: ac.signal,
    })
      .then((res) => {
        if (cancelled || !res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (cancelled || !data?.event_id) return;
        if (data.event_id === eventId) return;
        clearPendingPaymongoBooking();
        clear();
        toast.error("Checkout cart belonged to a different event and was cleared.");
        router.replace(`/${eventSlug}/book`);
      })
      .catch((err) => {
        if (cancelled || err?.name === "AbortError") return;
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [activeCartId, eventId, clear, router, eventSlug]);

  const { data: capabilitiesData } = useQuery({
    queryKey: ["admin-capabilities"],
    queryFn: async () => {
      const res = await fetch("/api/admin/me/capabilities");
      if (!res.ok) return { role: null };
      const data = await res.json();
      return { role: data.role as string | null };
    },
    retry: false,
    staleTime: 0,
  });

  const isAdminOrSuperAdmin =
    capabilitiesData?.role === "admin" || capabilitiesData?.role === "super_admin";

  const { data: summary } = useQuery({
    queryKey: ["cart-summary", eventId, activeCartId],
    queryFn: async ({ signal }) => {
      if (!eventId || !activeCartId) return null;
      if (reservationGoneHandledRef.current) return null;
      const res = await fetch(
        `/api/events/${eventId}/cart-summary?cart_id=${activeCartId}`,
        { cache: "no-store", credentials: "same-origin", signal }
      );
      if (res.ok) return res.json();
      let bodyCode: string | undefined;
      try {
        const body = (await res.json()) as { code?: string };
        bodyCode = body?.code;
      } catch {
        /* ignore */
      }
      if (bodyCode === "expired" || bodyCode === "not_found") {
        redirectIfReservationGone();
        return null;
      }
      const verify = await fetch(`/api/reservations/${activeCartId}`, {
        credentials: "same-origin",
        signal,
      });
      if (verify.status === 404) {
        redirectIfReservationGone();
        return null;
      }
      return null;
    },
    enabled: !!eventId && !!activeCartId,
    initialData:
      initialSummary ?? scopedStoreSummaryData ?? undefined,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4000),
  });

  useEffect(() => {
    if (!eventId || !activeCartId || summary == null) return;
    const clientCount =
      items.filter((i) => i.type === "seat").length +
      items
        .filter((i) => i.type === "section")
        .reduce((s, i) => s + i.quantity, 0);
    if (clientCount <= 0 || (summary.item_count ?? 0) > 0) return;
    if (cartSummaryMismatchRetriesRef.current >= 3) return;
    cartSummaryMismatchRetriesRef.current += 1;
    const delay = 350 * cartSummaryMismatchRetriesRef.current;
    const t = window.setTimeout(() => {
      void queryClient.invalidateQueries({
        queryKey: ["cart-summary", eventId, activeCartId],
      });
    }, delay);
    return () => window.clearTimeout(t);
  }, [summary, eventId, activeCartId, items, queryClient]);

  const {
    data: paymongoOptions,
    isLoading: paymongoOptionsLoading,
    isError: paymongoOptionsError,
  } = useQuery({
    queryKey: ["paymongo-checkout-options"],
    queryFn: async () => {
      const res = await fetch("/api/checkout/paymongo-options", {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("payment_options");
      const json = (await res.json()) as {
        buckets: { id: PaymongoPaymentBucket; label: string; available: boolean }[];
        fees: PaymongoProcessingFeesConfig;
      };
      return json;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    const buckets = paymongoOptions?.buckets;
    if (!buckets?.length) {
      setPaymentBucket(null);
      return;
    }
    setPaymentBucket((prev) => {
      if (!prev) return null;
      return buckets.some((b) => b.id === prev && b.available) ? prev : null;
    });
  }, [paymongoOptions]);

  const clientCartItemCount = useMemo(
    () =>
      items.filter((i) => i.type === "seat").length +
      items
        .filter((i) => i.type === "section")
        .reduce((s, i) => s + i.quantity, 0),
    [items]
  );

  /**
   * Cart-summary sometimes returns item_count 0 (transient read/API) while the client still has
   * seats from the book step; React Query would then override the prefetched scoped summary and
   * show ₱0. Prefer SSR / store summary when the server reports an empty cart but local items
   * disagree and we still have a non-zero fallback subtotal.
   */
  const effectiveSummary = useMemo(() => {
    const scoped = scopedStoreSummaryData;
    const initial = initialSummary ?? null;
    const fallbackSubtotal = Math.max(
      scoped?.subtotal_cents ?? 0,
      initial?.subtotal_cents ?? 0
    );
    if (
      summary != null &&
      (summary.item_count ?? 0) === 0 &&
      clientCartItemCount > 0 &&
      fallbackSubtotal > 0
    ) {
      return scoped ?? initial ?? summary;
    }
    return summary ?? scoped ?? initial;
  }, [
    summary,
    scopedStoreSummaryData,
    initialSummary,
    clientCartItemCount,
  ]);

  const subtotalCents = effectiveSummary?.subtotal_cents ?? 0;

  const discountCents = appliedPromos.reduce((s, p) => s + p.discount_cents, 0);
  const finalCents = Math.max(0, subtotalCents - discountCents);

  const quotedChargeCents = useMemo(() => {
    if (finalCents <= 0 || !paymentBucket || !paymongoOptions?.fees) return finalCents;
    return computeChargedCentsForBucket(finalCents, paymentBucket, paymongoOptions.fees);
  }, [finalCents, paymentBucket, paymongoOptions?.fees]);

  useEffect(() => {
    setPaymentPricingOverride(null);
  }, [activeCartId, finalCents, paymentBucket]);

  const displayTicketNetCents =
    paymentPricingOverride?.net ?? finalCents;

  const displayQuotedChargeCents = paymentPricingOverride
    ? paymentPricingOverride.charged
    : quotedChargeCents;

  const displayProcessingFeeDelta = Math.max(
    0,
    displayQuotedChargeCents - displayTicketNetCents
  );

  const paymentBucketReady =
    finalCents <= 0 ||
    (!!paymentBucket &&
      !!paymongoOptions?.buckets?.some((b) => b.id === paymentBucket && b.available));

  const checkoutBlockedPaymongo =
    finalCents > 0 &&
    (paymongoOptionsLoading || paymongoOptionsError || !paymentBucketReady);

  const renderPaymentBucketValue = useCallback((bucket: PaymongoPaymentBucket) => {
    const meta = paymentBucketMeta(bucket);
    const Icon = meta.Icon;
    return (
      <span className="inline-flex w-full min-w-0 items-center justify-between gap-2">
        <span className="inline-flex min-w-0 flex-1 items-center gap-2 pr-2">
          <Icon className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden />
          <span className="truncate">{meta.label}</span>
        </span>
        <span className="shrink-0">{renderPaymentBucketLogos(bucket, "full")}</span>
      </span>
    );
  }, []);

  const renderPaymentBucketOption = useCallback((bucket: PaymongoPaymentBucket) => {
    const meta = paymentBucketMeta(bucket);
    const Icon = meta.Icon;
    return (
      <span className="inline-flex min-w-0 max-w-full items-center gap-2">
        <span className="inline-flex min-w-0 flex-1 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden />
          <span className="truncate">{meta.label}</span>
        </span>
        <span className="shrink-0">{renderPaymentBucketLogos(bucket, "full")}</span>
      </span>
    );
  }, []);

  useEffect(() => {
    if (!expiresAt || !activeCartId) {
      setTimeRemaining(null);
      warnedThresholdsRef.current.clear();
      return;
    }
    warnedThresholdsRef.current.clear();
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setTimeRemaining(formatTimeRemaining(ms));

      const warnThresholds = [120];
      for (const threshold of warnThresholds) {
        if (
          ms > 0 &&
          ms <= threshold * 1000 &&
          !warnedThresholdsRef.current.has(threshold)
        ) {
          warnedThresholdsRef.current.add(threshold);
          if (!cartStayLongerDialogOpenRef.current && !isExtendingCartRef.current) {
            setCartStayLongerDialogOpen(true);
          }
        }
      }
      if (ms <= 0) {
        if (isExtendingCartRef.current) return false;
        setCartStayLongerDialogOpen(false);
        const expiredCartId = activeCartId;
        clear();
        toast.error("Your reservation has expired.");
        void notifyReservationExpired(expiredCartId);
        router.push(`/${eventSlug}/book`);
        return true;
      }
      return false;
    };
    tick();
    const id = setInterval(() => {
      if (tick()) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt, activeCartId, eventSlug, clear, router]);

  const handleApplyPromo = async () => {
    const code = promoCode.trim();
    if (!code || !eventId || !activeCartId || subtotalCents <= 0) return;
    const currentTotal = subtotalCents - discountCents;
    if (currentTotal <= 0) {
      toast.error("No amount left to discount");
      return;
    }
    try {
      const res = await fetch("/api/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          event_id: eventId,
          cart_id: activeCartId,
          applied_promo_codes: appliedPromos.map((p) => p.code),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.valid) {
        setAppliedPromos((prev) => [
          ...prev,
          { code: code.toUpperCase(), discount_cents: data.discount_cents ?? 0 },
        ]);
        setPromoCode("");
        if (data.promo_no_discount_hint) {
          toast.info(data.message ?? "Promo added", { duration: 12000 });
        } else {
          toast.success(data.message ?? "Promo applied");
        }
      } else {
        if (data.reason === "not_stackable") {
          setNotStackableDialogOpen(true);
        } else {
          const msg =
            (typeof data.message === "string" && data.message.trim()
              ? data.message
              : null) ??
            (typeof data.error === "string" ? data.error : null) ??
            "Invalid promo code";
          toast.error(msg);
        }
      }
    } catch {
      toast.error("Failed to validate promo");
    }
  };

  const handleRemovePromo = (code: string) => {
    setAppliedPromos((prev) => prev.filter((p) => p.code !== code));
  };

  const RESERVATION_CHANNEL = "wish-reservation";

  const handleExtendCart = useCallback(async () => {
    if (!activeCartId || !eventId || items.length === 0) return;

    setIsExtendingCart(true);
    isExtendingCartRef.current = true;

    try {
      const extendRes = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extend: true,
          event_id: eventId,
          items: buildReservationSyncPayload(items),
        }),
      });

      if (!extendRes.ok) {
        const errData = await extendRes.json().catch(() => ({}));
        toast.error(errData.error ?? "Failed to extend reservation time.");
        setCartStayLongerDialogOpen(false);
        return;
      }

      const extendData = await extendRes.json().catch(() => ({}));
      if (extendData?.expires_at) {
        const newCartId = extendData.reservation_cart_id ?? activeCartId;
        setCart(newCartId, eventId, extendData.expires_at);
        if (typeof BroadcastChannel !== "undefined") {
          new BroadcastChannel(RESERVATION_CHANNEL).postMessage({
            type: "update",
            cartId: newCartId,
            eventId,
            expiresAt: extendData.expires_at,
          });
        }
      }

      setCartStayLongerDialogOpen(false);
      toast.success("Reservation time extended.");
    } catch {
      setCartStayLongerDialogOpen(false);
      // Let the existing countdown/expiry handling clear the cart.
    } finally {
      setIsExtendingCart(false);
      isExtendingCartRef.current = false;
    }
  }, [activeCartId, eventId, items, setCart]);

  const handleDeclineExtend = useCallback(() => {
    if (isExtendingCartRef.current) return;
    setCartStayLongerDialogOpen(false);
    const expiredCartId = activeCartId;
    clear();
    toast.error("Your reservation has been released.");
    void notifyReservationExpired(expiredCartId);
    router.push(`/${eventSlug}/book`);
  }, [activeCartId, clear, router, eventSlug]);

  const handleOnSitePayment = async () => {
    if (!activeCartId || !eventId || items.length === 0) return;
    const { customer_name, customer_email } = onSiteCustomer;
    if (!customer_name.trim() || !customer_email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (!specialRequestType) {
      toast.error("Please select a special request type");
      return;
    }
    if (specialRequestType === "others" && !specialRequestDetails.trim()) {
      toast.error("Please enter notes for “Others.”");
      return;
    }
    setOnSiteSubmitting(true);
    setCheckoutFlowPhase("extending");
    try {
      const extendRes = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extend: true,
          event_id: eventId,
          items: buildReservationSyncPayload(items),
        }),
      });
      if (!extendRes.ok) {
        const errData = await extendRes.json().catch(() => ({}));
        toast.error(errData.error ?? "Reservation expired. Please select seats again.");
        return;
      }
      const extendData = await extendRes.json().catch(() => ({}));
      const cartIdForCheckout = extendData?.reservation_cart_id ?? activeCartId;
      if (extendData?.expires_at) {
        const newCartId = extendData.reservation_cart_id ?? activeCartId;
        setCart(newCartId, eventId, extendData.expires_at);
        if (typeof BroadcastChannel !== "undefined") {
          new BroadcastChannel(RESERVATION_CHANNEL).postMessage({
            type: "update",
            cartId: newCartId,
            eventId,
            expiresAt: extendData.expires_at,
          });
        }
      }

      setCheckoutFlowPhase("checkout");
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart_id: cartIdForCheckout,
          event_id: eventId,
          promo_codes: appliedPromos.map((p) => p.code),
          special_request_type: specialRequestType as SpecialRequestType,
          special_request_details: specialRequestDetails.trim() || undefined,
          on_site_payment: {
            customer_name: customer_name.trim(),
            customer_email: customer_email.trim(),
            customer_phone: onSiteCustomer.customer_phone.trim() || undefined,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        toast.error("You do not have permission for on-site payment.");
        return;
      }
      if (!res.ok) {
        throw new Error(data.error ?? "On-site payment failed");
      }
      if (data.booking_id) {
        clear();
        clearPendingPaymongoBooking();
        window.location.href = `/${eventSlug}/confirmation/${data.booking_id}?fromPayment=1`;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "On-site payment failed");
    } finally {
      setOnSiteSubmitting(false);
      setCheckoutFlowPhase(null);
    }
  };

  const handlePayment = async (opts?: { pageProgress?: boolean }) => {
    const pageProgress = opts?.pageProgress !== false;
    if (!activeCartId || !eventId || items.length === 0) return;
    if (!specialRequestType) {
      toast.error("Please select a special request type");
      return;
    }
    if (specialRequestType === "others" && !specialRequestDetails.trim()) {
      toast.error("Please enter notes for “Others.”");
      return;
    }
    if (finalCents > 0) {
      if (paymongoOptionsLoading || paymongoOptionsError) {
        toast.error("Payment options are still loading. Try again in a moment.");
        return;
      }
      if (!paymentBucketReady || !paymentBucket) {
        toast.error("Choose a payment option.");
        return;
      }
    }
    if (pageProgress) setLoading(true);
    setCheckoutFlowPhase("extending");
    try {
      const pendingBookingId = readPendingPaymongoBooking(eventId);
      if (pendingBookingId && finalCents > 0 && paymentBucket) {
        setCheckoutFlowPhase("checkout");
        const resessionRes = await fetch(`/api/bookings/${pendingBookingId}/paymongo-resession`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_bucket: paymentBucket }),
        });
        const resessionData = await resessionRes.json().catch(() => ({}));
        if (resessionRes.ok && typeof resessionData.redirect_url === "string") {
          const netRaw = resessionData.ticket_net_cents;
          const chargedRaw = resessionData.charged_cents;
          if (
            typeof netRaw === "number" &&
            typeof chargedRaw === "number" &&
            Number.isFinite(netRaw) &&
            Number.isFinite(chargedRaw)
          ) {
            setPaymentPricingOverride({
              net: Math.max(0, Math.round(netRaw)),
              charged: Math.max(0, Math.round(chargedRaw)),
            });
          }
          writePendingPaymongoBooking(eventId, pendingBookingId);
          setCheckoutFlowPhase(null);
          setLoading(false);
          redirectToPaymongoCheckout(resessionData.redirect_url);
          return;
        }
        if (resessionRes.status === 404 || resessionRes.status === 400) {
          clearPendingPaymongoBooking();
        }
      }

      // Extend cart timer before checkout so buyer has full window to complete payment
      const extendRes = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extend: true,
          event_id: eventId,
          items: buildReservationSyncPayload(items),
        }),
      });
      if (!extendRes.ok) {
        // Retry path: cart may already be consumed by an existing pending PayMongo booking.
        // In that case, /api/checkout can reuse the active pending payment session.
        if (extendRes.status !== 404 && extendRes.status !== 409) {
          const errData = await extendRes.json().catch(() => ({}));
          toast.error(errData.error ?? "Reservation expired. Please select seats again.");
          return;
        }
      }
      const extendData = await extendRes.json().catch(() => ({}));
      if (extendData?.expires_at) {
        const newCartId = extendData.reservation_cart_id ?? activeCartId;
        setCart(newCartId, eventId, extendData.expires_at);
        if (typeof BroadcastChannel !== "undefined") {
          new BroadcastChannel(RESERVATION_CHANNEL).postMessage({
            type: "update",
            cartId: newCartId,
            eventId,
            expiresAt: extendData.expires_at,
          });
        }
      }

      const cartIdForCheckout = extendData?.reservation_cart_id ?? activeCartId;
      setCheckoutFlowPhase("checkout");
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart_id: cartIdForCheckout,
          event_id: eventId,
          promo_codes: appliedPromos.map((p) => p.code),
          special_request_type: specialRequestType as SpecialRequestType,
          special_request_details: specialRequestDetails.trim() || undefined,
          ...(finalCents > 0 && paymentBucket ? { payment_bucket: paymentBucket } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        toast.info("Sign up to complete your purchase.");
        const bookUrl = `/${eventSlug}/book`;
        window.location.href = `/signup?redirectTo=${encodeURIComponent(bookUrl)}`;
        return;
      }
      if (!res.ok) {
        throw new Error(data.error ?? "Checkout failed");
      }
      if (data.reused_pending_payment) {
        toast.info("Resuming your previous payment session.");
      }
      if (data.redirect_url) {
        const netRaw = data.ticket_net_cents;
        const chargedRaw = data.charged_cents;
        if (
          typeof netRaw === "number" &&
          typeof chargedRaw === "number" &&
          Number.isFinite(netRaw) &&
          Number.isFinite(chargedRaw)
        ) {
          setPaymentPricingOverride({
            net: Math.max(0, Math.round(netRaw)),
            charged: Math.max(0, Math.round(chargedRaw)),
          });
        }
        if (typeof data.booking_id === "string") {
          writePendingPaymongoBooking(eventId, data.booking_id);
        }
        setCheckoutFlowPhase(null);
        setLoading(false);
        redirectToPaymongoCheckout(data.redirect_url);
        return;
      }
      if (data.booking_id) {
        clearPendingPaymongoBooking();
        window.location.href = `/${eventSlug}/confirmation/${data.booking_id}?fromPayment=1`;
        return;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setLoading(false);
      setCheckoutFlowPhase(null);
    }
  };

  const handleResumePendingPayment = async () => {
    if (!resumeBookingId || !paymentBucket) return;
    setLoading(true);
    setCheckoutFlowPhase("checkout");
    try {
      const resessionRes = await fetch(`/api/bookings/${resumeBookingId}/paymongo-resession`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_bucket: paymentBucket }),
      });
      const data = await resessionRes.json().catch(() => ({}));
      if (!resessionRes.ok || typeof data.redirect_url !== "string") {
        throw new Error(
          typeof data.error === "string" && data.error.trim().length > 0
            ? data.error
            : "Could not reopen payment. Please try again."
        );
      }
      redirectToPaymongoCheckout(data.redirect_url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reopen payment.");
    } finally {
      setLoading(false);
      setCheckoutFlowPhase(null);
    }
  };

  const checkoutProgress = useMemo(() => {
    if (isExtendingCart) {
      return {
        message: "Extending your reservation…",
        subtitle: "Checkout",
        detail: "Adding a little more time to complete your purchase.",
      };
    }
    if (onSiteSubmitting) {
      if (checkoutFlowPhase === "extending") {
        return {
          message: "Extending reservation time…",
          subtitle: "On-site payment",
          detail: "Keeping your seats held while we continue.",
        };
      }
      return {
        message: "Completing on-site payment…",
        subtitle: "On-site payment",
        detail: "Creating the booking and sending tickets to the customer.",
      };
    }
    if (loading) {
      if (checkoutFlowPhase === "extending") {
        return {
          message: "Extending reservation time…",
          subtitle: "Checkout",
          detail:
            finalCents <= 0
              ? "Keeping your seats while we complete your order."
              : "Getting your cart ready for payment.",
        };
      }
      if (finalCents <= 0) {
        return {
          message: "Completing your order…",
          subtitle: "Checkout",
          detail:
            "Creating your tickets and emailing them to you. This may take a moment—please keep this tab open.",
        };
      }
      return {
        message: "Starting secure payment…",
        subtitle: "Checkout",
        detail:
          "Connecting to our payment partner. You'll finish checkout in the next step.",
      };
    }
    return { message: "Working…", subtitle: "Checkout", detail: undefined };
  }, [
    isExtendingCart,
    onSiteSubmitting,
    loading,
    checkoutFlowPhase,
    finalCents,
  ]);

  if (!activeCartId) {
    if (resumeBookingId) {
      return (
        <div className="container mx-auto flex max-w-lg w-full flex-1 flex-col px-4 py-12 my-auto">
          <FloatingProgressBar
            active={loading}
            message="Starting secure payment…"
            subtitle="Checkout"
            detail="Connecting to our payment partner. You'll finish checkout in the next step."
          />
          <div className="glass rounded-xl border border-[var(--glass-border)] p-6 space-y-4">
            <h1 className="text-2xl font-bold text-foreground">Change payment method</h1>
            <p className="text-sm text-foreground-muted">
              Pick a payment option, then we&apos;ll open a fresh PayMongo checkout session for this booking.
            </p>
            <div>
              <Label htmlFor="resume-payment-option" className="text-sm text-foreground">
                Payment option <span className="text-red-400" aria-hidden>*</span>
              </Label>
              {paymongoOptionsLoading ? (
                <p className="mt-2 text-sm text-foreground-muted">Loading payment options…</p>
              ) : paymongoOptionsError ? (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                  Could not load payment options. Refresh the page and try again.
                </p>
              ) : (
                <Select
                  value={paymentBucket ?? CHECKOUT_PAYMENT_BUCKET_UNSET}
                  onValueChange={(v) =>
                    setPaymentBucket(
                      v === CHECKOUT_PAYMENT_BUCKET_UNSET
                        ? null
                        : (v as PaymongoPaymentBucket)
                    )
                  }
                >
                  <SelectTrigger
                    id="resume-payment-option"
                    className="mt-2 w-full border-[var(--glass-border)] bg-black/20"
                    aria-required
                  >
                    {paymentBucket ? (
                      renderPaymentBucketValue(paymentBucket)
                    ) : (
                      <SelectValue placeholder="Select a payment option" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      value={CHECKOUT_PAYMENT_BUCKET_UNSET}
                      disabled
                      className="hidden"
                      aria-hidden
                    >
                      Select a payment option
                    </SelectItem>
                    {(paymongoOptions?.buckets ?? []).map((b) => (
                      <SelectItem
                        key={b.id}
                        value={b.id}
                        disabled={!b.available}
                        textValue={b.label}
                      >
                        <span className="block space-y-1.5">
                          <span className="inline-flex items-center gap-2">
                            {renderPaymentBucketOption(b.id)}
                          </span>
                          {!b.available ? (
                            <span className="block text-xs text-foreground-muted font-normal">
                              Not enabled on current PayMongo account/mode
                            </span>
                          ) : null}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button
              className="w-full bg-[var(--wish-yellow)] text-neutral-950 hover:bg-[#FFF9B8] hover:text-neutral-950"
              onClick={() => void handleResumePendingPayment()}
              disabled={loading || paymongoOptionsLoading || paymongoOptionsError || !paymentBucket}
            >
              {loading ? "Opening payment..." : "Continue to payment"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={() => setCancelCheckoutOpen(true)}
              disabled={loading}
            >
              Cancel order
            </Button>
            <ConfirmDialog
              open={cancelCheckoutOpen}
              onOpenChange={setCancelCheckoutOpen}
              title="Cancel this order?"
              description="This will cancel your pending payment attempt for this booking. This action cannot be undone."
              confirmLabel="Cancel order"
              variant="destructive"
              onConfirm={async () => {
                let cancelled = false;
                try {
                  const res = await fetch(`/api/bookings/${resumeBookingId}/cancel`, {
                    method: "POST",
                  });
                  cancelled = res.ok;
                } catch {
                  // ignore network errors; fallback to event-level pending cancellation below
                }
                if (eventId) {
                  try {
                    const res = await fetch("/api/bookings/cancel-pending", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ event_id: eventId }),
                    });
                    if (res.ok || res.status === 404) {
                      cancelled = true;
                    }
                  } catch {
                    // ignore network errors; local clear still runs
                  }
                }
                clearPendingPaymongoBooking();
                clear();
                if (cancelled) toast.success("Order cancelled.");
                else toast.error("Could not confirm server cancellation. Cart was cleared locally.");
                router.push(`/${eventSlug}/book`);
              }}
            />
          </div>
        </div>
      );
    }
    return (
      <div className="container mx-auto flex max-w-lg w-full flex-1 flex-col px-4 py-12 my-auto">
        <div className="glass rounded-xl p-8 text-center">
          <p className="text-foreground-muted mb-4">No reservation found. Select seats first.</p>
          <NavButtonWithProgress
            href={`/${eventSlug}/book`}
            loadingMessage="Loading seat selection…"
          >
            Back to seat selection
          </NavButtonWithProgress>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto flex max-w-lg w-full flex-1 flex-col px-4 py-12 my-auto">
      <FloatingProgressBar
        active={loading || onSiteSubmitting || isExtendingCart}
        message={checkoutProgress.message}
        subtitle={checkoutProgress.subtitle}
        detail={checkoutProgress.detail}
      />
      <CartStayLongerDialog
        open={cartStayLongerDialogOpen}
        onOpenChange={setCartStayLongerDialogOpen}
        onStayLonger={handleExtendCart}
        onDecline={handleDeclineExtend}
        isExtending={isExtendingCart}
      />
      <h1 className="text-2xl font-bold text-foreground mb-6">Checkout</h1>
      {timeRemaining != null && (
        <div className="glass rounded-xl border border-[var(--glass-border)] p-4 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="flex items-center gap-1.5 text-lg font-semibold tabular-nums text-amber-800 dark:text-[rgba(255,220,0,1)]"
              aria-live="polite"
            >
              <Clock className="h-5 w-5" />
              {timeRemaining}
            </span>
            <p className="text-sm text-foreground dark:text-yellow-400">
              Please complete your purchase by the time shown or your tickets and items in your cart will be released for others to purchase.
            </p>
          </div>
        </div>
      )}
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6 space-y-4">
        <div className="space-y-2">
          <div
            className="rounded-xl border-2 p-4 space-y-3
              border-amber-500/45 bg-gradient-to-br from-amber-100/50 via-white/50 to-transparent
              dark:border-amber-400/45 dark:bg-gradient-to-br dark:from-amber-950/80 dark:via-amber-950/50 dark:to-black/20"
            role="region"
            aria-labelledby="special-request-heading"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-200/60 text-amber-800 dark:bg-amber-400/25 dark:text-amber-100">
                <Accessibility className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <h2
                  id="special-request-heading"
                  className="text-base font-semibold tracking-tight text-foreground"
                >
                  Special request
                </h2>
                <p className="text-xs leading-relaxed text-foreground-muted">
                  Choose a request type before you pay. Add details if needed; notes are required only for
                  &quot;Others.&quot;
                </p>
              </div>
            </div>
            <div className="space-y-2 pt-0.5">
              <Label htmlFor="special-request-type" className="text-sm text-foreground">
                Request type <span className="text-red-400" aria-hidden>*</span>
              </Label>
              <Select
                value={specialRequestType}
                onValueChange={(v) => {
                  const next = v as SpecialRequestType;
                  setSpecialRequestType(next);
                  if (next === "none") setSpecialRequestDetails("");
                }}
                required
              >
                <SelectTrigger
                  id="special-request-type"
                  className="w-full border-[var(--glass-border)] bg-black/20"
                  aria-required
                >
                  <SelectValue placeholder="Select a request type" />
                </SelectTrigger>
                <SelectContent>
                  {SPECIAL_REQUEST_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {SPECIAL_REQUEST_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {specialRequestType && specialRequestType !== "none" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="special-request-details" className="text-sm text-foreground">
                    Details
                    {specialRequestType === "others" ? (
                      <span className="text-red-400"> *</span>
                    ) : (
                      <span className="text-foreground-muted font-normal"> (optional)</span>
                    )}
                  </Label>
                  <Textarea
                    id="special-request-details"
                    placeholder="e.g. wheelchair access, near aisle, assistance needed"
                    value={specialRequestDetails}
                    onChange={(e) => setSpecialRequestDetails(e.target.value)}
                    maxLength={2000}
                    className="min-h-[88px] border-[var(--glass-border)] bg-black/20"
                  />
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-muted" />
              <Input
                placeholder="Promo code"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                className="pl-9"
              />
            </div>
            <Button
              variant="secondary"
              onClick={handleApplyPromo}
              disabled={
                !promoCode.trim() ||
                subtotalCents <= 0 ||
                finalCents <= 0
              }
            >
              Apply
            </Button>
          </div>
          {appliedPromos.length > 0 && (
            <div className="space-y-1">
              {appliedPromos.map((p) => (
                <div
                  key={p.code}
                  className="flex justify-between items-center text-sm text-emerald-800 dark:text-green-400"
                >
                  <span className="flex items-center gap-2">
                    {p.code}
                    <button
                      type="button"
                      onClick={() => handleRemovePromo(p.code)}
                      className="text-foreground-muted hover:text-foreground text-xs"
                      aria-label={`Remove ${p.code}`}
                    >
                      ×
                    </button>
                  </span>
                  <span>-{formatPrice(p.discount_cents)}</span>
                </div>
              ))}
            </div>
          )}
          {finalCents > 0 ? (
            <div className="space-y-3 pt-2 border-t border-[var(--glass-border)]">
              <div>
                <Label htmlFor="checkout-payment-option" className="text-sm text-foreground">
                  Payment option <span className="text-red-400" aria-hidden>*</span>
                </Label>
                {paymongoOptionsLoading ? (
                  <p className="text-sm text-foreground-muted">Loading payment options…</p>
                ) : paymongoOptionsError ? (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    Could not load payment options. Refresh the page and try again.
                  </p>
                ) : (
                  <Select
                    value={paymentBucket ?? CHECKOUT_PAYMENT_BUCKET_UNSET}
                    onValueChange={(v) =>
                      setPaymentBucket(
                        v === CHECKOUT_PAYMENT_BUCKET_UNSET
                          ? null
                          : (v as PaymongoPaymentBucket)
                      )
                    }
                  >
                    <SelectTrigger
                      id="checkout-payment-option"
                      className="mt-2 w-full border-[var(--glass-border)] bg-black/20"
                      aria-required
                    >
                      {paymentBucket ? (
                        renderPaymentBucketValue(paymentBucket)
                      ) : (
                        <SelectValue placeholder="Select a payment option" />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        value={CHECKOUT_PAYMENT_BUCKET_UNSET}
                        disabled
                        className="hidden"
                        aria-hidden
                      >
                        Select a payment option
                      </SelectItem>
                      {(paymongoOptions?.buckets ?? []).map((b) => (
                        <SelectItem
                          key={b.id}
                          value={b.id}
                          disabled={!b.available}
                          textValue={b.label}
                        >
                          <span className="block space-y-1.5">
                            <span className="inline-flex items-center gap-2">
                              {renderPaymentBucketOption(b.id)}
                            </span>
                            {!b.available ? (
                              <span className="block text-xs text-foreground-muted font-normal">
                                Not enabled on current PayMongo account/mode
                              </span>
                            ) : null}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          ) : null}
          <div className="flex justify-between text-sm pt-2 border-t border-[var(--glass-border)]">
            <span className="text-foreground-muted">Tickets total</span>
            <span className="text-foreground tabular-nums">
              {effectiveSummary != null ? formatPrice(displayTicketNetCents) : "—"}
            </span>
          </div>
          {finalCents > 0 && displayProcessingFeeDelta > 0 ? (
            <div className="flex justify-between text-sm">
              <span className="text-foreground-muted">PayMongo Transaction Fee</span>
              <span className="text-foreground tabular-nums">
                {formatPrice(displayProcessingFeeDelta)}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between text-lg font-semibold pt-1 border-t border-[var(--glass-border)]">
            <span className="text-foreground">{finalCents > 0 ? "Total due" : "Total"}</span>
            <span className="text-foreground tabular-nums">
              {effectiveSummary != null
                ? formatPrice(finalCents > 0 ? displayQuotedChargeCents : finalCents)
                : "—"}
            </span>
          </div>
        </div>
        {finalCents === 0 ? (
          <p className="text-sm text-foreground-muted">
            No payment is due. We&apos;ll confirm your order, generate your tickets, and send them to your email on file.
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="w-full border-[var(--glass-border)] text-foreground hover:bg-[var(--glass-bg)]"
          onClick={() => setRefundPolicyDialogOpen(true)}
        >
          Check our Return and Refund Policy
        </Button>
        <Button
          className="w-full bg-[var(--wish-yellow)] text-neutral-950 hover:bg-[#FFF9B8] hover:text-neutral-950"
          onClick={() => {
            if (finalCents === 0) {
              void handlePayment();
            } else {
              setPrePaymongoOpen(true);
            }
          }}
          disabled={
            loading ||
            onSiteSubmitting ||
            checkoutBlockedPaymongo ||
            !specialRequestType
          }
        >
          {loading ? "Processing..." : finalCents === 0 ? "Complete Checkout" : "Proceed to payment"}
        </Button>
        <ConfirmDialog
          open={prePaymongoOpen}
          onOpenChange={setPrePaymongoOpen}
          title="Continue to PayMongo?"
          description="We&apos;ll redirect you to PayMongo to complete payment securely. You&apos;ll return here automatically after checkout."
          confirmLabel="Continue to PayMongo"
          loadingMessage="Starting secure payment…"
          loadingSubtitle="Checkout"
          loadingDetail="Connecting to our payment partner. You'll finish checkout in the next step."
          onConfirm={() => handlePayment({ pageProgress: false })}
        />
        {isAdminOrSuperAdmin && finalCents > 0 && (
          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            onClick={() => setOnSiteDialogOpen(true)}
            disabled={
              loading ||
              onSiteSubmitting ||
              checkoutBlockedPaymongo ||
              !specialRequestType
            }
          >
            On-Site Payment
          </Button>
        )}
        <Button
          type="button"
          variant="destructive"
          className="w-full"
          onClick={() => setCancelCheckoutOpen(true)}
          disabled={loading || onSiteSubmitting}
        >
          Cancel order
        </Button>
        <Dialog open={notStackableDialogOpen} onOpenChange={setNotStackableDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Promo code not stackable</DialogTitle>
              <DialogDescription>
                This promo code is not stackable with other promotions. It cannot be used with early
                bird pricing or combined with other promo codes.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setNotStackableDialogOpen(false)}>
                OK
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={onSiteDialogOpen} onOpenChange={setOnSiteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>On-Site Payment</DialogTitle>
              <DialogDescription>
                Collect customer details and complete the purchase without online payment. Tickets will be sent to the customer&apos;s email.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="on-site-name">Customer Name *</Label>
                <Input
                  id="on-site-name"
                  placeholder="Full name"
                  value={onSiteCustomer.customer_name}
                  onChange={(e) =>
                    setOnSiteCustomer((p) => ({ ...p, customer_name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="on-site-phone">Contact number</Label>
                <Input
                  id="on-site-phone"
                  type="tel"
                  placeholder="Optional"
                  value={onSiteCustomer.customer_phone}
                  onChange={(e) =>
                    setOnSiteCustomer((p) => ({ ...p, customer_phone: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="on-site-email">Email *</Label>
                <Input
                  id="on-site-email"
                  type="email"
                  placeholder="Where tickets will be sent"
                  value={onSiteCustomer.customer_email}
                  onChange={(e) =>
                    setOnSiteCustomer((p) => ({ ...p, customer_email: e.target.value }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOnSiteDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleOnSitePayment}
                disabled={
                  onSiteSubmitting ||
                  !onSiteCustomer.customer_name.trim() ||
                  !onSiteCustomer.customer_email.trim()
                }
              >
                {onSiteSubmitting ? "Completing…" : "Complete On-Site Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <ConfirmDialog
          open={cancelCheckoutOpen}
          onOpenChange={setCancelCheckoutOpen}
          title="Cancel this order?"
          description="This will release your reserved seats and clear your cart. This action cannot be undone."
          confirmLabel="Cancel order"
          variant="destructive"
          onConfirm={async () => {
            let cancelled = false;
            const pendingPaymongoBookingId =
              eventId ? readPendingPaymongoBooking(eventId) : null;
            if (pendingPaymongoBookingId) {
              try {
                const res = await fetch(`/api/bookings/${pendingPaymongoBookingId}/cancel`, {
                  method: "POST",
                });
                cancelled = res.ok;
              } catch {
                // ignore network errors; fallback to cart cancellation below when possible
              }
            }
            if (eventId) {
              try {
                const res = await fetch("/api/bookings/cancel-pending", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ event_id: eventId }),
                });
                if (res.ok || res.status === 404) {
                  cancelled = true;
                }
              } catch {
                // ignore network errors; fallback to cart cancellation below when possible
              }
            }
            // Always release the reservation cart when we have an id, even if cancel-pending
            // or PayMongo already returned ok — those paths do not delete `reservation_carts`.
            if (activeCartId) {
              try {
                const res = await fetch(`/api/reservations/${activeCartId}`, { method: "DELETE" });
                // 404: already cleared (e.g. checkout consumed the cart first).
                if (res.ok || res.status === 404) {
                  cancelled = true;
                }
              } catch {
                // ignore network errors; local clear still runs
              }
            }
            clearPendingPaymongoBooking();
            clear();
            if (cancelled) toast.success("Order cancelled and seats released.");
            else toast.error("Could not confirm server cancellation. Cart was cleared locally.");
            router.push(`/${eventSlug}/book`);
          }}
        />
        <ReturnAndRefundPolicyDialog
          open={refundPolicyDialogOpen}
          onOpenChange={setRefundPolicyDialogOpen}
        />
        <NavButtonWithProgress
          href={`/${eventSlug}/book`}
          variant="ghost"
          className="w-full"
          loadingMessage="Loading seat selection…"
        >
          Back to seat selection
        </NavButtonWithProgress>
      </div>
    </div>
  );
}
