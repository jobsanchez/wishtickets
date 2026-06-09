"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";

interface ProducerRow {
  id: string;
  name: string | null;
  producer_representative: string | null;
  contact: string | null;
  email: string | null;
}

interface ProducersTableProps {
  producers: ProducerRow[] | null;
  canDelete?: boolean;
}

export function ProducersTable({ producers, canDelete = true }: ProducersTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [producerToDelete, setProducerToDelete] = useState<ProducerRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    if (!producers?.length) return [];
    const q = search.trim().toLowerCase();
    if (!q) return producers;
    return producers.filter((p) => {
      const name = (p.name ?? "").toLowerCase();
      const rep = (p.producer_representative ?? "").toLowerCase();
      const contact = (p.contact ?? "").toLowerCase();
      const email = (p.email ?? "").toLowerCase();
      return (
        name.includes(q) ||
        rep.includes(q) ||
        contact.includes(q) ||
        email.includes(q)
      );
    });
  }, [producers, search]);

  async function confirmDeleteProducer() {
    if (!producerToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/producers/${producerToDelete.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to delete producer");
        return;
      }
      toast.success("Producer deleted");
      setProducerToDelete(null);
      router.refresh();
    } catch {
      toast.error("Failed to delete producer");
    } finally {
      setDeleting(false);
      setProducerToDelete(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
        <Input
          type="search"
          placeholder="Search producers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          aria-label="Search producers"
        />
      </div>
      <div className="glass rounded-xl border border-[var(--glass-border)] overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[var(--glass-border)]">
              <th className="p-4 text-sm font-medium text-foreground-muted">Name</th>
              <th className="p-4 text-sm font-medium text-foreground-muted">Representative</th>
              <th className="p-4 text-sm font-medium text-foreground-muted">Contact</th>
              <th className="p-4 text-sm font-medium text-foreground-muted">Email</th>
              <th className="p-4 text-sm font-medium text-foreground-muted w-28"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? (
              filtered.map((p) => (
                <tr key={p.id} className="border-b border-[var(--glass-border)]">
                  <td className="p-4 text-foreground">{p.name}</td>
                  <td className="p-4 text-foreground-muted">{p.producer_representative ?? "—"}</td>
                  <td className="p-4 text-foreground-muted">{p.contact ?? "—"}</td>
                  <td className="p-4 text-foreground-muted">{p.email ?? "—"}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/admin/producers/${p.id}`}
                        className="text-sm text-[var(--wish-orange)] hover:underline"
                      >
                        Edit
                      </Link>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setProducerToDelete(p)}
                          className="text-sm text-red-400 hover:text-red-300 hover:underline flex items-center gap-1"
                          aria-label={`Delete ${p.name ?? "producer"}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="p-8 text-center text-foreground-muted">
                  {producers?.length
                    ? "No producers match your search."
                    : "No producers yet. Create one to assign to events."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={!!producerToDelete}
        onOpenChange={(open) => !open && setProducerToDelete(null)}
        onConfirm={confirmDeleteProducer}
        title="Delete producer"
        description={
          producerToDelete
            ? `Delete "${producerToDelete.name ?? "this producer"}"? Events using this producer will have their producer cleared.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
      />
      <FloatingProgressBar
        active={deleting}
        {...FLOATING_PROGRESS_PRESETS.deleting}
        message="Deleting producer…"
        subtitle="Producers"
      />
    </div>
  );
}
