"use client";

import { useState, Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { FloatingProgressBar } from "@/components/ui/floating-progress";
import { RouteLoading } from "@/components/ui/route-loading";

function ResetPasswordForm() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error?.message?.includes("Invalid Refresh Token")) {
        await supabase.auth.signOut({ scope: "local" });
      }
      setHasSession(!!session);
      setCheckingAuth(false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated. Signing you in...");
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading…"
        subtitle="Verifying your reset link."
        className="min-h-[calc(100vh-4rem)]"
      />
    );
  }

  if (!hasSession) {
    return (
      <div className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
        <div className="glass w-full max-w-md rounded-xl border border-[var(--glass-border)] p-8 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Invalid or expired link</h1>
          <p className="text-foreground-muted text-sm mb-6">
            This reset link may have expired. Request a new one below.
          </p>
          <Button asChild>
            <Link href="/forgot-password">Request new reset link</Link>
          </Button>
          <p className="mt-6 text-center text-sm text-foreground-muted">
            <Link href="/login" className="text-[var(--wish-orange)] hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <FloatingProgressBar
        active={loading}
        message="Updating password…"
        subtitle="Your account"
        detail="Saving your new password with our auth provider."
      />
      <div className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
        <div className="glass w-full max-w-md rounded-xl border border-[var(--glass-border)] p-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Reset password</h1>
          <p className="text-foreground-muted text-sm mb-6">
            Enter your new password below.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Updating..." : "Update password"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-foreground-muted">
            <Link href="/login" className="text-[var(--wish-orange)] hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <RouteLoading
          variant="compact"
          message="Loading…"
          subtitle="Opening password reset."
          className="min-h-[calc(100vh-4rem)]"
        />
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
