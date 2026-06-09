export const ALL_CAPABILITIES = [
  "manage_seats",
  "manage_events",
  "manage_venues",
  "manage_prices",
  "view_sales_analytics",
  "manage_assignments",
  "manage_event_administrators",
  "manage_event_admissions_codes",
  "manage_ticket_templates",
  "refund_lookup",
  "resend_tickets",
] as const;

export type Capability = (typeof ALL_CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  manage_seats: "Manage Seats",
  manage_events: "Manage Events",
  manage_venues: "Manage Venues",
  manage_prices: "Manage Prices",
  view_sales_analytics: "View Sales Analytics",
  manage_assignments: "Manage Manual Distribution",
  manage_event_administrators: "Manage Event Administrators",
  manage_event_admissions_codes: "Manage Admissions Codes",
  manage_ticket_templates: "Manage Ticket Templates",
  refund_lookup: "Refund lookup",
  resend_tickets: "Ticket resending",
};

/** caps shown on Admin Dashboard cards (configurable in User Roles for staff accounts). */
export const DASHBOARD_BOX_CAPABILITIES = [
  "manage_events",
  "manage_venues",
  "view_sales_analytics",
  "refund_lookup",
  "resend_tickets",
] as const;

export type DashboardBoxCapability = (typeof DASHBOARD_BOX_CAPABILITIES)[number];

const DASHBOARD_CAP_SET = new Set<string>(DASHBOARD_BOX_CAPABILITIES);

export function isDashboardBoxCapability(
  c: string
): c is DashboardBoxCapability {
  return DASHBOARD_CAP_SET.has(c);
}

/** Labels in dashboard UI order; Producers is covered by `manage_events`. */
export const DASHBOARD_ACCESS_LABELS: Record<DashboardBoxCapability, string> = {
  manage_events: "Events & Producers",
  manage_venues: "Venues",
  view_sales_analytics: "Reports",
  refund_lookup: "Refund lookup",
  resend_tickets: "Ticket resending",
};
