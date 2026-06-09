"use client";

import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";

export function SalesAnalytics() {
  return (
    <div className="space-y-6">
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
        <h3 className="text-lg font-semibold text-foreground mb-2">Sales & Reports</h3>
        <p className="text-sm text-foreground-muted mb-4">
          View confirmed bookings, revenue, and export data.
        </p>
        <NavButtonWithProgress
          href="/admin/reports"
          loadingMessage="Loading reports…"
        >
          Open full reports
        </NavButtonWithProgress>
      </div>
    </div>
  );
}
