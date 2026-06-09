"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown, ChevronRight, CopyPlus, Search, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { usePermissionDialog } from "@/components/providers/permission-dialog-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface EventRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  category: string;
  event_start: string;
  producer_id?: string | null;
  featured?: boolean;
  thumbnail_url?: string | null;
  image_url?: string | null;
}

interface EventsTableProps {
  events: EventRow[] | null;
  /** Map producer_id -> name for Producer column. When provided, Producer column is shown. */
  producerMap?: Record<string, string>;
  /** Show Featured column and checkbox (super_admin only) */
  showFeatured?: boolean;
  /** Filter events by status (e.g. "archived") */
  statusFilter?: string;
  /** Custom message when no events (default: "No events yet.") */
  emptyMessage?: string;
  /** Hide the search input */
  hideSearch?: boolean;
  /** Start with category groups collapsed (default: false = expanded) */
  defaultCollapsed?: boolean;
  /** Duplicate event template (manage_events capability) */
  canDuplicate?: boolean;
}

function groupByCategory(events: EventRow[]): [string, EventRow[]][] {
  const map = new Map<string, EventRow[]>();
  for (const e of events) {
    const cat = e.category || "Uncategorized";
    const list = map.get(cat) ?? [];
    list.push(e);
    map.set(cat, list);
  }
  return Array.from(map.entries());
}

