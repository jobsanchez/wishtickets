/** Tab/section ids for event edit UI and `event_administrators.allowed_sections`. */
export const EVENT_ADMIN_SECTION_IDS = [
  "details",
  "admissionsCodes",
  "addOns",
  "eventAdministrators",
  "auditTrail",
  "assign",
  "printTickets",
  "promo",
  "promoCalculator",
  "reservedSeats",
  "pricing",
  "seating",
  "selector",
  "seatHold",
  "ticketTemplate",
] as const;

export type EventAdminSectionId = (typeof EVENT_ADMIN_SECTION_IDS)[number];

export const EVENT_ADMIN_SECTION_LABELS: Record<EventAdminSectionId, string> = {
  details: "Event Details",
  admissionsCodes: "Admissions Codes",
  addOns: "Add-Ons",
  eventAdministrators: "Event Administrators",
  auditTrail: "Audit Trail",
  assign: "Manual Ticket Distribution",
  printTickets: "Print Tickets",
  promo: "Promos",
  promoCalculator: "Promo Calculator",
  reservedSeats: "Reserved Seats",
  pricing: "Seat Pricing",
  seating: "Seat Configurator",
  selector: "Seat Selector Setup",
  seatHold: "Seat Hold",
  ticketTemplate: "Ticket Template",
};

/** Default sections when adding an event administrator (super-admin-only void sale is separate). */
export const DEFAULT_EVENT_ADMIN_SECTIONS: EventAdminSectionId[] = [
  ...EVENT_ADMIN_SECTION_IDS,
];

export function parseEventAdminSections(value: unknown): EventAdminSectionId[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(EVENT_ADMIN_SECTION_IDS);
  const out: EventAdminSectionId[] = [];
  for (const v of value) {
    if (typeof v === "string" && allowed.has(v)) {
      out.push(v as EventAdminSectionId);
    }
  }
  return out;
}

/** Build per-tab access for the event editor. Null/empty allowed = all sections (legacy / migration). */
export function sectionIdsToAccessMap(
  isSuperAdmin: boolean,
  allowedSections: string[] | null | undefined
): Record<EventAdminSectionId, boolean> {
  if (isSuperAdmin) {
    return Object.fromEntries(
      EVENT_ADMIN_SECTION_IDS.map((k) => [k, true])
    ) as Record<EventAdminSectionId, boolean>;
  }
  const useAll =
    allowedSections == null ||
    allowedSections.length === 0;
  const S = new Set(useAll ? EVENT_ADMIN_SECTION_IDS : allowedSections);
  return Object.fromEntries(
    EVENT_ADMIN_SECTION_IDS.map((k) => [k, S.has(k)])
  ) as Record<EventAdminSectionId, boolean>;
}
