"use client";

import { useEffect, useState } from "react";
import { usePermissionDialog } from "@/components/providers/permission-dialog-provider";
import { toast } from "@/lib/toast";
import { RouteLoading } from "@/components/ui/route-loading";
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
import { ChevronRight, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

type AdminUserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  created_at: string | null;
  capabilities: string[];
};

export function UsersSettings() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const { showPermissionDialog } = usePermissionDialog() ?? { showPermissionDialog: () => {} };

  useEffect(() => {
    fetch("/api/admin/users?audience=registered")
      .then((r) => {
        if (r.status === 403) {
          showPermissionDialog();
          return null;
        }
        if (!r.ok) throw new Error("Failed to load users");
        return r.json();
      })
      .then((data) => {
        if (data === null) return;
        if (Array.isArray(data)) setUsers(data as AdminUserRow[]);
        else setUsers([]);
      })
      .catch(() => toast.error("Failed to load users"))
      .finally(() => setLoading(false));
  }, [showPermissionDialog]);

  async function sendEmailList() {
    const trimmed = recipientEmail.trim();
    if (!trimmed) {
      toast.error("Enter an email address.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/admin/users/email-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: trimmed }),
      });
      if (res.status === 403) {
        showPermissionDialog();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Failed to send email");
        return;
      }
      toast.success(
        typeof data.count === "number"
          ? `Sent list of ${data.count} user(s) to ${trimmed}.`
          : `Sent user list to ${trimmed}.`
      );
      setEmailDialogOpen(false);
      setRecipientEmail("");
    } catch {
      toast.error("Failed to send email.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading users…"
        subtitle="Registered portal accounts."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={() => setListOpen((prev) => !prev)}
          className="text-left rounded-md px-1 -mx-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wish-orange)]"
          aria-expanded={listOpen}
          aria-controls="registered-users-list"
        >
          <div className="flex items-start gap-2">
            <ChevronRight
              className={cn(
                "mt-0.5 h-4 w-4 text-foreground-muted transition-transform",
                listOpen && "rotate-90"
              )}
              aria-hidden
            />
            <div>
              <h2 className="text-lg font-semibold text-foreground">Registered users</h2>
              <p className="text-sm text-foreground-muted mt-1 max-w-2xl">
                Accounts that signed up for the portal. <strong>Admins and super admins</strong> are
                not listed here.
              </p>
              <p className="text-xs text-foreground-muted mt-1">
                {users.length} account{users.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </button>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 gap-2"
          onClick={() => setEmailDialogOpen(true)}
          disabled={users.length === 0}
        >
          <Mail className="h-4 w-4" />
          Email list…
        </Button>
      </div>

      {listOpen &&
        (users.length === 0 ? (
          <div
            id="registered-users-list"
            className="glass rounded-xl border border-[var(--glass-border)] p-10 text-center text-foreground-muted"
          >
            No registered users found (excluding admins and super admins).
          </div>
        ) : (
          <div
            id="registered-users-list"
            className="glass rounded-xl border border-[var(--glass-border)] overflow-x-auto"
          >
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--glass-border)]">
                  <th className="p-3 sm:p-4 font-medium text-foreground-muted">Name</th>
                  <th className="p-3 sm:p-4 font-medium text-foreground-muted">Email</th>
                  <th className="p-3 sm:p-4 font-medium text-foreground-muted w-36">Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-[var(--glass-border)] last:border-0 bg-white/[0.02] hover:bg-white/[0.06]"
                  >
                    <td className="p-3 sm:p-4 text-foreground align-top">
                      {u.full_name?.trim() ? u.full_name : "—"}
                    </td>
                    <td className="p-3 sm:p-4 text-foreground-muted align-top break-all">
                      {u.email?.trim() ? u.email : "—"}
                    </td>
                    <td className="p-3 sm:p-4 text-foreground-muted align-top capitalize">
                      {u.role?.trim() ? u.role.replace(/_/g, " ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email user list</DialogTitle>
            <DialogDescription>
              Sends a table of <strong>{users.length}</strong> registered user(s) (name and email) to
              the address below. Admins and super admins are excluded. SMTP must be configured under
              Email and Tickets.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="user-list-recipient">Send to</Label>
            <Input
              id="user-list-recipient"
              type="email"
              autoComplete="email"
              placeholder="recipient@example.com"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              disabled={sending}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEmailDialogOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button type="button" onClick={sendEmailList} disabled={sending}>
              {sending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