export function EventsTable({ events, producerMap, showFeatured = false, statusFilter, emptyMessage = "No events yet.", hideSearch = false, defaultCollapsed = false, canDuplicate = false }: EventsTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { showPermissionDialog } = usePermissionDialog() ?? { showPermissionDialog: () => {} };
  const [search, setSearch] = useState("");
  const [producerFilter, setProducerFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (defaultCollapsed) return new Set();
    const cats = groupByCategory(events ?? []).map(([c]) => c);
    return new Set(cats);
  });
  const [featuredState, setFeaturedState] = useState<Record<string, boolean>>({});
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState<EventRow | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState("");
  const [duplicateSubmitting, setDuplicateSubmitting] = useState(false);
  const [openingEventId, setOpeningEventId] = useState<string | null>(null);

  const dupColumnVisible = Boolean(canDuplicate);

  const tableColSpan =
    4 +
    (producerMap ? 1 : 0) +
    (showFeatured ? 1 : 0) +
    (dupColumnVisible ? 1 : 0);

  const filteredEvents = useMemo(() => {
    if (!events?.length) return [];
    let list = events;
    if (statusFilter) {
      list = list.filter((e) => (e.status ?? "").toLowerCase() === statusFilter.toLowerCase());
    }
    if (producerFilter) {
      if (producerFilter === "__none__") {
        list = list.filter((e) => !e.producer_id);
      } else {
        list = list.filter((e) => e.producer_id === producerFilter);
      }
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) => {
      const title = (e.title ?? "").toLowerCase();
      const slug = (e.slug ?? "").toLowerCase();
      const category = (e.category ?? "").toLowerCase();
      const producerName = e.producer_id && producerMap?.[e.producer_id] ? producerMap[e.producer_id].toLowerCase() : "";
      return (
        title.includes(q) ||
        slug.includes(q) ||
        category.includes(q) ||
        producerName.includes(q)
      );
    });
  }, [events, search, statusFilter, producerFilter, producerMap]);

  const groups = useMemo(() => {
    if (!filteredEvents?.length) return [];
    const merged = filteredEvents.map((e) => ({
      ...e,
      featured: e.id in featuredState ? featuredState[e.id] : (e.featured ?? false),
    }));
    const sorted = [...merged].sort((a, b) => {
      const aFeat = a.featured ? 1 : 0;
      const bFeat = b.featured ? 1 : 0;
      if (bFeat !== aFeat) return bFeat - aFeat;
      return (
        new Date(a.event_start).getTime() - new Date(b.event_start).getTime()
      );
    });
    return groupByCategory(sorted);
  }, [filteredEvents, featuredState]);

  function toggleCategory(category: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  async function handleFeaturedChange(eventId: string, checked: boolean) {
    setFeaturedState((prev) => ({ ...prev, [eventId]: checked }));
    try {
      const res = await fetch(`/api/admin/events/${eventId}/featured`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: checked }),
      });
      if (res.status === 403) {
        showPermissionDialog();
        setFeaturedState((prev) => ({ ...prev, [eventId]: !checked }));
        return;
      }
      if (!res.ok) {
        setFeaturedState((prev) => ({ ...prev, [eventId]: !checked }));
      }
    } catch {
      setFeaturedState((prev) => ({ ...prev, [eventId]: !checked }));
    }
  }

  function isFeatured(e: EventRow): boolean {
    if (e.id in featuredState) return featuredState[e.id];
    return e.featured ?? false;
  }

  function openDuplicateDialog(ev: EventRow) {
    setDuplicateSource(ev);
    setDuplicateTitle(`${ev.title} (copy)`);
    setDuplicateDialogOpen(true);
  }

  async function confirmDuplicate() {
    const source = duplicateSource;
    if (!source?.id) return;
    const title = duplicateTitle.trim();
    if (!title) {
      toast.error("Enter a name for the duplicated event");
      return;
    }
    setDuplicateSubmitting(true);
    try {
      const res = await fetch(`/api/admin/events/${source.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.status === 403) {
        showPermissionDialog();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Duplicate failed");
      }
      if (!data.id) throw new Error("No event id returned");
      toast.success("Event duplicated as draft");
      setDuplicateDialogOpen(false);
      setDuplicateSource(null);
      router.refresh();
      startTransition(() => {
        router.push(`/admin/events/${data.id}`);
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Duplicate failed");
    } finally {
      setDuplicateSubmitting(false);
    }
  }

  if (!events?.length) {
    return (
      <div className="glass rounded-xl border border-[var(--glass-border)] p-8 text-center text-foreground-muted">
        {emptyMessage}
      </div>
    );
  }

  if (statusFilter && !filteredEvents.length) {
    return (
      <div className="space-y-4">
        {!hideSearch && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
              <Input
                type="search"
                placeholder="Search events..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                aria-label="Search events"
              />
            </div>
            {producerMap && Object.keys(producerMap).length > 0 && (
              <select
                className="flex h-10 min-w-[180px] rounded-lg glass border border-[var(--glass-border)] bg-white/5 px-3 text-sm text-foreground"
                value={producerFilter}
                onChange={(e) => setProducerFilter(e.target.value)}
                aria-label="Filter by producer"
              >
                <option value="">All producers</option>
                <option value="__none__">No producer</option>
                {Object.entries(producerMap)
                  .sort(([, a], [, b]) => a.localeCompare(b))
                  .map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
              </select>
            )}
          </div>
        )}
        <div className="glass rounded-xl border border-[var(--glass-border)] p-8 text-center text-foreground-muted">
          {emptyMessage}
        </div>
      </div>
    );
  }

  if ((search.trim() || producerFilter) && !filteredEvents.length) {
    return (
      <div className="space-y-4">
        {!hideSearch && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
              <Input
                type="search"
                placeholder="Search events..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                aria-label="Search events"
              />
            </div>
            {producerMap && Object.keys(producerMap).length > 0 && (
              <select
                className="flex h-10 min-w-[180px] rounded-lg glass border border-[var(--glass-border)] bg-white/5 px-3 text-sm text-foreground"
                value={producerFilter}
                onChange={(e) => setProducerFilter(e.target.value)}
                aria-label="Filter by producer"
              >
                <option value="">All producers</option>
                <option value="__none__">No producer</option>
                {Object.entries(producerMap)
                  .sort(([, a], [, b]) => a.localeCompare(b))
                  .map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
              </select>
            )}
          </div>
        )}
        <div className="glass rounded-xl border border-[var(--glass-border)] p-8 text-center text-foreground-muted">
          No events match your search or filter.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {duplicateSubmitting ? (
        <FloatingProgressBar
          active
          message="Duplicating event…"
          subtitle={duplicateSource?.title ?? undefined}
          detail="Copying seating, pricing, promos, and other settings as a blank draft. No bookings are copied. Keep this tab open until it finishes."
        />
      ) : (
        <FloatingProgressBar
          active={isPending || openingEventId !== null}
          {...FLOATING_PROGRESS_PRESETS.navigation}
          message="Opening event…"
        />
      )}
      {!hideSearch && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
            <Input
              type="search"
              placeholder="Search events..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search events"
            />
          </div>
          {producerMap && Object.keys(producerMap).length > 0 && (
            <select
              className="flex h-10 min-w-[180px] rounded-lg glass border border-[var(--glass-border)] bg-white/5 px-3 text-sm text-foreground"
              value={producerFilter}
              onChange={(e) => setProducerFilter(e.target.value)}
              aria-label="Filter by producer"
            >
              <option value="">All producers</option>
              <option value="__none__">No producer</option>
              {Object.entries(producerMap)
                .sort(([, a], [, b]) => a.localeCompare(b))
                .map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
            </select>
          )}
        </div>
      )}
      <div className="glass rounded-xl border border-[var(--glass-border)] overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full text-left min-w-[640px]">
        <thead>
          <tr className="border-b border-[var(--glass-border)]">
            <th className="p-4 text-sm font-medium text-foreground-muted">Title</th>
            <th className="p-4 text-sm font-medium text-foreground-muted">Status</th>
            <th className="p-4 text-sm font-medium text-foreground-muted">Date</th>
            {producerMap && (
              <th className="p-4 text-sm font-medium text-foreground-muted">Producer</th>
            )}
            {showFeatured && (
              <th className="p-4 text-sm font-medium text-foreground-muted w-24">Featured</th>
            )}
            {dupColumnVisible && (
              <th className="p-4 text-sm font-medium text-foreground-muted w-14">Dup</th>
            )}
            <th className="p-4 text-sm font-medium text-foreground-muted w-20">Share</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(([category, items]) => {
            const isOpen = expanded.has(category);
            return (
              <React.Fragment key={category}>
                <tr
                  className="border-b border-[var(--glass-border)] bg-white/5 cursor-pointer hover:bg-white/[0.07]"
                  onClick={() => toggleCategory(category)}
                >
                  <td colSpan={tableColSpan} className="p-3">
                    <div className="flex items-center gap-2">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
                      )}
                      <span className="font-medium text-foreground">{category}</span>
                      <span className="text-sm text-foreground-muted">
                        ({items.length} {items.length === 1 ? "event" : "events"})
                      </span>
                    </div>
                  </td>
                </tr>
                {isOpen &&
                  items.map((e) => (
                    <tr
                      key={e.id}
                      className="group border-b border-[var(--glass-border)] hover:bg-white/[0.07] transition-colors"
                    >
                      <td className="p-4 pl-12">
                        <div className="flex items-center gap-3">
                          {(e.thumbnail_url ?? e.image_url) ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={e.thumbnail_url ?? e.image_url ?? ""}
                              alt=""
                              className="h-10 w-16 shrink-0 rounded object-cover bg-[var(--surface)]"
                              width={64}
                              height={40}
                            />
                          ) : (
                            <div className="h-10 w-16 shrink-0 rounded bg-[var(--surface)] flex items-center justify-center text-foreground-muted text-xs">
                              —
                            </div>
                          )}
                          <Link
                            href={`/admin/events/${e.id}`}
                            onClick={() => setOpeningEventId(e.id)}
                            className="text-foreground group-hover:text-yellow-400 transition-colors underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wish-orange)] rounded-sm"
                          >
                            {e.title}
                          </Link>
                        </div>
                      </td>
                      <td
                        className={`p-4 transition-colors ${
                          (e.status ?? "").toLowerCase() === "published"
                            ? "text-[#9dffbf] group-hover:text-[#c4ffd8]"
                            : "text-foreground-muted group-hover:text-yellow-400"
                        }`}
                      >
                        {e.status}
                      </td>
                      <td className="p-4 text-foreground-muted group-hover:text-yellow-400 transition-colors">
                        {new Date(e.event_start).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "numeric",
                          day: "numeric",
                        })}
                      </td>
                      {producerMap && (
                        <td className="p-4 text-foreground-muted group-hover:text-yellow-400 transition-colors">
                          {e.producer_id ? producerMap[e.producer_id] ?? "—" : "—"}
                        </td>
                      )}
                      {showFeatured && (
                        <td className="p-4" onClick={(ev) => ev.stopPropagation()}>
                          <Checkbox
                            checked={isFeatured(e)}
                            onCheckedChange={(checked) =>
                              handleFeaturedChange(e.id, checked === true)
                            }
                            onClick={(ev) => ev.stopPropagation()}
                            aria-label={`Featured: ${e.title}`}
                          />
                        </td>
                      )}
                      {dupColumnVisible && (
                        <td className="p-4" onClick={(ev) => ev.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => openDuplicateDialog(e)}
                            className="rounded-md p-2 text-foreground-muted hover:bg-white/10 hover:text-foreground transition-colors"
                            aria-label={`Duplicate ${e.title}`}
                          >
                            <CopyPlus className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                      <td className="p-4" onClick={(ev) => ev.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            const url =
                              typeof window !== "undefined"
                                ? `${window.location.origin}/${e.slug}`
                                : "";
                            if (!url) return;
                            if (typeof navigator !== "undefined" && navigator.share) {
                              navigator
                                .share({ title: e.title, url })
                                .then(() => toast.success("Link shared"))
                                .catch((err) => {
                                  if (err?.name !== "AbortError") {
                                    navigator.clipboard?.writeText(url).then(
                                      () => toast.success("Event link copied to clipboard"),
                                      () => toast.error("Failed to copy link")
                                    );
                                  }
                                });
                            } else {
                              navigator.clipboard?.writeText(url).then(
                                () => toast.success("Event link copied to clipboard"),
                                () => toast.error("Failed to copy link")
                              );
                            }
                          }}
                          className="rounded-md p-2 text-foreground-muted hover:bg-white/10 hover:text-foreground transition-colors"
                          aria-label={`Share ${e.title}`}
                        >
                          <Share2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>

    <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicate event</DialogTitle>
            <DialogDescription>
              Creates a new draft with the same seating, pricing, promos, and settings. Sales and bookings are not copied. Seat QR codes will be regenerated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label htmlFor="duplicate-event-title" className="text-sm text-foreground-muted">
              Title for the new event
            </label>
            <Input
              id="duplicate-event-title"
              value={duplicateTitle}
              onChange={(ev) => setDuplicateTitle(ev.target.value)}
              disabled={duplicateSubmitting}
              placeholder="Event name"
              autoComplete="off"
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  ev.preventDefault();
                  void confirmDuplicate();
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDuplicateDialogOpen(false)}
              disabled={duplicateSubmitting}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void confirmDuplicate()} disabled={duplicateSubmitting}>
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
