"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { VssBreakdown } from "@/hooks/use-dashboard-data";

interface VssStackedBarProps {
  data: VssBreakdown[];
}

const SOLD_COLOR = "#22c55e";
const DISTRIBUTED_COLOR = "#3b82f6";
const COMPLIMENTARY_COLOR = "#a855f7";
const AVAILABLE_COLOR = "#6b7280";
const FALLBACK_SECTION_COLOR = "#6b7280";
const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

const VSS_LEGEND_ITEMS: { color: string; label: string }[] = [
  { color: SOLD_COLOR, label: "Total Sales" },
  { color: DISTRIBUTED_COLOR, label: "Distributed Tickets" },
  { color: COMPLIMENTARY_COLOR, label: "Complimentary" },
  { color: AVAILABLE_COLOR, label: "Available" },
];

export function VssStackedBar({ data }: VssStackedBarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const chartData = data.map((d) => ({
    name: d.section_name?.length > 10 ? d.section_name.slice(0, 10) + "…" : d.section_name,
    fullName: d.section_name,
    sectionColor:
      d.section_color && HEX_COLOR_REGEX.test(d.section_color)
        ? d.section_color
        : FALLBACK_SECTION_COLOR,
    sold: d.sold,
    distributed: d.distributed,
    complimentary: d.complimentary,
    available: d.available,
  }));

  return (
    <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="w-full flex items-center justify-between text-left mb-2"
        aria-expanded={!collapsed}
        aria-controls="vss-breakdown-content"
      >
        <h3 className="text-lg font-semibold text-foreground">
          VSS (Seat Allocation Breakdown)
        </h3>
        {collapsed ? (
          <ChevronRight className="w-5 h-5 text-foreground-muted" />
        ) : (
          <ChevronDown className="w-5 h-5 text-foreground-muted" />
        )}
      </button>
      {!collapsed && (
        <div id="vss-breakdown-content">
          {chartData.length === 0 ? (
            <p className="text-foreground-muted text-sm py-8 text-center">No section data</p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="h-64 w-full min-h-[200px] min-w-0 sm:h-72">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  initialDimension={{ width: 480, height: 288 }}
                >
                  <BarChart
                    data={chartData}
                    margin={{ top: 16, right: 12, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis
                      dataKey="name"
                      height={36}
                      interval={0}
                      tick={({ x, y, payload }) => {
                        const idx = chartData.findIndex((d) => d.name === payload.value);
                        const color = idx >= 0 ? chartData[idx].sectionColor : "#a3a3a3";
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <text
                              x={0}
                              y={0}
                              dy={12}
                              textAnchor="middle"
                              fill={color}
                              fontSize={11}
                            >
                              {payload.value}
                            </text>
                          </g>
                        );
                      }}
                    />
                    <YAxis tick={{ fill: "#a3a3a3", fontSize: 12 }} width={40} />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(23,23,23,0.95)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                      }}
                      formatter={(value, name) => [value ?? 0, name ?? ""]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
                    />
                    <Bar dataKey="sold" stackId="a" fill={SOLD_COLOR} name="Total Sales" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="distributed" stackId="a" fill={DISTRIBUTED_COLOR} name="Distributed Tickets" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="complimentary" stackId="a" fill={COMPLIMENTARY_COLOR} name="Complimentary" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="available" stackId="a" fill={AVAILABLE_COLOR} name="Available" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div
                className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-foreground-muted"
                role="list"
                aria-label="Seat status legend"
              >
                {VSS_LEGEND_ITEMS.map(({ color, label }) => (
                  <span key={label} className="inline-flex items-center gap-1.5" role="listitem">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: color }}
                      aria-hidden
                    />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
