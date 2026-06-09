"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberStepper } from "@/components/ui/number-stepper";
import { toast } from "@/lib/toast";
import { ImagePlus, Link2, Upload, X, Trash2 } from "lucide-react";
import { CreateNewVenueDialog } from "@/components/admin/create-new-venue-dialog";
import { CreateNewProducerDialog } from "@/components/admin/create-new-producer-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FloatingProgressBar } from "@/components/ui/floating-progress";
import {
  EventBannersSection,
  type AdminEventBanner,
} from "@/components/admin/event-banners-section";
import { Checkbox } from "@/components/ui/checkbox";
import { PhotoProvider, PhotoView } from "react-photo-view";
import { parseEventStartInput, toManilaDatetimeLocal } from "@/lib/event-datetime";
import { getVideoEmbedInfo } from "@/lib/utils";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import "react-photo-view/dist/react-photo-view.css";

const CREATE_NEW_VENUE_SENTINEL = "__create_new__";
const CREATE_NEW_PRODUCER_SENTINEL = "__create_new_producer__";
const VENUE_TBA_SENTINEL = "__venue_tba__";

interface Venue {
  id: string;
  name: string;
}

interface Producer {
  id: string;
  name: string;
}

/** Derive URL-safe slug from title (lowercase, spaces to hyphens, alphanumeric + hyphens only) */
function slugify(title: string): string {
  const s = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "event";
}

function toPublicTeaserUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/storage/v1/object/public/")) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "") ?? "";
    return base ? `${base}${trimmed}` : trimmed;
  }
  if (trimmed.startsWith("storage://")) {
    const withoutScheme = trimmed.slice("storage://".length);
    const slash = withoutScheme.indexOf("/");
    if (slash <= 0) return trimmed;
    const bucket = withoutScheme.slice(0, slash);
    const objectPath = withoutScheme.slice(slash + 1);
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "") ?? "";
    return base ? `${base}/storage/v1/object/public/${bucket}/${objectPath}` : trimmed;
  }
  return trimmed;
}

type EventStatus = "draft" | "published" | "postponed" | "archived";

interface CategoryItem {
  value: string;
  label: string;
}

interface EventFormProps {
  eventId?: string;
  initialEvent?: {
    title: string;
    slug: string;
    description?: string | null;
    category: string;
    status: string;
    image_url?: string | null;
    thumbnail_url?: string | null;
    teaser_video_url?: string | null;
    event_start: string;
    venue_id?: string | null;
    venue_to_be_announced?: boolean | null;
    schedule_to_be_announced?: boolean | null;
    producer_id?: string | null;
    ticket_purchase_per_user?: number | null;
  };
  venues?: Venue[];
  producers?: Producer[];
  canCreateVenue?: boolean;
  canCreateProducer?: boolean;
  isSuperAdmin?: boolean;
  /** Homepage carousel rows; only when editing an existing event */
  initialBanners?: AdminEventBanner[];
}

