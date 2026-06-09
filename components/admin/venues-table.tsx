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

export interface VenueRow {
  id: string;
  name: string | null;
  province_id: string | null;
  city_id: string | null;
  standard_capacity: number | null;
  provinces?: { name: string } | null;
  cities?: { name: string } | null;
}

interface VenuesTableProps {
  venues: VenueRow[] | null;
  isSuperAdmin?: boolean;
}

export function VenuesTable({ venues, isSuperAdmin }: VenuesTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [venueToDelete, setVenueToDelete] = useState<VenueRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    if (!venues?.length) return [];
    const q = search.trim().toLowerCase();
    if (!q) return venues;
    return venues.filter((v) => {
      const name = (v.name ?? "").toLowerCase();
      const province = (v.provinces?.name ?? "").toLowerCase();
      const city = (v.cities?.name ?? "").toLowerCase();
      return (
        name.includes(q) ||
        province.includes(q) ||
        city.includes(q)
      );
    });
  }, [venues, search]);

  async function confirmDeleteVenue() {
    if (!venueToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/venues/${venueToDelete.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to delete venue");
        return;
      }
      toast.success("Venue deleted");
      setVenueToDelete(null);
      router.refresh();
    } catch {
      toast.error("Failed to delete venue");
    } finally {
      setDeleting(false);
      setVenueToDelete(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
        <Input
          type="search"
          placeholder="Search venues..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          aria-label="Search venues"
        />
      </div>
      <div className="glass rounded-xl border border-[var(--glass-border)] overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[var(--glass-border)]">
              <th className="p-4 text-sm font-medium text-foreground-muted">Name</th>
              <th className="p-4 text-sm font-medium text-foreground-muted">Location</th>
              <th className="p-4 text-sm font-medium text-foreground-muted">Standard Capacity</th>
              <th className="p-4 text-sm font-medium text-foreground-muted w-28"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? (
              filtered.map((v) => (
                <tr key={v.id} className="border-b border-[var(--glass-border)]">
                  <td className="p-4 text-foreground">{v.name}</td>
                  <td className="p-4 text-foreground-muted">
                    {[v.cities?.name, v.provinces?.name]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td className="p-4 text-foreground-muted">{v.standard_capacity ?? "—"}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/admin/venues/${v.id}`}
                        className="text-sm text-[var(--wish-orange)] hover:underline"
                      >
                        Edit
                      </Link>
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => setVenueToDelete(v)}
                          className="text-sm text-red-400 hover:text-red-300 hover:underline flex items-center gap-1"
                          aria-label={`Delete ${v.name ?? "venue"}`}
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
                <td colSpan={4} className="p-8 text-center text-foreground-muted">
                  {venues?.length
                    ? "No venues match your search."
                    : "No venues yet. Create one to add events."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={!!venueToDelete}
        onOpenChange={(open) => !open && setVenueToDelete(null)}
        onConfirm={confirmDeleteVenue}
        title="Delete venue"
        description={
          venueToDelete
            ? `Delete "${venueToDelete.name ?? "this venue"}"? This will also remove all sections and seats. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
      />
      <FloatingProgressBar
        active={deleting}
        {...FLOATING_PROGRESS_PRESETS.deleting}
        message="Deleting venue…"
        subtitle="Venues"
      />
    </div>
  );
}
