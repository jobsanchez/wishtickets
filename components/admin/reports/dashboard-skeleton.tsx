"use client";

export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="glass rounded-xl border border-[var(--glass-border)] p-6 animate-pulse"
          >
            <div className="h-4 bg-white/10 rounded w-24 mb-3" />
            <div className="h-8 bg-white/10 rounded w-16" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="glass rounded-xl border border-[var(--glass-border)] p-6 h-80 animate-pulse">
          <div className="h-5 bg-white/10 rounded w-48 mb-4" />
          <div className="space-y-3">
            {[68, 89, 84, 79, 67].map((pct, i) => (
              <div key={i} className="h-6 bg-white/10 rounded" style={{ width: `${pct}%` }} />
            ))}
          </div>
        </div>
        <div className="glass rounded-xl border border-[var(--glass-border)] p-6 h-80 flex items-center justify-center animate-pulse">
          <div className="h-32 w-32 rounded-full bg-white/10" />
        </div>
      </div>
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6 h-80 animate-pulse">
        <div className="h-5 bg-white/10 rounded w-40 mb-4" />
        <div className="h-56 bg-white/10 rounded" />
      </div>
    </div>
  );
}
