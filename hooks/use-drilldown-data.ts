"use client";

import { useQuery } from "@tanstack/react-query";

export type DrilldownMetric =
  | "capacity"
  | "revenue"
  | "sold"
  | "distributed"
  | "complimentary"
  | "admitted"
  | "occupancy";

export interface DrilldownParams {
  eventId: string | null;
  metric: DrilldownMetric | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  enabled?: boolean;
}

export interface DrilldownResponse {
  rows: unknown[];
}

export function useDrilldownData({
  eventId,
  metric,
  dateFrom,
  dateTo,
  enabled = true,
}: DrilldownParams) {
  const { data, isLoading, error, refetch } = useQuery<DrilldownResponse>({
    queryKey: ["admin-dashboard-drilldown", eventId ?? "", metric ?? "", dateFrom ?? "", dateTo ?? ""],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (eventId) params.set("event_id", eventId);
      if (metric) params.set("metric", metric);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const res = await fetch(`/api/admin/dashboard/drilldown?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to load drilldown");
      }
      return res.json();
    },
    enabled: !!eventId && !!metric && enabled,
    staleTime: 0,
  });

  return { data, isLoading, error, refetch };
}
