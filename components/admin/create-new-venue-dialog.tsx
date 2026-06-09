"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import {
  fetchCitiesForProvinceCached,
  fetchProvincesCached,
} from "@/lib/geography-fetch-cache";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";

export interface CreatedVenue {
  id: string;
  name: string;
}

interface CreateNewVenueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (venue: CreatedVenue) => void;
}

export function CreateNewVenueDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateNewVenueDialogProps) {
  const [loading, setLoading] = useState(false);
  const [provinces, setProvinces] = useState<{ id: string; name: string }[]>([]);
  const [cities, setCities] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    name: "",
    province_id: "",
    city_id: "",
    standard_capacity: "100",
    google_maps_url: "",
  });

  useEffect(() => {
    if (open) {
      fetchProvincesCached("/api/admin/geography")
        .then(setProvinces)
        .catch(() => setProvinces([]));
    }
  }, [open]);

  useEffect(() => {
    if (!form.province_id) {
      setCities([]);
      return;
    }
    fetchCitiesForProvinceCached("/api/admin/geography", form.province_id)
      .then(setCities)
      .catch(() => setCities([]));
  }, [form.province_id]);

  useEffect(() => {
    if (!open) {
      setForm({
        name: "",
        province_id: "",
        city_id: "",
        standard_capacity: "100",
        google_maps_url: "",
      });
    }
  }, [open]);

  async function handleSave(e: React.FormEvent) {
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
    if (!form.name.trim()) {
      toast.error("Please enter a venue name");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          province_id: form.province_id || null,
          city_id: form.city_id || null,
          standard_capacity: capacity,
          google_maps_url: form.google_maps_url || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create venue");
      }
      const data = await res.json();
      toast.success("Venue created");
      onCreated({ id: data.id, name: form.name.trim() });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create venue");
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    onOpenChange(false);
  }

  return (
    <>
      <FloatingProgressBar
        active={loading}
        {...FLOATING_PROGRESS_PRESETS.genericSave}
        message="Creating venue…"
        subtitle="New venue"
      />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Create New Venue</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <Label htmlFor="create-venue-name">Name</Label>
              <Input
                id="create-venue-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Venue name"
                required
                disabled={loading}
              />
            </div>
            <div>
              <Label htmlFor="create-venue-province">Province</Label>
              <Select
                value={form.province_id || undefined}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, province_id: v, city_id: "" }))
                }
                required
                disabled={loading}
              >
                <SelectTrigger id="create-venue-province">
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
              <Label htmlFor="create-venue-city">City / Municipality</Label>
              <Select
                value={form.city_id || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, city_id: v }))}
                required
                disabled={!form.province_id || loading}
              >
                <SelectTrigger id="create-venue-city">
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
              <Label htmlFor="create-venue-google-maps">Google Maps URL</Label>
              <Input
                id="create-venue-google-maps"
                type="url"
                placeholder="https://maps.app.goo.gl/..."
                value={form.google_maps_url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, google_maps_url: e.target.value }))
                }
                disabled={loading}
              />
              <p className="text-xs text-foreground-muted mt-1">
                Share link from Google Maps (e.g. Share → Copy link).
              </p>
            </div>
            <div>
              <Label htmlFor="create-venue-capacity">Standard Capacity</Label>
              <Input
                id="create-venue-capacity"
                type="number"
                min={1}
                value={form.standard_capacity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, standard_capacity: e.target.value }))
                }
                disabled={loading}
              />
              <p className="text-xs text-foreground-muted mt-1">
                Default capacity per section when creating seating for this venue.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
