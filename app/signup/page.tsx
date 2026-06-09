"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { FloatingProgressBar } from "@/components/ui/floating-progress";
import { RouteLoading } from "@/components/ui/route-loading";
import { hardAuthReset } from "@/lib/supabase/auth-hard-reset";
import { validateUsername } from "@/lib/auth/username";

const PRIVACY_NOTICE = `The information collected through this form will be used solely for the purpose of processing and verifying your ticket purchase through the Wish Tickets Portal, including payment confirmation, ticket issuance, and event entry validation.

All submitted details, such as your name, email address, mobile number, and proof of payment (if applicable), will be kept secure and will only be accessed by authorized Wish 107.5 personnel and the Wish Tickets Portal administration team.

Your information may also be used to send important updates regarding your ticket purchase, event details, or admission instructions.

After the event, the information will be securely archived for documentation, reporting, and auditing purposes related to Wish 107.5 ticketing transactions.`;

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams?.get("redirectTo") ?? "";
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [marketingEmailOptIn, setMarketingEmailOptIn] = useState(true);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alreadyRegisteredDialogOpen, setAlreadyRegisteredDialogOpen] = useState(false);
  const [alreadyRegisteredEmail, setAlreadyRegisteredEmail] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedConfirmEmail = confirmEmail.trim().toLowerCase();
    const normalizedFullName = fullName.trim();

    if (!agreedToPrivacy) {
      toast.error("Please agree to the Privacy Notice to continue.");
      return;
    }
    if (normalizedEmail.length === 0 || normalizedConfirmEmail.length === 0) {
      toast.error("Please enter and confirm your email address.");
      return;
    }
    if (normalizedEmail !== normalizedConfirmEmail) {
      toast.error("Emails do not match. Please check and try again.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match. Please check and try again.");
      return;
    }
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.ok || !usernameValidation.normalized) {
      toast.error(usernameValidation.message ?? "Please provide a valid username.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    await hardAuthReset(supabase);
    const { error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: normalizedFullName,
          marketing_email_opt_in: marketingEmailOptIn,
          username: usernameValidation.normalized,
        },
      },
    });
    if (error) {
      setLoading(false);
      const message = error.message?.toLowerCase() ?? "";
      if (message.includes("already registered")) {
        setAlreadyRegisteredEmail(normalizedEmail);
        setAlreadyRegisteredDialogOpen(true);
        return;
      }
      if (message.includes("422")) {
        toast.error("Sign-up request was rejected. Please review your email/password and try again.");
        return;
      }
      toast.error(error.message || "Unable to create account right now. Please try again.");
      return;
    }
    const profileResponse = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: normalizedFullName,
        username: usernameValidation.normalized,
      }),
    });
    setLoading(false);
    if (!profileResponse.ok) {
      const payload = (await profileResponse.json().catch(() => null)) as { error?: string } | null;
      if (profileResponse.status === 409) {
        toast.error("Username is already taken. Please choose another one in Personal details.");
        router.push("/account?tab=personal");
        router.refresh();
        return;
      }
      toast.error(payload?.error ?? "Your account was created, but profile setup is incomplete.");
      router.push("/account?tab=personal");
      router.refresh();
      return;
    }
    toast.success("Account created. Signing you in...");
    router.push(redirectTo || "/");
    router.refresh();
  }

  async function handleGoogleSignUp() {
    setLoading(true);
    const supabase = createClient();
    await hardAuthReset(supabase);
    const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo || "/")}`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl },
    });
    setLoading(false);
  }

  const handleGoToSignIn = () => {
    setAlreadyRegisteredDialogOpen(false);
    router.push(`/login?redirectTo=${encodeURIComponent(redirectTo || "/")}`);
    router.refresh();
  };

  const handleGoToForgotPassword = () => {
    setAlreadyRegisteredDialogOpen(false);
    router.push(`/forgot-password?email=${encodeURIComponent(alreadyRegisteredEmail)}`);
    router.refresh();
  };

  return (
    <>
      <FloatingProgressBar
        active={loading}
        message="Creating account…"
        subtitle="Wish Tickets Portal"
        detail="Creating your profile and signing you in. You may be redirected to Google."
      />
      <Dialog
        open={alreadyRegisteredDialogOpen}
        onOpenChange={setAlreadyRegisteredDialogOpen}
      >
        <DialogContent className="max-w-md">
          <DialogHeader className="space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[var(--wish-orange)]/50 bg-[var(--wish-orange)]/15">
              <span className="text-2xl" aria-hidden>
                ✨
              </span>
            </div>
            <DialogTitle className="text-center text-xl">
              Welcome back, you already have an account
            </DialogTitle>
            <DialogDescription className="text-center leading-relaxed">
              The email <span className="font-medium text-foreground">{alreadyRegisteredEmail}</span>{" "}
              is already registered in Wish Tickets Portal. Continue to sign in, or reset your
              password if you cannot access it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2 gap-2 sm:justify-center">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={handleGoToForgotPassword}
            >
              Reset password
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={handleGoToSignIn}
            >
              Sign in
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <div className="glass w-full max-w-md rounded-xl border border-[var(--glass-border)] p-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Sign up for free</h1>
        <p className="text-foreground-muted text-sm mb-6">
          Create your Wish Tickets Portal account to book events.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="w-full mb-4"
          onClick={handleGoogleSignUp}
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
        <p className="text-center text-sm text-foreground-muted mb-4">— or sign up with email —</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              type="text"
              placeholder="Jane Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="your_username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={30}
              autoComplete="username"
            />
            <p className="text-xs text-foreground-muted">
              3-30 chars. Use letters, numbers, dots, underscores, or hyphens.
            </p>
          </div>
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
          <div className="space-y-2">
            <Label htmlFor="confirmEmail">Confirm email</Label>
            <Input
              id="confirmEmail"
              type="email"
              placeholder="Re-enter your email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="marketing-email-opt-in"
              checked={marketingEmailOptIn}
              onCheckedChange={(checked) => setMarketingEmailOptIn(checked === true)}
              className="mt-0.5"
            />
            <label
              htmlFor="marketing-email-opt-in"
              className="cursor-pointer text-sm text-foreground-muted leading-relaxed"
            >
              I would like to receive promotional communications by email.
            </label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="privacy"
              checked={agreedToPrivacy}
              onCheckedChange={(checked) => setAgreedToPrivacy(checked === true)}
              className="mt-0.5"
            />
            <div className="text-sm text-foreground-muted leading-relaxed">
              <label htmlFor="privacy" className="cursor-pointer">
                I agree to the{" "}
              </label>
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="text-[var(--wish-orange)] hover:underline font-medium bg-transparent border-none p-0 cursor-pointer inline"
                  >
                    Privacy Notice
                  </button>
                </DialogTrigger>
                <DialogContent
                  className="max-w-lg max-h-[85vh] overflow-y-auto"
                  aria-describedby={undefined}
                >
                  <DialogHeader>
                    <DialogTitle>Privacy Notice</DialogTitle>
                  </DialogHeader>
                  <div className="text-sm text-foreground-muted whitespace-pre-line leading-relaxed">
                    {PRIVACY_NOTICE}
                  </div>
                  <div className="mt-4 text-sm">
                    <Link
                      href="/privacy-policy"
                      className="text-[var(--wish-orange)] hover:underline font-medium"
                    >
                      Read full Privacy Policy
                    </Link>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading || !agreedToPrivacy}>
            {loading ? "Creating account..." : "Sign up for free"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-foreground-muted">
          Already have an account?{" "}
          <Link href={`/login?redirectTo=${encodeURIComponent(redirectTo)}`} className="text-[var(--wish-orange)] hover:underline">
            Sign In
          </Link>
        </p>
      </div>
    </div>
    </>
  );
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <RouteLoading
          variant="compact"
          message="Loading…"
          subtitle="Preparing the sign-up form."
          className="min-h-[calc(100vh-4rem)]"
        />
      }
    >
      <SignUpForm />
    </Suspense>
  );
}
