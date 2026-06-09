"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { RouteLoading } from "@/components/ui/route-loading";
import { usePermissionDialog } from "@/components/providers/permission-dialog-provider";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  DASHBOARD_ACCESS_LABELS,
  DASHBOARD_BOX_CAPABILITIES,
  type DashboardBoxCapability,
} from "@/lib/capabilities";
import { ChevronRight } from "lucide-react";

const DASHBOARD_CAP_SET = new Set<string>(DASHBOARD_BOX_CAPABILITIES);

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  created_at: string | null;
  /** From GET /api/admin/users; used for dashboard access dialog + merge on save. */
  capabilities: string[];
};

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
  { value: "admissions_staff", label: "Admissions Staff" },
  { value: "super_admin", label: "Super Admin" },
];

/** Display order: highest privilege first */
const ROLE_CARD_ORDER = ["super_admin", "admin", "admissions_staff", "user"] as const;
type AppRole = (typeof ROLE_CARD_ORDER)[number];

const ROLE_CARD_HEADINGS: Record<AppRole, string> = {
  super_admin: "Super Admins",
  admin: "Admins",
  admissions_staff: "Admissions Staff",
  user: "Users",
};

/** Full-card solid tint (no `glass`; no gradients). */
const ROLE_CARD_APPEARANCE: Record<AppRole, string> = {
  super_admin:
    "border-2 border-amber-500/60 bg-amber-100/80 dark:bg-amber-950/90 ring-1 ring-inset ring-amber-400/25 dark:ring-amber-400/15",
  admin:
    "border-2 border-sky-500/60 bg-sky-100/80 dark:bg-sky-950/90 ring-1 ring-inset ring-sky-400/25 dark:ring-sky-400/15",
  admissions_staff:
    "border-2 border-emerald-500/60 bg-emerald-100/80 dark:bg-emerald-950/90 ring-1 ring-inset ring-emerald-400/25 dark:ring-emerald-400/15",
  user:
    "border-2 border-slate-400/55 bg-slate-100/90 dark:bg-slate-900/90 ring-1 ring-inset ring-slate-400/20 dark:ring-slate-400/12",
};

const ROLE_HEADER_DIVIDER: Record<AppRole, string> = {
  super_admin: "border-b border-amber-500/35 dark:border-amber-400/35",
  admin: "border-b border-sky-500/35 dark:border-sky-400/35",
  admissions_staff: "border-b border-emerald-500/35 dark:border-emerald-400/35",
  user: "border-b border-slate-500/30 dark:border-slate-400/30",
};

function normalizeAppRole(role: string | null): AppRole {
  const v = (role ?? "user").trim() || "user";
  if (ROLE_OPTIONS.some((r) => r.value === v)) {
    return v as AppRole;
  }
  return "user";
}

function roleLabel(role: string | null): string {
  const v = (role ?? "user").trim();
  return ROLE_OPTIONS.find((r) => r.value === v)?.label ?? v.replace(/_/g, " ");
}

function initialOpenByRole(): Record<AppRole, boolean> {
  return {
    super_admin: false,
    admin: false,
    admissions_staff: false,
    user: false,
  };
}

function initialSearchByRole(): Record<AppRole, string> {
  return {
    super_admin: "",
    admin: "",
    admissions_staff: "",
    user: "",
  };
}

function readDashboardDraft(caps: string[] | undefined): Record<DashboardBoxCapability, boolean> {
  const set = new Set(caps ?? []);
  const o = {} as Record<DashboardBoxCapability, boolean>;
  for (const c of DASHBOARD_BOX_CAPABILITIES) {
    o[c] = set.has(c);
  }
  return o;
}

