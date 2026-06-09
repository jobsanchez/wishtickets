"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Mail } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FloatingProgressBar } from "@/components/ui/floating-progress";

export function ContactContent() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to send message");
        return;
      }
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setSuccessDialogOpen(true);
    } catch {
      toast.error("Failed to send message. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-16 md:py-24 space-y-16">
      <FloatingProgressBar
        active={saving}
        message="Sending your message"
        subtitle="Contact"
        detail="Delivering your note to our team. We'll get back to you shortly."
      />

      <motion.section
        className="text-center max-w-3xl mx-auto"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
          Contact
        </h1>
        <p className="text-lg text-foreground-muted">
          Get in touch for support or inquiries.
        </p>
      </motion.section>

      <motion.section
        className="max-w-lg mx-auto"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Card>
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-[var(--wish-orange-muted)] flex items-center justify-center">
              <Mail className="h-5 w-5 text-[var(--wish-orange)]" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Reach Us</h2>
            <p className="text-sm text-foreground-muted">
              Fill out the form and we&apos;ll get back to you shortly.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="contact-name" className="text-foreground-muted">
                  Name
                </Label>
                <Input
                  id="contact-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  disabled={saving}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="contact-email" className="text-foreground-muted">
                  Email
                </Label>
                <Input
                  id="contact-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  disabled={saving}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="contact-subject" className="text-foreground-muted">
                  Subject
                </Label>
                <Input
                  id="contact-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="What is this about?"
                  required
                  disabled={saving}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="contact-message" className="text-foreground-muted">
                  Message
                </Label>
                <textarea
                  id="contact-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Your message..."
                  required
                  minLength={10}
                  disabled={saving}
                  rows={4}
                  className="flex w-full rounded-lg glass border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wish-orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 mt-1 resize-none"
                />
              </div>
              <Button type="submit" disabled={saving} size="lg">
                {saving ? "Sending..." : "Send Message"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.section>

      <Dialog
        open={successDialogOpen}
        onOpenChange={(open) => !open && setSuccessDialogOpen(false)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/40">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <DialogTitle className="text-foreground">
                  Message sent
                </DialogTitle>
                <DialogDescription className="mt-1 text-left text-zinc-400">
                  We&apos;ll get back to you soon.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setSuccessDialogOpen(false)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Ok
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
