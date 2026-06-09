import { redirect } from "next/navigation";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import nextDynamic from "next/dynamic";
import { EventForm } from "@/components/admin/event-form";
import type { AdminEventBanner } from "@/components/admin/event-banners-section";
import { SeatPricing } from "@/components/admin/seat-pricing";
import { EventPromoCodes } from "@/components/admin/event-promo-codes";
import { EventAdmissionsCodes } from "@/components/admin/event-admissions-codes";
import { EventAdministrators } from "@/components/admin/event-administrators";
import { TicketTemplateUpload } from "@/components/admin/ticket-template-upload";
import { EditEventTabs } from "@/components/admin/edit-event-tabs";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { requireSuperAdminOrCapability, getProfileRole } from "@/lib/auth";
import { sectionIdsToAccessMap } from "@/lib/event-admin-sections";

export const dynamic = "force-dynamic";

const SeatConfigurator = nextDynamic(
  () =>
    import("@/components/admin/seat-configurator").then(
      (m) => m.SeatConfigurator
    )
);

const SeatSelectorSetup = nextDynamic(
  () =>
    import("@/components/admin/seat-selector-setup").then(
      (m) => m.SeatSelectorSetup
    )
);

const SeatHold = nextDynamic(
  () =>
    import("@/components/admin/seat-hold").then(
      (m) => m.SeatHold
    )
);

const PrintTicketsTab = nextDynamic(
  () =>
    import("@/components/admin/print-tickets-tab").then((m) => m.PrintTicketsTab),
  {
    loading: () => (
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6 text-sm text-foreground-muted">
        Loading print tickets…
      </div>
    ),
  }
);

const ReservedSeatsTab = nextDynamic(
  () =>
    import("@/components/admin/reserved-seats-tab").then((m) => m.ReservedSeatsTab),
  {
    loading: () => (
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6 text-sm text-foreground-muted">
        Loading reserved seats…
      </div>
    ),
  }
);

const PromoCalculatorTab = nextDynamic(
  () =>
    import("@/components/admin/promo-calculator-tab").then((m) => m.PromoCalculatorTab),
  {
    loading: () => (
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6 text-sm text-foreground-muted">
        Loading promo calculator…
      </div>
    ),
  }
);

const EventAddOnsTab = nextDynamic(
  () =>
    import("@/components/admin/event-add-ons-tab").then((m) => m.EventAddOnsTab),
  {
    loading: () => (
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6 text-sm text-foreground-muted">
        Loading add-ons…
      </div>
    ),
  }
);

const VoidSaleReleaseTab = nextDynamic(
  () =>
    import("@/components/admin/void-sale-release-tab").then((m) => m.VoidSaleReleaseTab),
  {
    loading: () => (
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6 text-sm text-foreground-muted">
        Loading…
      </div>
    ),
  }
);

const VALID_TABS = new Set([
  "details",
  "seating",
  "selector",
  "seatHold",
  "reservedSeats",
  "pricing",
  "promo",
  "promoCalculator",
  "addOns",
  "admissionsCodes",
  "ticketTemplate",
  "printTickets",
  "eventAdministrators",
  "voidSaleRelease",
]);

