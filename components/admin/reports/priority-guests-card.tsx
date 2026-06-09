"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { PriorityGuestOrder, PriorityGuestsReport } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";

function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

interface PriorityGuestsCardProps {
  data: PriorityGuestsReport;
}

export function PriorityGuestsCard({ data }: PriorityGuestsCardProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(() => new Set());

  const orderTotal = data.order_total ?? 0;
  const ticketTotal = data.ticket_total ?? 0;
  const orders = data.by_order ?? [];

  const toggleCollapsed = () => setCollapsed((prev) => !prev);

  const toggleOrder = (bookingId: string) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookingId)) next.delete(bookingId);
      else next.add(bookingId);
      return next;
    });
  };

  return (
    <div className="glass rounded-xl border border-[var(--glass-border)] p-6 text-left w-full">
      <button
        type="button"
        onClick={toggleCollapsed}
        className="w-full flex items-start justify-between gap-3 text-left"
        aria-expanded={!collapsed}
        aria-controls="priority-guests-details"
      >
        <div className="min-w-0">
          <p className="text-sm text-green-300 [html[data-theme=light]_&]:text-emerald-700">
            Priority Guests
          </p>
          <p className="text-2xl font-bold mt-1 text-foreground">
            {formatNumber(orderTotal)}{" "}
            <span className="text-base font-normal text-foreground-muted">
              order{orderTotal !== 1 ? "s" : ""} with a special request
            </span>
          </p>
          {orderTotal > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-yellow-400 [html[data-theme=light]_&]:text-amber-600">
              <span>PWD: {formatNumber(data.pwd_total ?? 0)}</span>
              <span>Seniors: {formatNumber(data.senior_citizen_total ?? 0)}</span>
              <span>Pregnant: {formatNumber(data.pregnant_total ?? 0)}</span>
              <span>Others: {formatNumber(data.others_total ?? 0)}</span>
            </div>
          )}
          {orderTotal > 0 && ticketTotal > orderTotal && (
            <p className="mt-1 text-xs text-foreground-muted">
              {formatNumber(ticketTotal)} ticket{ticketTotal !== 1 ? "s" : ""} across these orders
            </p>
          )}
        </div>
        {collapsed ? (
          <ChevronRight className="w-5 h-5 text-foreground-muted shrink-0 mt-1" />
        ) : (
          <ChevronDown className="w-5 h-5 text-foreground-muted shrink-0 mt-1" />
        )}
      </button>

      {!collapsed && (
        <div id="priority-guests-details" className="mt-3">
          <p className="text-xs text-foreground-muted">
            Each order counts once. Select an order to view its sections.
          </p>

          {orders.length === 0 ? (
            <p className="mt-4 text-sm text-foreground-muted">
              No priority guest orders in this filter.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="border-b border-[var(--glass-border)]">
                    <th className="w-8 py-2" aria-hidden />
                    <th className="text-left py-2 pr-3 text-foreground-muted font-medium">Order</th>
                    <th className="text-left py-2 pr-3 text-foreground-muted font-medium">Request</th>
                    <th className="text-right py-2 px-2 text-foreground-muted font-medium whitespace-nowrap">
                      Tickets
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <OrderRows
                      key={order.booking_id}
                      order={order}
                      isExpanded={expandedOrderIds.has(order.booking_id)}
                      onToggle={() => toggleOrder(order.booking_id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrderRows({
  order,
  isExpanded,
  onToggle,
}: {
  order: PriorityGuestOrder;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b border-[var(--glass-border)]">
        <td className="py-2 align-top">
          <button
            type="button"
            onClick={onToggle}
            className="p-1 rounded text-foreground-muted hover:text-foreground hover:bg-white/5"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Hide seats" : "Show seats"}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </td>
        <td className="py-2 pr-3 align-top">
          <button
            type="button"
            onClick={onToggle}
            className="text-left text-foreground font-medium hover:text-[var(--wish-orange)]"
          >
            {order.order_label}
          </button>
        </td>
        <td className="py-2 pr-3 align-top text-foreground">
          <span>{order.request_label}</span>
          {order.request_details && (
            <p className="mt-0.5 text-xs text-foreground-muted line-clamp-2">
              {order.request_details}
            </p>
          )}
        </td>
        <td className="py-2 px-2 text-right text-foreground tabular-nums align-top">
          {formatNumber(order.ticket_count)}
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-[var(--glass-border)] bg-white/[0.03] [html[data-theme=light]_&]:bg-black/[0.02]">
          <td colSpan={4} className="py-3 px-2 pl-9">
            {(order.sections ?? []).length === 0 ? (
              <p className="text-sm text-foreground-muted">No section details for this order.</p>
            ) : (
              <ul className="space-y-1.5 text-sm max-w-md">
                {(order.sections ?? []).map((section) => (
                  <li key={section.section_id ?? section.section_name}>
                    <span
                      className={cn("inline-flex items-center gap-2 text-foreground")}
                      style={
                        section.section_color
                          ? {
                              borderLeftWidth: 3,
                              borderLeftColor: section.section_color,
                              paddingLeft: 8,
                            }
                          : undefined
                      }
                    >
                      {section.section_name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
