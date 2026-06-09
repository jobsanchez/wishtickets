import { notFound } from "next/navigation";
import { getPublicEventBySlug } from "@/lib/events/get-public-event-by-slug";
import { EventPageContent } from "./event-page-content";
import type { Metadata } from "next";

/** Short ISR — repeat event page views avoid per-hit SSR (book/checkout stay dynamic). */
export const revalidate = 60;

/** Avoid treating well-known paths as event slugs if they ever hit this segment. */
const RESERVED_EVENT_SLUGS = new Set([
  "robots.txt",
  "sitemap.xml",
  "favicon.ico",
  "manifest.webmanifest",
  "icon.png",
  "apple-icon.png",
]);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}): Promise<Metadata> {
  const { eventSlug } = await params;
  if (RESERVED_EVENT_SLUGS.has(eventSlug.toLowerCase())) notFound();
  const event = await getPublicEventBySlug(eventSlug);
  if (!event) {
    return { title: "Event Not Found" };
  }
  const title = event.title ?? "Event";
  const description =
    event.short_description ?? event.description ?? "Discover and book tickets for this event.";
  const imageUrl = event.image_url ?? undefined;
  return {
    title: `${title} | Wish Tickets Portal`,
    description,
    openGraph: {
      title,
      description,
      images: imageUrl ? [{ url: imageUrl, alt: title }] : undefined,
    },
  };
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  if (RESERVED_EVENT_SLUGS.has(eventSlug.toLowerCase())) notFound();
  const event = await getPublicEventBySlug(eventSlug);
  if (!event) notFound();

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <h1 className="text-3xl font-bold text-foreground mb-8 text-center md:text-left">
        {event.title}
      </h1>
      <EventPageContent event={event} eventSlug={eventSlug} />
    </div>
  );
}
