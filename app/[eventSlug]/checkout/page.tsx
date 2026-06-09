import { Suspense } from "react";
import CheckoutContent from "./checkout-content";
import { getCartSummary } from "@/lib/cart-summary";
import { RouteLoading } from "@/components/ui/route-loading";

export const dynamic = "force-dynamic";

export default async function CheckoutPage(props: {
  params: Promise<{ eventSlug: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { eventSlug } = await props.params;
  const search = props.searchParams ? await props.searchParams : {};
  const cartId =
    typeof search.cartId === "string"
      ? search.cartId
      : Array.isArray(search.cartId)
        ? search.cartId[0] ?? null
        : null;
  const eventId =
    typeof search.eventId === "string"
      ? search.eventId
      : Array.isArray(search.eventId)
        ? search.eventId[0] ?? null
        : null;

  // Fetch cart summary server-side so correct price shows on first paint (fixes Netlify P0)
  const summaryResult =
    cartId && eventId ? await getCartSummary(eventId, cartId) : null;
  const initialSummary =
    summaryResult?.ok === true ? summaryResult.data : null;

  return (
    <Suspense
      fallback={
        <RouteLoading
          variant="compact"
          message="Loading checkout…"
          subtitle="Fetching your cart and payment step."
          className="container mx-auto px-4"
        />
      }
    >
      <CheckoutContent
        eventSlug={eventSlug}
        initialCartId={cartId ?? undefined}
        initialEventId={eventId ?? undefined}
        initialSummary={initialSummary ?? undefined}
      />
    </Suspense>
  );
}
