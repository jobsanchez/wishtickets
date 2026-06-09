"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";

interface Promo {
  id: string;
  code: string;
  event_id: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  starts_at: string | null;
  expires_at: string | null;
  active: boolean;
  created_at: string;
}

export function PromoCodesSettings() {
  const router = useRouter();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: "",
    discount_type: "fixed" as "percentage" | "fixed",
    discount_value: 10000,
    max_uses: "" as string,
    starts_at: "",
    expires_at: "",
    active: true,
  });

  async function fetchPromos() {
    const res = await fetch("/api/admin/promo-codes?scope=general");
    if (res.ok) {
      const data = await res.json();
      setPromos(data.promos ?? []);
    }
  }

  useEffect(() => {
    fetchPromos().finally(() => setLoading(false));
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm({
      code: "",
      discount_type: "fixed",
      discount_value: 10000,
      max_uses: "",
      starts_at: "",
      expires_at: "",
      active: true,
    });
    setDialogOpen(true);
  }

  function openEdit(p: Promo) {
    setEditingId(p.id);
    setForm({
      code: p.code,
      discount_type: p.discount_type,
      discount_value: p.discount_value,
      max_uses: p.max_uses != null ? String(p.max_uses) : "",
      starts_at: p.starts_at ? p.starts_at.slice(0, 16) : "",
      expires_at: p.expires_at ? p.expires_at.slice(0, 16) : "",
      active: p.active,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        event_id: null,
        discount_type: form.discount_type,
        discount_value: form.discount_value,
        max_uses: form.max_uses ? parseInt(form.max_uses, 10) : null,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        expires_at: form.expires_at
          ? new Date(form.expires_at).toISOString()
          : null,
        active: form.active,
      };

      if (editingId) {
        const res = await fetch(`/api/admin/promo-codes/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Failed to update");
        }
        toast.success("Promo updated");
      } else {
        const res = await fetch("/api/admin/promo-codes/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Failed to create");
        }
        toast.success("Promo created");
      }
      setDialogOpen(false);
      fetchPromos();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this promo code?")) return;
    const res = await fetch(`/api/admin/promo-codes/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to delete");
      return;
    }
    toast.success("Promo deleted");
    fetchPromos();
    router.refresh();
  }

  const globalPromoProgress = useMemo(() => {
    if (saving) {
      return {
        message: "Saving promo codes",
        subtitle: "All events",
        detail: FLOATING_PROGRESS_PRESETS.genericSave.detail,
      };
    }
    if (loading) {
      return {
        message: "Loading promo codes",
        subtitle: "All events",
        detail: FLOATING_PROGRESS_PRESETS.genericLoad.detail,
      };
    }
    return {
      message: "Working…",
      subtitle: "Promo codes",
      detail: FLOATING_PROGRESS_PRESETS.genericLoad.detail,
    };
  }, [saving, loading]);

  return (
    <div>
      <FloatingProgressBar
        active={saving || loading}
        message={globalPromoProgress.message}
        subtitle={globalPromoProgress.subtitle}
        detail={globalPromoProgress.detail}
      />
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-foreground">Promo Codes</h2>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New promo
        </Button>
      </div>
      <p className="text-foreground-muted text-sm mb-6">
        Create promo codes that apply to all events. For event-specific promos, go to Edit event → Promo Codes tab.
      </p>
      <div className="glass rounded-xl border border-[var(--glass-border)] overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[var(--glass-border)]">
              <th className="p-4 text-sm font-medium text-foreground-muted">Code</th>
              <th className="p-4 text-sm font-medium text-foreground-muted">Type</th>
              <th className="p-4 text-sm font-medium text-foreground-muted">Value</th>
              <th className="p-4 text-sm font-medium text-foreground-muted">Used</th>
              <th className="p-4 text-sm font-medium text-foreground-muted">Active</th>
              <th className="p-4 text-sm font-medium text-foreground-muted w-24"></th>
            </tr>
          </thead>
          <tbody>
            {promos.length ? (
              promos.map((p) => (
                <tr key={p.id} className="border-b border-[var(--glass-border)]">
                  <td className="p-4 text-foreground font-mono">{p.code}</td>
                  <td className="p-4 text-foreground-muted capitalize">
                    {p.discount_type}
                  </td>
                  <td className="p-4 text-foreground-muted">
                    {p.discount_type === "percentage"
                      ? `${p.discount_value}%`
                      : `₱${(p.discount_value / 100).toLocaleString()}`}
                  </td>
                  <td className="p-4 text-foreground-muted">
                    {p.used_count}
                    {p.max_uses != null ? ` / ${p.max_uses}` : ""}
                  </td>
                  <td className="p-4">
                    <span
                      className={
                        p.active ? "text-green-400" : "text-foreground-muted"
                      }
                    >
                      {p.active ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="p-4 flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEdit(p)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(p.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="p-8 text-center text-foreground-muted">
                  No general promo codes yet. Create one to offer discounts across all events.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit promo code" : "New promo code"}
            </DialogTitle>
            <DialogDescription>
              Percentage: 1–100. Fixed: amount in pesos (e.g. 50 = ₱50).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Code</Label>
              <Input
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                }
                placeholder="SAVE20"
                disabled={!!editingId}
                className="font-mono"
              />
              {editingId && (
                <p className="text-xs text-foreground-muted mt-1">
                  Code cannot be changed when editing.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Discount type</Label>
                <Select
                  value={form.discount_type}
                  onValueChange={(v: "percentage" | "fixed") =>
                    setForm((f) => ({
                      ...f,
                      discount_type: v,
                      discount_value:
                        v === "fixed"
                          ? 10000
                          : f.discount_value <= 100
                            ? f.discount_value
                            : 20,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>
                  {form.discount_type === "percentage"
                    ? "Percentage (1–100)"
                    : "Amount (₱)"}
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={form.discount_type === "percentage" ? 1 : 0.01}
                  value={
                    form.discount_type === "percentage"
                      ? form.discount_value
                      : form.discount_value / 100
                  }
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0;
                    setForm((f) => ({
                      ...f,
                      discount_value:
                        form.discount_type === "percentage"
                          ? Math.round(v)
                          : Math.round(v * 100),
                    }));
                  }}
                />
              </div>
            </div>
            <div>
              <Label>Max uses (optional)</Label>
              <Input
                type="number"
                min={0}
                value={form.max_uses}
                onChange={(e) =>
                  setForm((f) => ({ ...f, max_uses: e.target.value }))
                }
                placeholder="Unlimited"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Starts at (optional)</Label>
                <Input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, starts_at: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Expires at (optional)</Label>
                <Input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, expires_at: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="active"
                checked={form.active}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, active: v }))
                }
              />
              <Label htmlFor="active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.code.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
