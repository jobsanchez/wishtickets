"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { FloatingProgressBar } from "@/components/ui/floating-progress";
import { RouteLoading } from "@/components/ui/route-loading";

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [accountMissingDialogOpen, setAccountMissingDialogOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSent(false);
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) {
        const lowered = error.message.toLowerCase();
        if (
          lowered.includes("user not found") ||
          lowered.includes("account not found") ||
          lowered.includes("email not found")
        ) {
          setAccountMissingDialogOpen(true);
          return;
        }
        throw error;
      }
      setSent(true);
      toast.success("Check your email for the reset link.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <FloatingProgressBar
        active={loading}
        message="Sending reset link"
        subtitle="Wish Tickets Portal"
        detail="Requesting a password reset email from our auth provider."
      />
      <AlertDialog
        open={accountMissingDialogOpen}
        onOpenChange={setAccountMissingDialogOpen}
        title="Account not found"
        description={
          <div className="space-y-3">
            <p className="text-foreground-muted">
              We couldn&apos;t find an account for <strong className="text-foreground">{email}</strong>.
            </p>
            <p className="text-foreground-muted">
              You can create a new account and continue booking tickets.
            </p>
            <Button className="w-full" asChild>
              <Link href="/signup">Sign up for free</Link>
            </Button>
          </div>
        }
        buttonLabel="Close"
      />
      <div className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
        <div className="glass w-full max-w-md rounded-xl border border-[var(--glass-border)] p-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Forgot password</h1>
          <p className="text-foreground-muted text-sm mb-6">
            Enter your email and we&apos;ll send you a link to reset your password.
          </p>
          {sent ? (
            <div className="space-y-4">
              <p className="text-foreground-muted text-sm">
                If an account exists for <strong className="text-foreground">{email}</strong>, you
                will receive an email with a link to reset your password.
              </p>
              <p className="text-foreground-muted text-sm">
                Check your spam folder if you don&apos;t see it.
              </p>
              <Button variant="secondary" className="w-full" asChild>
                <Link href="/login">Back to sign in</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending..." : "Send reset link"}
              </Button>
            </form>
          )}
          <p className="mt-6 text-center text-sm text-foreground-muted">
            Remember your password?{" "}
            <Link href="/login" className="text-[var(--wish-orange)] hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <RouteLoading
          variant="compact"
          message="Loading…"
          subtitle="Preparing password recovery."
          className="min-h-[calc(100vh-4rem)]"
        />
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}
