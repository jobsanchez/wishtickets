"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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

export function UserSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

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
        setPhone("");
        setLoading(false);
        return;
      }
      if (user) {
        setEmail(user.email ?? "");
        const { data } = await supabase
          .from("profiles")
          .select("full_name, phone")
          .eq("id", user.id)
          .single();
        if (!cancelled) {
          setFullName(data?.full_name ?? "");
          setPhone(data?.phone ?? "");
        }
      } else {
        setEmail("");
        setFullName("");
        setPhone("");
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
        .update({
          full_name: fullName,
          phone: phone.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      if (error) throw error;
      toast.success("Profile updated.");
      router.refresh();
    } catch {
      toast.error("Failed to update profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading profile…"
        subtitle="Fetching your account details."
      />
    );
  }

  return (
    <>
      <FloatingProgressBar
        active={saving}
        message="Saving profile"
        subtitle="Your account"
        detail={FLOATING_PROGRESS_PRESETS.genericSave.detail}
      />
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6 max-w-md">
      <h3 className="text-lg font-semibold text-foreground mb-4">Your profile</h3>
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
        <div>
          <Label className="text-foreground-muted">Phone (for PayMongo billing prefill)</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09XXXXXXXXX"
            className="mt-1"
          />
        </div>
      </div>
      <Button type="button" onClick={handleSave} disabled={saving} className="mt-6">
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
    </>
  );
}
