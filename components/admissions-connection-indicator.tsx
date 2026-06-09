"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

type NetworkInformationLite = EventTarget & {
  effectiveType?: string;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
};

function getNetworkConnection(): NetworkInformationLite | null {
  if (typeof navigator === "undefined") return null;
  const c = (navigator as Navigator & { connection?: NetworkInformationLite }).connection;
  return c ?? null;
}

type Quality = "checking" | "offline" | "stable" | "fair" | "weak";

const PING_INTERVAL_MS = 60_000;
const PING_TIMEOUT_MS = 12_000;

function qualityFromSignals(
  online: boolean,
  latencyMs: number | null,
  pingAttempted: boolean,
  effectiveType?: string
): Quality {
  if (!online) return "offline";
  if (!pingAttempted && latencyMs === null) {
    if (effectiveType === "slow-2g" || effectiveType === "2g") return "weak";
    return "checking";
  }
  if (latencyMs === null) return "weak";
  const slowLabel = effectiveType === "slow-2g" || effectiveType === "2g";
  if (latencyMs > 2200 || (slowLabel && latencyMs > 1000)) return "weak";
  if (latencyMs > 800 || effectiveType === "3g") return "fair";
  return "stable";
}

function labelFor(q: Quality): string {
  switch (q) {
    case "offline":
      return "Offline";
    case "checking":
      return "Checking…";
    case "stable":
      return "Stable";
    case "fair":
      return "Fair";
    case "weak":
      return "Weak";
  }
}

export function AdmissionsConnectionIndicator({
  className,
  offlinePackOnDevice = false,
  pendingSync = 0,
}: {
  className?: string;
  /** There is a downloaded offline pack for the current event on this device. */
  offlinePackOnDevice?: boolean;
  /** Unsynced offline operations in the outbox. */
  pendingSync?: number;
}) {
  const [online, setOnline] = useState(true);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [pingAttempted, setPingAttempted] = useState(false);
  const [effectiveType, setEffectiveType] = useState<string | undefined>(undefined);

  const runPing = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setLatencyMs(null);
      setPingAttempted(true);
      return;
    }
    const t0 = performance.now();
    try {
      const ctrl = new AbortController();
      const to = window.setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
      const res = await fetch("/api/ping", { cache: "no-store", signal: ctrl.signal });
      window.clearTimeout(to);
      if (!res.ok) {
        setLatencyMs(null);
      } else {
        setLatencyMs(Math.round(performance.now() - t0));
      }
    } catch {
      setLatencyMs(null);
    } finally {
      setPingAttempted(true);
    }
  }, []);

  useEffect(() => {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const on = () => {
      setOnline(true);
      void runPing();
    };
    const off = () => {
      setOnline(false);
      setLatencyMs(null);
      setPingAttempted(true);
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);

    const conn = getNetworkConnection();
    const syncConn = () => setEffectiveType(conn?.effectiveType);
    syncConn();
    conn?.addEventListener("change", syncConn);

    void runPing();
    const id = window.setInterval(() => void runPing(), PING_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      conn?.removeEventListener("change", syncConn);
      window.clearInterval(id);
    };
  }, [runPing]);

  const quality = qualityFromSignals(online, latencyMs, pingAttempted, effectiveType);

  const titleParts: string[] = [labelFor(quality)];
  if (latencyMs != null) titleParts.push(`server ~${latencyMs} ms`);
  else if (pingAttempted && online) titleParts.push("server unreachable or timed out");
  if (effectiveType) titleParts.push(`device: ${effectiveType}`);
  if (offlinePackOnDevice) titleParts.push("local offline pack on device");
  if (pendingSync > 0) titleParts.push(`${pendingSync} scan(s) pending upload`);
  const title = titleParts.join(" · ");

  return (
    <div
      role="status"
      aria-live="polite"
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums",
        "border-[var(--glass-border)] bg-[var(--surface)]/80 text-foreground",
        quality === "stable" && "border-emerald-500/40 text-emerald-400",
        quality === "fair" && "border-amber-500/40 text-amber-400",
        (quality === "weak" || quality === "offline") && "border-red-500/35 text-red-400",
        quality === "checking" && "text-foreground-muted",
        className
      )}
    >
      {quality === "offline" ? (
        <WifiOff className="size-3.5 shrink-0" aria-hidden />
      ) : quality === "checking" ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
      ) : (
        <Wifi className="size-3.5 shrink-0" aria-hidden />
      )}
      <span>Link: {labelFor(quality)}</span>
      {latencyMs != null && quality !== "checking" ? (
        <span className="text-foreground-muted font-normal">~{latencyMs}ms</span>
      ) : null}
      {offlinePackOnDevice ? (
        <span className="text-foreground-muted font-normal hidden sm:inline">· local pack</span>
      ) : null}
      {pendingSync > 0 ? (
        <span className="text-amber-400 font-normal">· {pendingSync} pending</span>
      ) : null}
    </div>
  );
}
