"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import {
  fetchCitiesForProvinceCached,
  fetchProvincesCached,
} from "@/lib/geography-fetch-cache";

interface VenueFormProps {
  venueId?: string;
  initialVenue?: {
    id: string;
    name: string;
    province_id?: string | null;
    city_id?: string | null;
    standard_capacity?: number | null;
    google_maps_url?: string | null;
  };
}

export function VenueForm({ venueId, initialVenue }: VenueFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [provinces, setProvinces] = useState<{ id: string; name: string }[]>([]);
  const [cities, setCities] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    name: initialVenue?.name ?? "",
    province_id: initialVenue?.province_id ?? "",
    city_id: initialVenue?.city_id ?? "",
    standard_capacity: String(initialVenue?.standard_capacity ?? 100),
    google_maps_url: initialVenue?.google_maps_url ?? "",
  });

  useEffect(() => {
    fetchProvincesCached("/api/admin/geography")
      .then(setProvinces)
      .catch(() => setProvinces([]));
  }, []);

  useEffect(() => {
    if (!form.province_id) {
      setCities([]);
      return;
    }
    fetchCitiesForProvinceCached("/api/admin/geography", form.province_id)
      .then(setCities)
      .catch(() => setCities([]));
  }, [form.province_id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const capacity = parseInt(form.standard_capacity, 10);
    if (isNaN(capacity) || capacity < 1) {
      toast.error("Standard capacity must be at least 1");
      return;
    }
    if (!form.province_id || !form.city_id) {
      toast.error("Please select Province and City");
      return;
    }
    setLoading(true);
    try {
      const url = venueId
        ? `/api/admin/venues/${venueId}`
        : "/api/admin/venues";
      const res = await fetch(url, {
        method: venueId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          province_id: form.province_id || null,
          city_id: form.city_id || null,
          standard_capacity: capacity,
          google_maps_url: form.google_maps_url || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save venue");
      }
      toast.success(venueId ? "Venue updated" : "Venue created");
      router.push("/admin/venues");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <FloatingProgressBar
        active={loading}
        {...FLOATING_PROGRESS_PRESETS.genericSave}
        message={venueId ? "Saving venue…" : "Creating venue…"}
        subtitle="Venues"
      />
      <div>
      <NavButtonWithProgress
        href="/admin/venues"
        variant="link"
        className="text-sm text-[var(--wish-orange)] hover:underline mb-4 inline-block p-0 h-auto font-normal"
        loadingMessage="Loading venues…"
      >
        ← Back to venues
      </NavButtonWithProgress>
      <h1 className="text-2xl font-bold text-foreground mb-6">
        {venueId ? "Edit venue" : "New venue"}
      </h1>
      <form
        onSubmit={handleSubmit}
        className="glass rounded-xl border border-[var(--glass-border)] p-6 max-w-lg space-y-4"
      >
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div>
          <Label htmlFor="province">Province</Label>
          <Select
            value={form.province_id || undefined}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, province_id: v, city_id: "" }))
            }
            required
          >
            <SelectTrigger id="province">
              <SelectValue placeholder="Select province" />
            </SelectTrigger>
            <SelectContent>
              {provinces.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="city">City / Municipality</Label>
          <Select
            value={form.city_id || undefined}
            onValueChange={(v) => setForm((f) => ({ ...f, city_id: v }))}
            required
            disabled={!form.province_id}
          >
            <SelectTrigger id="city">
              <SelectValue placeholder="Select city" />
            </SelectTrigger>
            <SelectContent>
              {cities.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="google_maps_url">Google Maps URL</Label>
          <Input
            id="google_maps_url"
            type="url"
            placeholder="https://maps.app.goo.gl/..."
            value={form.google_maps_url}
            onChange={(e) =>
              setForm((f) => ({ ...f, google_maps_url: e.target.value }))
            }
          />
          <p className="text-xs text-foreground-muted mt-1">
            Share link from Google Maps (e.g. &quot;Share&quot; → &quot;Copy link&quot;).
          </p>
        </div>
        <div>
          <Label htmlFor="standard_capacity">Standard Capacity</Label>
          <Input
            id="standard_capacity"
            type="number"
            min={1}
            value={form.standard_capacity}
            onChange={(e) =>
              setForm((f) => ({ ...f, standard_capacity: e.target.value }))
            }
          />
          <p className="text-xs text-foreground-muted mt-1">
            Default capacity per section when creating seating for this venue.
          </p>
        </div>
        <Button type="submit" disabled={loading}>
          {loading
            ? venueId
              ? "Saving..."
              : "Creating..."
            : venueId
              ? "Save changes"
              : "Create venue"}
        </Button>
      </form>
    </div>
    </>
  );
}
