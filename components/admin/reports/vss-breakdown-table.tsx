"use client";

import type { VssBreakdown } from "@/hooks/use-dashboard-data";

interface VssBreakdownTableProps {
  data: VssBreakdown[];
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function VssBreakdownTable({ data }: VssBreakdownTableProps) {
  const totalSeats = data.reduce(
    (sum, row) =>
      sum + (row.available ?? 0) + (row.complimentary ?? 0) + (row.distributed ?? 0) + (row.sold ?? 0),
    0
  );
  const totalAvailable = data.reduce((sum, row) => sum + (row.available ?? 0), 0);
  const totalComplimentary = data.reduce((sum, row) => sum + (row.complimentary ?? 0), 0);
  const totalDistributed = data.reduce((sum, row) => sum + (row.distributed ?? 0), 0);
  const totalSold = data.reduce((sum, row) => sum + (row.sold ?? 0), 0);

  return (
    <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
      <h3 className="text-lg font-semibold text-foreground">VSS Breakdown (List View)</h3>
      <p className="mt-1 text-sm text-foreground-muted">
        Section-level seat allocation details without hover.
      </p>

      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-foreground-muted">No section data</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)] bg-white/5 [html[data-theme=light]_&]:bg-black/[0.03]">
                <th className="px-3 py-3 text-left font-medium text-foreground">Section</th>
                <th className="px-3 py-3 text-right font-medium text-foreground">Total seats</th>
                <th className="px-3 py-3 text-right font-medium text-foreground">Available</th>
                <th className="px-3 py-3 text-right font-medium text-foreground">Complimentary</th>
                <th className="px-3 py-3 text-right font-medium text-foreground">Distributed Tickets</th>
                <th className="px-3 py-3 text-right font-medium text-foreground">Online Sales</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.section_id} className="border-b border-[var(--glass-border)]/60">
                  <td className="px-3 py-2 text-foreground">{row.section_name}</td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {formatNumber((row.available ?? 0) + (row.complimentary ?? 0) + (row.distributed ?? 0) + (row.sold ?? 0))}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">{formatNumber(row.available ?? 0)}</td>
                  <td className="px-3 py-2 text-right text-purple-300 [html[data-theme=light]_&]:text-violet-700">{formatNumber(row.complimentary ?? 0)}</td>
                  <td className="px-3 py-2 text-right text-blue-300 [html[data-theme=light]_&]:text-sky-700">{formatNumber(row.distributed ?? 0)}</td>
                  <td className="px-3 py-2 text-right text-green-300 [html[data-theme=light]_&]:text-emerald-700">{formatNumber(row.sold ?? 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--glass-border)] bg-white/5 [html[data-theme=light]_&]:bg-black/[0.03]">
                <td className="px-3 py-3 font-semibold text-foreground">Total</td>
                <td className="px-3 py-3 text-right font-semibold text-foreground">{formatNumber(totalSeats)}</td>
                <td className="px-3 py-3 text-right font-semibold text-foreground">{formatNumber(totalAvailable)}</td>
                <td className="px-3 py-3 text-right font-semibold text-purple-300 [html[data-theme=light]_&]:text-violet-700">{formatNumber(totalComplimentary)}</td>
                <td className="px-3 py-3 text-right font-semibold text-blue-300 [html[data-theme=light]_&]:text-sky-700">{formatNumber(totalDistributed)}</td>
                <td className="px-3 py-3 text-right font-semibold text-green-300 [html[data-theme=light]_&]:text-emerald-700">{formatNumber(totalSold)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

