"use client";

import { useQuery } from "@tanstack/react-query";

export interface VssBuyerSummary {
  buyer_name: string;
  buyer_email: string;
  ticket_count: number;
  payment_methods: Array<{ method: string; count: number }>;
}

export interface VssBuyerTicket {
  ticket_id: string;
  section_name: string;
  row_label: string;
  seat_number: string;
  payment_method: string;
  purchased_at: string;
}

function buyerKey(name: string, email: string): string {
  return `${name}|${email}`;
}

export function useVssBuyerSummaries({
  eventId,
  dateFrom,
  dateTo,
  enabled = true,
}: {
  eventId: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  enabled?: boolean;
}) {
  return useQuery<{ buyers: VssBuyerSummary[] }>({
    queryKey: ["vss-buyer-summaries", eventId ?? "", dateFrom ?? "", dateTo ?? ""],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (eventId) params.set("event_id", eventId);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const res = await fetch(`/api/admin/dashboard/vss-buyers?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to load buyer summaries");
      }
      return res.json();
    },
    enabled: !!eventId && enabled,
    staleTime: 0,
  });
}

export function useVssBuyerTickets({
  eventId,
  buyerName,
  buyerEmail,
  dateFrom,
  dateTo,
  enabled = false,
}: {
  eventId: string | null;
  buyerName: string;
  buyerEmail: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  enabled?: boolean;
}) {
  const key = buyerKey(buyerName, buyerEmail);
  return useQuery<{ tickets: VssBuyerTicket[] }>({
    queryKey: ["vss-buyer-tickets", eventId ?? "", key, dateFrom ?? "", dateTo ?? ""],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (eventId) params.set("event_id", eventId);
      params.set("buyer_name", buyerName);
      params.set("buyer_email", buyerEmail);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const res = await fetch(`/api/admin/dashboard/vss-buyers?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to load buyer tickets");
      }
      return res.json();
    },
    enabled: !!eventId && enabled,
    staleTime: 0,
  });
}
