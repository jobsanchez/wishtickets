"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  ImageOff,
  ImagePlus,
  Minus,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { supabaseStorageDisplaySrc } from "@/lib/image-remote";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export type EventAddOnRow = {
  id: string;
  event_id: string;
  title: string;
  image_url: string;
  price_cents: number;
  stock_quantity: number;
  /** Maximum quantity per buyer cart for this line (also capped by stock on the book page). */
  max_qty_per_cart: number;
  /** Hidden items stay in admin but are omitted from the public book API. */
  is_hidden: boolean;
  sort_order: number;
  created_at?: string;
};

function coerceAdminAddOnRow(
  raw: Partial<EventAddOnRow> & { id: string },
  fallbackEventId: string
): EventAddOnRow {
  return {
    id: raw.id,
    event_id: typeof raw.event_id === "string" ? raw.event_id : fallbackEventId,
    title: raw.title ?? "",
    image_url: raw.image_url ?? "",
    price_cents: Math.max(0, Number(raw.price_cents) || 0),
    stock_quantity: Math.max(0, Number(raw.stock_quantity) || 0),
    max_qty_per_cart: Math.max(
      1,
      Math.min(9999, Number(raw.max_qty_per_cart) || 10)
    ),
    is_hidden: !!raw.is_hidden,
    sort_order: Number(raw.sort_order) || 0,
    created_at: raw.created_at,
  };
}

type SoldAddOnLine = {
  id: string;
  title: string;
  quantity: number;
  released_quantity: number;
  pending_quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  fully_received: boolean;
};

type SoldOrderGroup = {
  booking_id: string;
  booking_created_at: string | null;
  pending_units: number;
  total_units: number;
  total_cents: number;
  items: SoldAddOnLine[];
};

type SoldBuyerGroup = {
  email: string;
  pending_units: number;
  total_units: number;
  total_cents: number;
  orders: SoldOrderGroup[];
};

function formatOrderLabel(bookingId: string, createdAt: string | null): string {
  if (createdAt) {
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) {
      return `Order · ${d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}`;
    }
  }
  return `Order · ${bookingId.slice(0, 8)}…`;
}

function receivedBadge(line: SoldAddOnLine): { label: string; className: string } {
  if (line.quantity <= 0) {
    return {
      label: "—",
      className:
        "border-[var(--glass-border)] bg-muted/50 text-foreground-muted dark:border-white/20 dark:bg-transparent",
    };
  }
  if (line.fully_received) {
    return {
      label: "Received",
      className:
        "border-emerald-600/40 bg-emerald-100 text-emerald-900 dark:border-emerald-500/50 dark:bg-emerald-500/15 dark:text-emerald-200",
    };
  }
  if (line.released_quantity <= 0) {
    return {
      label: "Pending pickup",
      className:
        "border-amber-600/40 bg-amber-100 text-amber-950 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-200",
    };
  }
  return {
    label: `Partial · ${line.released_quantity}/${line.quantity} received`,
    className:
      "border-sky-600/40 bg-sky-100 text-sky-950 dark:border-sky-500/50 dark:bg-sky-500/15 dark:text-sky-200",
  };
}

