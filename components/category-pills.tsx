"use client";

import { useState, useEffect } from "react";
import type { EventCategoryOption } from "@/lib/events/categories-server";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CategoryItem {
  value: string;
  label: string;
}

interface CategoryPillsProps {
  active: string;
  onChange: (category: string) => void;
  className?: string;
  /** From server — when set, seeds the select and skips the client categories fetch. */
  initialCategories?: EventCategoryOption[] | null;
}

const defaultCategoryItems: CategoryItem[] = [{ value: "all", label: "ALL" }];

export function CategoryPills({
  active,
  onChange,
  className,
  initialCategories,
}: CategoryPillsProps) {
  const seeded =
    Array.isArray(initialCategories) && initialCategories.length > 0;

  // Use `value` (canonical DB category string), not display `label`, so filters match `events.category`
  // before and after `/api/events/categories` loads — avoids Radix controlled-value drift on mobile.
  const [categories, setCategories] = useState<CategoryItem[]>(() =>
    seeded
      ? initialCategories.map((c) => ({
          value: c.value === "all" ? "all" : c.value,
          label: c.label,
        }))
      : defaultCategoryItems
  );

  useEffect(() => {
    if (seeded) return;
    fetch("/api/events/categories")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setCategories([{ value: "all", label: "ALL" }, ...data]);
        }
      })
      .catch(() => {});
  }, [seeded]);

  /** If a legacy/wrong casing value is active, align to a real option so the grid query matches the UI. */
  useEffect(() => {
    if (categories.length === 0 || active === "all") return;
    if (categories.some((c) => c.value === active)) return;
    const ci = categories.find(
      (c) => c.value.toLowerCase() === active.toLowerCase()
    );
    onChange(ci?.value ?? "all");
  }, [categories, active, onChange]);

  return (
    <div
      className={cn(
        "shrink-0 w-[min(42vw,11rem)] min-w-[7.25rem] max-w-[13rem] sm:min-w-[9rem] sm:max-w-[15rem]",
        className
      )}
    >
      <Select value={active} onValueChange={onChange}>
        <SelectTrigger
          aria-label="Event category"
          className="h-11 w-full rounded-xl glass border border-[var(--glass-border)] bg-white/5 px-3 text-sm text-foreground shadow-none focus:ring-2 focus:ring-[var(--wish-orange)] focus:ring-offset-0"
        >
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          {categories.map(({ value, label }) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
