import BookPageClient from "./book-page-client";
import { getGlobalReservationTtlMinutes } from "@/lib/reservations";
import { getPublicEventBySlug } from "@/lib/events/get-public-event-by-slug";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function BookPage(props: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await props.params;
  const event = await getPublicEventBySlug(eventSlug);
  const reservationTtlMinutes = await getGlobalReservationTtlMinutes();
  return (
    <BookPageClient
      eventSlug={eventSlug}
      initialEventId={event?.id ?? ""}
      initialEvent={event ?? null}
      reservationTtlMinutes={reservationTtlMinutes}
    />
  );
}
