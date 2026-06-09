"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { Plus, Trash2, ChevronDown, ChevronRight, Save } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  EVENT_ADMIN_SECTION_IDS,
  EVENT_ADMIN_SECTION_LABELS,
  parseEventAdminSections,
  type EventAdminSectionId,
} from "@/lib/event-admin-sections";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { RouteLoading } from "@/components/ui/route-loading";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function formatUserDisplay(user: { full_name: string | null; email: string | null }) {
  const name = user.full_name?.trim() || "No name";
  const email = user.email || "no email";
  return `${name} (${email})`;
}

interface Administrator {
  user_id: string;
  created_at: string;
  allowed_sections: string[] | null;
  email: string | null;
  full_name: string | null;
  role: string | null;
}

interface UserOption {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  capabilities: string[];
}

interface EventAdministratorsProps {
  eventId: string;
  eventTitle: string;
}

export function EventAdministrators({ eventId, eventTitle }: EventAdministratorsProps) {
  const router = useRouter();
  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [adminToRemove, setAdminToRemove] = useState<Administrator | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [sectionDraft, setSectionDraft] = useState<Set<EventAdminSectionId>>(new Set());
  const [savingSectionsFor, setSavingSectionsFor] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchAdmins = useCallback(async () => {
    const res = await fetch(`/api/admin/events/${eventId}/administrators`);
    if (res.ok) {
      const data = await res.json();
      setAdministrators(data.administrators ?? []);
    }
  }, [eventId]);

  const fetchAssignable = useCallback(async () => {
    const res = await fetch(`/api/admin/events/${eventId}/administrators/assignable`);
    if (res.ok) {
      const data = await res.json();
      setUsers(data?.users ?? []);
    }
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!cancelled) setCurrentUserId(user?.id ?? null);

        const [adminsRes, assignableRes] = await Promise.all([
          fetch(`/api/admin/events/${eventId}/administrators`),
          fetch(`/api/admin/events/${eventId}/administrators/assignable`),
        ]);
        if (adminsRes.ok) {
          const data = await adminsRes.json();
          setAdministrators(data.administrators ?? []);
        }
        if (assignableRes.ok) {
          const data = await assignableRes.json();
          setUsers(data?.users ?? []);
        } else if (assignableRes.status === 403) {
          toast.error("You don't have permission to view assignable users. Super admins or admins with event access can assign.");
        } else if (!assignableRes.ok) {
          const err = await assignableRes.json().catch(() => ({}));
          toast.error(err?.error ?? "Failed to load assignable users. Ensure migration 00110 is applied (supabase db push).");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setCurrentUserId(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [eventId]);

  const assignableUsers = users.filter(
    (u) =>
      u.role !== "super_admin" &&
      (u.role === "admin" || u.capabilities?.includes("manage_events")) &&
      !administrators.some((a) => a.user_id === u.id)
  );

  function effectiveSectionsForAdmin(a: Administrator): Set<EventAdminSectionId> {
    const raw = a.allowed_sections;
    const useAll = raw == null || raw.length === 0;
    const list = useAll ? [...EVENT_ADMIN_SECTION_IDS] : parseEventAdminSections(raw);
    return new Set(list);
  }

  function toggleExpanded(admin: Administrator) {
    if (expandedUserId === admin.user_id) {
      setExpandedUserId(null);
      return;
    }
    setExpandedUserId(admin.user_id);
    setSectionDraft(effectiveSectionsForAdmin(admin));
  }

  function toggleSectionDraft(section: EventAdminSectionId) {
    setSectionDraft((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  async function saveSectionsForUser(userId: string) {
    if (sectionDraft.size === 0) {
      toast.error("Select at least one page");
      return;
    }
    setSavingSectionsFor(userId);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/administrators/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowed_sections: Array.from(sectionDraft) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save pages");
      }
      toast.success("Page access updated");
      setExpandedUserId(null);
      await fetchAdmins();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingSectionsFor(null);
    }
  }

  const q = searchQuery.trim().toLowerCase();
  const filteredUsers = q
    ? assignableUsers.filter(
        (u) =>
          (u.full_name?.toLowerCase().includes(q) ?? false) ||
          (u.email?.toLowerCase().includes(q) ?? false)
      )
    : assignableUsers;

  const selectedUser = assignableUsers.find((u) => u.id === selectedUserId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleAdd() {
    if (!selectedUserId) {
      toast.error("Select a user to add");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/administrators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selectedUserId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to add");
      }
      toast.success("Administrator added");
      setSelectedUserId("");
      setSearchQuery("");
      setDropdownOpen(false);
      await Promise.all([fetchAdmins(), fetchAssignable()]);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (!adminToRemove) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/events/${eventId}/administrators/${adminToRemove.user_id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to remove");
      }
      toast.success("Administrator removed");
      setAdminToRemove(null);
      await Promise.all([fetchAdmins(), fetchAssignable()]);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading administrators…"
        subtitle={`Fetching who can manage ${eventTitle}.`}
      />
    );
  }

  return (
    <div>
      <FloatingProgressBar
        active={saving}
        message="Saving administrators"
        subtitle={eventTitle}
        detail={FLOATING_PROGRESS_PRESETS.genericSave.detail}
      />
      <h2 className="text-lg font-semibold text-foreground mb-4">Event Administrators</h2>
      <p className="text-foreground-muted text-sm mb-6">
        Assign admins for {eventTitle}. Only super admins or existing event administrators (with Event Administrators access)
        can add or remove people here. For each admin, choose which event pages they can open and edit.
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="relative" ref={dropdownRef}>
          <div className="relative">
            <Input
              type="text"
              placeholder="Type to search user..."
              value={dropdownOpen ? searchQuery : selectedUser ? formatUserDisplay(selectedUser) : ""}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setDropdownOpen(true);
              }}
              onFocus={() => setDropdownOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setDropdownOpen(false);
              }}
              className="w-[320px] pr-10"
            />
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-muted pointer-events-none" />
          </div>
          {dropdownOpen && (
            <div
              className={cn(
                "absolute top-full left-0 mt-1 z-50 w-full max-h-60 overflow-auto rounded-lg border border-[var(--glass-border)] bg-[var(--background)] shadow-lg"
              )}
            >
              {filteredUsers.length ? (
                filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={cn(
                      "w-full px-4 py-2.5 text-left text-sm hover:bg-white/10 transition-colors",
                      selectedUserId === u.id && "bg-white/10"
                    )}
                    onClick={() => {
                      setSelectedUserId(u.id);
                      setSearchQuery("");
                      setDropdownOpen(false);
                    }}
                  >
                    {formatUserDisplay(u)}
                  </button>
                ))
              ) : (
                <div className="p-4 text-sm text-foreground-muted">
                  {assignableUsers.length
                    ? "No users match your search."
                    : "No assignable users. All admins are already assigned, or no users have Admin role or Manage Events capability."}
                </div>
              )}
            </div>
          )}
        </div>
        <Button onClick={handleAdd} disabled={saving || !selectedUserId}>
          <Plus className="h-4 w-4 mr-2" />
          Add
        </Button>
      </div>
      <div className="glass rounded-xl border border-[var(--glass-border)] overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[var(--glass-border)]">
              <th className="p-4 text-sm font-medium text-foreground-muted w-10"></th>
              <th className="p-4 text-sm font-medium text-foreground-muted">User</th>
              <th className="p-4 text-sm font-medium text-foreground-muted">Role</th>
              <th className="p-4 text-sm font-medium text-foreground-muted w-24"></th>
            </tr>
          </thead>
          <tbody>
            {administrators.length ? (
              administrators.flatMap((a) => {
                const expanded = expandedUserId === a.user_id;
                const mainRow = (
                  <tr key={a.user_id} className="border-b border-[var(--glass-border)]">
                    <td className="p-2 pl-3 align-middle">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => toggleExpanded(a)}
                        aria-expanded={expanded}
                        title={expanded ? "Hide pages" : "Choose pages"}
                      >
                        {expanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </td>
                    <td className="p-4 text-foreground">
                      {formatUserDisplay(a)}
                    </td>
                    <td className="p-4 text-foreground-muted">{a.role ?? "—"}</td>
                    <td className="p-4">
                      {a.user_id !== currentUserId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAdminToRemove(a)}
                          disabled={saving}
                          title="Remove"
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
                if (!expanded) return [mainRow];
                const panel = (
                  <tr key={`${a.user_id}-pages`} className="border-b border-[var(--glass-border)] bg-white/[0.03]">
                    <td colSpan={4} className="p-4 pt-0">
                      <p className="text-xs text-foreground-muted mb-3">
                        Pages this administrator can access for this event:
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {EVENT_ADMIN_SECTION_IDS.map((sid) => (
                          <label
                            key={sid}
                            className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                          >
                            <Checkbox
                              checked={sectionDraft.has(sid)}
                              onCheckedChange={() => toggleSectionDraft(sid)}
                              aria-label={EVENT_ADMIN_SECTION_LABELS[sid]}
                            />
                            <span>{EVENT_ADMIN_SECTION_LABELS[sid]}</span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={savingSectionsFor === a.user_id}
                          onClick={() => saveSectionsForUser(a.user_id)}
                        >
                          <Save className="h-4 w-4 mr-2" />
                          Save pages
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSectionDraft(new Set(EVENT_ADMIN_SECTION_IDS));
                          }}
                        >
                          Select all
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setSectionDraft(new Set())}
                        >
                          Clear
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
                return [mainRow, panel];
              })
            ) : (
              <tr>
                <td colSpan={4} className="p-8 text-center text-foreground-muted">
                  No administrators assigned yet. Add users above to let them manage this event.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={!!adminToRemove}
        onOpenChange={(open) => !open && setAdminToRemove(null)}
        onConfirm={confirmRemove}
        title="Remove event administrator"
        description={
          adminToRemove
            ? `Remove ${formatUserDisplay(adminToRemove)} from event administrators? They will no longer be able to manage this event.`
            : ""
        }
        confirmLabel="Remove"
        variant="destructive"
      />
    </div>
  );
}
