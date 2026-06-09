"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { SectionRevenue } from "@/hooks/use-dashboard-data";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

interface SectionRevenueTableProps {
  data: SectionRevenue[];
}

export function SectionRevenueTable({ data }: SectionRevenueTableProps) {
  const [collapsed, setCollapsed] = useState(true);
  const hasData = !!data && data.length > 0;

  const toggleCollapsed = () => setCollapsed((prev) => !prev);

  if (!hasData) {
    return (
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="w-full flex items-center justify-between text-left mb-2"
          aria-expanded={!collapsed}
          aria-controls="section-revenue-content"
        >
          <h3 className="text-lg font-semibold text-foreground">
            Total Sales & Value by Section
          </h3>
          {collapsed ? (
            <ChevronRight className="w-5 h-5 text-foreground-muted" />
          ) : (
            <ChevronDown className="w-5 h-5 text-foreground-muted" />
          )}
        </button>
        {!collapsed && (
          <p
            id="section-revenue-content"
            className="text-foreground-muted text-sm py-6 text-center"
          >
            No section data
          </p>
        )}
      </div>
    );
  }

  const totalPaid = data.reduce((sum, r) => sum + (r.amount_paid_cents ?? 0), 0);
  const totalDistributedValue = data.reduce((sum, r) => sum + (r.distributed_value_cents ?? 0), 0);
  const totalComplimentaryValue = data.reduce((sum, r) => sum + (r.complimentary_value_cents ?? 0), 0);
  const totalProjectedRevenue = data.reduce((sum, r) => sum + (r.projected_revenue_cents ?? 0), 0);

  return (
    <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
      <button
        type="button"
        onClick={toggleCollapsed}
        className="w-full flex items-center justify-between text-left mb-2"
        aria-expanded={!collapsed}
        aria-controls="section-revenue-content"
      >
        <h3 className="text-lg font-semibold text-foreground">
          Total Sales & Value by Section
        </h3>
        {collapsed ? (
          <ChevronRight className="w-5 h-5 text-foreground-muted" />
        ) : (
          <ChevronDown className="w-5 h-5 text-foreground-muted" />
        )}
      </button>
      {!collapsed && (
        <div id="section-revenue-content">
          <p className="text-foreground-muted text-sm mb-4">
            Revenue per section (total sales), face value of distributed/complimentary tickets, and projected revenue (capacity × price minus complimentary).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--glass-border)]">
                  <th className="text-left py-3 px-2 font-medium text-foreground">Section</th>
                  <th className="text-right py-3 px-2 font-medium text-foreground">Total Sales</th>
                  <th className="text-right py-3 px-2 font-medium text-foreground">Distributed Tickets</th>
                  <th className="text-right py-3 px-2 font-medium text-foreground">Complimentary Value</th>
                  <th className="text-right py-3 px-2 font-medium text-foreground">Projected Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.section_id} className="border-b border-[var(--glass-border)]/50">
                    <td className="py-3 px-2 text-foreground">{row.section_name}</td>
                    <td className="py-3 px-2 text-right text-foreground">
                      {formatCurrency(row.amount_paid_cents ?? 0)}
                    </td>
                    <td className="py-3 px-2 text-right text-foreground-muted">
                      {formatCurrency(row.distributed_value_cents ?? 0)}
                    </td>
                    <td className="py-3 px-2 text-right text-foreground-muted">
                      {formatCurrency(row.complimentary_value_cents ?? 0)}
                    </td>
                    <td className="py-3 px-2 text-right text-foreground">
                      {formatCurrency(row.projected_revenue_cents ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--glass-border)] font-medium">
                  <td className="py-3 px-2 text-foreground">Total</td>
                  <td className="py-3 px-2 text-right text-foreground">
                    {formatCurrency(totalPaid)}
                  </td>
                  <td className="py-3 px-2 text-right text-foreground-muted">
                    {formatCurrency(totalDistributedValue)}
                  </td>
                  <td className="py-3 px-2 text-right text-foreground-muted">
                    {formatCurrency(totalComplimentaryValue)}
                  </td>
                  <td className="py-3 px-2 text-right text-foreground font-medium">
                    {formatCurrency(totalProjectedRevenue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
