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
import { toast } from "@/lib/toast";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";

export interface CreatedProducer {
  id: string;
  name: string;
}

interface CreateNewProducerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (producer: CreatedProducer) => void;
}

export function CreateNewProducerDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateNewProducerDialogProps) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    producer_representative: "",
    contact: "",
    email: "",
  });

  useEffect(() => {
    if (!open) {
      setForm({
        name: "",
        producer_representative: "",
        contact: "",
        email: "",
      });
    }
  }, [open]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Producer name is required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/producers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          producer_representative: form.producer_representative.trim() || null,
          contact: form.contact.trim() || null,
          email: form.email.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create producer");
      }
      const data = await res.json();
      toast.success("Producer created");
      onCreated({ id: data.id, name: form.name.trim() });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create producer");
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
        message="Creating producer…"
        subtitle="New producer"
      />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Create New Producer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <Label htmlFor="create-producer-name">Producer Name</Label>
              <Input
                id="create-producer-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Producer name"
                required
                disabled={loading}
              />
            </div>
            <div>
              <Label htmlFor="create-producer-representative">Producer Representative</Label>
              <Input
                id="create-producer-representative"
                value={form.producer_representative}
                onChange={(e) =>
                  setForm((f) => ({ ...f, producer_representative: e.target.value }))
                }
                placeholder="Representative name"
                disabled={loading}
              />
            </div>
            <div>
              <Label htmlFor="create-producer-contact">Contact</Label>
              <Input
                id="create-producer-contact"
                value={form.contact}
                onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                placeholder="Phone, address, or other contact info"
                disabled={loading}
              />
            </div>
            <div>
              <Label htmlFor="create-producer-email">Email</Label>
              <Input
                id="create-producer-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="producer@example.com"
                disabled={loading}
              />
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