export function EventForm({
  eventId,
  initialEvent,
  venues = [],
  producers = [],
  canCreateVenue = false,
  canCreateProducer = true,
  isSuperAdmin = false,
  initialBanners = [],
}: EventFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const teaserVideoInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingLabel, setUploadingLabel] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [createVenueOpen, setCreateVenueOpen] = useState(false);
  const [createProducerOpen, setCreateProducerOpen] = useState(false);
  const [carouselBusy, setCarouselBusy] = useState(false);
  const [venuesList, setVenuesList] = useState<Venue[]>(venues);
  const [producersList, setProducersList] = useState<Producer[]>(producers);
  const [categories, setCategories] = useState<CategoryItem[]>([
    { value: "Shows & Concerts", label: "Shows & Concerts" },
    { value: "Sports", label: "Sports" },
    { value: "Tours & Attraction", label: "Tours & Attraction" },
    { value: "Corporate Events", label: "Corporate Events" },
    { value: "Family", label: "Family" },
  ]);
  const [form, setForm] = useState({
    title: initialEvent?.title ?? "",
    slug: initialEvent?.slug ?? "",
    description: initialEvent?.description ?? "",
    category: initialEvent?.category ?? "Shows & Concerts",
    status: ((initialEvent?.status === "cancelled" ? "archived" : initialEvent?.status) ?? "draft") as EventStatus,
    image_url: initialEvent?.image_url ?? "",
    thumbnail_url: initialEvent?.thumbnail_url ?? initialEvent?.image_url ?? "",
    teaser_video_url: initialEvent?.teaser_video_url ?? "",
    event_start: initialEvent?.event_start
      ? toManilaDatetimeLocal(initialEvent.event_start)
      : "",
    venue_to_be_announced: Boolean(initialEvent?.venue_to_be_announced),
    schedule_to_be_announced: Boolean(initialEvent?.schedule_to_be_announced),
    venue_id:
      initialEvent?.venue_to_be_announced
        ? ""
        : initialEvent?.venue_id &&
            venues.some(
              (v) => String(v.id).toLowerCase() === String(initialEvent!.venue_id).toLowerCase()
            )
          ? String(initialEvent.venue_id).trim()
          : "",
    producer_id:
      initialEvent?.producer_id &&
      producers.some(
        (p) => String(p.id).toLowerCase() === String(initialEvent!.producer_id).toLowerCase()
      )
        ? String(initialEvent.producer_id).trim()
        : "",
    ticket_purchase_per_user: Math.max(
      0,
      Number(initialEvent?.ticket_purchase_per_user ?? 0) || 0
    ),
  });

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLabel("full-image");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("slug", form.slug || "temp");
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setForm((f) => ({ ...f, image_url: data.url }));
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadingLabel(null);
      e.target.value = "";
    }
  }

  async function handleThumbnailSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLabel("thumbnail");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("slug", form.slug || "temp");
      fd.append("isThumbnail", "true");
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setForm((f) => ({ ...f, thumbnail_url: data.url }));
      toast.success("Thumbnail uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadingLabel(null);
      e.target.value = "";
    }
  }

  async function handleTeaserVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLabel("teaser-video");
    setUploading(true);
    try {
      const signedRes = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createTeaserSignedUpload",
          slug: form.slug || "temp",
          assetKind: "teaser-video",
          mimeType: file.type,
        }),
      });
      const signedData = (await signedRes.json().catch(() => ({}))) as {
        bucket?: string;
        path?: string;
        token?: string;
        url?: string;
        storageRef?: string;
        error?: string;
      };
      if (!signedRes.ok || !signedData.bucket || !signedData.path || !signedData.token) {
        throw new Error(signedData.error ?? "Failed to prepare teaser upload");
      }

      const supabase = createSupabaseClient();
      const { error: directUploadError } = await supabase.storage
        .from(signedData.bucket)
        .uploadToSignedUrl(signedData.path, signedData.token, file);
      if (directUploadError) {
        throw new Error(directUploadError.message || "Teaser upload failed");
      }

      const data = {
        url: signedData.url,
        storageRef: signedData.storageRef,
      } as {
        url?: string;
        storageRef?: string;
      };
      if (!data.storageRef && !data.url) {
        throw new Error("Upload succeeded, but response is missing teaser URL");
      }
      const teaserValue = toPublicTeaserUrl(data.url ?? data.storageRef ?? "");
      setForm((f) => ({
        ...f,
        teaser_video_url: teaserValue,
      }));

      if (eventId) {
        setUploadingLabel("teaser-save");
        const producerId = String(form.producer_id ?? "").trim();
        const normalizedEventStart = form.event_start
          ? parseEventStartInput(form.event_start).toISOString()
          : new Date().toISOString();

        const payload = {
          ...form,
          teaser_video_url: teaserValue,
          event_start: normalizedEventStart,
          venue_id: form.venue_to_be_announced
            ? null
            : String(form.venue_id ?? "").trim() || null,
          venue_to_be_announced: form.venue_to_be_announced,
          schedule_to_be_announced: form.schedule_to_be_announced,
          producer_id: producerId,
        };

        const saveRes = await fetch(`/api/admin/events/${eventId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!saveRes.ok) {
          const saveData = (await saveRes.json().catch(() => ({}))) as { error?: string };
          toast.error(
            saveData.error ??
              "Teaser uploaded, but auto-save failed. Click Save changes to persist it."
          );
          return;
        }
        toast.success("Teaser video uploaded and saved");
      } else {
        toast.success("Teaser video uploaded");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadingLabel(null);
      e.target.value = "";
    }
  }

  useEffect(() => {
    fetch("/api/events/categories")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setCategories(data);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!initialEvent) return;
    setForm((prev) => ({
      ...prev,
      title: initialEvent.title ?? prev.title,
      slug: initialEvent.slug ?? prev.slug,
      description: initialEvent.description ?? prev.description,
      category: initialEvent.category ?? prev.category,
      status: ((initialEvent.status === "cancelled" ? "archived" : initialEvent.status) ?? prev.status) as EventStatus,
      image_url: initialEvent.image_url ?? prev.image_url,
      thumbnail_url:
        initialEvent.thumbnail_url ??
        initialEvent.image_url ??
        prev.thumbnail_url,
      teaser_video_url: initialEvent.teaser_video_url ?? prev.teaser_video_url,
      event_start: initialEvent.event_start
        ? toManilaDatetimeLocal(initialEvent.event_start)
        : prev.event_start,
      venue_to_be_announced: Boolean(initialEvent.venue_to_be_announced),
      schedule_to_be_announced: Boolean(initialEvent.schedule_to_be_announced),
      venue_id:
        initialEvent.venue_to_be_announced
          ? ""
          : initialEvent.venue_id &&
              venues.some(
                (v) => String(v.id).toLowerCase() === String(initialEvent!.venue_id).toLowerCase()
              )
            ? String(initialEvent.venue_id).trim()
            : prev.venue_id,
      producer_id:
        initialEvent.producer_id &&
        producers.some(
          (p) => String(p.id).toLowerCase() === String(initialEvent!.producer_id).toLowerCase()
        )
          ? String(initialEvent.producer_id).trim()
          : prev.producer_id,
      ticket_purchase_per_user: Math.max(
        0,
        Number(initialEvent.ticket_purchase_per_user ?? prev.ticket_purchase_per_user ?? 0) || 0
      ),
    }));
  }, [initialEvent, venues, producers]);

  useEffect(() => {
    setVenuesList(venues);
  }, [venues]);

  useEffect(() => {
    setProducersList(producers);
  }, [producers]);

  useEffect(() => {
    if (initialEvent) return;
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.event_defaults) {
          setForm((prev) => ({
            ...prev,
            category: data.event_defaults.default_category ?? prev.category,
            status: data.event_defaults.status ?? prev.status,
          }));
        }
      })
      .catch(() => {});
  }, [initialEvent]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const venueId = String(form.venue_id ?? "").trim();
    const matchedVenue = venuesList.find(
      (v) => String(v.id).toLowerCase() === venueId.toLowerCase()
    );
    if (!form.venue_to_be_announced && (!venueId || !matchedVenue)) {
      toast.error("Please select a venue or To be announced");
      return;
    }
    if (venuesList.length === 0) {
      toast.error("Create a venue first before adding events");
      return;
    }
    const producerId = String(form.producer_id ?? "").trim();
    const matchedProducer = producersList.find(
      (p) => String(p.id).toLowerCase() === producerId.toLowerCase()
    );
    if (!producerId || !matchedProducer) {
      toast.error("Please select a producer");
      return;
    }
    const slug = eventId ? form.slug : (slugify(form.title) || "event");
    if (!slug) {
      toast.error("Title is required to generate event URL");
      return;
    }
    setLoading(true);
    try {
      const url = eventId
        ? `/api/admin/events/${eventId}`
        : "/api/admin/events";
      const normalizedEventStart = form.event_start
        ? parseEventStartInput(form.event_start).toISOString()
        : new Date().toISOString();
      const payload = {
        ...form,
        slug,
        status: form.status,
        teaser_video_url: toPublicTeaserUrl(form.teaser_video_url),
        event_start: normalizedEventStart,
        venue_id: form.venue_to_be_announced ? null : String(matchedVenue!.id),
        venue_to_be_announced: form.venue_to_be_announced,
        schedule_to_be_announced: form.schedule_to_be_announced,
        producer_id: String(matchedProducer.id),
        ticket_purchase_per_user: Math.max(
          0,
          Number(form.ticket_purchase_per_user || 0)
        ),
      };
      const res = await fetch(url, {
        method: eventId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg =
          data.error ??
          (eventId ? "Failed to update event" : "Failed to create event");
        throw new Error(msg);
      }
      toast.success(eventId ? "Event updated" : "Event created");
      if (eventId) {
        router.refresh();
      } else {
        const data = await res.json();
        router.push(data?.id ? `/admin/events/${data.id}` : "/admin/events");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteEvent() {
    if (!eventId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to delete event");
        return;
      }
      toast.success("Event deleted");
      router.push("/admin/events");
      router.refresh();
    } catch {
      toast.error("Failed to delete event");
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  }

  const [eventDatePart, eventTimePart] = (form.event_start || "").split("T");
  const teaserVideoInfo = getVideoEmbedInfo(form.teaser_video_url);
  const teaserPreviewUrl = teaserVideoInfo?.type === "direct" ? teaserVideoInfo.url : null;
  const uploadProgressMessage =
    uploadingLabel === "thumbnail"
      ? "Uploading thumbnail..."
      : uploadingLabel === "full-image"
        ? "Uploading event image..."
        : uploadingLabel === "teaser-video"
          ? "Uploading teaser video..."
          : uploadingLabel === "teaser-save"
            ? "Saving teaser video..."
          : "Uploading...";
  const uploadProgressSubMessage =
    uploadingLabel === "teaser-video"
      ? "Processing file and sending to Supabase Storage."
      : uploadingLabel === "teaser-save"
        ? "Persisting teaser video to this event."
      : "Optimizing media and saving to storage.";

  const eventFloatingProgress =
    uploading
      ? {
          message: uploadProgressMessage,
          subtitle: "Media upload",
          detail: uploadProgressSubMessage,
        }
      : carouselBusy
        ? {
            message: "Updating homepage banners",
            subtitle: "Carousel media",
            detail: "Uploading, reordering, or applying banner settings.",
          }
        : deleting
          ? {
              message: "Deleting event",
              subtitle: "Irreversible action",
              detail: "Removing this event and related data from the database.",
            }
          : loading
            ? {
                message: "Saving event",
                subtitle: "Event details",
                detail: "Applying your event changes to the server.",
              }
            : {
                message: "Saving…",
                subtitle: "Event",
                detail:
                  "Hang tight — this usually finishes in a few seconds.",
              };

  return (
    <>
      <FloatingProgressBar
        active={loading || uploading || deleting || carouselBusy}
        message={eventFloatingProgress.message}
        subtitle={eventFloatingProgress.subtitle}
        detail={eventFloatingProgress.detail}
      />
      <form onSubmit={handleSubmit} className="glass rounded-xl border border-[var(--glass-border)] p-6 max-w-6xl mx-auto space-y-4">
      <div>
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={form.title}
          onChange={(e) => {
            const value = e.target.value;
            setForm((f) => ({
              ...f,
              title: value,
              slug: eventId ? f.slug : slugify(value),
            }));
          }}
          required
        />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          className="flex min-h-[80px] w-full rounded-lg glass border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-foreground"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            className="flex h-10 w-full rounded-lg glass border border-[var(--glass-border)] bg-white/5 px-3 text-sm text-foreground"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            className="flex h-10 w-full rounded-lg glass border border-[var(--glass-border)] bg-white/5 px-3 text-sm text-foreground"
            value={(form.status as string) === "cancelled" ? "archived" : form.status}
            onChange={(e) =>
              setForm((f) => ({ ...f, status: e.target.value as EventStatus }))
            }
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="postponed">Postponed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Thumbnail image (cards)</Label>
          <div className="mt-1 flex flex-col gap-2">
            <input
              ref={thumbnailInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleThumbnailSelect}
              disabled={uploading}
            />
            {form.thumbnail_url ? (
              <div className="relative inline-block">
                <PhotoProvider>
                  <PhotoView src={form.thumbnail_url}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.thumbnail_url}
                      alt="Thumbnail preview"
                      className="h-32 w-auto rounded-lg border border-[var(--glass-border)] object-cover cursor-zoom-in"
                    />
                  </PhotoView>
                </PhotoProvider>
                <div className="mt-1 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => thumbnailInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? "Uploading..." : "Replace"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-foreground-muted"
                    onClick={() => setForm((f) => ({ ...f, thumbnail_url: "" }))}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                onClick={() => thumbnailInputRef.current?.click()}
                disabled={uploading}
              >
                <ImagePlus className="h-4 w-4 mr-2" />
                {uploading ? "Uploading..." : "Upload thumbnail"}
              </Button>
            )}
            <p className="text-xs text-foreground-muted mt-1">
              Used on event cards. Converted to 400 × 500 px (4:5 portrait) on upload.
            </p>
          </div>
          <details className="mt-2">
            <summary className="text-sm text-foreground-muted cursor-pointer hover:text-foreground-muted">
              Or paste thumbnail URL
            </summary>
            <Input
              type="url"
              placeholder="https://..."
              value={form.thumbnail_url}
              onChange={(e) => setForm((f) => ({ ...f, thumbnail_url: e.target.value }))}
              className="mt-2"
            />
          </details>
        </div>
        <div>
          <Label>Full image (event page)</Label>
          <div className="mt-1 flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileSelect}
              disabled={uploading}
            />
            {form.image_url ? (
              <div className="relative inline-block">
                <PhotoProvider>
                  <PhotoView src={form.image_url}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.image_url}
                      alt="Full image preview"
                      className="h-32 w-auto rounded-lg border border-[var(--glass-border)] object-cover cursor-zoom-in"
                    />
                  </PhotoView>
                </PhotoProvider>
                <div className="mt-1 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? "Uploading..." : "Replace"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-foreground-muted"
                    onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <ImagePlus className="h-4 w-4 mr-2" />
                {uploading ? "Uploading..." : "Upload full image"}
              </Button>
            )}
            <p className="text-xs text-foreground-muted mt-1">
              Used on the event detail page. Converted on upload (landscape max 1920px wide, portrait max 1080px tall).
            </p>
          </div>
          <details className="mt-2">
            <summary className="text-sm text-foreground-muted cursor-pointer hover:text-foreground-muted">
              Or paste full image URL
            </summary>
            <Input
              type="url"
              placeholder="https://..."
              value={form.image_url}
              onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
              className="mt-2"
            />
          </details>
        </div>
      </div>
      {eventId ? (
        <EventBannersSection
          eventId={eventId}
          initialBanners={initialBanners}
          onCarouselBusyChange={setCarouselBusy}
        />
      ) : null}
      <div>
        <Label htmlFor="ticket_purchase_per_user">Ticket purchase per user</Label>
        <NumberStepper
          value={form.ticket_purchase_per_user}
          min={0}
          max={100000}
          step={1}
          className="mt-1 w-full sm:w-56"
          inputClassName="text-left px-3"
          aria-label="Ticket purchase per user"
          onChange={(value) =>
            setForm((f) => ({
              ...f,
              ticket_purchase_per_user: Math.max(0, value || 0),
            }))
          }
        />
        <p className="text-xs text-foreground-muted mt-1">
          0 = Unlimited. Applies across all confirmed transactions for this event.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Teaser video</Label>
          <div className="mt-1 flex flex-col gap-2">
            <input
              ref={teaserVideoInputRef}
              type="file"
              accept="video/mp4,video/webm"
              className="hidden"
              onChange={handleTeaserVideoSelect}
              disabled={uploading}
            />
            {form.teaser_video_url ? (
              <div className="relative inline-block">
                {teaserPreviewUrl ? (
                  <video
                    src={teaserPreviewUrl}
                    controls
                    preload="metadata"
                    className="h-32 w-auto rounded-lg border border-[var(--glass-border)] bg-black/40"
                  />
                ) : (
                  <div className="rounded-lg border border-[var(--glass-border)] px-3 py-2 text-xs text-foreground-muted">
                    External teaser link set
                  </div>
                )}
                <div className="mt-1 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => teaserVideoInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? "Uploading..." : "Replace"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-foreground-muted"
                    onClick={() => setForm((f) => ({ ...f, teaser_video_url: "" }))}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                onClick={() => teaserVideoInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? "Uploading..." : "Upload teaser video"}
              </Button>
            )}
          </div>
          <p className="text-xs text-foreground-muted mt-1">
            Upload MP4/WebM to Supabase Storage for in-app streaming playback.
          </p>
          <details className="mt-2">
            <summary className="text-sm text-foreground-muted cursor-pointer hover:text-foreground-muted">
              Or paste legacy video URL
            </summary>
            <Input
              id="teaser_video_url"
              type="url"
              placeholder="https://www.youtube.com/watch?v=... or direct video URL"
              value={form.teaser_video_url}
              onChange={(e) => setForm((f) => ({ ...f, teaser_video_url: e.target.value }))}
              className="mt-2"
            />
          </details>
        </div>
        <div>
          <Label htmlFor="event_date">Event date &amp; time</Label>
          <div className="mt-1 flex gap-2">
            <Input
              id="event_date"
              type="date"
              value={eventDatePart ?? ""}
              onChange={(e) => {
                const date = e.target.value;
                const [, existingTime = "00:00"] = (form.event_start || "").split("T");
                setForm((f) => ({
                  ...f,
                  event_start: date ? `${date}T${existingTime}` : "",
                }));
              }}
              className="flex-1"
            />
            <Input
              id="event_time"
              type="time"
              value={eventTimePart ?? ""}
              onChange={(e) => {
                const time = e.target.value;
                const [existingDate = ""] = (form.event_start || "").split("T");
                if (!existingDate) {
                  const nowLocal = toManilaDatetimeLocal(new Date().toISOString());
                  const [todayInManila = ""] = nowLocal.split("T");
                  setForm((f) => ({
                    ...f,
                    event_start: time ? `${todayInManila}T${time}` : "",
                  }));
                  return;
                }
                setForm((f) => ({
                  ...f,
                  event_start: time ? `${existingDate}T${time}` : `${existingDate}T00:00`,
                }));
              }}
              className="w-28"
            />
          </div>
          <p className="text-xs text-foreground-muted mt-1">
            This date and time are always saved and used for sorting and listings. If you check
            &quot;To be announced&quot; below, the public event card and detail page still use this
            value for order, but visitors only see &quot;To be announced&quot; instead of the date
            and time.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Checkbox
              id="schedule_tba"
              checked={form.schedule_to_be_announced}
              onCheckedChange={(v) => {
                const on = v === true;
                setForm((f) => {
                  if (on && !f.event_start?.trim()) {
                    return {
                      ...f,
                      schedule_to_be_announced: true,
                      event_start: toManilaDatetimeLocal(new Date().toISOString()),
                    };
                  }
                  return { ...f, schedule_to_be_announced: on };
                });
              }}
            />
            <Label htmlFor="schedule_tba" className="text-sm font-normal cursor-pointer">
              To be announced (show on event card instead of date &amp; time)
            </Label>
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="venue_id">Venue</Label>
          <select
            id="venue_id"
            className="flex h-10 w-full rounded-lg glass border border-[var(--glass-border)] bg-white/5 px-3 text-sm text-foreground"
            value={form.venue_to_be_announced ? VENUE_TBA_SENTINEL : form.venue_id}
            onChange={(e) => {
              const value = e.target.value;
              if (value === VENUE_TBA_SENTINEL) {
                setForm((f) => ({ ...f, venue_to_be_announced: true, venue_id: "" }));
                return;
              }
              if (value === CREATE_NEW_VENUE_SENTINEL) {
                setCreateVenueOpen(true);
                return;
              }
              setForm((f) => ({ ...f, venue_to_be_announced: false, venue_id: value }));
            }}
          >
            <option value="">Select a venue</option>
            <option value={VENUE_TBA_SENTINEL}>To be announced</option>
            {venuesList.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
            {canCreateVenue && (
              <option value={CREATE_NEW_VENUE_SENTINEL}>Create New Venue</option>
            )}
          </select>
          {venuesList.length === 0 && !canCreateVenue && (
            <p className="text-xs text-amber-500 mt-1">Create a venue first.</p>
          )}
          <CreateNewVenueDialog
            open={createVenueOpen}
            onOpenChange={setCreateVenueOpen}
            onCreated={(venue) => {
              setVenuesList((prev) => [...prev, venue].sort((a, b) => a.name.localeCompare(b.name)));
              setForm((f) => ({ ...f, venue_to_be_announced: false, venue_id: venue.id }));
            }}
          />
        </div>
        <div>
          <Label htmlFor="producer_id">Producer</Label>
          <select
            id="producer_id"
            className="flex h-10 w-full rounded-lg glass border border-[var(--glass-border)] bg-white/5 px-3 text-sm text-foreground"
            value={form.producer_id}
            onChange={(e) => {
              const value = e.target.value;
              if (value === CREATE_NEW_PRODUCER_SENTINEL) {
                setCreateProducerOpen(true);
                return;
              }
              setForm((f) => ({ ...f, producer_id: value }));
            }}
            required
          >
            <option value="">Select a producer</option>
            {producersList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {canCreateProducer && (
              <option value={CREATE_NEW_PRODUCER_SENTINEL}>Create New Producer</option>
            )}
          </select>
          <p className="text-xs text-foreground-muted mt-1">Required. Track events by producer.</p>
          {producersList.length === 0 && !canCreateProducer && (
            <p className="text-xs text-amber-500 mt-1">Create a producer first.</p>
          )}
          <CreateNewProducerDialog
            open={createProducerOpen}
            onOpenChange={setCreateProducerOpen}
            onCreated={(producer) => {
              setProducersList((prev) => [...prev, producer].sort((a, b) => a.name.localeCompare(b.name)));
              setForm((f) => ({ ...f, producer_id: producer.id }));
            }}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button
          type="submit"
          disabled={
            loading ||
            (!form.venue_to_be_announced && venuesList.length === 0) ||
            producersList.length === 0
          }
        >
          {loading ? (eventId ? "Saving..." : "Creating...") : eventId ? "Save changes" : "Create event"}
        </Button>
        {eventId && (
          <Button
            type="button"
            variant="secondary"
            disabled={loading || deleting || !form.slug?.trim()}
            onClick={() => {
              const slug = form.slug?.trim();
              if (!slug) {
                toast.error("Set a URL slug before copying the link");
                return;
              }
              const url = `${window.location.origin}/${slug}`;
              void navigator.clipboard?.writeText(url).then(
                () => toast.success("Event link copied to clipboard"),
                () => toast.error("Failed to copy link")
              );
            }}
          >
            <Link2 className="h-4 w-4 mr-2" />
            Copy Event Link
          </Button>
        )}
        {isSuperAdmin && eventId && (
          <Button
            type="button"
            variant="destructive"
            disabled={loading || deleting}
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Event
          </Button>
        )}
      </div>
      </form>
      {isSuperAdmin && eventId && (
        <ConfirmDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Delete event"
          description="This will permanently delete this event and all related data (seats, bookings, reservations, reports, etc.). This cannot be undone."
          confirmLabel="Delete event"
          variant="destructive"
          onConfirm={handleDeleteEvent}
        />
      )}
    </>
  );
}
