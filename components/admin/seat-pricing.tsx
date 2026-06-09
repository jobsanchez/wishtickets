"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";

interface Section {
  id: string;
  name: string;
  section_group?: string | null;
  color?: string | null;
}

interface EarlyBird {
  id: string;
  section_id: string;
  discount_percent: number;
}

interface SeatPricingProps {
  eventId: string;
  venueId: string | null;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const d = startOfLocalDay(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween(later: Date, earlier: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const startLater = startOfLocalDay(later).getTime();
  const startEarlier = startOfLocalDay(earlier).getTime();
  return Math.round((startLater - startEarlier) / msPerDay);
}

const STEP_PHP = 5; // 5 PHP per click
const STEP_PERCENT = 5;
const UNGROUPED_GROUP_LABEL = "Ungrouped";

function NumberStepper({
  value,
  onChange,
  min,
  max,
  step,
  format = (v) => String(v),
  parse = (s) => parseInt(s, 10) || 0,
  className = "",
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (n: number) => string;
  parse?: (s: string) => number;
  className?: string;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = parse(e.target.value);
    onChange(Math.min(max, Math.max(min, n)));
  };
  const inc = () => onChange(Math.min(max, value + step));
  const dec = () => onChange(Math.max(min, value - step));
  return (
    <div className={cn("flex items-center rounded-lg border border-[var(--glass-border)] bg-white/5 overflow-hidden", className)}>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={format(value)}
        onChange={handleChange}
        className="w-20 border-0 rounded-none bg-transparent focus-visible:ring-0 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <div className="flex flex-col border-l border-[var(--glass-border)]">
        <button
          type="button"
          onClick={inc}
          disabled={value >= max}
          className="p-0.5 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
          aria-label="Increase"
        >
          <ChevronUp className="h-4 w-4 text-foreground-muted" />
        </button>
        <button
          type="button"
          onClick={dec}
          disabled={value <= min}
          className="p-0.5 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors border-t border-[var(--glass-border)]"
          aria-label="Decrease"
        >
          <ChevronDown className="h-4 w-4 text-foreground-muted" />
        </button>
      </div>
    </div>
  );
}

export function SeatPricing({ eventId, venueId }: SeatPricingProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localPrices, setLocalPrices] = useState<Record<string, number>>({});
  const [localFree, setLocalFree] = useState<Record<string, boolean>>({});
  const [earlyBirdEnabled, setEarlyBirdEnabled] = useState(false);
  const [saleSuccessEmailEnabled, setSaleSuccessEmailEnabled] = useState(false);
  const [localEarlyBird, setLocalEarlyBird] = useState<Record<string, number>>({});
  const [localEarlyBirdEnabled, setLocalEarlyBirdEnabled] = useState<Record<string, boolean>>({});
  const [eventStartIso, setEventStartIso] = useState<string | null>(null);
  const [earlyBirdStartDaysBefore, setEarlyBirdStartDaysBefore] = useState<number>(30);
  const [earlyBirdEndDaysBefore, setEarlyBirdEndDaysBefore] = useState<number>(1);
  const [saleLabel, setSaleLabel] = useState("");
  const [collapsedGroupNames, setCollapsedGroupNames] = useState<Set<string>>(new Set());

  function getSectionGroupName(section: Section): string {
    const groupName = (section.section_group ?? "").trim();
    return groupName || UNGROUPED_GROUP_LABEL;
  }

  const fetchPricing = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/pricing`);
      const data = await res.json();
      if (res.ok) {
        setSections(data.sections ?? []);
        const map: Record<string, number> = {};
        const freeMap: Record<string, boolean> = {};
        for (const p of data.prices ?? []) {
          map[p.section_id] = p.price_cents;
          freeMap[p.section_id] = p.price_cents === 0;
        }
        setLocalPrices(map);
        setLocalFree(freeMap);

        const ebList: EarlyBird[] = data.early_bird ?? [];
        setEarlyBirdEnabled(Boolean(data.early_bird_enabled));
        const ebMap: Record<string, number> = {};
        const ebEnabledMap: Record<string, boolean> = {};
        for (const eb of ebList) {
          ebMap[eb.section_id] = eb.discount_percent ?? 0;
          ebEnabledMap[eb.section_id] = true;
        }
        setLocalEarlyBird(ebMap);
        setLocalEarlyBirdEnabled(ebEnabledMap);

        const eventStart: string | null = data.event_start ?? null;
        setEventStartIso(eventStart);
        setSaleSuccessEmailEnabled(Boolean(data.sale_success_email_enabled));
        setSaleLabel(
          typeof data.sale_label === "string" ? data.sale_label.toUpperCase() : ""
        );

        if (eventStart && data.early_bird_starts_at && data.early_bird_ends_at) {
          const eventDate = startOfLocalDay(new Date(eventStart));
          const ebStartDate = startOfLocalDay(new Date(data.early_bird_starts_at));
          const ebEndDate = startOfLocalDay(new Date(data.early_bird_ends_at));
          const startDays = Math.max(0, daysBetween(eventDate, ebStartDate));
          const endDays = Math.max(0, daysBetween(eventDate, ebEndDate));
          setEarlyBirdStartDaysBefore(startDays);
          setEarlyBirdEndDaysBefore(endDays);
        } else {
          // Defaults when early bird is first configured or dates are missing
          setEarlyBirdStartDaysBefore(30);
          setEarlyBirdEndDaysBefore(1);
        }
      } else {
        toast.error(data.error ?? "Failed to load pricing");
      }
    } catch {
      toast.error("Failed to load pricing");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchPricing();
  }, [fetchPricing]);

  const sectionsByGroup = useMemo(() => {
    const grouped = new Map<string, Section[]>();
    for (const section of sections) {
      const groupName = getSectionGroupName(section);
      const existing = grouped.get(groupName) ?? [];
      existing.push(section);
      grouped.set(groupName, existing);
    }
    return [...grouped.entries()].map(([groupName, groupedSections]) => ({
      groupName,
      sections: groupedSections,
    }));
  }, [sections]);

  useEffect(() => {
    setCollapsedGroupNames((prev) => {
      const next = new Set(prev);
      for (const group of sectionsByGroup) {
        if (!next.has(group.groupName)) next.add(group.groupName);
      }
      return next;
    });
  }, [sectionsByGroup]);

  function toggleGroup(groupName: string) {
    setCollapsedGroupNames((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  }

  function getPrice(sectionId: string): number {
    return localPrices[sectionId] ?? 0;
  }

  function setPrice(sectionId: string, cents: number) {
    setLocalPrices((prev) => ({ ...prev, [sectionId]: cents }));
  }

  function getFree(sectionId: string): boolean {
    return localFree[sectionId] ?? false;
  }

  function setFree(sectionId: string, isFree: boolean) {
    setLocalFree((prev) => ({ ...prev, [sectionId]: isFree }));
    if (isFree) {
      setLocalPrices((prev) => ({ ...prev, [sectionId]: 0 }));
      setLocalEarlyBirdEnabled((prev) => ({ ...prev, [sectionId]: false }));
    }
  }

  function getEarlyBirdPercent(sectionId: string): number {
    return localEarlyBird[sectionId] ?? 0;
  }

  function setEarlyBirdPercent(sectionId: string, percent: number) {
    setLocalEarlyBird((prev) => ({ ...prev, [sectionId]: Math.min(100, Math.max(0, percent)) }));
  }

  function getEarlyBirdEnabled(sectionId: string): boolean {
    return localEarlyBirdEnabled[sectionId] ?? false;
  }

  function setEarlyBirdEnabledForSection(sectionId: string, enabled: boolean) {
    setLocalEarlyBirdEnabled((prev) => ({ ...prev, [sectionId]: enabled }));
  }

  async function handleSave() {
    if (earlyBirdEnabled) {
      if (!eventStartIso) {
        toast.error("Event date is missing. Set it on the Event Details tab first.");
        return;
      }
      if (
        earlyBirdStartDaysBefore < 0 ||
        earlyBirdEndDaysBefore < 0 ||
        !Number.isFinite(earlyBirdStartDaysBefore) ||
        !Number.isFinite(earlyBirdEndDaysBefore)
      ) {
        toast.error("Start and end days must be zero or positive numbers when sale pricing is enabled.");
        return;
      }
      if (earlyBirdStartDaysBefore <= earlyBirdEndDaysBefore) {
        toast.error("Start must be more days before the event than End (e.g., 30 days start, 7 days end).");
        return;
      }
    }

    setSaving(true);
    try {
      const priceRows = sections.map((sec) => ({
        section_id: sec.id,
        price_cents: getFree(sec.id) ? 0 : getPrice(sec.id),
      }));

      const earlyBirdRows =
        earlyBirdEnabled
          ? sections
              .filter((sec) => !getFree(sec.id) && getEarlyBirdEnabled(sec.id))
              .map((sec) => ({
                section_id: sec.id,
                discount_percent: getEarlyBirdPercent(sec.id),
              }))
          : [];

      const payload: {
        prices: typeof priceRows;
        early_bird: typeof earlyBirdRows;
        early_bird_starts_at?: string;
        early_bird_ends_at?: string;
        early_bird_enabled: boolean;
        sale_success_email_enabled: boolean;
        sale_label: string | null;
      } = {
        prices: priceRows,
        early_bird: earlyBirdRows,
        early_bird_enabled: earlyBirdEnabled,
        sale_success_email_enabled: saleSuccessEmailEnabled,
        sale_label: saleLabel.trim() ? saleLabel.trim() : null,
      };
      if (earlyBirdEnabled && eventStartIso) {
        const eventDate = startOfLocalDay(new Date(eventStartIso));
        const ebStartDate = addDays(eventDate, -earlyBirdStartDaysBefore);
        const ebEndDate = addDays(eventDate, -earlyBirdEndDaysBefore);
        payload.early_bird_starts_at = ebStartDate.toISOString();
        payload.early_bird_ends_at = ebEndDate.toISOString();
      }

      const res = await fetch(`/api/admin/events/${eventId}/pricing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to save");
        return;
      }
      toast.success("Pricing saved");
      fetchPricing();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <FloatingProgressBar
          active
          {...FLOATING_PROGRESS_PRESETS.genericLoad}
          message="Loading pricing…"
          subtitle="Seat pricing"
        />
        <div className="glass rounded-xl border border-[var(--glass-border)] p-6 text-foreground-muted">
          Loading pricing...
        </div>
      </>
    );
  }

  if (!venueId && sections.length === 0) {
    return (
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">Seat Pricing</h2>
        <p className="text-foreground-muted text-sm">
          Configure seating in Seat Configurator first, or select a venue in Event Details to use venue sections.
        </p>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">Seat Pricing</h2>
        <p className="text-foreground-muted text-sm">
          No sections found. Add sections in Seat Configurator or copy from venue.
        </p>
      </div>
    );
  }

  return (
    <>
      <FloatingProgressBar
        active={saving}
        message="Saving pricing"
        subtitle="This event"
        detail={FLOATING_PROGRESS_PRESETS.genericSave.detail}
      />
      <div className="glass rounded-xl border border-[var(--glass-border)] p-6 space-y-6">
        <h2 className="text-lg font-semibold text-foreground">Seat Pricing</h2>
        <p className="text-sm text-foreground-muted">
          Set base price per section. Optional: enable a timed sale for discounted prices within a window before the event date.
        </p>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="early-bird"
            checked={earlyBirdEnabled}
            onCheckedChange={(v) => {
              setEarlyBirdEnabled(v);
              if (v) {
                const all: Record<string, boolean> = {};
                for (const sec of sections) all[sec.id] = true;
                setLocalEarlyBirdEnabled(all);
              }
            }}
          />
          <Label htmlFor="early-bird" className="text-foreground-muted">Enable Sale</Label>
        </div>
        {earlyBirdEnabled && (
          <>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <Label htmlFor="sale-label" className="text-foreground-muted text-xs shrink-0">
                Sale Label
              </Label>
              <Input
                id="sale-label"
                value={saleLabel}
                onChange={(e) => setSaleLabel(e.target.value.toUpperCase())}
                placeholder="Shown on event cards during the sale"
                maxLength={100}
                className="max-w-md flex-1 min-w-[12rem] bg-white/5 border-[var(--glass-border)] uppercase tracking-wide"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-foreground-muted text-xs shrink-0">Starts</Label>
              <NumberStepper
                value={earlyBirdStartDaysBefore}
                onChange={(v) => setEarlyBirdStartDaysBefore(Math.max(0, Math.round(v)))}
                min={0}
                max={365}
                step={1}
                format={(v) => String(Math.round(v))}
                className="w-28"
              />
              <span className="text-foreground-muted text-xs shrink-0">
                days before the event
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-foreground-muted text-xs shrink-0">Ends</Label>
              <NumberStepper
                value={earlyBirdEndDaysBefore}
                onChange={(v) => setEarlyBirdEndDaysBefore(Math.max(0, Math.round(v)))}
                min={0}
                max={365}
                step={1}
                format={(v) => String(Math.round(v))}
                className="w-28"
              />
              <span className="text-foreground-muted text-xs shrink-0">
                days before the event
              </span>
            </div>
          </>
        )}
      </div>

      <div className="space-y-4">
        {sectionsByGroup.map((group) => {
          const isCollapsed = collapsedGroupNames.has(group.groupName);
          return (
            <div
              key={group.groupName}
              className="rounded-lg border border-[var(--glass-border)] bg-black/10"
            >
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-white/5"
                onClick={() => toggleGroup(group.groupName)}
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{group.groupName}</p>
                  <p className="text-xs text-foreground-muted">
                    {group.sections.length} section{group.sections.length === 1 ? "" : "s"}
                  </p>
                </div>
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-foreground-muted" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-foreground-muted" />
                )}
              </button>
              {!isCollapsed && (
                <div className="space-y-3 border-t border-[var(--glass-border)] p-3">
                  {group.sections.map((sec) => (
                    <div
                      key={sec.id}
                      className="rounded-lg border border-[var(--glass-border)] p-4 bg-white/5 flex flex-wrap items-center gap-4"
                      style={sec.color ? { borderColor: sec.color } : undefined}
                    >
                      <h3 className="font-medium text-foreground w-full sm:w-auto">{sec.name}</h3>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`free-${sec.id}`}
                            checked={getFree(sec.id)}
                            onCheckedChange={(v) => setFree(sec.id, v)}
                          />
                          <Label htmlFor={`free-${sec.id}`} className="text-foreground-muted text-xs shrink-0">Free</Label>
                        </div>
                        {!getFree(sec.id) && (
                          <>
                            <div className="flex items-center gap-2">
                              <Label className="text-foreground-muted text-xs shrink-0">
                                {earlyBirdEnabled ? "Regular price (PHP)" : "Price (PHP)"}
                              </Label>
                              <NumberStepper
                                value={getPrice(sec.id) / 100}
                                onChange={(v) => setPrice(sec.id, Math.round(v * 100))}
                                min={0}
                                max={999999}
                                step={STEP_PHP}
                                format={(v) => String(Math.round(v))}
                                parse={(s) => parseFloat(s) || 0}
                              />
                            </div>
                            {earlyBirdEnabled && (
                              <div className="ml-auto flex items-center justify-end gap-2">
                                <Switch
                                  id={`early-bird-${sec.id}`}
                                  checked={getEarlyBirdEnabled(sec.id)}
                                  onCheckedChange={(v) => setEarlyBirdEnabledForSection(sec.id, v)}
                                />
                                <Label
                                  htmlFor={`early-bird-${sec.id}`}
                                  className="text-foreground-muted text-xs shrink-0 text-right"
                                >
                                  Sale Amount (Percentage)
                                </Label>
                                <NumberStepper
                                  value={getEarlyBirdPercent(sec.id)}
                                  onChange={(v) => setEarlyBirdPercent(sec.id, v)}
                                  min={0}
                                  max={100}
                                  step={STEP_PERCENT}
                                  format={(v) => String(Math.round(v))}
                                  parse={(s) => parseInt(s, 10) || 0}
                                />
                                {getEarlyBirdEnabled(sec.id) && (
                                  <span className="text-sm text-[var(--wish-orange)] font-medium">
                                    ₱{Math.floor((getPrice(sec.id) * (100 - getEarlyBirdPercent(sec.id))) / 10000).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save pricing"}
        </Button>
        <div className="flex items-center gap-2">
          <Switch
            id="sale-success-email-enabled"
            checked={saleSuccessEmailEnabled}
            onCheckedChange={setSaleSuccessEmailEnabled}
            disabled={saving}
          />
          <Label htmlFor="sale-success-email-enabled" className="text-foreground-muted text-sm">
            Email admins when sale succeeds
          </Label>
        </div>
      </div>
    </div>
    </>
  );
}