export default async function EditEventPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await props.params;
  const { tab: tabParam } = await props.searchParams;
  if (tabParam === "assign") {
    redirect(`/admin/events/${id}/assign-seats`);
  }
  const defaultTab = tabParam && VALID_TABS.has(tabParam) ? tabParam : "details";

  const canCreateVenue = await requireSuperAdminOrCapability("manage_venues");

  const role = await getProfileRole();
  const isSuperAdmin = role === "super_admin";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: event }, { data: venues }, { data: producers }, { data: bannerRows }] =
    await Promise.all([
      supabase.rpc("get_admin_event_by_id", { p_id: id }),
      supabase.from("venues").select("id, name").order("name"),
      supabase.from("event_producers").select("id, name").order("name"),
      supabase
        .from("event_banners")
        .select(
          "id, event_id, image_url, sort_order, is_active, created_at, updated_at"
        )
        .eq("event_id", id)
        .order("sort_order", { ascending: true }),
    ]);

  const initialBanners = ((bannerRows ?? []) as AdminEventBanner[]) ?? [];

  if (!event) notFound();

  let allowedSections: string[] | null = null;
  if (!isSuperAdmin && user) {
    const { data: ea } = await supabase
      .from("event_administrators")
      .select("allowed_sections")
      .eq("event_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    allowedSections = ea?.allowed_sections ?? null;
  }

  const sectionAccess = sectionIdsToAccessMap(isSuperAdmin, allowedSections);

  const venueId = event.venue_id ?? null;
  const venueRows = (venues ?? []) as { id: string; name: string }[];

  const noAccess = (
    <div className="glass rounded-xl border border-[var(--glass-border)] p-6 text-foreground-muted">
      You don&apos;t have access to this section for this event.
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <NavButtonWithProgress
          href="/admin/events"
          variant="secondary"
          size="sm"
          className="bg-amber-400 text-black hover:bg-amber-300 border-transparent"
          loadingMessage="Loading events…"
        >
          ← Back to events
        </NavButtonWithProgress>
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-6">
        {event?.title ?? "Edit event"}
      </h1>
      <EditEventTabs
        eventId={id}
        defaultTab={defaultTab}
        sectionAccess={sectionAccess}
        isSuperAdmin={isSuperAdmin}
        eventDetails={
          sectionAccess.details ? (
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">Event Details</h2>
              <EventForm
                eventId={id}
                initialEvent={event}
                venues={venueRows}
                producers={producers ?? []}
                canCreateVenue={canCreateVenue}
                isSuperAdmin={isSuperAdmin}
                initialBanners={initialBanners}
              />
            </div>
          ) : (
            noAccess
          )
        }
        promoCalculator={
          sectionAccess.promoCalculator ? (
            <PromoCalculatorTab eventId={id} />
          ) : (
            noAccess
          )
        }
        seatConfigurator={
          sectionAccess.seating
            ? venueId ? (
                <SeatConfigurator
                  eventId={id}
                  venueId={venueId}
                  venueName={venueRows.find((v) => v.id === venueId)?.name ?? ""}
                  initialSeatMapUrls={event?.seat_map_image_urls ?? []}
                />
              ) : (
                <div className="glass rounded-xl border border-[var(--glass-border)] p-6 text-foreground-muted">
                  Select a venue in Event Details first.
                </div>
              )
            : noAccess
        }
        seatSelectorSetup={
          sectionAccess.selector
            ? venueId ? (
                <SeatSelectorSetup eventId={id} venueId={venueId} />
              ) : (
                <div className="glass rounded-xl border border-[var(--glass-border)] p-6 text-foreground-muted">
                  Select a venue in Event Details first.
                </div>
              )
            : noAccess
        }
        seatHold={
          sectionAccess.seatHold ? <SeatHold eventId={id} /> : noAccess
        }
        reservedSeats={
          sectionAccess.reservedSeats ? <ReservedSeatsTab eventId={id} /> : undefined
        }
        seatPricing={
          sectionAccess.pricing ? (
            <SeatPricing eventId={id} venueId={venueId} />
          ) : (
            noAccess
          )
        }
        promoCodes={
          sectionAccess.promo ? (
            <EventPromoCodes eventId={id} eventTitle={event?.title ?? "Event"} />
          ) : (
            noAccess
          )
        }
        addOns={
          sectionAccess.addOns ? <EventAddOnsTab eventId={id} /> : noAccess
        }
        admissionsCodes={
          sectionAccess.admissionsCodes ? (
            <EventAdmissionsCodes eventId={id} eventTitle={event?.title ?? "Event"} />
          ) : (
            noAccess
          )
        }
        eventAdministrators={
          <EventAdministrators eventId={id} eventTitle={event?.title ?? "Event"} />
        }
        voidSaleRelease={isSuperAdmin ? <VoidSaleReleaseTab eventId={id} /> : undefined}
        printTickets={
          sectionAccess.printTickets ? (
            <PrintTicketsTab eventId={id} eventTitle={event?.title ?? "Event"} />
          ) : undefined
        }
        ticketTemplate={
          sectionAccess.ticketTemplate ? (
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">Ticket Template</h2>
              <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
                <TicketTemplateUpload
                  key={`${id}-${event?.ticket_template_image_url ?? "none"}`}
                  eventId={id}
                  initialUrl={event?.ticket_template_image_url}
                />
                <p className="text-sm text-foreground-muted mt-4">
                  Overlay positions are set once for all events in{" "}
                  <NavButtonWithProgress
                    href="/admin/ticket-layout"
                    variant="link"
                    className="text-[var(--wish-orange)] hover:underline p-0 h-auto font-normal inline"
                    loadingMessage="Loading ticket layout…"
                  >
                    Ticket layout
                  </NavButtonWithProgress>
                  . This upload is only the background art for this event.
                </p>
              </div>
            </div>
          ) : (
            noAccess
          )
        }
      />
    </div>
  );
}
