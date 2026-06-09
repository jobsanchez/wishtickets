"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GripVertical,
  ImagePlus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabaseStorageDisplaySrc } from "@/lib/image-remote";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

export type AdminEventBanner = {
  id: string;
  event_id: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function SortableBannerRow({
  banner,
  orderIndex,
  expanded,
  onExpandToggle,
  disabled,
  onToggleActive,
  onRemove,
}: {
  banner: AdminEventBanner;
  orderIndex: number;
  expanded: boolean;
  onExpandToggle: () => void;
  disabled: boolean;
  onToggleActive: (bannerId: string, isActive: boolean) => Promise<void>;
  onRemove: (bannerId: string) => Promise<void>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: banner.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const displaySrcRaw =
    banner.image_url.startsWith("/") ||
    banner.image_url.includes("localhost")
      ? banner.image_url
      : supabaseStorageDisplaySrc(banner.image_url) || banner.image_url;

  /** Per-row bust so the browser/CDN cannot reuse another row’s bitmap for the proxy URL. */
  const displaySrc =
    displaySrcRaw.startsWith("/api/image-proxy")
      ? `${displaySrcRaw}${displaySrcRaw.includes("?") ? "&" : "?"}bannerId=${banner.id}`
      : displaySrcRaw;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border border-[var(--glass-border)] bg-white/[0.03] overflow-hidden",
        isDragging && "opacity-60 z-50"
      )}
    >
      {!expanded ? (
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              type="button"
              aria-label="Drag to reorder banner"
              className="flex h-14 w-10 shrink-0 cursor-grab items-center justify-center rounded border border-[var(--glass-border)] text-foreground-muted hover:bg-white/10 active:cursor-grabbing"
              disabled={disabled}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-5 w-5" />
            </button>
            <div className="relative aspect-[1280/543] h-14 shrink-0 overflow-hidden rounded border border-[var(--glass-border)] bg-black/20">
              {/* eslint-disable-next-line @next/next/no-img-element -- avoid Next/Image reusing decoded pixels across sibling rows */}
              <img
                src={displaySrc}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-cover select-none"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-sm font-medium text-foreground">
                Homepage banner #{orderIndex}
              </span>
              <label
                className="flex w-fit items-center gap-2 cursor-pointer select-none"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={banner.is_active}
                  disabled={disabled}
                  onCheckedChange={(v) =>
                    void onToggleActive(banner.id, v === true)
                  }
                  aria-label="Active on homepage carousel"
                />
                <span className="text-xs text-foreground-muted">Active</span>
              </label>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full shrink-0 gap-2 sm:w-auto sm:ml-auto"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onExpandToggle();
            }}
            aria-expanded={false}
          >
            <span>Expand</span>
            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 gap-2 text-foreground-muted"
              disabled={disabled}
              onClick={onExpandToggle}
              aria-expanded
            >
              <span className="text-xs">Collapse</span>
              <ChevronUp className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <button
              type="button"
              aria-label="Drag to reorder banner"
              className="hidden sm:flex h-[7.75rem] w-10 shrink-0 cursor-grab items-center justify-center rounded border border-[var(--glass-border)] text-foreground-muted hover:bg-white/10 active:cursor-grabbing"
              disabled={disabled}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-5 w-5" />
            </button>
            <div className="relative mx-auto aspect-[1280/543] w-full max-w-[22rem] sm:mx-0 sm:w-[240px] shrink-0 overflow-hidden rounded-md border border-[var(--glass-border)] bg-black/20">
              {/* eslint-disable-next-line @next/next/no-img-element -- avoid Next/Image reusing decoded pixels across sibling rows */}
              <img
                src={displaySrc}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-cover select-none"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox
                    checked={banner.is_active}
                    disabled={disabled}
                    onCheckedChange={(v) =>
                      void onToggleActive(banner.id, v === true)
                    }
                    aria-label="Active on homepage carousel"
                  />
                  <span className="text-sm">Active</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="w-fit"
                  disabled={disabled}
                  onClick={() => void onRemove(banner.id)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function EventBannersSection({
  eventId,
  initialBanners,
  onCarouselBusyChange,
}: {
  eventId: string;
  initialBanners: AdminEventBanner[];
  /** When true, parent should include this in global blocking overlay coordination */
  onCarouselBusyChange?: (busy: boolean) => void;
}) {
  const [banners, setBanners] = useState<AdminEventBanner[]>(initialBanners);
  const [uploadingCarousel, setUploadingCarousel] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [patchingIds, setPatchingIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Banners collapsed by default; only ids in set are expanded. */
  const [expandedBannerIds, setExpandedBannerIds] = useState<Set<string>>(
    () => new Set()
  );

  /** Whole section (header + list) starts collapsed. */
  const [sectionExpanded, setSectionExpanded] = useState(false);

  const busy = uploadingCarousel || reordering || patchingIds.size > 0;
  useEffect(() => {
    onCarouselBusyChange?.(busy);
  }, [busy, onCarouselBusyChange]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = banners.findIndex((b) => b.id === active.id);
    const newIndex = banners.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const snapshot = banners;
    const next = arrayMove(banners, oldIndex, newIndex);
    setBanners(next);
    void (async () => {
      setReordering(true);
      try {
        const res = await fetch(`/api/admin/events/${eventId}/banners`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderedIds: next.map((b) => b.id),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to reorder banners");
        setBanners(next.map((b, i) => ({ ...b, sort_order: i })));
        toast.success("Banner order saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to reorder banners");
        setBanners(snapshot);
      } finally {
        setReordering(false);
      }
    })();
  }

  async function handleCarouselFile(file: File) {
    setUploadingCarousel(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("slug", "temp");
      fd.append("bucket", "event-banners");
      fd.append("eventId", eventId);
      const uploadRes = await fetch("/api/admin/upload", {
        method: "POST",
        body: fd,
      });
      const uploadData = (await uploadRes.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!uploadRes.ok || !uploadData.url) {
        throw new Error(uploadData.error ?? "Upload failed");
      }
      const insertRes = await fetch(`/api/admin/events/${eventId}/banners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: uploadData.url }),
      });
      const insertBody = (await insertRes.json().catch(() => ({}))) as {
        banner?: AdminEventBanner;
        error?: string;
      };
      if (!insertRes.ok || !insertBody.banner) {
        throw new Error(insertBody.error ?? "Failed to save banner row");
      }
      setBanners((prev) =>
        [...prev, { ...insertBody.banner! }].sort((a, b) => a.sort_order - b.sort_order)
      );
      toast.success("Banner added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingCarousel(false);
    }
  }

  async function toggleActive(bannerId: string, isActive: boolean) {
    setPatchingIds((s) => new Set(s).add(bannerId));
    try {
      const res = await fetch(
        `/api/admin/events/${eventId}/banners/${bannerId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: isActive }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as {
        banner?: AdminEventBanner;
        error?: string;
      };
      if (!res.ok || !body.banner) {
        throw new Error(body.error ?? "Failed to update banner");
      }
      setBanners((prev) =>
        prev.map((b) =>
          b.id === bannerId ? { ...b, ...body.banner!, is_active: body.banner!.is_active } : b
        )
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setPatchingIds((s) => {
        const next = new Set(s);
        next.delete(bannerId);
        return next;
      });
    }
  }

  async function removeBanner(bannerId: string) {
    setPatchingIds((s) => new Set(s).add(bannerId));
    try {
      const res = await fetch(
        `/api/admin/events/${eventId}/banners/${bannerId}`,
        { method: "DELETE" }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to delete banner");
      setBanners((prev) => prev.filter((b) => b.id !== bannerId));
      toast.success("Banner removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setPatchingIds((s) => {
        const next = new Set(s);
        next.delete(bannerId);
        return next;
      });
    }
  }

  return (
    <>
      <div className="rounded-lg border border-[var(--glass-border)] bg-white/[0.02]">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void handleCarouselFile(f);
          }}
        />

        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-1 gap-2 sm:items-start">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-0.5 h-9 w-9 shrink-0 text-foreground-muted hover:text-foreground"
                disabled={busy}
                aria-expanded={sectionExpanded}
                aria-label={
                  sectionExpanded
                    ? "Collapse homepage carousel section"
                    : "Expand homepage carousel section"
                }
                onClick={() => setSectionExpanded((v) => !v)}
              >
                {sectionExpanded ? (
                  <ChevronUp className="h-5 w-5" aria-hidden />
                ) : (
                  <ChevronRight className="h-5 w-5" aria-hidden />
                )}
              </Button>
              <div className="min-w-0">
                <p className="font-medium text-foreground">Homepage carousel banners</p>
                {sectionExpanded ? (
                  <p className="mt-1 text-xs text-foreground-muted">
                    Shown on the public home page carousel (published, upcoming events). Multiple
                    banners per event; resized to 1280 × 543 px on upload.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-foreground-muted">
                    {banners.length === 0
                      ? "Collapsed — expand to add or manage banners."
                      : `${banners.length} banner${banners.length === 1 ? "" : "s"} — expand to edit or reorder.`}
                  </p>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full shrink-0 sm:ml-auto sm:w-auto"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="mr-2 h-4 w-4 shrink-0" />
              Add banner
            </Button>
          </div>

          {sectionExpanded ? (
            banners.length === 0 ? (
              <p className="rounded-md border border-dashed border-[var(--glass-border)] py-4 text-center text-sm text-foreground-muted">
                No banners yet. Upload images to rotate on the homepage.
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={banners.map((b) => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="space-y-3" role="list">
                    {banners.map((b, i) => (
                      <li key={b.id}>
                        <SortableBannerRow
                          banner={b}
                          orderIndex={i + 1}
                          expanded={expandedBannerIds.has(b.id)}
                          onExpandToggle={() => {
                            setExpandedBannerIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(b.id)) next.delete(b.id);
                              else next.add(b.id);
                              return next;
                            });
                          }}
                          disabled={busy}
                          onToggleActive={toggleActive}
                          onRemove={removeBanner}
                        />
                      </li>
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )
          ) : null}
        </div>
      </div>
    </>
  );
}
