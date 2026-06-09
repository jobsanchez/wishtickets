"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Moon, Sun } from "lucide-react";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { Button } from "@/components/ui/button";
import type { DashboardData } from "@/hooks/use-dashboard-data";
import { ReportsContent } from "@/components/admin/reports/reports-content";

interface SharedReportResponse {
  generated_at: string;
  /** null = link does not expire (until revoked in DB). */
  expires_at: string | null;
  report: DashboardData;
}

interface SharedReportClientProps {
  token: string;
}

export function SharedReportClient({ token }: SharedReportClientProps) {
  const [isExpired, setIsExpired] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const { data, isLoading, error } = useQuery<SharedReportResponse>({
    queryKey: ["shared-report", token],
    queryFn: async () => {
      const res = await fetch(`/api/reports/shared/${token}`, { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to load shared report");
      }
      return res.json();
    },
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-theme");
    const previousStoredTheme = localStorage.getItem("theme");

    // Shared reports default to light mode on first load.
    root.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
    setTheme("light");

    return () => {
      if (previousTheme === "light" || previousTheme === "dark") {
        root.setAttribute("data-theme", previousTheme);
      } else {
        root.setAttribute("data-theme", "light");
      }

      if (previousStoredTheme == null) {
        localStorage.removeItem("theme");
      } else {
        localStorage.setItem("theme", previousStoredTheme);
      }
    };
  }, []);

  useEffect(() => {
    const exp = data?.expires_at;
    if (exp == null || exp === "") {
      setIsExpired(false);
      return;
    }

    const updateExpired = () => {
      setIsExpired(Date.now() >= new Date(exp).getTime());
    };

    updateExpired();
    const intervalId = window.setInterval(updateExpired, 1000);
    return () => window.clearInterval(intervalId);
  }, [data?.expires_at]);

  const setReportTheme = (nextTheme: "light" | "dark") => {
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem("theme", nextTheme);
    setTheme(nextTheme);
  };

  const generatedLabel = data?.generated_at
    ? new Date(data.generated_at).toLocaleString("en-PH", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <FloatingProgressBar
        active={isLoading}
        {...FLOATING_PROGRESS_PRESETS.genericLoad}
        message="Loading shared report…"
        subtitle="Sales snapshot"
      />
      {isExpired ? (
        <div className="py-20 text-center text-foreground-muted">This shared report link has expired.</div>
      ) : error ? (
        <div className="py-20 text-center text-foreground-muted">{String(error.message ?? "This shared report is unavailable.")}</div>
      ) : data ? (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
            <div className="inline-flex items-center gap-2 self-center rounded-lg border border-[var(--glass-border)] bg-[var(--surface)]/70 p-1 sm:self-auto">
              <Button
                type="button"
                size="sm"
                variant={theme === "light" ? "default" : "ghost"}
                className="h-8 px-3"
                onClick={() => setReportTheme("light")}
              >
                <Sun className="h-4 w-4" />
                Light
              </Button>
              <Button
                type="button"
                size="sm"
                variant={theme === "dark" ? "default" : "ghost"}
                className="h-8 px-3"
                onClick={() => setReportTheme("dark")}
              >
                <Moon className="h-4 w-4" />
                Dark
              </Button>
            </div>
            <h1 className="text-2xl font-bold text-foreground">{data.report.event.title}</h1>
            <div className="sm:text-right">
              <p className="text-sm text-foreground-muted">Generated: {generatedLabel ?? "N/A"}</p>
            </div>
          </div>
          <ReportsContent data={data.report} mode="public" />
        </div>
      ) : null}
    </div>
  );
}
