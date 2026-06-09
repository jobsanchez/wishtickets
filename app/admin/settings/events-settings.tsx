"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissionDialog } from "@/components/providers/permission-dialog-provider";
import { toast } from "@/lib/toast";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { RouteLoading } from "@/components/ui/route-loading";
import { Plus, Trash2 } from "lucide-react";

interface EventDefaults {
  status?: "draft" | "published" | "postponed" | "archived";
  default_category?: string;
  per_page?: number;
}

interface EventCategoryItem {
  label: string;
}

const DEFAULT_CATEGORIES: EventCategoryItem[] = [
  { label: "Shows & Concerts" },
  { label: "Sports" },
  { label: "Tours & Attraction" },
  { label: "Corporate Events" },
  { label: "Family" },
];

export function EventsSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const { showPermissionDialog } = usePermissionDialog() ?? { showPermissionDialog: () => {} };
  const [saving, setSaving] = useState(false);
  const [eventDefaults, setEventDefaults] = useState<EventDefaults>({
    status: "draft",
    default_category: "Shows & Concerts",
    per_page: 50,
  });
  const [eventCategories, setEventCategories] = useState<EventCategoryItem[]>(DEFAULT_CATEGORIES);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/settings").then((r) => {
        if (r.status === 403) {
          showPermissionDialog();
          return null;
        }
        return r.json();
      }),
      fetch("/api/admin/event-categories").then((r) => {
        if (r.status === 403) {
          showPermissionDialog();
          return null;
        }
        return r.json();
      }),
    ])
      .then(([settingsData, categoriesData]) => {
        if (settingsData === null || categoriesData === null) return;
        if (settingsData?.event_defaults) {
          const defs = { ...(settingsData.event_defaults as EventDefaults) };
          if ((defs.status as string) === "cancelled") defs.status = "archived";
          setEventDefaults((prev) => ({ ...prev, ...defs }));
        }
        if (Array.isArray(categoriesData) && categoriesData.length > 0) {
          setEventCategories(
            categoriesData.map((c: { label: string }) => ({ label: c.label }))
          );
        }
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, [showPermissionDialog]);

  async function handleSave() {
    setSaving(true);
    try {
      const [settingsRes, categoriesRes] = await Promise.all([
        fetch("/api/admin/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_defaults: eventDefaults }),
        }),
        fetch("/api/admin/event-categories", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          categories: eventCategories.map((c) => ({ label: c.label })),
        }),
        }),
      ]);
      if (settingsRes.status === 403 || categoriesRes.status === 403) {
        showPermissionDialog();
        return;
      }
      if (!settingsRes.ok || !categoriesRes.ok) throw new Error("Failed to save");
      toast.success("Settings saved.");
      router.refresh();
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  function addCategory() {
    setEventCategories((prev) => [...prev, { label: "New Category" }]);
  }

  function updateCategory(index: number, val: string) {
    setEventCategories((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], label: val };
      return next;
    });
  }

  function removeCategory(index: number) {
    setEventCategories((prev) => prev.filter((_, i) => i !== index));
  }

  if (loading) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading event defaults…"
        subtitle="Categories and portal defaults."
      />
    );
  }

  return (
    <>
      <FloatingProgressBar
        active={saving}
        message="Saving event defaults"
        subtitle="Admin settings"
        detail={FLOATING_PROGRESS_PRESETS.genericSave.detail}
      />
      <div className="space-y-8">
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Event defaults</h3>
        <p className="text-sm text-foreground-muted mb-6">
          Default values for newly created events and homepage display.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label className="text-foreground-muted">Default status for new events</Label>
            <select
              className="flex h-10 w-full rounded-lg glass border border-[var(--glass-border)] bg-white/5 px-3 text-sm text-foreground mt-1"
              value={(eventDefaults.status as string) === "cancelled" ? "archived" : (eventDefaults.status ?? "draft")}
              onChange={(e) =>
                setEventDefaults((p) => ({
                  ...p,
                  status: e.target.value as EventDefaults["status"],
                }))
              }
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="postponed">Postponed</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <Label className="text-foreground-muted">Default category for new events</Label>
            <select
              className="flex h-10 w-full rounded-lg glass border border-[var(--glass-border)] bg-white/5 px-3 text-sm text-foreground mt-1"
              value={eventDefaults.default_category ?? "Shows & Concerts"}
              onChange={(e) =>
                setEventDefaults((p) => ({
                  ...p,
                  default_category: e.target.value,
                }))
              }
            >
              {eventCategories.map((c) => (
                <option key={c.label} value={c.label}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-foreground-muted">Events per page (homepage)</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={eventDefaults.per_page ?? 50}
              onChange={(e) =>
                setEventDefaults((p) => ({
                  ...p,
                  per_page: parseInt(e.target.value, 10) || 50,
                }))
              }
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Event Categories</h3>
        <p className="text-sm text-foreground-muted mb-6">
          Manage the categories shown on the homepage and when creating events.
        </p>
        <div className="space-y-3">
          {eventCategories.map((cat, i) => (
            <div
              key={cat.label + i}
              className="flex gap-3 items-center"
            >
              <Input
                placeholder="Category name"
                value={cat.label}
                onChange={(e) => updateCategory(i, e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-red-400 hover:text-red-300 shrink-0"
                onClick={() => removeCategory(i)}
                aria-label="Remove category"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={addCategory}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add category
        </Button>
      </div>

      <Button type="button" onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
    </>
  );
}
