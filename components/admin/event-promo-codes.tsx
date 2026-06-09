"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, ChevronRight } from "lucide-react";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { RouteLoading } from "@/components/ui/route-loading";
import { parsePromoRule, type PromoRule } from "@/lib/promo-rule-schema";
import { formatPromoRuleSummary, buildPromoRuleFromForm } from "@/lib/promo-rule-summary";

interface Promo {
  id: string;
  code: string;
  event_id: string | null;
  display_name?: string | null;
  rule?: unknown;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  starts_at: string | null;
  expires_at: string | null;
  active: boolean;
  stackable: boolean;
  created_at: string;
}

interface EventPromoCodesProps {
  eventId: string;
  eventTitle: string;
}

export function EventPromoCodes({ eventId, eventTitle }: EventPromoCodesProps) {
  const router = useRouter();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoCardCollapsed, setPromoCardCollapsed] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingStackableId, setTogglingStackableId] = useState<string | null>(null);
  const [sectionRows, setSectionRows] = useState<
    { id: string; name: string; section_group: string | null }[]
  >([]);
  const [displayName, setDisplayName] = useState("");
  const [promoMode, setPromoMode] = useState<"legacy" | "structured">("legacy");
  const [mechanic, setMechanic] = useState<PromoRule["type"]>("buy_pay_get_free");
  const [scopeSectionIds, setScopeSectionIds] = useState<string[]>([]);
  const [scopeGroupInput, setScopeGroupInput] = useState("");
  const [scopeGroups, setScopeGroups] = useState<string[]>([]);
  /** buy_pay_get: total tickets in one set = paid + free; paid is derived (not “4+1” = 4 paid unless bundle is 5). */
  const [bpgBundleSize, setBpgBundleSize] = useState(4);
  const [bpgFree, setBpgFree] = useState(1);
  const [tiers, setTiers] = useState([
    { min_qty: 2, max_qty: 3, percent: 5 },
    { min_qty: 4, max_qty: 6, percent: 10 },
    { min_qty: 7, max_qty: 10, percent: 15 },
  ]);
  const [bundleSize, setBundleSize] = useState(5);
  const [bundleTotalPhp, setBundleTotalPhp] = useState(5000);
  const [allowMultiple, setAllowMultiple] = useState(true);
  const [thresholdMin, setThresholdMin] = useState(6);
  const [thresholdFree, setThresholdFree] = useState(1);
  const [form, setForm] = useState({
    code: "",
    discount_type: "fixed" as "percentage" | "fixed",
    discount_value: 10000,
    max_uses: "" as string,
    starts_at: "",
    expires_at: "",
    active: true,
    stackable: false,
  });

  const fetchPromos = useCallback(async () => {
    const res = await fetch(`/api/admin/events/${eventId}/promo-codes`);
    if (res.ok) {
      const data = await res.json();
      setPromos(data.promos ?? []);
    }
  }, [eventId]);

  useEffect(() => {
    fetchPromos().finally(() => setLoading(false));
  }, [fetchPromos]);

  useEffect(() => {
    void fetch(`/api/admin/events/${eventId}/seating`)
      .then((r) => (r.ok ? r.json() : { sections: [] }))
      .then((d: { sections?: { id: string; name: string; section_group: string | null }[] }) => {
        setSectionRows(d.sections ?? []);
      })
      .catch(() => setSectionRows([]));
  }, [eventId]);

  function resetDesigner() {
    setDisplayName("");
    setPromoMode("legacy");
    setMechanic("buy_pay_get_free");
    setScopeSectionIds([]);
    setScopeGroupInput("");
    setScopeGroups([]);
    setBpgBundleSize(4);
    setBpgFree(1);
    setTiers([
      { min_qty: 2, max_qty: 3, percent: 5 },
      { min_qty: 4, max_qty: 6, percent: 10 },
      { min_qty: 7, max_qty: 10, percent: 15 },
    ]);
    setBundleSize(5);
    setBundleTotalPhp(5000);
    setAllowMultiple(true);
    setThresholdMin(6);
    setThresholdFree(1);
  }

  function openCreate() {
    setEditingId(null);
    resetDesigner();
    setForm({
      code: "",
      discount_type: "fixed",
      discount_value: 10000,
      max_uses: "",
      starts_at: "",
      expires_at: "",
      active: true,
      stackable: false,
    });
    setDialogOpen(true);
  }

  function openEdit(p: Promo) {
    setEditingId(p.id);
    setDisplayName(p.display_name?.trim() ?? "");
    resetDesigner();
    const r = p.rule != null ? parsePromoRule(p.rule) : null;
    if (r) {
      setPromoMode("structured");
      setMechanic(r.type);
      setScopeSectionIds(r.scope.section_ids ?? []);
      setScopeGroups((r.scope.section_groups ?? []).map((g) => g.trim()).filter(Boolean));
      if (r.type === "buy_pay_get_free") {
        setBpgBundleSize(r.pay + r.free);
        setBpgFree(r.free);
      } else if (r.type === "tiered_percent") {
        setTiers(r.tiers);
      } else if (r.type === "flat_bundle") {
        setBundleSize(r.bundle_size);
        setBundleTotalPhp(r.bundle_total_cents / 100);
        setAllowMultiple(r.allow_multiple);
      } else if (r.type === "threshold_free") {
        setThresholdMin(r.min_qty);
        setThresholdFree(r.free_qty);
      }
    } else {
      setPromoMode("legacy");
    }
    setForm({
      code: p.code,
      discount_type: p.discount_type,
      discount_value: p.discount_value,
      max_uses: p.max_uses != null ? String(p.max_uses) : "",
      starts_at: p.starts_at ? p.starts_at.slice(0, 16) : "",
      expires_at: p.expires_at ? p.expires_at.slice(0, 16) : "",
      active: p.active,
      stackable: p.stackable ?? false,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const groupList = [
        ...scopeGroups.map((g) => g.trim()).filter(Boolean),
        ...scopeGroupInput
          .split(",")
          .map((g) => g.trim())
          .filter(Boolean),
      ];
      const uniqueGroups = [...new Set(groupList)];

      const basePayload: Record<string, unknown> = {
        code: form.code.trim(),
        event_id: eventId,
        display_name: displayName.trim() || null,
        max_uses: form.max_uses ? parseInt(form.max_uses, 10) : null,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        expires_at: form.expires_at
          ? new Date(form.expires_at).toISOString()
          : null,
        active: form.active,
        stackable: form.stackable,
      };

      let payload: Record<string, unknown> = { ...basePayload };
      if (promoMode === "structured") {
        if (scopeSectionIds.length === 0 && uniqueGroups.length === 0) {
          throw new Error("Select at least one section or one section group for the promo scope.");
        }
        const bpgPay = Math.max(1, bpgBundleSize - bpgFree);
        const rule = buildPromoRuleFromForm({
          mechanic,
          scope: { section_ids: scopeSectionIds, section_groups: uniqueGroups },
          pay: bpgPay,
          free: bpgFree,
          tiers: tiers.map((t) => ({
            min_qty: t.min_qty,
            max_qty: t.max_qty,
            percent: t.percent,
          })),
          bundle_size: bundleSize,
          bundle_total_cents: Math.round(bundleTotalPhp * 100),
          allow_multiple: allowMultiple,
          min_qty: thresholdMin,
          free_qty: thresholdFree,
        });
        payload = {
          ...basePayload,
          rule,
          discount_type: "percentage",
          discount_value: 0,
        };
      } else {
        payload = {
          ...basePayload,
          rule: null,
          discount_type: form.discount_type,
          discount_value: form.discount_value,
        };
      }

      if (editingId) {
        const res = await fetch(`/api/admin/promo-codes/${editingId}?event_id=${eventId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.hint || data.error || "Failed to update");
        }
        const data = (await res.json()) as { success?: boolean; notice?: string };
        if (data.notice) {
          toast.info(data.notice, { duration: 10000 });
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
          throw new Error(data.hint || data.error || "Failed to create");
        }
        const data = (await res.json()) as { id: string; notice?: string };
        if (data.notice) {
          toast.info(data.notice, { duration: 10000 });
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

  async function handleToggleStackable(p: Promo) {
    const nextStackable = !(p.stackable ?? false);
    setTogglingStackableId(p.id);
    try {
      const res = await fetch(`/api/admin/promo-codes/${p.id}?event_id=${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stackable: nextStackable }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to update");
      }
      toast.success(nextStackable ? "Promo can now be stacked" : "Promo is no longer stackable");
      fetchPromos();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setTogglingStackableId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this promo code?")) return;
    const res = await fetch(`/api/admin/promo-codes/${id}?event_id=${eventId}`, {
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

  const distinctSectionGroupLabels = useMemo(
    () =>
      [
        ...new Set(
          sectionRows
            .map((r) => r.section_group)
            .filter((g): g is string => typeof g === "string" && g.trim().length > 0)
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [sectionRows]
  );

  const eventPromoProgress = useMemo(() => {
    if (saving) {
      return {
        message: "Saving promo codes",
        subtitle: eventTitle,
        detail: FLOATING_PROGRESS_PRESETS.genericSave.detail,
      };
    }
    if (togglingStackableId != null) {
      return {
        message: "Updating stackable rule",
        subtitle: eventTitle,
        detail: "Saving whether this promo can combine with others.",
      };
    }
    return {
      message: "Working…",
      subtitle: eventTitle,
      detail: FLOATING_PROGRESS_PRESETS.genericLoad.detail,
    };
  }, [saving, togglingStackableId, eventTitle]);

  if (loading) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading promo codes…"
        subtitle={eventTitle}
      />
    );
  }

  return (
    <div>
      <FloatingProgressBar
        active={saving || togglingStackableId != null}
        message={eventPromoProgress.message}
        subtitle={eventPromoProgress.subtitle}
        detail={eventPromoProgress.detail}
      />
      <div className="glass rounded-xl border border-[var(--glass-border)] p-4">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setPromoCardCollapsed((prev) => !prev)}
        >
          <div>
            <h2 className="text-lg font-semibold text-foreground">Promo Codes</h2>
          </div>
          {promoCardCollapsed ? (
            <ChevronRight className="h-4 w-4 text-foreground-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-foreground-muted" />
          )}
        </button>

        {!promoCardCollapsed && (
          <div className="mt-4">
            <div className="flex justify-end mb-4">
              <Button onClick={openCreate} className="min-w-[220px]">
                <Plus className="h-4 w-4 mr-2" />
                Create New Promo Code
              </Button>
            </div>
            <div className="glass rounded-xl border border-[var(--glass-border)] overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[var(--glass-border)]">
                    <th className="p-4 text-sm font-medium text-foreground-muted">Code</th>
                    <th className="p-4 text-sm font-medium text-foreground-muted">Name</th>
                    <th className="p-4 text-sm font-medium text-foreground-muted">Type</th>
                    <th className="p-4 text-sm font-medium text-foreground-muted">Value / Rule</th>
                    <th className="p-4 text-sm font-medium text-foreground-muted">Used</th>
                    <th className="p-4 text-sm font-medium text-foreground-muted">Active</th>
                    <th className="p-4 text-sm font-medium text-foreground-muted">Stackable</th>
                    <th className="p-4 text-sm font-medium text-foreground-muted w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {promos.length ? (
                    promos.map((p) => (
                      <tr key={p.id} className="border-b border-[var(--glass-border)]">
                        <td className="p-4 text-foreground font-mono">{p.code}</td>
                        <td className="p-4 text-foreground-muted text-sm max-w-[140px] truncate" title={p.display_name ?? ""}>
                          {p.display_name || "—"}
                        </td>
                        <td className="p-4 text-foreground-muted capitalize">
                          {parsePromoRule(p.rule) ? "Rule" : p.discount_type}
                        </td>
                        <td className="p-4 text-foreground-muted text-sm max-w-[200px]">
                          {parsePromoRule(p.rule)
                            ? formatPromoRuleSummary(p.rule)
                            : p.discount_type === "percentage"
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
                        <td className="p-4">
                          <Switch
                            checked={p.stackable ?? false}
                            onCheckedChange={() => handleToggleStackable(p)}
                            disabled={togglingStackableId === p.id}
                          />
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
                      <td colSpan={8} className="p-8 text-center text-foreground-muted">
                        No promo codes for this event yet. Create one to offer discounts.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[min(90vh,800px)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit promo code" : "New promo code"}
            </DialogTitle>
            <DialogDescription>
              Simple: percentage or fixed off cart subtotal. Advanced: buy-X-get-free, tiered %, flat bundle, or threshold free, scoped to sections or groups.
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
            <div>
              <Label>Display name (optional)</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Barkada 3+1"
                className="bg-white/5"
              />
            </div>
            <div>
              <Label>Promo mode</Label>
              <Select
                value={promoMode}
                onValueChange={(v: "legacy" | "structured") => setPromoMode(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="legacy">Simple (percent or fixed off subtotal)</SelectItem>
                  <SelectItem value="structured">Advanced (rule: bundles, tiers, …)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {promoMode === "structured" && (
              <div className="space-y-3 rounded-lg border border-[var(--glass-border)] bg-white/5 p-3">
                <div>
                  <Label>Mechanic</Label>
                  <Select
                    value={mechanic}
                    onValueChange={(v: PromoRule["type"]) => setMechanic(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buy_pay_get_free">Buy X get Y free (repeating bundles)</SelectItem>
                      <SelectItem value="tiered_percent">Tiered % by ticket count</SelectItem>
                      <SelectItem value="flat_bundle">Flat bundle (N tickets for fixed price)</SelectItem>
                      <SelectItem value="threshold_free">Threshold (e.g. 6+ get 1 free once)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-foreground-muted">Scope: sections</Label>
                  <div className="mt-1 max-h-32 overflow-y-auto rounded border border-[var(--glass-border)] p-2 space-y-1">
                    {sectionRows.length === 0 ? (
                      <p className="text-xs text-foreground-muted">No sections (configure seating first).</p>
                    ) : (
                      sectionRows.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={scopeSectionIds.includes(s.id)}
                            onChange={() => {
                              setScopeSectionIds((prev) =>
                                prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]
                              );
                            }}
                          />
                          <span>
                            {s.name}
                            {s.section_group ? (
                              <span className="text-foreground-muted"> · {s.section_group}</span>
                            ) : null}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-foreground-muted">Scope: section groups (extra labels)</Label>
                  <p className="text-xs text-foreground-muted mb-1">Comma-separated, or add known groups below.</p>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {distinctSectionGroupLabels.map((g) => (
                        <Button
                          key={g}
                          type="button"
                          size="sm"
                          variant={scopeGroups.includes(g) ? "default" : "secondary"}
                          className="h-7 text-xs"
                          onClick={() => {
                            setScopeGroups((prev) =>
                              prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
                            );
                          }}
                        >
                          {g}
                        </Button>
                      ))}
                  </div>
                  <Input
                    value={scopeGroupInput}
                    onChange={(e) => setScopeGroupInput(e.target.value)}
                    placeholder="e.g. Gen Ad, Upper Box (comma-separated)"
                    className="bg-white/5"
                  />
                </div>

                {mechanic === "buy_pay_get_free" && (
                  <div className="space-y-2">
                    <p className="text-xs text-foreground-muted leading-relaxed">
                      One <strong>full set</strong> is the smallest group that gets free ticket(s). Example: a 4-ticket
                      &quot;3+1&quot; group means <strong>4 tickets per set, 1 free</strong> (so 3 paid + 1 free) — you
                      need <strong>4</strong> eligible tickets for the first free seat. A 5-ticket &quot;4+1&quot; offer
                      needs <strong>5</strong> eligible tickets per set.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Tickets per set (paid + free)</Label>
                        <Input
                          type="number"
                          min={2}
                          value={bpgBundleSize}
                          onChange={(e) => {
                            const b = Math.max(2, parseInt(e.target.value, 10) || 2);
                            setBpgBundleSize(b);
                            setBpgFree((f) => (f >= b ? Math.max(1, b - 1) : f));
                          }}
                        />
                      </div>
                      <div>
                        <Label>Free in each set</Label>
                        <Input
                          type="number"
                          min={1}
                          value={bpgFree}
                          onChange={(e) => {
                            const f = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setBpgFree(f >= bpgBundleSize ? bpgBundleSize - 1 : f);
                          }}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-foreground-muted">
                      Paid per set: {Math.max(1, bpgBundleSize - bpgFree)} (discount applies only for full sets in cart)
                    </p>
                  </div>
                )}

                {mechanic === "tiered_percent" && (
                  <div className="space-y-2">
                    {tiers.map((t, i) => (
                      <div key={i} className="grid grid-cols-3 gap-2 items-end">
                        <div>
                          <Label className="text-xs">Min qty</Label>
                          <Input
                            type="number"
                            min={1}
                            value={t.min_qty}
                            onChange={(e) => {
                              const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                              setTiers((rows) => rows.map((r, j) => (j === i ? { ...r, min_qty: v } : r)));
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Max qty</Label>
                          <Input
                            type="number"
                            min={1}
                            value={t.max_qty}
                            onChange={(e) => {
                              const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                              setTiers((rows) => rows.map((r, j) => (j === i ? { ...r, max_qty: v } : r)));
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">% off</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={t.percent}
                            onChange={(e) => {
                              const v = Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0));
                              setTiers((rows) => rows.map((r, j) => (j === i ? { ...r, percent: v } : r)));
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {mechanic === "flat_bundle" && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Bundle size (tickets)</Label>
                        <Input type="number" min={2} value={bundleSize} onChange={(e) => setBundleSize(Math.max(2, parseInt(e.target.value, 10) || 2))} />
                      </div>
                      <div>
                        <Label>Bundle total (₱)</Label>
                        <Input type="number" min={0} step={0.01} value={bundleTotalPhp} onChange={(e) => setBundleTotalPhp(Math.max(0, parseFloat(e.target.value) || 0))} />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-foreground-muted">
                      <input type="checkbox" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} />
                      Allow multiple full bundles
                    </label>
                  </div>
                )}

                {mechanic === "threshold_free" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Min eligible tickets</Label>
                      <Input type="number" min={2} value={thresholdMin} onChange={(e) => setThresholdMin(Math.max(2, parseInt(e.target.value, 10) || 2))} />
                    </div>
                    <div>
                      <Label>Free tickets (cheapest)</Label>
                      <Input type="number" min={1} value={thresholdFree} onChange={(e) => setThresholdFree(Math.max(1, parseInt(e.target.value, 10) || 1))} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {promoMode === "legacy" && (
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
                <div className="flex items-stretch rounded-lg border border-[var(--glass-border)] bg-white/5 overflow-hidden focus-within:ring-2 focus-within:ring-[var(--wish-orange)] focus-within:ring-offset-2 focus-within:ring-offset-background">
                  <Input
                    type="number"
                    min={0}
                    step={form.discount_type === "percentage" ? 5 : 0.01}
                    className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                  <div className="flex flex-col border-l border-[var(--glass-border)]">
                    <button
                      type="button"
                      aria-label="Increase"
                      className="flex-1 flex items-center justify-center px-2 text-foreground-muted hover:text-foreground hover:bg-white/10 transition-colors min-h-[20px]"
                      onClick={() => {
                        const step = form.discount_type === "percentage" ? 5 : 100;
                        const max = form.discount_type === "percentage" ? 100 : 99999999;
                        setForm((f) => ({
                          ...f,
                          discount_value: Math.min(max, f.discount_value + step),
                        }));
                      }}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Decrease"
                      className="flex-1 flex items-center justify-center px-2 text-foreground-muted hover:text-foreground hover:bg-white/10 transition-colors min-h-[20px] border-t border-[var(--glass-border)]"
                      onClick={() => {
                        const step = form.discount_type === "percentage" ? 5 : 100;
                        setForm((f) => ({
                          ...f,
                          discount_value: Math.max(0, f.discount_value - step),
                        }));
                      }}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            )}
            <div>
              <Label>Max uses (optional)</Label>
              <div className="flex items-stretch rounded-lg border border-[var(--glass-border)] bg-white/5 overflow-hidden focus-within:ring-2 focus-within:ring-[var(--wish-orange)] focus-within:ring-offset-2 focus-within:ring-offset-background">
                <Input
                  type="number"
                  min={0}
                  value={form.max_uses}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, max_uses: e.target.value }))
                  }
                  placeholder="Unlimited"
                  className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <div className="flex flex-col border-l border-[var(--glass-border)]">
                  <button
                    type="button"
                    aria-label="Increase max uses"
                    className="flex-1 flex items-center justify-center px-2 text-foreground-muted hover:text-foreground hover:bg-white/10 transition-colors min-h-[20px]"
                    onClick={() => {
                      const current = parseInt(form.max_uses, 10) || 0;
                      setForm((f) => ({ ...f, max_uses: String(current + 1) }));
                    }}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Decrease max uses"
                    className="flex-1 flex items-center justify-center px-2 text-foreground-muted hover:text-foreground hover:bg-white/10 transition-colors min-h-[20px] border-t border-[var(--glass-border)]"
                    onClick={() => {
                      const current = parseInt(form.max_uses, 10) || 0;
                      if (current > 0) {
                        setForm((f) => ({ ...f, max_uses: current === 1 ? "" : String(current - 1) }));
                      }
                    }}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
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
            <div className="flex items-center gap-2">
              <Switch
                id="stackable"
                checked={form.stackable}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, stackable: v }))
                }
              />
              <Label htmlFor="stackable">Stackable (can combine with early bird and other promos)</Label>
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
