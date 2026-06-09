"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  type LucideIcon,
  Armchair,
  Ban,
  Bookmark,
  Calculator,
  DollarSign,
  FileText,
  Grid3X3,
  Image as ImageIcon,
  Inbox,
  KeyRound,
  Printer,
  ShoppingBag,
  Tag,
  Timer,
  Users,
} from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { EventAdminSectionId } from "@/lib/event-admin-sections";

interface EditEventTabsProps {
  eventId: string;
  defaultTab?: string;
  /** Per-page access from `event_administrators.allowed_sections` (super admin: all true). */
  sectionAccess: Record<EventAdminSectionId, boolean>;
  isSuperAdmin: boolean;
  eventDetails: React.ReactNode;
  seatConfigurator: React.ReactNode;
  seatSelectorSetup: React.ReactNode;
  seatHold?: React.ReactNode;
  reservedSeats?: React.ReactNode;
  seatPricing: React.ReactNode;
  promoCodes: React.ReactNode;
  addOns?: React.ReactNode;
  promoCalculator?: React.ReactNode;
  admissionsCodes: React.ReactNode;
  ticketTemplate: React.ReactNode;
  voidSaleRelease?: React.ReactNode;
  eventAdministrators?: React.ReactNode;
  printTickets?: React.ReactNode;
}

