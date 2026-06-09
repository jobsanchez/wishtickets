"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";

export default function ClearSessionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams?.get("redirectTo") ?? "/";
  const initialIdentifier = searchParams?.get("identifier") ?? "";
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(
    () => identifier.trim().length > 0 && password.length > 0 && !loading,
    [identifier, password, loading]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      const response = await fetch("/api/auth/clear-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(payload?.error ?? "Unable to clear your previous session.");
        setLoading(false);
        return;
      }

      toast.success("Previous session cleared.");
      router.push(
        `/login?redirectTo=${encodeURIComponent(redirectTo)}&sessionCleared=1&identifier=${encodeURIComponent(
          identifier.trim()
        )}`
      );
      return;
    } catch {
      toast.error("Unable to clear your previous session.");
    }
    setLoading(false);
  }

  return (
    <div className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-8">
      <FloatingProgressBar
        active={loading}
        {...FLOATING_PROGRESS_PRESETS.genericSave}
        message="Clearing previous session"
        subtitle="Single-session account security"
        detail="Verifying your credentials and ending the active login on another device."
      />
      <div className="w-full max-w-xl rounded-3xl border border-[var(--glass-border)] bg-card p-8 shadow-xl md:p-10">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-5 inline-flex size-12 items-center justify-center rounded-xl border border-[var(--wish-orange)]/35 bg-[var(--wish-orange)]/10 text-[var(--wish-orange)]">
            <Layers className="size-5" aria-hidden />
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">Clear My Sessions</h1>
          <p className="mt-2 text-xl font-medium text-[var(--wish-orange)]">
            Already logged in elsewhere? Clear your previous session.
          </p>
        </div>

        <div className="mb-6 rounded-xl border border-[#e6cfb7] bg-[#f7efe5] px-5 py-4 text-center text-[#3a2f28]">
          Only one active session is allowed per account. Enter your credentials below to clear your previous
          session and free up your account.
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="identifier">Username or Email</Label>
            <Input
              id="identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <Button type="submit" className="h-12 w-full text-lg" disabled={!canSubmit}>
            Clear All Sessions
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Link href={`/login?redirectTo=${encodeURIComponent(redirectTo)}`} className="text-[var(--wish-orange)] hover:underline">
            ← Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