export function UserRolesSettings() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [savingAccessUserId, setSavingAccessUserId] = useState<string | null>(null);
  const [openByRole, setOpenByRole] = useState<Record<AppRole, boolean>>(initialOpenByRole);
  const [searchByRole, setSearchByRole] = useState<Record<AppRole, string>>(initialSearchByRole);
  const { showPermissionDialog } = usePermissionDialog() ?? { showPermissionDialog: () => {} };
  const [accessDialogUser, setAccessDialogUser] = useState<UserRow | null>(null);
  const [dashboardDraft, setDashboardDraft] = useState<Record<DashboardBoxCapability, boolean> | null>(
    null
  );

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.status === 403) {
      showPermissionDialog();
      return;
    }
    if (!res.ok) {
      toast.error("Failed to load users");
      return;
    }
    const data = await res.json();
    const list = (Array.isArray(data) ? data : []) as UserRow[];
    setUsers(
      list.map((u) => ({
        ...u,
        capabilities: Array.isArray(u.capabilities) ? u.capabilities : [],
      }))
    );
  }, [showPermissionDialog]);

  const openDashboardAccessDialog = (u: UserRow) => {
    setAccessDialogUser(u);
    if (normalizeAppRole(u.role) === "super_admin") {
      setDashboardDraft(
        DASHBOARD_BOX_CAPABILITIES.reduce(
          (acc, c) => {
            acc[c] = true;
            return acc;
          },
          {} as Record<DashboardBoxCapability, boolean>
        )
      );
    } else {
      setDashboardDraft(readDashboardDraft(u.capabilities));
    }
  };

  const closeAccessDialog = () => {
    setAccessDialogUser(null);
    setDashboardDraft(null);
  };

  const saveDashboardAccess = async () => {
    if (!accessDialogUser || !dashboardDraft) return;
    const isSuper = normalizeAppRole(accessDialogUser.role) === "super_admin";
    if (isSuper) {
      closeAccessDialog();
      return;
    }
    const uid = accessDialogUser.id;
    setSavingAccessUserId(uid);
    const capList = accessDialogUser.capabilities ?? [];
    const other = capList.filter((c) => !DASHBOARD_CAP_SET.has(c));
    const selected = DASHBOARD_BOX_CAPABILITIES.filter((c) => dashboardDraft[c]);
    const nextCapabilities = [...other, ...selected];
    try {
      const res = await fetch(`/api/admin/users/${uid}/capabilities`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capabilities: nextCapabilities }),
      });
      if (res.status === 403) {
        showPermissionDialog();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Failed to save");
        return;
      }
      setUsers((prev) =>
        prev.map((row) =>
          row.id === uid ? { ...row, capabilities: nextCapabilities } : row
        )
      );
      toast.success("Dashboard access updated");
      closeAccessDialog();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSavingAccessUserId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setCurrentUserId(session?.user?.id ?? null);
    });

    async function init() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!cancelled) setCurrentUserId(user?.id ?? null);
        await loadUsers();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void init();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadUsers]);

  async function updateRole(userId: string, newRole: string) {
    setSavingUserId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.status === 403) {
        showPermissionDialog();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Failed to update role");
        return;
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      toast.success("Role updated");
    } catch {
      toast.error("Failed to update role");
    } finally {
      setSavingUserId(null);
    }
  }

  const usersByRole = useMemo(() => {
    const map = new Map<AppRole, UserRow[]>();
    for (const r of ROLE_CARD_ORDER) {
      map.set(r, []);
    }
    for (const u of users) {
      const key = normalizeAppRole(u.role);
      const list = map.get(key) ?? [];
      list.push(u);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const an = (a.full_name || a.email || "").toLowerCase();
        const bn = (b.full_name || b.email || "").toLowerCase();
        return an.localeCompare(bn);
      });
    }
    return map;
  }, [users]);

  if (loading) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading users…"
        subtitle="Assign portal roles (super admin)."
      />
    );
  }

  return (
    <div className="space-y-6">
      <FloatingProgressBar
        active={savingUserId != null || savingAccessUserId != null}
        {...FLOATING_PROGRESS_PRESETS.genericSave}
        message={
          savingUserId != null
            ? "Updating role…"
            : savingAccessUserId != null
              ? "Saving dashboard access…"
              : "Saving…"
        }
        subtitle={
          savingUserId
            ? users.find((u) => u.id === savingUserId)?.email ??
              users.find((u) => u.id === savingUserId)?.full_name ??
              undefined
            : savingAccessUserId
              ? users.find((u) => u.id === savingAccessUserId)?.email ??
                users.find((u) => u.id === savingAccessUserId)?.full_name ??
                undefined
              : undefined
        }
      />
      <div>
        <h2 className="text-lg font-semibold text-foreground">User Roles</h2>
        <p className="text-sm text-foreground-muted mt-1 max-w-2xl">
          Set each account&apos;s <strong>role</strong> (User, Admin, Admissions Staff, Super Admin).
          For admin staff, use <strong>Dashboard access</strong> to pick which /admin home cards they see
          (Events, Venues, Reports, Refund lookup, Ticket resending). Event-specific access is set under{" "}
          <strong>Event Administrators</strong>. You cannot change your own role here.
        </p>
      </div>

      <div className="space-y-5">
        {ROLE_CARD_ORDER.map((roleKey) => {
          const list = usersByRole.get(roleKey) ?? [];
          const query = searchByRole[roleKey].trim().toLowerCase();
          const filteredList =
            query.length === 0
              ? list
              : list.filter((u) => {
                  const name = u.full_name?.toLowerCase() ?? "";
                  const email = u.email?.toLowerCase() ?? "";
                  return name.includes(query) || email.includes(query);
                });
          const isOpen = openByRole[roleKey];
          return (
            <div
              key={roleKey}
              className={cn("rounded-xl overflow-hidden backdrop-blur-sm", ROLE_CARD_APPEARANCE[roleKey])}
            >
              <button
                type="button"
                onClick={() =>
                  setOpenByRole((prev) => ({ ...prev, [roleKey]: !prev[roleKey] }))
                }
                className={cn(
                  "w-full text-left px-4 py-3 sm:px-5 flex items-start gap-3 sm:gap-3.5 bg-black/[0.02] hover:bg-black/[0.06] dark:bg-black/10 dark:hover:bg-black/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wish-orange)] focus-visible:ring-inset transition-colors",
                  ROLE_HEADER_DIVIDER[roleKey]
                )}
                aria-expanded={isOpen}
                aria-controls={`user-role-card-${roleKey}`}
                id={`user-role-card-trigger-${roleKey}`}
              >
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0 mt-0.5 text-foreground-muted transition-transform duration-200",
                    isOpen && "rotate-90"
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-foreground">
                    {ROLE_CARD_HEADINGS[roleKey]}
                  </h3>
                  <p className="text-xs text-foreground-muted mt-0.5">
                    {list.length === 0
                      ? "No accounts in this role"
                      : `${list.length} account${list.length === 1 ? "" : "s"}`}
                  </p>
                </div>
              </button>
              {isOpen && (
                <div
                  id={`user-role-card-${roleKey}`}
                  role="region"
                  aria-labelledby={`user-role-card-trigger-${roleKey}`}
                  className="space-y-3 p-3 sm:p-4"
                >
                  <div className="max-w-sm">
                    <Input
                      type="search"
                      placeholder={`Search ${ROLE_CARD_HEADINGS[roleKey].toLowerCase()}...`}
                      className="shadow-none ring-1 ring-black/10 dark:ring-white/10 bg-white/55 dark:bg-black/20"
                      value={searchByRole[roleKey]}
                      onChange={(e) =>
                        setSearchByRole((prev) => ({
                          ...prev,
                          [roleKey]: e.target.value,
                        }))
                      }
                      aria-label={`Search users in ${ROLE_CARD_HEADINGS[roleKey]}`}
                    />
                    <p className="mt-1 text-xs text-foreground-muted">
                      {query.length > 0
                        ? `${filteredList.length} of ${list.length} account${
                            list.length === 1 ? "" : "s"
                          } shown`
                        : `${list.length} account${list.length === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  {filteredList.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="p-3 sm:p-4 font-medium text-foreground-muted">Name</th>
                            <th className="p-3 sm:p-4 font-medium text-foreground-muted">Email</th>
                            <th className="p-3 sm:p-4 font-medium text-foreground-muted min-w-[180px]">Role</th>
                            <th className="p-3 sm:p-4 font-medium text-foreground-muted min-w-[200px]">
                              Dashboard
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredList.map((u) => {
                            const value = (u.role ?? "user").trim() || "user";
                            const isSelf = currentUserId != null && u.id === currentUserId;
                            const rKey = normalizeAppRole(u.role);
                            const showDashboardBtn =
                              rKey === "admin" || rKey === "admissions_staff" || rKey === "super_admin";
                            return (
                              <tr
                                key={u.id}
                                className="border-b border-black/10 dark:border-white/10 last:border-0 bg-black/[0.02] hover:bg-black/[0.06] dark:bg-black/10 dark:hover:bg-black/20"
                              >
                                <td className="p-3 sm:p-4 text-foreground align-top">
                                  {u.full_name?.trim() ? u.full_name : "—"}
                                </td>
                                <td className="p-3 sm:p-4 text-foreground-muted align-top break-all">
                                  {u.email?.trim() ? u.email : "—"}
                                </td>
                                <td className="p-3 sm:p-4 align-top">
                                  {isSelf ? (
                                    <span className="text-foreground-muted capitalize">
                                      {roleLabel(u.role)} <span className="text-xs">(you)</span>
                                    </span>
                                  ) : (
                                    <Select
                                      value={ROLE_OPTIONS.some((r) => r.value === value) ? value : "user"}
                                      onValueChange={(v) => updateRole(u.id, v)}
                                      disabled={savingUserId === u.id}
                                    >
                                      <SelectTrigger className="h-9 w-full max-w-[220px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {ROLE_OPTIONS.map((opt) => (
                                          <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </td>
                                <td className="p-3 sm:p-4 align-top">
                                  {showDashboardBtn && (
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      className="whitespace-nowrap"
                                      onClick={() => openDashboardAccessDialog(u)}
                                      disabled={savingUserId === u.id || savingAccessUserId === u.id}
                                    >
                                      {rKey === "super_admin" ? "View…" : "Configure…"}
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-foreground-muted bg-black/[0.03] dark:bg-black/5 rounded-md p-3 sm:p-4">
                      {query.length > 0
                        ? "No accounts match your search in this role."
                        : "No accounts in this role"}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={accessDialogUser != null} onOpenChange={(o) => !o && closeAccessDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dashboard access</DialogTitle>
            <DialogDescription>
              {accessDialogUser && normalizeAppRole(accessDialogUser.role) === "super_admin" ? (
                <>
                  Super administrators always have every dashboard area. <strong>Global Settings</strong> and{" "}
                  <strong>Clear database</strong> stay super-admin only.
                </>
              ) : (
                <>
                  Choose which cards appear for this account on the Admin home. Seat maps, prices, manual
                  distribution, and other tools keep their own permissions and are not cleared when you
                  change this list.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {accessDialogUser && dashboardDraft && (
            <ul className="space-y-3 py-1">
              {DASHBOARD_BOX_CAPABILITIES.map((cap) => {
                const isSuper = normalizeAppRole(accessDialogUser.role) === "super_admin";
                const id = `dash-cap-${accessDialogUser.id}-${cap}`;
                return (
                  <li key={cap} className="flex items-center gap-3">
                    <Checkbox
                      id={id}
                      checked={dashboardDraft[cap]}
                      onCheckedChange={(v) => {
                        if (isSuper) return;
                        setDashboardDraft((d) =>
                          d
                            ? {
                                ...d,
                                [cap]: v === true,
                              }
                            : d
                        );
                      }}
                      disabled={isSuper}
                    />
                    <label
                      htmlFor={id}
                      className={cn("text-sm leading-tight", isSuper && "text-foreground-muted")}
                    >
                      {DASHBOARD_ACCESS_LABELS[cap]}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            {accessDialogUser && normalizeAppRole(accessDialogUser.role) === "super_admin" ? (
              <Button type="button" onClick={closeAccessDialog}>
                Close
              </Button>
            ) : (
              <>
                <Button type="button" variant="secondary" onClick={closeAccessDialog}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void saveDashboardAccess()}
                  disabled={savingAccessUserId != null}
                >
                  Save
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
