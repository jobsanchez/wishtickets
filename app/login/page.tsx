"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { toast } from "@/lib/toast";
import { FloatingProgressBar } from "@/components/ui/floating-progress";
import { RouteLoading } from "@/components/ui/route-loading";
import { hardAuthReset } from "@/lib/supabase/auth-hard-reset";

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams?.get("redirectTo") ?? "/";
  const sessionCleared = searchParams?.get("sessionCleared") === "1";
  const prefillIdentifier = searchParams?.get("identifier") ?? "";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [accountMissingDialogOpen, setAccountMissingDialogOpen] = useState(false);
  const [sessionConflict, setSessionConflict] = useState(false);

  useEffect(() => {
    if (!sessionCleared) return;
    toast.success("Previous session cleared. You can log in now.");
  }, [sessionCleared]);

  useEffect(() => {
    if (!prefillIdentifier) return;
    setIdentifier(prefillIdentifier);
  }, [prefillIdentifier]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    await hardAuthReset(supabase);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    setLoading(false);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (response.status === 409) {
        setSessionConflict(true);
        return;
      }
      if (response.status === 401) {
        setAccountMissingDialogOpen(true);
        return;
      }
      toast.error(payload?.error ?? "Unable to sign in right now.");
      return;
    }
    toast.success("Signed in successfully");
    window.location.assign(redirectTo);
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    const supabase = createClient();
    await hardAuthReset(supabase);
    const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl },
    });
    setLoading(false);
  }

  return (
    <>
      <FloatingProgressBar
        active={loading}
        message="Signing in…"
        subtitle="Wish Tickets Portal"
        detail="Authenticating your account. You may be redirected to Google."
      />
      <AlertDialog
        open={accountMissingDialogOpen}
        onOpenChange={setAccountMissingDialogOpen}
        title="Account not found"
        description={
          <div className="space-y-3">
            <p className="text-foreground-muted">
              We couldn&apos;t find an account for <strong className="text-foreground">{identifier}</strong>.
            </p>
            <p className="text-foreground-muted">
              Please check your email/password, or create a new account to continue.
            </p>
            <Button className="w-full bg-yellow-400 text-black hover:bg-yellow-300" asChild>
              <Link href={`/signup?redirectTo=${encodeURIComponent(redirectTo)}`}>Sign up for free</Link>
            </Button>
          </div>
        }
        buttonLabel="Retry"
      />
      <div className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <div className="glass w-full max-w-md rounded-xl border border-[var(--glass-border)] p-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Sign In</h1>
        <p className="text-foreground-muted text-sm mb-6">
          Sign in to your Wish Tickets Portal account.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="w-full mb-4"
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          <svg className="size-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </Button>
        <p className="text-center text-sm text-foreground-muted mb-4">— or sign in with email or username —</p>
        {sessionConflict ? (
          <div className="mb-4 rounded-lg border border-[var(--wish-orange)]/35 bg-[var(--wish-orange-muted)]/70 px-4 py-3 text-sm text-[var(--wish-orange)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <p className="font-semibold text-foreground">This account is already logged in on another device.</p>
            <Link
              href={`/clear-session?identifier=${encodeURIComponent(identifier)}&redirectTo=${encodeURIComponent(redirectTo)}`}
              className="mt-1 inline-block font-semibold text-[var(--wish-orange)] transition-colors hover:text-[var(--wish-orange-hover)] hover:underline"
            >
              Clear my session to log in here →
            </Link>
          </div>
        ) : null}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="identifier">Email or username</Label>
            <Input
              id="identifier"
              type="text"
              placeholder="you@example.com or username"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                setSessionConflict(false);
              }}
              required
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-[var(--wish-orange)] hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-foreground-muted">
          Don&apos;t have an account?{" "}
          <Link href={`/signup?redirectTo=${encodeURIComponent(redirectTo)}`} className="text-[var(--wish-orange)] hover:underline">
            Sign up for free
          </Link>
        </p>
      </div>
    </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <RouteLoading
          variant="compact"
          message="Loading…"
          subtitle="Preparing sign in."
          className="min-h-[calc(100vh-4rem)]"
        />
      }
    >
      <LoginForm />
    </Suspense>
  );
}
