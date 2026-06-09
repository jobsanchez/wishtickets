"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { RouteLoading } from "@/components/ui/route-loading";
import { AdmissionsConnectionIndicator } from "@/components/admissions-connection-indicator";

export default function AdmissionsLoginPage() {
  const router = useRouter();
  const [admissionsCode, setAdmissionsCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    titleClassName?: string;
  }>({ open: false, title: "", description: "" });

  useEffect(() => {
    fetch("/api/admissions/clear-session", { method: "POST" }).finally(() =>
      setReady(true)
    );
  }, []);

  async function handleValidateCode(code: string) {
    if (!code.trim()) {
      setAlertDialog({
        open: true,
        title: "Enter admissions code",
        description: "Please enter the admissions code for your event.",
      });
      return;
    }
    setCodeLoading(true);
    try {
      const res = await fetch("/api/admissions/validate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAlertDialog({
          open: true,
          title: "Invalid admissions code",
          description: data.error ?? "The code you entered is not valid. Please check and try again.",
          titleClassName: "text-xl text-red-500",
        });
        setCodeLoading(false);
        return;
      }
      router.push("/admissions/scan");
      return;
    } catch {
      setAlertDialog({
        open: true,
        title: "Request failed",
        description: "Could not validate the code. Please try again.",
        titleClassName: "text-xl text-red-500",
      });
    }
    setCodeLoading(false);
  }

  if (!ready) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading…"
        subtitle="Preparing admissions login."
        className="container mx-auto max-w-md px-4"
      />
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-md">
      <FloatingProgressBar
        active={codeLoading}
        {...FLOATING_PROGRESS_PRESETS.genericLoad}
        message="Checking admissions code"
        subtitle="Admissions staff login"
        detail="Verifying your code with the server. Keep this tab open."
      />
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <h1 className="text-2xl font-bold text-foreground">Admissions Staff Login</h1>
        <AdmissionsConnectionIndicator className="shrink-0" />
      </div>
      <p className="text-foreground-muted text-sm mb-6">
        Enter the admissions code for your event to scan tickets.
      </p>
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6 space-y-4">
        <div>
          <Label htmlFor="admissions-code">Admissions code</Label>
          <Input
            id="admissions-code"
            value={admissionsCode}
            onChange={(e) => setAdmissionsCode(e.target.value)}
            placeholder="e.g. ABC12XYZ"
            onKeyDown={(e) => e.key === "Enter" && handleValidateCode(admissionsCode)}
            disabled={codeLoading}
          />
        </div>
        <Button
          className="w-full bg-[var(--wish-orange)] hover:bg-[var(--wish-orange-hover)]"
          onClick={() => handleValidateCode(admissionsCode)}
          disabled={codeLoading || !admissionsCode.trim()}
        >
          {codeLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Validating…
            </>
          ) : (
            "Continue"
          )}
        </Button>
      </div>
      <NavButtonWithProgress
        href="/"
        variant="ghost"
        className="mt-4"
        loadingMessage="Loading…"
      >
        Back to home
      </NavButtonWithProgress>
      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog((d) => ({ ...d, open }))}
        title={alertDialog.title}
        description={alertDialog.description}
        titleClassName={alertDialog.titleClassName}
      />
    </div>
  );
}