export function EventAddOnsTab({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<EventAddOnRow[]>([]);
  const [savedItems, setSavedItems] = useState<EventAddOnRow[]>([]);
  const [soldByBuyer, setSoldByBuyer] = useState<SoldBuyerGroup[]>([]);
  /** Buyer email → expanded; omitted/false = collapsed (default). */
  const [buyerExpanded, setBuyerExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [itemsExpanded, setItemsExpanded] = useState(false);
  /** Add-on id → expanded (default collapsed) */
  const [itemExpanded, setItemExpanded] = useState<Record<string, boolean>>({});
  const [soldExpanded, setSoldExpanded] = useState(false);
  const [imagePreview, setImagePreview] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const moveItem = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setItems((prev) => {
      const srcIdx = prev.findIndex((r) => r.id === sourceId);
      const dstIdx = prev.findIndex((r) => r.id === targetId);
      if (srcIdx < 0 || dstIdx < 0) return prev;
      const next = [...prev];
      const [picked] = next.splice(srcIdx, 1);
      next.splice(dstIdx, 0, picked);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/add-ons`, {
        credentials: "same-origin",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(typeof json?.error === "string" ? json.error : "Failed to load add-ons");
        setItems([]);
        setSavedItems([]);
        setSoldByBuyer([]);
        return;
      }
      const rawItems = Array.isArray(json?.items) ? json.items : [];
      const next = rawItems.map((r: Partial<EventAddOnRow> & { id: string }) =>
        coerceAdminAddOnRow(r, eventId)
      );
      const sold = Array.isArray(json?.sold_by_buyer) ? json.sold_by_buyer : [];
      setItems(next);
      setSavedItems(next);
      setSoldByBuyer(sold as SoldBuyerGroup[]);
      setItemExpanded({});
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (next: EventAddOnRow[]) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/add-ons`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: next.map((r) => ({
            id: r.id,
            title: r.title,
            image_url: r.image_url,
            price_cents: r.price_cents,
            stock_quantity: r.stock_quantity,
            max_qty_per_cart: Math.max(
              1,
              Math.min(9999, Math.floor(r.max_qty_per_cart) || 10)
            ),
            is_hidden: r.is_hidden,
          })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(typeof json?.error === "string" ? json.error : "Failed to save");
        return;
      }
      const committed = Array.isArray(json?.items)
        ? (json.items as (Partial<EventAddOnRow> & { id: string })[]).map((r) =>
            coerceAdminAddOnRow(r, eventId)
          )
        : next;
      setItems(committed);
      setSavedItems(committed);
    } finally {
      setSaving(false);
    }
  };

  const addRow = () => {
    const id = crypto.randomUUID();
    const next = [
      ...items,
      {
        id,
        event_id: eventId,
        title: "",
        image_url: "",
        price_cents: 0,
        stock_quantity: 0,
        max_qty_per_cart: 10,
        is_hidden: false,
        sort_order: items.length,
      },
    ];
    setItems(next);
    setItemExpanded((prev) => ({ ...prev, [id]: true }));
  };

  const removeRow = (id: string) => {
    const next = items.filter((r) => r.id !== id);
    setItems(next);
  };

  const updateLocal = (id: string, patch: Partial<EventAddOnRow>) => {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const bumpStock = (id: string, delta: number) => {
    setItems((prev) => {
      return prev.map((r) => {
        if (r.id !== id) return r;
        const v = Math.max(0, r.stock_quantity + delta);
        return { ...r, stock_quantity: v };
      });
    });
  };

  const bumpMaxPerCart = (id: string, delta: number) => {
    setItems((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const v = Math.max(1, Math.min(9999, r.max_qty_per_cart + delta));
        return { ...r, max_qty_per_cart: v };
      })
    );
  };

  /** Step by 1 PHP (100 centavos); typing still allows cent precision. */
  const bumpPriceCents = (id: string, deltaCents: number) => {
    setItems((prev) => {
      return prev.map((r) => {
        if (r.id !== id) return r;
        const v = Math.max(0, r.price_cents + deltaCents);
        return { ...r, price_cents: v };
      });
    });
  };

  const clearPhoto = (rowId: string) => {
    setItems((prev) => {
      const clearedUrl = prev.find((r) => r.id === rowId)?.image_url ?? "";
      const next = prev.map((r) =>
        r.id === rowId ? { ...r, image_url: "" } : r
      );
      if (clearedUrl) {
        setImagePreview((p) => (p?.url === clearedUrl ? null : p));
      }
      return next;
    });
  };

  const uploadImage = async (rowId: string, file: File) => {
    setUploadingId(rowId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("slug", `add-on-${rowId.slice(0, 8)}`);
      formData.append("bucket", "event-images");
      formData.append("eventId", eventId);
      formData.append("assetKind", "add-on");
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(typeof json?.error === "string" ? json.error : "Upload failed");
        return;
      }
      const url =
        typeof json?.url === "string"
          ? json.url
          : typeof json?.publicUrl === "string"
            ? json.publicUrl
            : null;
      if (!url) {
        toast.error("Upload response missing URL");
        return;
      }
      setItems((prev) => {
        return prev.map((r) => (r.id === rowId ? { ...r, image_url: url } : r));
      });
    } finally {
      setUploadingId(null);
    }
  };

  const hasChanges = JSON.stringify(items) !== JSON.stringify(savedItems);

  const displaySrc = (url: string) => {
    if (!url) return "";
    if (url.startsWith("/") || url.includes("localhost")) return url;
    return supabaseStorageDisplaySrc(url) || url;
  };
  const formatPhp = (cents: number) => `PHP ${(cents / 100).toFixed(2)}`;

  /** Sum of (unit price × stock) for every add-on row — list value of on-hand inventory. */
  const addOnsInventoryListTotalCents = useMemo(
    () =>
      items.reduce(
        (sum, row) =>
          sum +
          Math.max(0, Math.round(row.price_cents)) *
            Math.max(0, Math.floor(row.stock_quantity)),
        0
      ),
    [items]
  );

  const soldAddOnsGrandTotalCents = useMemo(
    () => soldByBuyer.reduce((sum, b) => sum + b.total_cents, 0),
    [soldByBuyer]
  );

  return (
    <div className="space-y-4">
      <FloatingProgressBar
        active={loading || uploadingId != null}
        {...FLOATING_PROGRESS_PRESETS.genericSave}
        message={loading ? "Loading add-ons…" : "Uploading image…"}
      />
      <div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Add-Ons</h2>
          <p className="text-sm text-foreground-muted">
            Merch and extras on the book page. Set stock to 0 for sold out. Use{" "}
            <strong className="font-medium text-foreground">Hidden</strong> to keep an item in admin
            without showing buyers. <strong className="font-medium text-foreground">Max per cart</strong>{" "}
            limits quantity per purchase (still capped by stock).
          </p>
        </div>
      </div>

      <div className="glass rounded-xl border border-[var(--glass-border)] bg-white/[0.03]">
        <div className="flex items-stretch gap-2 p-3 sm:p-4">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-lg px-1 py-0.5 text-left outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--wish-orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            aria-expanded={itemsExpanded}
            aria-label={itemsExpanded ? "Collapse add-on items" : "Expand add-on items"}
            onClick={() => setItemsExpanded((v) => !v)}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">All add-on items</p>
              <p className="text-xs text-foreground-muted">
                {items.length} item{items.length === 1 ? "" : "s"}
              </p>
              {items.length > 0 ? (
                <p className="text-xs font-semibold text-foreground mt-1 tabular-nums">
                  Total all items (price × stock) · {formatPhp(addOnsInventoryListTotalCents)}
                </p>
              ) : null}
            </div>
            <ChevronDown
              className={cn(
                "mt-0.5 h-5 w-5 shrink-0 text-foreground-muted transition-transform",
                itemsExpanded && "rotate-180"
              )}
              aria-hidden
            />
          </button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0 self-center"
            onClick={() => {
              addRow();
              setItemsExpanded(true);
            }}
            disabled={loading}
          >
            Add item
          </Button>
        </div>
        {itemsExpanded ? (
          <div className="space-y-4 px-4 pb-4">
            {items.length === 0 && !loading ? (
              <div className="glass rounded-xl border border-[var(--glass-border)] p-6 text-sm text-foreground-muted">
                No add-ons yet. Click &quot;Add item&quot; to create one.
              </div>
            ) : null}
            {items.map((row) => {
              const expanded = itemExpanded[row.id] === true;
              const title = row.title.trim() || "Untitled add-on";
              const thumb = row.image_url ? displaySrc(row.image_url) : "";
              return (
                <div
                  key={row.id}
                  draggable={!saving && uploadingId == null}
                  onDragStart={(e) => {
                    setDraggingId(row.id);
                    try {
                      e.dataTransfer.setData("text/plain", row.id);
                      e.dataTransfer.effectAllowed = "move";
                    } catch {
                      /* ignore */
                    }
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  onDragOver={(e) => {
                    if (!draggingId || draggingId === row.id) return;
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const src =
                      ((): string => {
                        try {
                          return e.dataTransfer.getData("text/plain") || "";
                        } catch {
                          return "";
                        }
                      })() || draggingId;
                    if (!src) return;
                    moveItem(src, row.id);
                    setDraggingId(null);
                  }}
                  className={cn(
                    "glass rounded-xl border border-[var(--glass-border)] bg-white/[0.03] overflow-hidden",
                    draggingId === row.id && "ring-2 ring-[var(--wish-orange)]/40",
                    row.is_hidden && "opacity-80 ring-1 ring-amber-500/30"
                  )}
                >
                  {/* Collapsed header */}
                  <div
                    className={cn(
                      "flex items-center gap-3 p-3 sm:p-4",
                      "hover:bg-white/[0.03] transition-colors"
                    )}
                  >
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--glass-border)] bg-white/[0.02] text-foreground-muted cursor-grab active:cursor-grabbing"
                        aria-label="Drag to reorder"
                        title="Drag to reorder"
                      >
                        <GripVertical className="h-4 w-4" aria-hidden />
                      </span>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--glass-border)] bg-white/[0.02] text-foreground hover:bg-white/[0.06] transition-colors"
                        aria-label={expanded ? "Collapse add-on" : "Expand add-on"}
                        onClick={() =>
                          setItemExpanded((p) => ({ ...p, [row.id]: !expanded }))
                        }
                      >
                        {expanded ? (
                          <ChevronDown className="h-4 w-4" aria-hidden />
                        ) : (
                          <ChevronRight className="h-4 w-4" aria-hidden />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[var(--glass-border)] bg-black/20">
                        {thumb ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={thumb}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-foreground-muted px-1 text-center">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {title}
                        </p>
                        <p className="text-xs text-foreground-muted truncate">
                          {row.is_hidden ? "Hidden" : "Visible"} · Stock {row.stock_quantity} · Cap{" "}
                          {row.max_qty_per_cart}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="hidden sm:block">
                        <Label
                          htmlFor={`hidden-${row.id}`}
                          className="text-xs text-foreground-muted"
                        >
                          Hidden
                        </Label>
                      </div>
                      <Switch
                        id={`hidden-${row.id}`}
                        checked={row.is_hidden}
                        onCheckedChange={(v) => updateLocal(row.id, { is_hidden: v })}
                        aria-label={`Hidden from buyers: ${title}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        disabled={saving}
                        onClick={() => removeRow(row.id)}
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded body */}
                  {expanded ? (
                    <div className="border-t border-[var(--glass-border)] p-4 space-y-4">
                      <div className="flex flex-col gap-4 sm:flex-row">
                        <div className="flex-shrink-0">
                          <Label className="text-xs text-foreground-muted">Image</Label>
                          <div className="mt-1 flex items-start gap-3">
                            {row.image_url ? (
                              <button
                                type="button"
                                className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-[var(--glass-border)] bg-black/20 outline-none transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-[var(--wish-orange)]"
                                aria-label="View image full size"
                                onClick={() =>
                                  setImagePreview({
                                    url: row.image_url,
                                    title: row.title.trim() || "Add-on image",
                                  })
                                }
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={displaySrc(row.image_url)}
                                  alt=""
                                  className="h-full w-full object-cover pointer-events-none"
                                />
                              </button>
                            ) : (
                              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-[var(--glass-border)] bg-black/20">
                                <div className="flex h-full w-full items-center justify-center text-[10px] text-foreground-muted px-1 text-center">
                                  No image
                                </div>
                              </div>
                            )}
                            <div className="flex flex-col gap-2">
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                className="hidden"
                                id={`add-on-file-${row.id}`}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  e.target.value = "";
                                  if (f) void uploadImage(row.id, f);
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                disabled={uploadingId != null}
                                onClick={() =>
                                  document.getElementById(`add-on-file-${row.id}`)?.click()
                                }
                              >
                                <ImagePlus className="h-4 w-4" />
                                Upload
                              </Button>
                              {row.image_url ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-1 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  disabled={uploadingId != null || saving}
                                  onClick={() => clearPhoto(row.id)}
                                  aria-label="Remove photo"
                                >
                                  <ImageOff className="h-4 w-4" />
                                  Remove photo
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="min-w-0 flex-1 space-y-3">
                          <div>
                            <Label htmlFor={`title-${row.id}`}>Title</Label>
                            <Input
                              id={`title-${row.id}`}
                              value={row.title}
                              onChange={(e) =>
                                updateLocal(row.id, { title: e.target.value })
                              }
                              placeholder="e.g. Event shirt"
                              className="mt-1"
                            />
                          </div>

                          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-8 sm:gap-y-3">
                            <div className="w-full max-w-[11.5rem] shrink-0">
                              <Label htmlFor={`price-${row.id}`}>Price (PHP)</Label>
                              <div className="mt-1 flex items-center gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9 shrink-0 rounded-lg border-[var(--glass-border)] bg-white/[0.04] hover:bg-white/[0.08]"
                                  disabled={row.price_cents <= 0}
                                  aria-label="Decrease price by ₱1"
                                  onClick={() => bumpPriceCents(row.id, -100)}
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                                <Input
                                  id={`price-${row.id}`}
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  inputMode="decimal"
                                  value={row.price_cents / 100}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    if (raw === "") {
                                      updateLocal(row.id, { price_cents: 0 });
                                      return;
                                    }
                                    const v = Number(raw);
                                    if (Number.isFinite(v) && v >= 0) {
                                      updateLocal(row.id, {
                                        price_cents: Math.round(v * 100),
                                      });
                                    }
                                  }}
                                  className="h-9 w-24 shrink-0 text-center tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9 shrink-0 rounded-lg border-[var(--glass-border)] bg-white/[0.04] hover:bg-white/[0.08]"
                                  aria-label="Increase price by ₱1"
                                  onClick={() => bumpPriceCents(row.id, 100)}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            <div className="w-full max-w-[10.75rem] shrink-0">
                              <Label htmlFor={`stock-${row.id}`}>Stock quantity</Label>
                              <div className="mt-1 flex items-center gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9 shrink-0 rounded-lg border-[var(--glass-border)] bg-white/[0.04] hover:bg-white/[0.08]"
                                  disabled={row.stock_quantity <= 0}
                                  aria-label="Decrease stock"
                                  onClick={() => bumpStock(row.id, -1)}
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                                <Input
                                  id={`stock-${row.id}`}
                                  type="number"
                                  min={0}
                                  step={1}
                                  inputMode="numeric"
                                  value={row.stock_quantity}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    if (raw === "") {
                                      updateLocal(row.id, { stock_quantity: 0 });
                                      return;
                                    }
                                    const v = parseInt(raw, 10);
                                    if (Number.isFinite(v) && v >= 0) {
                                      updateLocal(row.id, { stock_quantity: v });
                                    }
                                  }}
                                  className="h-9 w-20 shrink-0 text-center tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9 shrink-0 rounded-lg border-[var(--glass-border)] bg-white/[0.04] hover:bg-white/[0.08]"
                                  aria-label="Increase stock"
                                  onClick={() => bumpStock(row.id, 1)}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            <div className="w-full max-w-[11rem] shrink-0">
                              <Label htmlFor={`cap-${row.id}`}>Max per cart</Label>
                              <div className="mt-1 flex items-center gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9 shrink-0 rounded-lg border-[var(--glass-border)] bg-white/[0.04] hover:bg-white/[0.08]"
                                  disabled={row.max_qty_per_cart <= 1}
                                  aria-label="Decrease max per cart"
                                  onClick={() => bumpMaxPerCart(row.id, -1)}
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                                <Input
                                  id={`cap-${row.id}`}
                                  type="number"
                                  min={1}
                                  max={9999}
                                  step={1}
                                  inputMode="numeric"
                                  value={row.max_qty_per_cart}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    if (raw === "") {
                                      updateLocal(row.id, { max_qty_per_cart: 1 });
                                      return;
                                    }
                                    const v = parseInt(raw, 10);
                                    if (Number.isFinite(v) && v >= 1) {
                                      updateLocal(row.id, {
                                        max_qty_per_cart: Math.min(9999, v),
                                      });
                                    }
                                  }}
                                  className="h-9 w-20 shrink-0 text-center tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9 shrink-0 rounded-lg border-[var(--glass-border)] bg-white/[0.04] hover:bg-white/[0.08]"
                                  disabled={row.max_qty_per_cart >= 9999}
                                  aria-label="Increase max per cart"
                                  onClick={() => bumpMaxPerCart(row.id, 1)}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div
                            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-lg border border-[var(--glass-border)] bg-muted/40 px-3 py-2 text-sm dark:bg-black/20"
                            aria-live="polite"
                          >
                            <div className="min-w-0">
                              <span className="text-foreground-muted">Price per item · </span>
                              <span className="font-medium tabular-nums text-foreground">
                                {formatPhp(Math.max(0, Math.round(row.price_cents)))}
                              </span>
                            </div>
                            <div className="min-w-0 text-right sm:text-left">
                              <span className="text-foreground-muted">
                                Total (price × stock) ·{" "}
                              </span>
                              <span className="font-semibold tabular-nums text-foreground">
                                {formatPhp(
                                  Math.max(0, Math.round(row.price_cents)) *
                                    Math.max(0, Math.floor(row.stock_quantity))
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {items.length > 0 ? (
              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--glass-border)] bg-muted/40 px-3 py-2.5 text-sm dark:bg-black/20"
                aria-live="polite"
              >
                <span className="text-foreground-muted">Total all items (price × stock)</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatPhp(addOnsInventoryListTotalCents)}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-xs text-foreground-muted">
          {hasChanges ? "You have unsaved add-on changes." : "All changes saved."}
        </p>
        <Button
          type="button"
          onClick={() => void save(items)}
          disabled={saving || uploadingId != null || !hasChanges}
        >
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>

      <div className="glass rounded-xl border border-[var(--glass-border)] bg-muted/30 dark:bg-white/[0.03]">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-3 p-4 text-left outline-none transition-colors hover:bg-muted/50 dark:hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--wish-orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          aria-expanded={soldExpanded}
          aria-label={soldExpanded ? "Collapse sold add-ons section" : "Expand sold add-ons section"}
          onClick={() => setSoldExpanded((v) => !v)}
        >
          <div className="min-w-0 pr-1">
            <p className="text-sm font-medium text-foreground">Sold add-ons</p>
            <p className="text-xs text-foreground-muted">
              By buyer and order · fulfillment matches admissions “Release” ({soldByBuyer.length}{" "}
              buyer{soldByBuyer.length === 1 ? "" : "s"})
            </p>
            {soldByBuyer.length > 0 ? (
              <p className="text-xs font-semibold text-foreground mt-1.5 tabular-nums">
                Total add-on sales · {formatPhp(soldAddOnsGrandTotalCents)}
              </p>
            ) : null}
          </div>
          <ChevronDown
            className={cn(
              "mt-0.5 h-5 w-5 shrink-0 text-foreground-muted transition-transform",
              soldExpanded && "rotate-180"
            )}
            aria-hidden
          />
        </button>
        {soldExpanded ? (
          <div className="space-y-3 px-4 pb-4">
            {soldByBuyer.length === 0 ? (
              <div className="rounded-lg border border-[var(--glass-border)] bg-muted/60 p-4 text-sm text-foreground dark:bg-black/20">
                No sold add-ons found yet.
              </div>
            ) : (
              soldByBuyer.map((buyer) => {
                const expanded = buyerExpanded[buyer.email] === true;
                const waitingLabel =
                  buyer.pending_units <= 0
                    ? "All add-ons received"
                    : `${buyer.pending_units} unit${buyer.pending_units === 1 ? "" : "s"} waiting to be received`;
                return (
                  <div
                    key={buyer.email}
                    className="rounded-lg border border-[var(--glass-border)] bg-muted/50 overflow-hidden dark:bg-black/20"
                  >
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-2 p-3 text-left outline-none transition-colors hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--wish-orange)] dark:hover:bg-white/[0.06]"
                      aria-expanded={expanded}
                      aria-label={
                        expanded
                          ? `Collapse orders for ${buyer.email}`
                          : `Expand orders for ${buyer.email}`
                      }
                      onClick={() =>
                        setBuyerExpanded((prev) => ({
                          ...prev,
                          [buyer.email]: !expanded,
                        }))
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground break-all">{buyer.email}</p>
                        <p className="text-xs text-foreground-muted mt-1">
                          {expanded ? (
                            <>
                              {buyer.orders.length} order{buyer.orders.length === 1 ? "" : "s"} ·{" "}
                              {buyer.total_units} unit{buyer.total_units === 1 ? "" : "s"} ·{" "}
                              {formatPhp(buyer.total_cents)}
                            </>
                          ) : (
                            <>
                              {waitingLabel}
                              <span className="text-foreground-muted"> · </span>
                              <span className="tabular-nums text-foreground">{formatPhp(buyer.total_cents)}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <ChevronDown
                        className={cn(
                          "mt-0.5 h-5 w-5 shrink-0 text-foreground-muted transition-transform",
                          expanded && "rotate-180"
                        )}
                        aria-hidden
                      />
                    </button>
                    {expanded ? (
                      <div className="border-t border-[var(--glass-border)] px-3 pb-3 pt-2 space-y-3">
                        {buyer.orders.map((order) => (
                          <div
                            key={order.booking_id}
                            className="rounded-md border border-[var(--glass-border)] bg-background/80 p-2.5 shadow-sm dark:bg-black/25 dark:shadow-none"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                              <p className="text-xs font-semibold text-foreground">
                                {formatOrderLabel(order.booking_id, order.booking_created_at)}
                              </p>
                              <p className="text-[11px] text-foreground/80 tabular-nums">
                                {order.pending_units > 0 ? (
                                  <>
                                    {order.pending_units} waiting · {formatPhp(order.total_cents)}
                                  </>
                                ) : (
                                  <>All received · {formatPhp(order.total_cents)}</>
                                )}
                              </p>
                            </div>
                            <div className="space-y-2">
                              {order.items.map((line) => {
                                const badge = receivedBadge(line);
                                return (
                                  <div
                                    key={line.id}
                                    className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2 text-xs"
                                  >
                                    <span className="min-w-0 truncate text-foreground">
                                      {line.title}{" "}
                                      <span className="font-medium tabular-nums">
                                        ×{line.quantity}
                                      </span>
                                      {line.pending_quantity > 0 ? (
                                        <span className="text-foreground-muted font-normal">
                                          {" "}
                                          ({line.pending_quantity} pending)
                                        </span>
                                      ) : null}
                                    </span>
                                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                                      <span
                                        className={cn(
                                          "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                                          badge.className
                                        )}
                                      >
                                        {badge.label}
                                      </span>
                                      <span className="text-foreground/90 tabular-nums font-medium">
                                        {formatPhp(line.line_total_cents)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      <Dialog
        open={imagePreview != null}
        onOpenChange={(o) => !o && setImagePreview(null)}
      >
        <DialogContent
          hideClose
          className="max-w-[min(100vw-2rem,900px)] border-[var(--glass-border)] bg-black/90 p-0 gap-0"
        >
          <DialogTitle className="sr-only">
            {imagePreview?.title ?? "Add-on image"}
          </DialogTitle>
          {imagePreview?.url ? (
            <div className="relative aspect-square w-full max-h-[85vh]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displaySrc(imagePreview.url)}
                alt=""
                className="h-full w-full object-contain"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 rounded-full bg-black/60 text-white hover:bg-black/80"
                onClick={() => setImagePreview(null)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
