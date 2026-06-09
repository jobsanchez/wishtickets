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
  Legend,
} from "recharts";
import type { DailyOnlineSalesByGroup } from "@/lib/reports/daily-online-sales-by-group";

interface DailyOnlineSalesStackedBarProps {
  data: DailyOnlineSalesByGroup;
}

const FALLBACK_COLORS = [
  "#e63946",
  "#a65111",
  "#ffcc33",
  "#8b9dc3",
  "#76c72d",
  "#6b7280",
];
const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

function seriesColor(color: string | null, index: number): string {
  if (color && HEX_COLOR_REGEX.test(color)) return color;
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

export function DailyOnlineSalesStackedBar({ data }: DailyOnlineSalesStackedBarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { days, series } = data;
  const hasData = days.length > 0 && series.length > 0;

  return (
    <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="w-full flex items-center justify-between text-left mb-2"
        aria-expanded={!collapsed}
        aria-controls="daily-online-sales-by-group-content"
      >
        <div>
          <h3 className="text-lg font-semibold text-foreground">Daily Online Ticket Sales by Group</h3>
          <p className="mt-0.5 text-xs text-foreground-muted">
            Tickets sold online per day, stacked by section group.
          </p>
        </div>
        {collapsed ? (
          <ChevronRight className="w-5 h-5 text-foreground-muted shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-foreground-muted shrink-0" />
        )}
      </button>
      {!collapsed && (
        <div id="daily-online-sales-by-group-content">
          {!hasData ? (
            <p className="text-foreground-muted text-sm py-8 text-center">
              No online ticket sales in this date range
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="h-80 w-full min-w-0">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  initialDimension={{ width: 480, height: 320 }}
                >
                  <BarChart data={days} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                    <XAxis
                      dataKey="date_label"
                      tick={{ fill: "var(--foreground-muted)", fontSize: 11 }}
                      interval={days.length > 14 ? Math.floor(days.length / 10) : 0}
                      angle={days.length > 10 ? -35 : 0}
                      textAnchor={days.length > 10 ? "end" : "middle"}
                      height={days.length > 10 ? 56 : 36}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "var(--foreground-muted)", fontSize: 12 }}
                      width={44}
                      label={{
                        value: "Tickets",
                        angle: -90,
                        position: "insideLeft",
                        fill: "var(--foreground-muted)",
                        fontSize: 11,
                        dx: -4,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface)",
                        border: "1px solid var(--glass-border)",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "var(--foreground)" }}
                      formatter={(value, name) => {
                        const s = series.find((item) => item.key === name);
                        return [value ?? 0, s?.name ?? String(name)];
                      }}
                      labelFormatter={(_, payload) => {
                        const row = payload?.[0]?.payload as { date_label?: string } | undefined;
                        return row?.date_label ?? "";
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12, color: "var(--foreground-muted)" }}
                      formatter={(value) => {
                        const s = series.find((item) => item.key === value);
                        return s?.name ?? value;
                      }}
                    />
                    {series.map((s, index) => (
                      <Bar
                        key={s.key}
                        dataKey={s.key}
                        name={s.name}
                        stackId="daily"
                        fill={seriesColor(s.color, index)}
                        radius={
                          index === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
                        }
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
