"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Event } from "@/lib/types";
import {
  fetchCitiesForProvinceCached,
  fetchProvincesCached,
} from "@/lib/geography-fetch-cache";

const MONTH_LABELS: Record<number, string> = {
  1: "January",
  2: "February",
  3: "March",
  4: "April",
  5: "May",
  6: "June",
  7: "July",
  8: "August",
  9: "September",
  10: "October",
  11: "November",
  12: "December",
};

export interface EventFilters {
  year: number | null;
  month: number | null;
  provinceId: string | null;
  cityId: string | null;
}

const defaultFilters: EventFilters = {
  year: null,
  month: null,
  provinceId: null,
  cityId: null,
};

interface EventFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: EventFilters;
  onApply: (filters: EventFilters) => void;
  events: Event[];
}

export function EventFilterDialog({
  open,
  onOpenChange,
  filters,
  onApply,
  events,
}: EventFilterDialogProps) {
  const [localFilters, setLocalFilters] = useState<EventFilters>(filters);
  const [allProvinces, setAllProvinces] = useState<{ id: string; name: string }[]>([]);
  const [allCities, setAllCities] = useState<{ id: string; name: string }[]>([]);

  const { availableYears, availableMonths, provinceIdsWithEvents, cityIdsWithEvents } =
    useMemo(() => {
      const years = new Set<number>();
      const monthsByYear = new Map<number, Set<number>>();
      const provinceIds = new Set<string>();
      const cityIds = new Set<string>();
      for (const e of events) {
        const d = new Date(e.event_start);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        years.add(y);
        if (!monthsByYear.has(y)) monthsByYear.set(y, new Set());
        monthsByYear.get(y)!.add(m);
        if (e.venue?.province_id) provinceIds.add(e.venue.province_id);
        if (e.venue?.city_id) cityIds.add(e.venue.city_id);
      }
      return {
        availableYears: [...years].sort((a, b) => b - a),
        availableMonths: monthsByYear,
        provinceIdsWithEvents: provinceIds,
        cityIdsWithEvents: cityIds,
      };
    }, [events]);

  const monthsForSelectedYear = useMemo(() => {
    if (localFilters.year != null && availableMonths.has(localFilters.year)) {
      return [...availableMonths.get(localFilters.year)!].sort((a, b) => a - b);
    }
    const all = new Set<number>();
    for (const s of availableMonths.values()) {
      for (const m of s) all.add(m);
    }
    return [...all].sort((a, b) => a - b);
  }, [localFilters.year, availableMonths]);

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters, open]);

  useEffect(() => {
    if (
      localFilters.year != null &&
      localFilters.month != null &&
      !availableMonths.get(localFilters.year)?.has(localFilters.month)
    ) {
      setLocalFilters((f) => ({ ...f, month: null }));
    }
  }, [localFilters.year, localFilters.month, availableMonths]);

  useEffect(() => {
    if (!open) return;
    fetchProvincesCached("/api/geography")
      .then(setAllProvinces)
      .catch(() => setAllProvinces([]));
  }, [open]);

  useEffect(() => {
    if (!localFilters.provinceId) {
      setAllCities([]);
      return;
    }
    fetchCitiesForProvinceCached("/api/geography", localFilters.provinceId)
      .then(setAllCities)
      .catch(() => setAllCities([]));
  }, [localFilters.provinceId]);

  const provinces = useMemo(
    () => allProvinces.filter((p) => provinceIdsWithEvents.has(p.id)),
    [allProvinces, provinceIdsWithEvents]
  );

  const cities = useMemo(
    () => allCities.filter((c) => cityIdsWithEvents.has(c.id)),
    [allCities, cityIdsWithEvents]
  );

  const handleProvinceChange = (value: string) => {
    setLocalFilters((f) => ({
      ...f,
      provinceId: value || null,
      cityId: null,
    }));
  };

  const handleApply = () => {
    onApply(localFilters);
    onOpenChange(false);
  };

  const handleReset = () => {
    setLocalFilters(defaultFilters);
    onApply(defaultFilters);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-foreground">Filter events</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label htmlFor="filter-year" className="text-foreground-muted">
              Year
            </Label>
            <Select
              value={localFilters.year != null ? String(localFilters.year) : "all"}
              onValueChange={(v) =>
                setLocalFilters((f) => ({
                  ...f,
                  year: v === "all" ? null : parseInt(v, 10),
                }))
              }
            >
              <SelectTrigger id="filter-year">
                <SelectValue placeholder="All years" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {availableYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="filter-month" className="text-foreground-muted">
              Month
            </Label>
            <Select
              value={localFilters.month != null ? String(localFilters.month) : "all"}
              onValueChange={(v) =>
                setLocalFilters((f) => ({
                  ...f,
                  month: v === "all" ? null : parseInt(v, 10),
                }))
              }
            >
              <SelectTrigger id="filter-month">
                <SelectValue placeholder="All months" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {monthsForSelectedYear.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {MONTH_LABELS[m] ?? String(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="filter-province" className="text-foreground-muted">
              Province
            </Label>
            <Select
              value={localFilters.provinceId ?? "all"}
              onValueChange={(v) =>
                handleProvinceChange(v === "all" ? "" : v)
              }
            >
              <SelectTrigger id="filter-province">
                <SelectValue placeholder="All provinces" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All provinces</SelectItem>
                {provinces.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="filter-city" className="text-foreground-muted">
              City
            </Label>
            <Select
              value={localFilters.cityId ?? "all"}
              onValueChange={(v) =>
                setLocalFilters((f) => ({
                  ...f,
                  cityId: v === "all" ? null : v,
                }))
              }
              disabled={!localFilters.provinceId}
            >
              <SelectTrigger id="filter-city">
                <SelectValue placeholder="All cities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cities</SelectItem>
                {cities.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={handleReset}
              className="flex-1"
            >
              Reset
            </Button>
            <Button
              onClick={handleApply}
              className="flex-1 bg-[var(--wish-orange)] hover:bg-[var(--wish-orange-hover)]"
            >
              Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
