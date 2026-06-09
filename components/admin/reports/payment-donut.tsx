"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { DashboardPaymentMethods } from "@/hooks/use-dashboard-data";

interface PaymentDonutProps {
  data: DashboardPaymentMethods;
}

const PAYMONGO_COLOR = "#3b82f6";
const ONSITE_COLOR = "#22c55e";
const DISTRIBUTED_COLOR = "#a855f7";

export function PaymentDonut({ data }: PaymentDonutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const distributedCents = Math.max(0, data.distributed_revenue_cents ?? 0);
  const grossTotal = Math.max(0, data.total_revenue_cents ?? 0);
  const hasSplit = grossTotal > 0;
  const total = hasSplit ? grossTotal : 1;
  const paymongoPct = hasSplit ? (data.paymongo_revenue_cents / total) * 100 : 0;
  const onsitePct = hasSplit ? (data.onsite_revenue_cents / total) * 100 : 0;
  const distributedPct = hasSplit ? (distributedCents / total) * 100 : 0;

  const chartData = [
    { name: "PayMongo", value: data.paymongo_revenue_cents, color: PAYMONGO_COLOR, pct: paymongoPct },
    { name: "Onsite", value: data.onsite_revenue_cents, color: ONSITE_COLOR, pct: onsitePct },
    {
      name: "Distributed Tickets",
      value: distributedCents,
      color: DISTRIBUTED_COLOR,
      pct: distributedPct,
    },
  ];
  const pieSlices = chartData.filter((d) => d.value > 0);

  return (
    <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="w-full flex items-center justify-between text-left mb-2"
        aria-expanded={!collapsed}
        aria-controls="payment-method-distribution-content"
      >
        <h3 className="text-lg font-semibold text-foreground">Payment Method Distribution</h3>
        {collapsed ? (
          <ChevronRight className="w-5 h-5 text-foreground-muted" />
        ) : (
          <ChevronDown className="w-5 h-5 text-foreground-muted" />
        )}
      </button>
      {!collapsed && (
        <div id="payment-method-distribution-content" className="flex flex-col md:flex-row items-center gap-6">
          {!hasSplit ? (
            <div className="w-full py-6 text-center text-sm text-foreground-muted leading-relaxed max-w-lg mx-auto">
              <p className="text-foreground/90 font-medium mb-1">No revenue to split for this view</p>
              <p>
                Shares combine online (PayMongo) and onsite booking totals with the face value of
                manual distributed (sales) seats in your date range. If you see zeros here, there
                is no qualifying amount for those filters yet (or only complimentary / non-paid
                activity).
              </p>
            </div>
          ) : (
            <>
              <div className="h-64 w-64 shrink-0">
                <ResponsiveContainer width={256} height={256}>
                  <PieChart>
                    <Pie
                      data={pieSlices}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieSlices.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "rgba(23,23,23,0.95)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                      }}
                      formatter={(_value, name, props) => [
                        `${props?.payload?.pct?.toFixed(1) ?? 0}%`,
                        name ?? "",
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: PAYMONGO_COLOR }} />
                  <span className="text-foreground-muted">Online Revenue: {paymongoPct.toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: ONSITE_COLOR }} />
                  <span className="text-foreground-muted">Onsite Revenue: {onsitePct.toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: DISTRIBUTED_COLOR }} />
                  <span className="text-foreground-muted">
                    Distributed Tickets (seat value): {distributedPct.toFixed(1)}%
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