export function EditEventTabs({
  eventId,
  defaultTab = "details",
  sectionAccess,
  isSuperAdmin,
  eventDetails,
  seatConfigurator,
  seatSelectorSetup,
  seatHold,
  reservedSeats,
  seatPricing,
  promoCodes,
  addOns,
  promoCalculator,
  admissionsCodes,
  ticketTemplate,
  voidSaleRelease,
  eventAdministrators,
  printTickets,
}: EditEventTabsProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [sectionSelectOpen, setSectionSelectOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  type TabOption = {
    value: string;
    label: string;
    icon: LucideIcon;
    section: EventAdminSectionId | "voidSaleRelease";
    visible: boolean;
  };

  const tabOptions: TabOption[] = useMemo(() => {
    const raw: TabOption[] = [
      {
        value: "details",
        label: "Event Details",
        icon: FileText,
        section: "details",
        visible: sectionAccess.details,
      },
      {
        value: "admissionsCodes",
        label: "Admissions Codes",
        icon: KeyRound,
        section: "admissionsCodes",
        visible: sectionAccess.admissionsCodes,
      },
      {
        value: "eventAdministrators",
        label: "Event Administrators",
        icon: Users,
        section: "eventAdministrators",
        visible: Boolean(sectionAccess.eventAdministrators && eventAdministrators),
      },
      {
        value: "addOns",
        label: "Add-Ons",
        icon: ShoppingBag,
        section: "addOns",
        visible: Boolean(sectionAccess.addOns && addOns),
      },
      {
        value: "assign",
        label: "Manual Ticket Distribution",
        icon: Inbox,
        section: "assign",
        visible: sectionAccess.assign,
      },
      {
        value: "printTickets",
        label: "Print Tickets",
        icon: Printer,
        section: "printTickets",
        visible: Boolean(sectionAccess.printTickets && printTickets),
      },
      {
        value: "promo",
        label: "Promos",
        icon: Tag,
        section: "promo",
        visible: sectionAccess.promo,
      },
      {
        value: "promoCalculator",
        label: "Promo Calculator",
        icon: Calculator,
        section: "promoCalculator",
        visible: Boolean(sectionAccess.promoCalculator && promoCalculator),
      },
      {
        value: "reservedSeats",
        label: "Reserved Seats",
        icon: Bookmark,
        section: "reservedSeats",
        visible: Boolean(sectionAccess.reservedSeats && reservedSeats),
      },
      {
        value: "voidSaleRelease",
        label: "Void Sale & Release Seat",
        icon: Ban,
        section: "voidSaleRelease",
        visible: Boolean(isSuperAdmin && voidSaleRelease),
      },
      {
        value: "pricing",
        label: "Seat Pricing",
        icon: DollarSign,
        section: "pricing",
        visible: sectionAccess.pricing,
      },
      {
        value: "seating",
        label: "Seat Configurator",
        icon: Armchair,
        section: "seating",
        visible: sectionAccess.seating,
      },
      {
        value: "selector",
        label: "Seat Selector Setup",
        icon: Grid3X3,
        section: "selector",
        visible: sectionAccess.selector,
      },
      {
        value: "seatHold",
        label: "Seat Hold",
        icon: Timer,
        section: "seatHold",
        visible: sectionAccess.seatHold,
      },
      {
        value: "ticketTemplate",
        label: "Ticket Template",
        icon: ImageIcon,
        section: "ticketTemplate",
        visible: sectionAccess.ticketTemplate,
      },
    ];
    return raw
      .filter((tab) => tab.visible)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [
    sectionAccess,
    eventAdministrators,
    printTickets,
    promoCalculator,
    reservedSeats,
    addOns,
    voidSaleRelease,
    isSuperAdmin,
  ]);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    if (tabOptions.length === 0) return;
    if (tabOptions.some((tab) => tab.value === activeTab)) return;
    const fallbackTab = tabOptions[0].value;
    setActiveTab(fallbackTab);
    startTransition(() => {
      router.replace(`/admin/events/${eventId}?tab=${fallbackTab}`, { scroll: false });
    });
  }, [activeTab, eventId, router, startTransition, tabOptions]);

  const selectedTab = tabOptions.find((t) => t.value === activeTab);
  const SelectedHeaderIcon = selectedTab?.icon;

  return (
    <>
      <FloatingProgressBar
        active={isPending}
        {...FLOATING_PROGRESS_PRESETS.navigation}
        message="Loading tab…"
      />
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (value === "assign") {
            startTransition(() => {
              router.push(`/admin/events/${eventId}/assign-seats`);
            });
            return;
          }
          setActiveTab(value);
          startTransition(() => {
            router.replace(`/admin/events/${eventId}?tab=${value}`, { scroll: false });
          });
        }}
        className="w-full"
      >
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="w-full rounded-lg border border-[var(--glass-border)] bg-white/5 p-3">
            {sectionSelectOpen ? (
              <div
                className="pointer-events-none fixed inset-0 z-40 bg-black/45"
                aria-hidden="true"
              />
            ) : null}
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-foreground-muted">
              Section
            </label>
            <Select
              value={activeTab}
              onOpenChange={setSectionSelectOpen}
              onValueChange={(value) => {
                if (value === "assign") {
                  startTransition(() => {
                    router.push(`/admin/events/${eventId}/assign-seats`);
                  });
                  return;
                }
                setActiveTab(value);
                startTransition(() => {
                  router.replace(`/admin/events/${eventId}?tab=${value}`, { scroll: false });
                });
              }}
            >
              <SelectTrigger className="border-[var(--wish-orange)]/30 bg-white/5 text-[var(--wish-orange)] hover:border-[var(--wish-orange)]/50 hover:bg-white/10 focus:ring-[var(--wish-orange)]">
                <div className="flex min-w-0 flex-1 items-center gap-2 pr-1 text-left">
                  {selectedTab && SelectedHeaderIcon ? (
                    <>
                      <SelectedHeaderIcon
                        className="h-4 w-4 shrink-0 text-[var(--wish-orange)]"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{selectedTab.label}</span>
                    </>
                  ) : (
                    <span className="truncate text-foreground-muted">Choose section</span>
                  )}
                </div>
              </SelectTrigger>
              <SelectContent
                className="max-h-56"
                viewportClassName="admin-tabs-scroll max-h-56 overflow-y-auto"
              >
                {tabOptions.map((tab) => {
                  const TabIcon = tab.icon;
                  return (
                    <SelectItem key={tab.value} value={tab.value} textValue={tab.label}>
                      <span className="flex items-center gap-2">
                        <TabIcon className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden />
                        <span>{tab.label}</span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
        <TabsContent value="details">{eventDetails}</TabsContent>
        <TabsContent value="seating">{seatConfigurator}</TabsContent>
        <TabsContent value="selector">{seatSelectorSetup}</TabsContent>
        <TabsContent value="seatHold">{seatHold}</TabsContent>
        <TabsContent value="reservedSeats">{reservedSeats}</TabsContent>
        <TabsContent value="pricing">{seatPricing}</TabsContent>
        <TabsContent value="promo">{promoCodes}</TabsContent>
        {sectionAccess.promoCalculator && promoCalculator && (
          <TabsContent value="promoCalculator">{promoCalculator}</TabsContent>
        )}
        <TabsContent value="admissionsCodes">{admissionsCodes}</TabsContent>
        {sectionAccess.addOns && addOns && (
          <TabsContent value="addOns">{addOns}</TabsContent>
        )}
        <TabsContent value="ticketTemplate">{ticketTemplate}</TabsContent>
        {isSuperAdmin && voidSaleRelease && (
          <TabsContent value="voidSaleRelease">{voidSaleRelease}</TabsContent>
        )}
        {sectionAccess.printTickets && printTickets && (
          <TabsContent value="printTickets">{printTickets}</TabsContent>
        )}
        {sectionAccess.eventAdministrators && eventAdministrators && (
          <TabsContent value="eventAdministrators">{eventAdministrators}</TabsContent>
        )}
      </Tabs>
    </>
  );
}
