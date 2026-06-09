"use client";

import { useMemo, useState, type ComponentProps, type ComponentType } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, Lock, Ticket, User, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hardAuthReset } from "@/lib/supabase/auth-hard-reset";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { DashboardBookings } from "@/app/dashboard/dashboard-bookings";
import { toast } from "@/lib/toast";

type RawBooking = {
  id: string;
  status: string;
  created_at: string;
  event:
    | {
        id: string;
        title: string;
        slug: string;
        event_start: string;
        status?: string;
      }
    | {
        id: string;
        title: string;
        slug: string;
        event_start: string;
        status?: string;
      }[]
    | null;
  tickets?: { id: string }[] | null;
};
type DashboardBooking = ComponentProps<typeof DashboardBookings>["confirmed"][number];

type AccountTab = "personal" | "orders" | "communications" | "password" | "cancel";
const DELETE_ACCOUNT_PHRASE = "DELETE MY ACCOUNT";

type CommunicationPrefs = {
  emailPromos: boolean;
};

type PasswordFeedback = {
  type: "success" | "error";
  message: string;
} | null;

type CommunicationFeedback = {
  type: "success" | "error";
  message: string;
} | null;

const TAB_PARAM = "tab";
const DEFAULT_TAB: AccountTab = "personal";
const VALID_TABS: AccountTab[] = ["personal", "orders", "communications", "password", "cancel"];

function normalizeTab(raw: string | null): AccountTab {
  if (!raw) return DEFAULT_TAB;
  return VALID_TABS.includes(raw as AccountTab) ? (raw as AccountTab) : DEFAULT_TAB;
}

function formatAccountId(userId: string) {
  return userId.replaceAll("-", "").slice(0, 8);
}

