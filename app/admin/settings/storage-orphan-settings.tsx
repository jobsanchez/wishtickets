"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "@/lib/toast";
import {
  STORAGE_ORPHAN_BUCKET_IDS,
  type StorageOrphanBucketId,
} from "@/lib/storage/storage-orphan-buckets";

const BUCKET_LABELS: Record<StorageOrphanBucketId, string> = {
  "ticket-images": "ticket-images — rendered tickets & print assets",
  "ticket-qr": "ticket-qr — QR PNGs",
  "event-images": "event-images — hero, thumbnails, teaser video",
  "event-banners": "event-banners — carousel images",
  "ticket-templates": "ticket-templates — layout JPEGs",
  "seat-map-images": "seat-map-images — seating graphics",
};

const DELETE_CONFIRM = "DELETE_ORPHANS" as const;

export function StorageOrphanSettings() {
  const [bucket, setBucket] = useState<StorageOrphanBucketId>("ticket-images");
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [inUse, setInUse] = useState<number | null>(null);
  const [orphaned, setOrphaned] = useState<number | null>(null);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadStats = useCallback(async () => {
    setScanning(true);
    setInUse(null);
    setOrphaned(null);
    setScannedAt(null);
    try {
      const res = await fetch(
        `/api/admin/storage/orphans/stats?bucket=${encodeURIComponent(bucket)}`
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        fileCountInUse?: number;
        fileCountOrphaned?: number;
        scannedAt?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to scan storage");
        return;
      }
      setInUse(data.fileCountInUse ?? 0);
      setOrphaned(data.fileCountOrphaned ?? 0);
      setScannedAt(data.scannedAt ?? null);
    } catch {
      toast.error("Failed to scan storage");
    } finally {
      setScanning(false);
    }
  }, [bucket]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  async function handleDeleteConfirmed() {
    setConfirmOpen(false);
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/storage/orphans/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket, confirm: DELETE_CONFIRM }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        deletedCount?: number;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Delete failed");
        return;
      }
      toast.success(`Removed ${data.deletedCount ?? 0} orphaned object(s).`);
      await loadStats();
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const busy = scanning || deleting;

  return (
    <div className="max-w-xl space-y-6">
      <FloatingProgressBar
        active={scanning}
        {...FLOATING_PROGRESS_PRESETS.genericLoad}
        message="Scanning storage bucket…"
        subtitle={bucket}
        detail="Listing objects and comparing them to database references. Leave this tab open until the scan finishes."
      />
      <FloatingProgressBar
        active={deleting}
        {...FLOATING_PROGRESS_PRESETS.deleting}
        message="Deleting orphaned files…"
        subtitle={bucket}
        detail="Removing objects that are not referenced by the database. This cannot be undone."
      />

      <div className="space-y-2">
        <Label htmlFor="orphan-bucket" className="text-sm text-foreground-muted">
          Storage bucket
        </Label>
        <Select
          value={bucket}
          onValueChange={(v) => setBucket(v as StorageOrphanBucketId)}
          disabled={busy}
        >
          <SelectTrigger
            id="orphan-bucket"
            className="h-11 w-full rounded-xl glass border border-[var(--glass-border)] bg-white/5"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STORAGE_ORPHAN_BUCKET_IDS.map((id) => (
              <SelectItem key={id} value={id}>
                {BUCKET_LABELS[id]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-[var(--glass-border)] bg-white/5 p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Reference scan</p>
        <p className="text-sm text-foreground-muted">
          Orphans are files in this bucket that are not referenced by any known URL column in the
          database for this bucket. External URLs and references embedded only in JSON are not
          counted as in-use.
        </p>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-foreground-muted">Files in use</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {inUse === null ? "—" : inUse}
            </dd>
          </div>
          <div>
            <dt className="text-foreground-muted">Orphaned files</dt>
            <dd className="text-lg font-semibold tabular-nums text-amber-400">
              {orphaned === null ? "—" : orphaned}
            </dd>
          </div>
        </dl>
        {scannedAt ? (
          <p className="text-xs text-foreground-muted">Last scan: {new Date(scannedAt).toLocaleString()}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={() => void loadStats()} disabled={busy}>
          Refresh counts
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={() => setConfirmOpen(true)}
          disabled={busy || orphaned === null || orphaned === 0}
        >
          Delete orphaned files
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete orphaned files?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-foreground-muted">
                <p>
                  Bucket <span className="font-mono text-foreground">{bucket}</span>: permanently
                  remove <strong className="text-foreground">{orphaned ?? 0}</strong> object(s) that
                  are not linked from the database.
                </p>
                <p>This cannot be undone. Active links will not be removed.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDeleteConfirmed()}>
              Delete orphaned files
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
