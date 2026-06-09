"use client";

interface OccupancyGaugeProps {
  value: number; // 0–100
  label: string;
}

function getGaugeColor(value: number): string {
  if (value < 50) return "#ef4444";
  if (value < 75) return "#eab308";
  return "#22c55e";
}

export function OccupancyGauge({ value, label }: OccupancyGaugeProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const color = getGaugeColor(clamped);

  return (
    <div className="glass rounded-xl border border-[var(--glass-border)] p-6 flex flex-col items-center">
      <h3 className="text-lg font-semibold text-foreground mb-4">{label}</h3>
      <div className="relative w-48 h-24">
        <svg viewBox="0 0 200 100" className="w-full h-full">
          {/* Background arc */}
          <path
            d="M 20 90 A 80 80 0 0 1 180 90"
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Value arc */}
          <path
            d="M 20 90 A 80 80 0 0 1 180 90"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${(clamped / 100) * 251.2} 251.2`}
          />
        </svg>
        <div className="absolute inset-0 flex items-end justify-center pb-2">
          <span className="text-3xl font-bold text-foreground">{clamped.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}
