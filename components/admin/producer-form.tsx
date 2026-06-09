"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";

interface ProducerFormProps {
  producerId?: string;
  initialProducer?: {
    id: string;
    name: string;
    producer_representative?: string | null;
    contact?: string | null;
    email?: string | null;
  };
}

export function ProducerForm({ producerId, initialProducer }: ProducerFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: initialProducer?.name ?? "",
    producer_representative: initialProducer?.producer_representative ?? "",
    contact: initialProducer?.contact ?? "",
    email: initialProducer?.email ?? "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Producer name is required");
      return;
    }
    setLoading(true);
    try {
      const url = producerId
        ? `/api/admin/producers/${producerId}`
        : "/api/admin/producers";
      const res = await fetch(url, {
        method: producerId ? "PATCH" : "POST",
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
        throw new Error(data.error ?? "Failed to save producer");
      }
      toast.success(producerId ? "Producer updated" : "Producer created");
      router.push("/admin/producers");
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
        message={producerId ? "Saving producer…" : "Creating producer…"}
        subtitle="Producers"
      />
      <div>
      <NavButtonWithProgress
        href="/admin/producers"
        variant="secondary"
        size="sm"
        className="bg-amber-400 text-black hover:bg-amber-300 border-transparent mb-4"
        loadingMessage="Loading producers…"
      >
        ← Back to producers
      </NavButtonWithProgress>
      <h1 className="text-2xl font-bold text-foreground mb-6">
        {producerId ? "Edit producer" : "New producer"}
      </h1>
      <form
        onSubmit={handleSubmit}
        className="glass rounded-xl border border-[var(--glass-border)] p-6 max-w-lg space-y-4"
      >
        <div>
          <Label htmlFor="name">Producer Name</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div>
          <Label htmlFor="producer_representative">Producer Representative</Label>
          <Input
            id="producer_representative"
            value={form.producer_representative}
            onChange={(e) =>
              setForm((f) => ({ ...f, producer_representative: e.target.value }))
            }
          />
        </div>
        <div>
          <Label htmlFor="contact">Contact</Label>
          <Input
            id="contact"
            value={form.contact}
            onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
            placeholder="Phone, address, or other contact info"
          />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="producer@example.com"
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading
            ? producerId
              ? "Saving..."
              : "Creating..."
            : producerId
              ? "Save changes"
              : "Create producer"}
        </Button>
      </form>
    </div>
    </>
  );
}
