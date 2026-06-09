"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Armchair,
  CalendarDays,
  CreditCard,
  LockKeyhole,
  Mail,
  Megaphone,
  QrCode,
  Shield,
  Tag,
  Ticket,
  Trash2,
  Users,
} from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SettingsTabOption = { value: string; label: string };

const SETTINGS_TAB_ICONS: Record<string, LucideIcon> = {
  events: CalendarDays,
  seat: Armchair,
  email: Mail,
  "ticket-scanning-source": QrCode,
  "ticket-layout": Ticket,
  promos: Tag,
  paymongo: CreditCard,
  "meta-pixel": Megaphone,
  "user-roles": Shield,
  users: Users,
  "session-security": LockKeyhole,
  "storage-cleanup": Trash2,
};

type SettingsTabsShellProps = {
  tabOptions: SettingsTabOption[];
  defaultValue: string;
  /** Tab panels (`TabsContent` + settings UI) composed on the server to avoid importing Server Components into this client module. */
  children: ReactNode;
};

export function SettingsTabsShell({
  tabOptions,
  defaultValue,
  children,
}: SettingsTabsShellProps) {
  const allowedValues = useMemo(() => new Set(tabOptions.map((t) => t.value)), [tabOptions]);
  const tabMap = useMemo(
    () =>
      Object.fromEntries(tabOptions.map((option) => [option.value, option])) as Record<
        string,
        SettingsTabOption
      >,
    [tabOptions]
  );

  const [active, setActive] = useState(() =>
    allowedValues.has(defaultValue) ? defaultValue : tabOptions[0]?.value ?? "email"
  );
  const renderTabLabel = (value: string, label: string) => {
    const Icon = SETTINGS_TAB_ICONS[value];
    return (
      <div className="flex w-full items-center gap-2">
        {Icon ? <Icon className="h-4 w-4 text-foreground-muted" aria-hidden /> : null}
        <span>{label}</span>
      </div>
    );
  };

  useEffect(() => {
    if (!allowedValues.has(active)) {
      setActive(allowedValues.has(defaultValue) ? defaultValue : tabOptions[0]?.value ?? "email");
    }
  }, [active, allowedValues, defaultValue, tabOptions]);

  return (
    <Tabs value={active} onValueChange={setActive} className="w-full">
      <div className="mb-6 space-y-2 max-w-xl">
        <Label htmlFor="settings-section" className="text-sm text-foreground-muted">
          Settings section
        </Label>
        <Select value={active} onValueChange={setActive}>
          <SelectTrigger
            id="settings-section"
            aria-label="Settings section"
            className="h-11 w-full rounded-xl glass border border-[var(--glass-border)] bg-white/5 text-sm text-foreground shadow-none focus:ring-2 focus:ring-[var(--wish-orange)] focus:ring-offset-0"
          >
            {active && tabMap[active] ? (
              renderTabLabel(active, tabMap[active].label)
            ) : (
              <SelectValue placeholder="Choose a section" />
            )}
          </SelectTrigger>
          <SelectContent>
            {tabOptions.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {renderTabLabel(t.value, t.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {children}
    </Tabs>
  );
}
