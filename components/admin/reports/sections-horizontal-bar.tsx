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
  Cell,
} from "recharts";
import type { SectionSales } from "@/hooks/use-dashboard-data";
import { sectionsOnlineSalesChartData } from "@/lib/reports/sections-online-sales-chart";

interface SectionsHorizontalBarProps {
  data: SectionSales[];
}

const FALLBACK_SECTION_COLOR = "#6b7280";
const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

export function SectionsHorizontalBar({ data }: SectionsHorizontalBarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const chartData = sectionsOnlineSalesChartData(data);

  return (
    <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="w-full flex items-center justify-between text-left mb-2"
        aria-expanded={!collapsed}
        aria-controls="sections-highest-sales-content"
      >
        <h3 className="text-lg font-semibold text-foreground">
          Sections with Highest Sales Online
        </h3>
        {collapsed ? (
          <ChevronRight className="w-5 h-5 text-foreground-muted" />
        ) : (
          <ChevronDown className="w-5 h-5 text-foreground-muted" />
        )}
      </button>
      {!collapsed && (
        <div id="sections-highest-sales-content">
          {chartData.length === 0 ? (
            <p className="text-foreground-muted text-sm py-8 text-center">No section data</p>
          ) : (
            <div className="h-80 w-full min-w-0">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                initialDimension={{ width: 480, height: 320 }}
              >
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--glass-border)"
                  />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fill: "var(--foreground-muted)", fontSize: 12 }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="section_name"
                    width={80}
                    tick={{ fill: "var(--foreground-muted)", fontSize: 12 }}
                    tickFormatter={(v) => (v?.length > 12 ? v.slice(0, 12) + "…" : v)}
                  />
                  <Tooltip
                    separator=""
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--glass-border)",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "var(--foreground)" }}
                    formatter={(value, _name, props) => {
                      const p = props?.payload as SectionSales | undefined;
                      return [
                        `${value ?? 0}% of online sales (${p?.sold_count ?? 0} ticket${(p?.sold_count ?? 0) !== 1 ? "s" : ""})`,
                        "",
                      ];
                    }}
                    labelFormatter={(label) => label}
                  />
                  <Bar dataKey="sold_pct" fill="#22c55e" radius={[0, 4, 4, 0]}>
                    {chartData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={
                          d.section_color && HEX_COLOR_REGEX.test(d.section_color)
                            ? d.section_color
                            : FALLBACK_SECTION_COLOR
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
