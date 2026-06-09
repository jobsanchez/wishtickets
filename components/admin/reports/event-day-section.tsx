"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { OccupancyGauge } from "./occupancy-gauge";
import type { EventDayData } from "@/hooks/use-dashboard-data";
import type { DashboardKPIs } from "@/hooks/use-dashboard-data";

interface EventDaySectionProps {
  eventDayData: EventDayData;
  kpis: DashboardKPIs;
}

const SOLD_COLOR = "#22c55e";
const DISTRIBUTED_COLOR = "#3b82f6";
const COMPLIMENTARY_COLOR = "#a855f7";
const ADMITTED_COLOR = "#FF6B00";

export function EventDaySection({ eventDayData, kpis }: EventDaySectionProps) {
  const chartData = [
    {
      category: "SOLD",
      total: kpis.total_sold,
      admitted: eventDayData.sold_admitted,
      fill: SOLD_COLOR,
    },
    {
      category: "DISTRIBUTED",
      total: kpis.distributed,
      admitted: eventDayData.distributed_admitted,
      fill: DISTRIBUTED_COLOR,
    },
    {
      category: "COMPLIMENTARY",
      total: kpis.complimentary,
      admitted: eventDayData.complimentary_admitted,
      fill: COMPLIMENTARY_COLOR,
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-foreground">Event Day Monitoring</h2>
      <div className="grid gap-6 md:grid-cols-2">
        <OccupancyGauge
          value={eventDayData.checkin_rate}
          label="Check-in Rate"
        />
        <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Sold vs Distributed vs Complimentary vs Admitted
          </h3>
          {chartData.every((d) => d.total === 0) ? (
            <p className="text-foreground-muted text-sm py-8 text-center">No data</p>
          ) : (
            <div className="h-64 w-full min-w-0">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                initialDimension={{ width: 480, height: 256 }}
              >
                <BarChart
                  data={chartData}
                  margin={{ top: 20, right: 20, left: 20, bottom: 72 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis
                    dataKey="category"
                    tick={{ fill: "#a3a3a3", fontSize: 12 }}
                  />
                  <YAxis tick={{ fill: "#a3a3a3", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(23,23,23,0.95)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    align="center"
                    iconType="square"
                    iconSize={10}
                    wrapperStyle={{
                      fontSize: "12px",
                      lineHeight: "1.5",
                      paddingTop: 16,
                      width: "100%",
                    }}
                    formatter={(value) => <span className="text-foreground-muted">{value}</span>}
                  />
                  <Bar dataKey="total" name="Total" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                  <Bar dataKey="admitted" fill={ADMITTED_COLOR} name="Admitted" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
