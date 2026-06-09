"use client";

import dynamic from "next/dynamic";
import type { DashboardData } from "@/hooks/use-dashboard-data";
import { KPICards } from "@/components/admin/reports/kpi-cards";
import { PriorityGuestsCard } from "@/components/admin/reports/priority-guests-card";
import { EMPTY_PRIORITY_GUESTS_REPORT } from "@/lib/reports/priority-guests-report";
import { SectionRevenueTable } from "@/components/admin/reports/section-revenue-table";
import { VssBreakdownTable } from "@/components/admin/reports/vss-breakdown-table";
import { VssBuyerBreakdown } from "@/components/admin/reports/vss-buyer-breakdown";

function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-white/5 border border-[var(--glass-border)] ${className ?? "h-[280px] w-full"}`}
      aria-hidden
    />
  );
}

const SectionsHorizontalBar = dynamic(
  () =>
    import("@/components/admin/reports/sections-horizontal-bar").then(
      (m) => m.SectionsHorizontalBar
    ),
  { loading: () => <ChartSkeleton className="h-[320px] w-full" />, ssr: false }
);

const DailyOnlineSalesStackedBar = dynamic(
  () =>
    import("@/components/admin/reports/daily-online-sales-stacked-bar").then(
      (m) => m.DailyOnlineSalesStackedBar
    ),
  { loading: () => <ChartSkeleton className="h-[360px] w-full" />, ssr: false }
);

const PaymentDonut = dynamic(
  () =>
    import("@/components/admin/reports/payment-donut").then((m) => m.PaymentDonut),
  { loading: () => <ChartSkeleton className="h-[300px] w-full max-w-md mx-auto" />, ssr: false }
);

const VssStackedBar = dynamic(
  () =>
    import("@/components/admin/reports/vss-stacked-bar").then((m) => m.VssStackedBar),
  { loading: () => <ChartSkeleton className="h-[340px] w-full" />, ssr: false }
);

const EventDaySection = dynamic(
  () =>
    import("@/components/admin/reports/event-day-section").then((m) => m.EventDaySection),
  { loading: () => <ChartSkeleton className="min-h-[200px] w-full" />, ssr: false }
);

interface ReportsContentProps {
  data: DashboardData;
  eventId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  canRelease?: boolean;
  canDeleteAdmissions?: boolean;
  canClearSoldSection?: boolean;
  mode?: "admin" | "public";
}

export function ReportsContent({
  data,
  eventId = null,
  dateFrom = null,
  dateTo = null,
  canRelease = false,
  canDeleteAdmissions = false,
  canClearSoldSection = false,
  mode = "admin",
}: ReportsContentProps) {
  const isPublic = mode === "public";

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <KPICards
          kpis={data.kpis}
          eventId={eventId}
          dateFrom={dateFrom}
          dateTo={dateTo}
          promoBudget={data.promo_budget}
          sectionsSales={data.sections_sales}
          vssBreakdown={data.vss_breakdown}
          canRelease={isPublic ? false : canRelease}
          canDeleteAdmissions={isPublic ? false : canDeleteAdmissions}
          canClearSoldSection={isPublic ? false : canClearSoldSection}
          disableDrilldown={isPublic}
        />
        <PriorityGuestsCard data={data.priority_guests ?? EMPTY_PRIORITY_GUESTS_REPORT} />
      </div>
      <SectionsHorizontalBar data={data.sections_sales} />
      <DailyOnlineSalesStackedBar
        data={
          data.daily_online_sales_by_group ?? { days: [], series: [] }
        }
      />
      <SectionRevenueTable data={data.section_revenue ?? []} />
      <PaymentDonut data={data.payment_methods} />
      <VssStackedBar data={data.vss_breakdown} />
      <VssBreakdownTable data={data.vss_breakdown} />
      {!isPublic && (
        <VssBuyerBreakdown
          eventId={eventId}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      )}
      {data.is_event_day && data.event_day_data && (
        <EventDaySection eventDayData={data.event_day_data} kpis={data.kpis} />
      )}
    </div>
  );
}
