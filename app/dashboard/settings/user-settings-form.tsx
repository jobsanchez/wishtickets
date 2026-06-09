"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { RouteLoading } from "@/components/ui/route-loading";

export function UserSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    async function loadProfile() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error?.message?.includes("Invalid Refresh Token")) {
        await supabase.auth.signOut({ scope: "local" });
        setEmail("");
        setFullName("");
        setLoading(false);
        return;
      }
      if (user) {
        setEmail(user.email ?? "");
        const { data } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        if (!cancelled) setFullName(data?.full_name ?? "");
      } else {
        setEmail("");
        setFullName("");
      }
      setLoading(false);
    }

    void loadProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadProfile();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw error;
      toast.success("Profile updated.");
    } catch {
      toast.error("Failed to update profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setChangingPassword(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update password.";
      toast.error(msg);
    } finally {
      setChangingPassword(false);
    }
  }

  const dashboardSettingsProgress = useMemo(() => {
    if (changingPassword) {
      return {
        message: "Updating password",
        subtitle: "Your account",
        detail: "Saving your new password with our auth provider.",
      };
    }
    if (saving) {
      return {
        message: "Saving profile",
        subtitle: "Your account",
        detail: FLOATING_PROGRESS_PRESETS.genericSave.detail,
      };
    }
    return {
      message: "Working…",
      subtitle: "Your account",
      detail: FLOATING_PROGRESS_PRESETS.genericLoad.detail,
    };
  }, [saving, changingPassword]);

  if (loading) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading settings…"
        subtitle="Your profile and security options."
      />
    );
  }

  return (
    <>
      <FloatingProgressBar
        active={saving || changingPassword}
        message={dashboardSettingsProgress.message}
        subtitle={dashboardSettingsProgress.subtitle}
        detail={dashboardSettingsProgress.detail}
      />
      <div className="space-y-8 max-w-md">
        <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Personal</h2>
          <p className="text-sm text-foreground-muted mb-4">
            Edit your name and account details.
          </p>
          <div className="space-y-4">
            <div>
              <Label className="text-foreground-muted">Display name</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-foreground-muted">Email</Label>
              <Input
                value={email}
                disabled
                className="mt-1 bg-white/5"
              />
              <p className="text-xs text-foreground-muted mt-1">Email cannot be changed here.</p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="mt-6">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>

        <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Change password</h2>
          <p className="text-sm text-foreground-muted mb-4">
            Set a new password for your account.
          </p>
          <div className="space-y-4">
            <div>
              <Label className="text-foreground-muted">New password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="mt-1"
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label className="text-foreground-muted">Confirm new password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="mt-1"
                autoComplete="new-password"
              />
            </div>
          </div>
          <Button
            onClick={handleChangePassword}
            disabled={changingPassword || !newPassword || !confirmPassword}
            variant="secondary"
            className="mt-6"
          >
            {changingPassword ? "Updating..." : "Update password"}
          </Button>
        </div>
      </div>
    </>
  );
}
