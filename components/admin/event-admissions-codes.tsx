"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { Plus, Copy, Mail } from "lucide-react";
import { FloatingProgressBar } from "@/components/ui/floating-progress";
import { RouteLoading } from "@/components/ui/route-loading";

interface AdmissionsCode {
  id: string;
  code: string;
  label: string | null;
  assignee_email: string | null;
  created_at: string;
}

interface EventAdmissionsCodesProps {
  eventId: string;
  eventTitle: string;
}

const DEBOUNCE_MS = 400;

export function EventAdmissionsCodes({ eventId, eventTitle }: EventAdmissionsCodesProps) {
  const router = useRouter();
  const [codes, setCodes] = useState<AdmissionsCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const codesRef = useRef<AdmissionsCode[]>([]);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    codesRef.current = codes;
  }, [codes]);

  const fetchCodes = useCallback(async () => {
    const res = await fetch(`/api/admin/events/${eventId}/admissions-codes`);
    if (res.ok) {
      const data = await res.json();
      setCodes((data.codes ?? []) as AdmissionsCode[]);
    }
  }, [eventId]);

  useEffect(() => {
    fetchCodes().finally(() => setLoading(false));
  }, [fetchCodes]);

  useEffect(() => {
    return () => {
      /* Latest ref at unmount so we clear all pending debounced saves. */
      // eslint-disable-next-line react-hooks/exhaustive-deps -- ref.current must be read when cleanup runs, not when effect is created
      const pending = debounceTimers.current;
      for (const t of Object.values(pending)) {
        clearTimeout(t);
      }
    };
  }, []);

  const patchCode = useCallback(
    async (id: string) => {
      const row = codesRef.current.find((c) => c.id === id);
      if (!row) return;
      const label = (row.label ?? "").trim() || null;
      const assignee_email = (row.assignee_email ?? "").trim() || null;
      const res = await fetch(`/api/admin/events/${eventId}/admissions-codes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, assignee_email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error ?? "Failed to save");
      }
    },
    [eventId]
  );

  function schedulePatch(id: string) {
    if (debounceTimers.current[id]) {
      clearTimeout(debounceTimers.current[id]);
    }
    debounceTimers.current[id] = setTimeout(() => {
      delete debounceTimers.current[id];
      void patchCode(id);
    }, DEBOUNCE_MS);
  }

  function updateLabel(id: string, value: string) {
    setCodes((prev) =>
      prev.map((c) => (c.id === id ? { ...c, label: value } : c))
    );
    schedulePatch(id);
  }

  function updateEmail(id: string, value: string) {
    setCodes((prev) =>
      prev.map((c) => (c.id === id ? { ...c, assignee_email: value } : c))
    );
    schedulePatch(id);
  }

  async function handleSendEmail(c: AdmissionsCode) {
    const assigneeName = (c.label ?? "").trim();
    const to = (c.assignee_email ?? "").trim();
    if (!assigneeName) {
      toast.error("Enter a name in Assigned to before sending.");
      return;
    }
    if (!to) {
      toast.error("Enter an email address before sending.");
      return;
    }
    setSendingId(c.id);
    try {
      const res = await fetch(
        `/api/admin/events/${eventId}/admissions-codes/${c.id}/send-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assigneeName, to }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Failed to send");
      }
      toast.success("Email sent");
      await fetchCodes();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send email");
    } finally {
      setSendingId(null);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/admissions-codes`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to generate");
      }
      const data = await res.json();
      toast.success("Admissions code generated");
      await navigator.clipboard.writeText(data.code.code);
      toast.success("Code copied to clipboard");
      await fetchCodes();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setGenerating(false);
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(
      () => toast.success("Code copied to clipboard"),
      () => toast.error("Failed to copy")
    );
  }

  if (loading) {
    return (
      <RouteLoading
        variant="compact"
        message="Loading admissions codes…"
        subtitle={eventTitle}
      />
    );
  }

  return (
    <div>
      <FloatingProgressBar
        active={generating}
        message="Generating admissions code"
        subtitle={eventTitle}
        detail="Creating a new staff access code tied to this event."
      />
      <h2 className="text-lg font-semibold text-foreground mb-4">Admissions Codes</h2>
      <p className="text-foreground-muted text-sm mb-6">
        Generate codes for staff to scan tickets at {eventTitle}. Each code is tied to this event only. Staff enter the code on the scan page to gain access. Assign a name and email, then send the admission code by email.
      </p>
      <div className="flex justify-end mb-4">
        <Button onClick={handleGenerate} disabled={generating}>
          <Plus className="h-4 w-4 mr-2" />
          {generating ? "Generating..." : "Generate code"}
        </Button>
      </div>
      <div className="glass rounded-xl border border-[var(--glass-border)] overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-[var(--glass-border)]">
              <th className="p-3 text-sm font-medium text-foreground-muted whitespace-nowrap">Code</th>
              <th className="p-3 text-sm font-medium text-foreground-muted whitespace-nowrap">Created</th>
              <th className="p-3 text-sm font-medium text-foreground-muted min-w-[140px]">Assigned to</th>
              <th className="p-3 text-sm font-medium text-foreground-muted min-w-[200px]">Email</th>
              <th className="p-3 text-sm font-medium text-foreground-muted whitespace-nowrap">Send email</th>
              <th className="p-3 text-sm font-medium text-foreground-muted w-20"></th>
            </tr>
          </thead>
          <tbody>
            {codes.length ? (
              codes.map((c) => {
                const canSend =
                  (c.label ?? "").trim().length > 0 &&
                  (c.assignee_email ?? "").trim().length > 0;
                return (
                  <tr key={c.id} className="border-b border-[var(--glass-border)]">
                    <td className="p-3 text-foreground font-mono align-top">{c.code}</td>
                    <td className="p-3 text-foreground-muted text-sm align-top whitespace-nowrap">
                      {new Date(c.created_at).toLocaleString()}
                    </td>
                    <td className="p-2 align-top">
                      <Input
                        value={c.label ?? ""}
                        onChange={(e) => updateLabel(c.id, e.target.value)}
                        placeholder="Name"
                        className="h-9 min-w-[7rem] bg-background/50"
                        aria-label="Assigned to"
                      />
                    </td>
                    <td className="p-2 align-top">
                      <Input
                        type="email"
                        value={c.assignee_email ?? ""}
                        onChange={(e) => updateEmail(c.id, e.target.value)}
                        placeholder="name@example.com"
                        className="h-9 min-w-[10rem] bg-background/50"
                        aria-label="Email"
                        autoComplete="off"
                      />
                    </td>
                    <td className="p-2 align-top">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={!canSend || sendingId === c.id}
                        onClick={() => void handleSendEmail(c)}
                        className="whitespace-nowrap"
                      >
                        <Mail className="h-4 w-4 mr-1.5" />
                        {sendingId === c.id ? "Sending…" : "Send email"}
                      </Button>
                    </td>
                    <td className="p-2 align-top">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyCode(c.code)}
                        title="Copy code"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="p-8 text-center text-foreground-muted">
                  No admissions codes yet. Generate one to allow staff to scan tickets for this event.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
