import type { ReactNode } from "react";

export type RouteLoadingVariant = "page" | "fullscreen" | "compact" | "panel";

/** Orange “Loading ” + rest of line styling */
export function LoadingTitle({
  message,
  compact = false,
}: {
  message: string;
  compact?: boolean;
}) {
  const titleClass = compact
    ? "text-base sm:text-lg font-bold font-[var(--font-display)] uppercase tracking-[0.12em] leading-snug"
    : "text-lg sm:text-xl font-bold font-[var(--font-display)] uppercase tracking-[0.14em] leading-snug";
  const match = message.match(/^(Loading\s+)(.+)$/i);
  if (match) {
    return (
      <p className={titleClass}>
        <span className="text-[var(--wish-orange)]">{match[1]}</span>
        <span className="text-foreground">{match[2]}</span>
      </p>
    );
  }
  return (
    <p className={`${titleClass} text-foreground`}>{message}</p>
  );
}

export function WishLoadingSpinner({ size = "md" }: { size?: "md" | "sm" }) {
  const spinnerClass =
    size === "sm" ? "route-loading-spinner-sm shrink-0" : "route-loading-spinner shrink-0";
  return (
    <div className={spinnerClass} aria-hidden>
      <span className="route-loading-loader-dot" />
      <span className="route-loading-loader-dot" />
      <span className="route-loading-loader-dot" />
      <span className="route-loading-loader-dot" />
      <span className="route-loading-loader-dot" />
    </div>
  );
}

export function WishLoadingDots() {
  return (
    <p className="flex items-center justify-center pt-1" aria-hidden>
      <span className="route-loading-dots">
        <span className="route-loading-loader-dot" />
        <span className="route-loading-loader-dot" />
        <span className="route-loading-loader-dot" />
        <span className="route-loading-loader-dot" />
        <span className="route-loading-loader-dot" />
      </span>
    </p>
  );
}

export function WishLoadingTrack({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative w-full h-1.5 overflow-hidden rounded-full bg-white/10 ${className}`}
    >
      <div
        className="absolute inset-0 route-loading-shimmer rounded-full pointer-events-none opacity-70"
        aria-hidden
      />
      <div
        className="absolute inset-y-0 left-0 w-[42%] rounded-full bg-gradient-to-r from-[var(--wish-orange)] via-[var(--wish-orange-hover)] to-[var(--wish-purple)] shadow-[0_0_14px_rgba(255,80,35,0.35)] animate-floating-progress"
        aria-hidden
      />
    </div>
  );
}

const radialWashStyle = {
  background:
    "radial-gradient(ellipse 80% 60% at 50% -20%, var(--wish-orange), transparent), radial-gradient(ellipse 60% 50% at 100% 100%, var(--wish-purple), transparent)",
} as const;

export function WishLoadingGlassCard({
  children,
  compact = false,
  glow = true,
  className = "",
}: {
  children: ReactNode;
  compact?: boolean;
  glow?: boolean;
  className?: string;
}) {
  const pad = compact ? "px-6 py-7" : "px-8 py-10";
  return (
    <div
      className={`${glow ? "route-loading-card-glow " : ""}glass rounded-2xl border border-[var(--glass-border)] ${pad} max-w-md w-full text-center relative overflow-hidden ${className}`}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.07] z-[1]"
        aria-hidden
        style={radialWashStyle}
      />
      <div className="relative z-[2]">{children}</div>
    </div>
  );
}

/** Core column: spinner, title, subtitle */
export function WishLoadingBody({
  message,
  subtitle,
  compact = false,
}: {
  message: string;
  subtitle?: string;
  compact?: boolean;
}) {
  const gap = compact ? "gap-4" : "gap-6";
  return (
    <div className={`relative flex flex-col items-center ${gap}`}>
      <WishLoadingSpinner size={compact ? "sm" : "md"} />
      <div className="space-y-2">
        <LoadingTitle message={message} compact={compact} />
        {subtitle ? (
          <p
            className={`text-foreground-muted leading-relaxed max-w-[30ch] mx-auto ${
              compact ? "text-xs sm:text-sm" : "text-sm"
            }`}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface RouteLoadingProps {
  message?: string;
  subtitle?: string;
  /** Layout: page (default), fullscreen (root), compact (Suspense/admin), panel (inner card only) */
  variant?: RouteLoadingVariant;
  className?: string;
  /** Optional block above hero copy (e.g. event hero placeholder) — only used with `variant="fullscreen"`. */
  fullscreenLead?: ReactNode;
  /** Overrides default `aria-label` on fullscreen variant (e.g. event detail loading). */
  fullscreenAriaLabel?: string;
}

export function RouteLoading({
  message = "Loading…",
  subtitle,
  variant = "page",
  className = "",
  fullscreenLead,
  fullscreenAriaLabel,
}: RouteLoadingProps) {
  const inner = (
    <WishLoadingGlassCard compact={variant === "compact" || variant === "panel"}>
      <WishLoadingBody
        message={message}
        subtitle={subtitle}
        compact={variant === "compact" || variant === "panel"}
      />
    </WishLoadingGlassCard>
  );

  if (variant === "panel") {
    return (
      <div
        className={className}
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        {inner}
      </div>
    );
  }

  if (variant === "fullscreen") {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[var(--background)] via-[var(--surface)] to-[var(--background)] text-foreground px-4 py-10 gap-8 ${className}`}
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label={fullscreenAriaLabel ?? "Loading Wish Tickets Portal"}
      >
        {fullscreenLead ? (
          <div className="w-full max-w-5xl shrink-0">{fullscreenLead}</div>
        ) : null}
        <div className="text-center space-y-4 mb-8 max-w-lg">
          <p className="text-sm tracking-[0.35em] text-foreground-muted uppercase mb-2">
            Loading
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold font-[var(--font-display)] uppercase tracking-wide">
            <span className="text-[var(--wish-orange)]">Wish</span>{" "}
            <span className="text-foreground">Tickets Portal</span>
          </h1>
          <p className="text-sm text-foreground-muted max-w-md mx-auto">
            Preparing events, seats, and your personalized experience…
          </p>
        </div>
        <div className="w-full max-w-md">{inner}</div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div
        className={`flex flex-col items-center justify-center py-8 px-4 ${className}`}
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="w-full max-w-sm">{inner}</div>
      </div>
    );
  }

  return (
    <div
      className={`container mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[45vh] ${className}`}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      {inner}
    </div>
  );
}
