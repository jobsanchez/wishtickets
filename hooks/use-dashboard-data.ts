"use client";

import { useQuery } from "@tanstack/react-query";

export interface DashboardEvent {
  id: string;
  title: string;
  event_start: string;
}

export interface DashboardKPIs {
  total_capacity: number;
  gross_revenue_cents: number;
  projected_total_gross_cents?: number;
  total_projected_revenue_cents: number;
  total_sold: number;
  distributed: number;
  /** Distinct manual-distribution (sales) recipient names for filtered bookings, comma-separated. */
  distributed_recipient_names?: string | null;
  complimentary: number;
  admitted: number;
  occupancy_pct: number;
  tech_hold_seats?: number;
  tech_hold_value_cents?: number;
}

export interface DashboardPaymentMethods {
  paymongo_revenue_cents: number;
  onsite_revenue_cents: number;
  /** Face value of manual sales (distributed) seats — same basis as section “Distributed value”. */
  distributed_revenue_cents: number;
  total_revenue_cents: number;
}

export interface SectionSales {
  section_id: string;
  section_name: string;
  section_color?: string | null;
  capacity: number;
  sold_count: number;
  sold_pct: number;
}

export interface DailyOnlineSalesSeries {
  key: string;
  name: string;
  color: string | null;
  sort_order: number;
}

export interface DailyOnlineSalesDay {
  date: string;
  date_label: string;
  [stackKey: string]: string | number;
}

export interface DailyOnlineSalesByGroup {
  days: DailyOnlineSalesDay[];
  series: DailyOnlineSalesSeries[];
}

export interface VssBreakdown {
  section_id: string;
  section_name: string;
  section_color?: string | null;
  sold: number;
  distributed: number;
  complimentary: number;
  available: number;
}

export interface SectionRevenue {
  section_id: string;
  section_name: string;
  amount_paid_cents: number;
  distributed_value_cents: number;
  complimentary_value_cents: number;
  projected_revenue_cents: number;
}

export interface EventDayData {
  checkin_rate: number;
  sold_admitted: number;
  distributed_admitted: number;
  complimentary_admitted: number;
}

export interface PriorityGuestSectionLine {
  section_id: string | null;
  section_name: string;
  section_color?: string | null;
}

export interface PriorityGuestOrder {
  booking_id: string;
  order_label: string;
  request_type: string;
  request_label: string;
  request_details: string | null;
  ticket_count: number;
  sections: PriorityGuestSectionLine[];
  created_at?: string;
}

export interface PriorityGuestsReport {
  /** Distinct orders (bookings) with a special request — one order counts once. */
  order_total: number;
  /** Total tickets across those orders (detail only). */
  ticket_total: number;
  pwd_total: number;
  senior_citizen_total: number;
  pregnant_total: number;
  others_total: number;
  by_order: PriorityGuestOrder[];
}

export interface DashboardPromoBudget {
  promo_budget_percent: number;
  allocated_cents: number;
  used_cents: number;
  remaining_cents: number;
}

export interface DashboardData {
  event: DashboardEvent;
  is_event_day: boolean;
  kpis: DashboardKPIs;
  promo_budget?: DashboardPromoBudget;
  payment_methods: DashboardPaymentMethods;
  sections_sales: SectionSales[];
  daily_online_sales_by_group?: DailyOnlineSalesByGroup;
  vss_breakdown: VssBreakdown[];
  section_revenue: SectionRevenue[];
  event_day_data: EventDayData | null;
  priority_guests: PriorityGuestsReport;
}

export interface DashboardParams {
  eventId: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  autoRefresh?: boolean;
}

export function useDashboardData({
  eventId,
  dateFrom,
  dateTo,
  autoRefresh = false,
}: DashboardParams) {
  const { data, isLoading, error, refetch } = useQuery<DashboardData>({
    queryKey: ["admin-dashboard", eventId ?? "", dateFrom ?? "", dateTo ?? "", autoRefresh],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (eventId) params.set("event_id", eventId);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const res = await fetch(`/api/admin/dashboard?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to load dashboard");
      }
      return res.json();
    },
    enabled: !!eventId,
    refetchInterval:
      autoRefresh
        ? (query) => (query.state.data?.is_event_day ? 30_000 : false)
        : false,
  });

  return { data, isLoading, error, refetch };
}