export function AccountPageClient({
  userId,
  email,
  initialFullName,
  initialUsername,
  initialMarketingEmailOptIn,
  bookings,
}: {
  userId: string;
  email: string;
  initialFullName: string;
  initialUsername: string;
  initialMarketingEmailOptIn: boolean;
  bookings: RawBooking[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = normalizeTab(searchParams?.get(TAB_PARAM) ?? null);

  const [fullName, setFullName] = useState(initialFullName);
  const [username, setUsername] = useState(initialUsername);
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<PasswordFeedback>(null);

  const [prefs, setPrefs] = useState<CommunicationPrefs>({
    emailPromos: initialMarketingEmailOptIn,
  });
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [communicationFeedback, setCommunicationFeedback] = useState<CommunicationFeedback>(null);

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelProcessing, setCancelProcessing] = useState(false);
  const [cancelPhraseInput, setCancelPhraseInput] = useState("");
  const [cancelEmailInput, setCancelEmailInput] = useState("");
  const [cancelFeedback, setCancelFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [profileFirstName, profileLastName] = useMemo(() => {
    const words = fullName.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return ["", ""];
    if (words.length === 1) return [words[0], ""];
    return [words.slice(0, -1).join(" "), words.at(-1) ?? ""];
  }, [fullName]);

  const allBookings = useMemo<DashboardBooking[]>(
    () =>
      (bookings ?? []).map((booking) => ({
        ...booking,
        // DashboardBookings expects event to be non-null; normalize null to an empty array.
        event: booking.event ?? [],
      })),
    [bookings]
  );
  const confirmedBookings = useMemo(
    () => allBookings.filter((booking) => booking.status === "confirmed"),
    [allBookings]
  );
  const pendingBookings = useMemo(
    () => allBookings.filter((booking) => booking.status === "pending"),
    [allBookings]
  );
  const failedBookings = useMemo(
    () => allBookings.filter((booking) => booking.status === "failed"),
    [allBookings]
  );

  const navItems: {
    key: AccountTab;
    label: string;
    icon: ComponentType<{ className?: string }>;
  }[] = [
    { key: "personal", label: "Personal details", icon: User },
    { key: "orders", label: "Order history", icon: Ticket },
    { key: "communications", label: "Communication preferences", icon: Bell },
    { key: "password", label: "Password", icon: Lock },
    { key: "cancel", label: "Cancel account", icon: XCircle },
  ];

  function setTab(tab: AccountTab) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set(TAB_PARAM, tab);
    router.replace(`/account?${params.toString()}`);
  }

  async function handleSaveProfile() {
    setSavingName(true);
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          username,
        }),
      });
      if (!response.ok) {
        if (response.status === 409) {
          toast.error("That username is already taken.");
          return;
        }
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to save profile.");
      }
      toast.success("Profile updated.");
      router.refresh();
    } catch {
      toast.error("Failed to save profile.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleUpdatePassword() {
    setPasswordFeedback(null);
    if (!currentPassword.trim()) {
      setPasswordFeedback({ type: "error", message: "Current password is required." });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordFeedback({ type: "error", message: "New passwords do not match." });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordFeedback({ type: "error", message: "Password must be at least 8 characters." });
      return;
    }
    setUpdatingPassword(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) {
        throw new Error("Could not verify your account session. Please sign in again.");
      }

      // Reauthenticate with current password before allowing password update.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (reauthError) {
        throw new Error("Current password is incorrect.");
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);

      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordFeedback({ type: "success", message: "Password updated successfully." });
    } catch {
      setPasswordFeedback({
        type: "error",
        message: "Failed to update password. Please check your current password and try again.",
      });
    } finally {
      setUpdatingPassword(false);
    }
  }

  async function handleSavePrefs() {
    setCommunicationFeedback(null);
    setSavingPrefs(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          marketing_email_opt_in: prefs.emailPromos,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (error) throw error;
      setCommunicationFeedback({
        type: "success",
        message: "Communication preferences updated successfully.",
      });
    } catch {
      setCommunicationFeedback({
        type: "error",
        message: "Could not save communication preferences. Please try again.",
      });
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleCancelAccount() {
    const phraseMatches = cancelPhraseInput.trim() === DELETE_ACCOUNT_PHRASE;
    const emailMatches = cancelEmailInput.trim().toLowerCase() === email.trim().toLowerCase();
    if (!phraseMatches || !emailMatches) {
      setCancelFeedback({
        type: "error",
        message: "Please enter the exact confirmation phrase and your account email.",
      });
      return false;
    }

    setCancelProcessing(true);
    setCancelFeedback(null);
    try {
      const response = await fetch("/api/account/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phraseConfirmation: cancelPhraseInput.trim(),
          emailConfirmation: cancelEmailInput.trim(),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setCancelFeedback({
          type: "error",
          message: payload?.error ?? "Failed to cancel account. Please try again.",
        });
        return false;
      }

      setCancelFeedback({
        type: "success",
        message: "Your account has been canceled.",
      });
      const supabase = createClient();
      await hardAuthReset(supabase);
      router.push("/?accountCanceled=1");
      router.refresh();
      return true;
    } finally {
      setCancelProcessing(false);
    }
  }

  return (
    <>
      <FloatingProgressBar
        active={savingName || savingPrefs || updatingPassword || cancelProcessing}
        {...FLOATING_PROGRESS_PRESETS.genericSave}
        message={
          savingName
            ? "Saving profile"
            : savingPrefs
              ? "Saving communication preferences"
              : updatingPassword
                ? "Updating password"
                : cancelProcessing
                  ? "Processing request"
                  : "Saving"
        }
      />
      <div className="container mx-auto px-4 py-8">
        <div className="overflow-hidden rounded-xl border border-[var(--glass-border)] bg-background">
          <div className="grid min-h-[680px] grid-cols-1 md:grid-cols-[300px_1fr]">
            <aside className="border-r border-[var(--glass-border)] p-5">
              <h1 className="text-4xl font-bold text-foreground">{fullName || "Account"}</h1>
              <p className="mt-2 text-foreground-muted">Customer ID: {formatAccountId(userId)}</p>
              <nav className="mt-6 space-y-3">
                {navItems.map(({ key, label, icon: Icon }) => {
                  const active = activeTab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTab(key)}
                      className={`flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors ${
                        active
                          ? "border-[#003153] bg-[#002746] text-white"
                          : "border-[var(--glass-border)] bg-background text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${active ? "text-white" : "text-foreground"}`} />
                      <span className={active ? "font-semibold" : ""}>{label}</span>
                    </button>
                  );
                })}
              </nav>
            </aside>

            <section className="p-6 md:p-10">
              {activeTab === "personal" && (
                <div className="mx-auto max-w-2xl space-y-6">
                  <h2 className="text-4xl font-semibold text-foreground">Personal details</h2>
                  <div className="grid gap-4">
                    <div>
                      <Label className="text-xs text-foreground-muted">Email address</Label>
                      <Input value={email} disabled className="mt-2 bg-white/5" />
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <Label className="text-xs text-foreground-muted">First Name</Label>
                        <Input
                          value={profileFirstName}
                          onChange={(e) => {
                            const newFirst = e.target.value;
                            const merged = [newFirst, profileLastName].filter(Boolean).join(" ").trim();
                            setFullName(merged);
                          }}
                          className="mt-2"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-foreground-muted">Last Name</Label>
                        <Input
                          value={profileLastName}
                          onChange={(e) => {
                            const newLast = e.target.value;
                            const merged = [profileFirstName, newLast].filter(Boolean).join(" ").trim();
                            setFullName(merged);
                          }}
                          className="mt-2"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-foreground-muted">Username</Label>
                      <Input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="mt-2"
                        autoComplete="username"
                        minLength={3}
                        maxLength={30}
                      />
                      <p className="mt-2 text-xs text-foreground-muted">
                        3-30 chars. Use letters, numbers, dots, underscores, or hyphens.
                      </p>
                    </div>
                  </div>
                  <Button onClick={handleSaveProfile} disabled={savingName}>
                    {savingName ? "Saving..." : "Update"}
                  </Button>
                </div>
              )}

              {activeTab === "orders" && (
                <div className="mx-auto max-w-4xl">
                  <h2 className="text-4xl font-semibold text-foreground">Orders</h2>
                  <p className="mt-4 text-foreground-muted">
                    {allBookings.length === 0
                      ? "You don't have any events coming up. Only events that haven't happened yet will appear here."
                      : "Your recent orders are listed below. Open any order to view tickets and confirmation details."}
                  </p>
                  <ul className="mt-4 list-disc space-y-1 pl-6 text-sm text-foreground-muted">
                    <li>Tickets are delivered electronically after successful checkout.</li>
                    <li>Past events may no longer appear in this list.</li>
                  </ul>
                  {allBookings.length > 0 && (
                    <div className="mt-6 rounded-md border border-[var(--glass-border)] p-3">
                      <DashboardBookings
                        confirmed={confirmedBookings}
                        pending={pendingBookings}
                        failed={failedBookings}
                        serverNow={new Date().toISOString()}
                      />
                    </div>
                  )}
                </div>
              )}

              {activeTab === "communications" && (
                <div className="mx-auto max-w-2xl space-y-6">
                  <h2 className="text-4xl font-semibold text-foreground">Communication preferences</h2>
                  <p className="text-foreground-muted">
                    Let us know what you want to hear about and we&apos;ll keep you posted on the latest events.
                  </p>
                  <div className="space-y-4 border-y border-[var(--glass-border)] py-6">
                    <label className="flex items-start gap-3">
                      <Checkbox
                        checked={prefs.emailPromos}
                        onCheckedChange={(checked) =>
                          setPrefs((current) => ({ ...current, emailPromos: checked === true }))
                        }
                      />
                      <span className="text-foreground">
                        I would like to receive promotional communications by email.
                      </span>
                    </label>
                  </div>
                  {communicationFeedback ? (
                    <p
                      className={`text-sm ${
                        communicationFeedback.type === "success" ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {communicationFeedback.message}
                    </p>
                  ) : null}
                  <Button onClick={handleSavePrefs} disabled={savingPrefs}>
                    {savingPrefs ? "Updating..." : "Update"}
                  </Button>
                </div>
              )}

              {activeTab === "password" && (
                <div className="mx-auto max-w-2xl space-y-6">
                  <h2 className="text-4xl font-semibold text-foreground">Change password</h2>
                  <div className="grid gap-4">
                    <div>
                      <Label className="text-xs text-foreground-muted">Current password</Label>
                      <Input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-foreground-muted">New password</Label>
                      <Input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-foreground-muted">Re-enter new password</Label>
                      <Input
                        type="password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="mt-2"
                      />
                    </div>
                  </div>
                  {passwordFeedback ? (
                    <p
                      className={`text-sm ${
                        passwordFeedback.type === "success" ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {passwordFeedback.message}
                    </p>
                  ) : null}
                  <Button onClick={handleUpdatePassword} disabled={updatingPassword}>
                    {updatingPassword ? "Updating..." : "Update"}
                  </Button>
                </div>
              )}

              {activeTab === "cancel" && (
                <div className="mx-auto max-w-2xl space-y-6">
                  <div className="space-y-5 rounded-md border border-red-300 bg-red-50 p-5 dark:border-red-400/60 dark:bg-red-500/10">
                    <h3 className="text-2xl font-semibold text-red-700 dark:text-red-200">Cancel account</h3>
                    <p className="text-foreground">
                      Remember, you need to have a Wish Tickets Portal account to purchase tickets to entertainment
                      events online. Plus, your Wish Tickets Portal account gives you access to presales, special
                      offers and regular updates on upcoming events.
                    </p>
                    <p className="text-foreground">
                      To confirm, type <span className="font-semibold">{DELETE_ACCOUNT_PHRASE}</span> and enter your
                      current email.
                    </p>
                    <div className="space-y-2">
                      <Label className="text-sm text-foreground">Confirmation phrase</Label>
                      <Input value={DELETE_ACCOUNT_PHRASE} readOnly className="bg-white/80 font-semibold dark:bg-white/5" />
                      <Input
                        value={cancelPhraseInput}
                        onChange={(e) => setCancelPhraseInput(e.target.value)}
                        placeholder={`Type ${DELETE_ACCOUNT_PHRASE}`}
                        autoComplete="off"
                      />
                      {cancelPhraseInput.length > 0 && cancelPhraseInput.trim() !== DELETE_ACCOUNT_PHRASE ? (
                        <p className="text-sm text-red-300">Phrase does not match exactly.</p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-foreground-muted">Current email</Label>
                      <Input
                        type="email"
                        value={cancelEmailInput}
                        onChange={(e) => setCancelEmailInput(e.target.value)}
                        placeholder="Enter your current email"
                        autoComplete="email"
                      />
                      {cancelEmailInput.length > 0 &&
                      cancelEmailInput.trim().toLowerCase() !== email.trim().toLowerCase() ? (
                        <p className="text-sm text-red-300">Email does not match your account email.</p>
                      ) : null}
                    </div>
                    {cancelFeedback ? (
                      <p
                        className={`text-sm ${
                          cancelFeedback.type === "success" ? "text-green-400" : "text-red-300"
                        }`}
                      >
                        {cancelFeedback.message}
                      </p>
                    ) : null}
                    <Button
                      variant="destructive"
                      onClick={() => setCancelConfirmOpen(true)}
                      disabled={
                        cancelProcessing ||
                        cancelPhraseInput.trim() !== DELETE_ACCOUNT_PHRASE ||
                        cancelEmailInput.trim().toLowerCase() !== email.trim().toLowerCase()
                      }
                    >
                      {cancelProcessing ? "Canceling..." : "Cancel my account"}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
        title="Confirm account cancellation"
        description="This action cannot be undone. Your sign-in access will be permanently removed. Do you want to continue?"
        confirmLabel="Yes, cancel my account"
        cancelLabel="Keep account"
        variant="destructive"
        loadingMessage="Canceling account"
        loadingSubtitle="Finalizing account deletion"
        loadingDetail="Please wait while we remove account access and preserve required historical records."
        onConfirm={handleCancelAccount}
      />
    </>
  );
}
