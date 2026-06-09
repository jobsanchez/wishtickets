"use client";

import { getContrastTextColor } from "@/lib/utils";

export type SeatStatus = "available" | "reserved" | "sold" | "hold";

export interface Seat {
  id: string;
  event_section_id: string;
  row_label: string;
  seat_number: string;
  status?: SeatStatus;
}

interface SeatGridProps {
  sectionName: string;
  seats: Seat[];
  sectionColor?: string;
  /** When "right-to-left", columns display 10, 9, 8... 1 (left to right) */
  columnDirection?: "left-to-right" | "right-to-left";
}

/** Sort row labels: A, B, ..., Z, AA, AB, ... */
function sortRowLabels(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a.localeCompare(b);
}

/** Sort seat numbers numerically when possible, else lexicographically */
function sortSeatNumbers(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.localeCompare(b);
}

export function SeatGrid({
  sectionName,
  seats,
  sectionColor = "#0d9488",
  columnDirection = "left-to-right",
}: SeatGridProps) {
  if (seats.length === 0) return null;

  const byRow = new Map<string, Seat[]>();
  for (const seat of seats) {
    const row = String(seat.row_label ?? "").trim();
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row)!.push(seat);
  }

  const rows = Array.from(byRow.keys()).sort(sortRowLabels);
  for (const row of rows) {
    byRow.get(row)!.sort((a, b) => sortSeatNumbers(String(a.seat_number), String(b.seat_number)));
  }

  const allColumns = new Set<string>();
  for (const seat of seats) allColumns.add(String(seat.seat_number ?? ""));
  const sortedColumns = Array.from(allColumns).sort(sortSeatNumbers);
  const columns =
    columnDirection === "right-to-left" ? [...sortedColumns].reverse() : sortedColumns;

  const seatMap = new Map<string, Seat>();
  for (const seat of seats) {
    const key = `${String(seat.row_label ?? "").trim()}-${String(seat.seat_number ?? "")}`;
    seatMap.set(key, seat);
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-4 mb-2 flex-wrap">
        <h4 className="text-sm font-medium text-foreground-muted">
          Section: {sectionName}
        </h4>
        <div className="flex items-center gap-4 text-[10px] text-foreground-muted">
          <span>
            <span className="inline-block w-3 h-3 rounded mr-1 align-middle" style={{ backgroundColor: `${sectionColor}cc` }} />
            Available
          </span>
          <span>
            <span className="inline-block w-3 h-3 rounded mr-1 align-middle bg-amber-500/80" />
            Reserved
          </span>
          <span>
            <span className="inline-block w-3 h-3 rounded mr-1 align-middle bg-neutral-600/80" />
            Sold
          </span>
          <span>
            <span className="inline-block w-3 h-3 rounded mr-1 align-middle bg-black" />
            Seat Hold
          </span>
        </div>
      </div>
      <div className="overflow-x-auto overflow-y-auto max-h-[320px] rounded-lg border border-[var(--glass-border)] p-3 bg-white/5">
        <div className="inline-block min-w-0">
          <div className="flex gap-1 mb-1">
            <div className="w-7 shrink-0" aria-hidden="true" />
            {columns.map((col) => (
              <div
                key={col}
                className="w-9 h-7 flex items-center justify-center text-xs text-foreground-muted font-medium"
              >
                {col}
              </div>
            ))}
          </div>
          {rows.map((rowLabel) => (
            <div key={rowLabel} className="flex gap-1 items-center mb-1">
              <div className="w-7 h-9 flex items-center justify-center text-xs text-foreground-muted font-medium shrink-0">
                {rowLabel}
              </div>
              <div className="flex gap-1">
                {columns.map((col) => {
                  const key = `${rowLabel}-${String(col)}`;
                  const seat = seatMap.get(key);
                  const label = seat
                    ? `${seat.row_label}${seat.seat_number}`
                    : null;
                  const status = seat?.status ?? "available";
                  const isEmpty = !label;
                  let seatStyle: React.CSSProperties | undefined;
                  if (!isEmpty) {
                    if (status === "sold") {
                      const bg = "rgba(82, 82, 82, 0.8)";
                      seatStyle = {
                        backgroundColor: bg,
                        borderColor: "rgba(115, 115, 115, 0.6)",
                        color: getContrastTextColor(bg),
                      };
                    } else if (status === "reserved") {
                      const bg = "rgba(245, 158, 11, 0.8)";
                      seatStyle = {
                        backgroundColor: bg,
                        borderColor: "rgba(251, 191, 36, 0.6)",
                        color: getContrastTextColor(bg),
                      };
                    } else if (status === "hold") {
                      const bg = "rgba(0, 0, 0, 0.95)";
                      seatStyle = {
                        backgroundColor: bg,
                        borderColor: "rgba(38, 38, 38, 0.9)",
                        color: "#ffffff",
                      };
                    } else {
                      const bg = `${sectionColor}80`;
                      seatStyle = {
                        backgroundColor: bg,
                        borderColor: `${sectionColor}99`,
                        color: getContrastTextColor(bg),
                      };
                    }
                  }
                  return (
                    <div
                      key={`${rowLabel}-${col}`}
                      className={`w-9 h-9 flex items-center justify-center text-xs font-medium rounded border shrink-0 ${
                        isEmpty ? "border-white/5 bg-white/5" : "border-[var(--glass-border)]"
                      }`}
                      style={seatStyle}
                      title={!isEmpty ? `${label} (${status})` : undefined}
                    >
                      {label ?? ""}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
