"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SearchHeroProps {
  value: string;
  onChange: (value: string) => void;
  onSearch?: () => void;
  className?: string;
}

export function SearchHero({
  value,
  onChange,
  onSearch,
  className,
}: SearchHeroProps) {
  return (
    <div
      className={cn(
        "flex w-full max-w-2xl mx-auto gap-2 rounded-xl glass border border-[var(--glass-border)] p-2",
        className
      )}
    >
      <Input
        type="search"
        placeholder="Search events, venues, or cities..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSearch?.()}
        className="border-0 bg-transparent focus-visible:ring-0 flex-1"
      />
      <Button
        type="button"
        size="icon"
        onClick={onSearch}
        className="shrink-0 bg-[var(--wish-orange)] hover:bg-[var(--wish-orange-hover)]"
      >
        <Search className="h-4 w-4" aria-hidden />
        <span className="sr-only">Search</span>
      </Button>
    </div>
  );
}
