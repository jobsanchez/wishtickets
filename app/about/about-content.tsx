"use client";

import { motion } from "framer-motion";
import {
  Ticket,
  CreditCard,
  Tag,
  Calendar,
  Users,
  BarChart3,
  ScanLine,
  Building2,
  Wrench,
  Sparkles,
} from "lucide-react";

const features = [
  {
    icon: Ticket,
    title: "Sell Tickets Online",
    items: [
      "Multi-channel discovery (homepage, search, filters, featured events)",
      "Assigned seating – Interactive seat map (rows & seats)",
      "Free seating – Section + quantity (general admission)",
      "Standing – Capacity-based sections",
      "Smart reservations with time-limited cart & auto-release",
    ],
  },
  {
    icon: CreditCard,
    title: "Payment Options (PH-Ready)",
    items: [
      "Credit/Debit Cards",
      "GCash, PayMaya, GrabPay, Shopee Pay",
      "Online checkout via PayMongo",
      "On-site payment (admin-accepted walk-ins)",
      "Free tickets support",
    ],
  },
  {
    icon: Tag,
    title: "Promote and Discount",
    items: [
      "Promo codes (percentage or fixed amount)",
      "Optional stacking (multiple codes per order)",
      "Date range & usage limits",
      "Per-event or platform-wide codes",
    ],
  },
  {
    icon: Calendar,
    title: "Manage Events End-to-End",
    items: [
      "Event setup (title, description, date, venue)",
      "Assign producer for tracking",
      "Featured events & seat map images",
      "Venue management & reusable seat templates",
      "Per-section pricing & early bird pricing",
    ],
  },
  {
    icon: Users,
    title: "Manual & VIP Distribution",
    items: [
      "Assign seats to specific people (VIP, press, sponsors)",
      "Mark tickets as complimentary",
      "Email tickets with QR codes",
      "Send per person or per section",
      "Printable ticket images",
    ],
  },
  {
    icon: BarChart3,
    title: "Insights & Reporting",
    items: [
      "Total capacity vs sold",
      "Gross revenue",
      "Sold vs distributed vs complimentary",
      "Occupancy percentage",
      "Payment method breakdown",
      "Filters by event & date range",
      "Real-time auto-refresh (event day view)",
    ],
  },
  {
    icon: ScanLine,
    title: "Door Operations (Admissions)",
    items: [
      "Staff login with event admissions code",
      "QR check-in via device camera",
      "Manual code entry fallback",
      "First-time admission mode",
      "Re-entry tracking",
      "Session view of admitted tickets",
    ],
  },
  {
    icon: Building2,
    title: "Producer Profile & Organization",
    items: [
      "Create producers (name, representative, contact, email)",
      "Assign producer per event",
      "Filter events by producer",
      "Assign event administrators",
      "Role-based access (sales vs analytics)",
    ],
  },
  {
    icon: Wrench,
    title: "Operational Tools",
    items: [
      "Refund lookup (Booking ID → PayMongo Payment ID)",
      "Custom ticket layout with overlays (QR, section, row, seat)",
      "Print tickets for manual distribution",
      "Async generation for large batches",
      "Email delivery to recipients",
    ],
  },
] as const;

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

export function AboutContent() {
  return (
    <div className="container mx-auto px-4 py-16 md:py-24 lg:py-28 space-y-20 md:space-y-28 min-h-screen">
      {/* Hero */}
      <motion.section
        className="text-center max-w-4xl mx-auto"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--wish-orange)]/40 bg-[var(--wish-orange)]/10 px-4 py-1.5 text-sm font-medium text-[var(--wish-orange)] mb-8">
          <Sparkles className="h-4 w-4" />
          For event producers
        </div>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold font-[var(--font-display)] uppercase tracking-wide mb-6">
          <span className="text-[var(--wish-orange)]">Wish</span>{" "}
          <span className="text-foreground">Tickets Portal</span>
        </h1>
        <p className="text-xl md:text-2xl text-foreground-muted max-w-2xl mx-auto leading-relaxed">
          One platform to sell tickets, manage events, and run admissions — for
          concerts, theater, conferences, sports, and live events.
        </p>
      </motion.section>

      {/* Features grid */}
      <motion.section
        className="max-w-6xl mx-auto"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <h2 className="text-2xl md:text-3xl font-bold font-[var(--font-display)] text-center mb-12 md:mb-16">
          <span className="text-[var(--wish-orange)]">Everything</span>{" "}
          <span className="text-foreground">you need</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {features.map(({ icon: Icon, title, items }) => (
            <motion.article
              key={title}
              variants={item}
              className="group relative overflow-hidden rounded-2xl glass p-6 md:p-8 transition-all duration-300 hover:border-[var(--wish-orange)]/30 hover:shadow-[0_0_0_1px_rgba(255,112,0,0.15),0_8px_32px_rgba(0,0,0,0.3)]"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--wish-orange)]/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-[var(--wish-orange)]/10 transition-colors" />
              <div className="relative">
                <div className="flex items-center gap-4 mb-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--wish-orange)]/20 text-[var(--wish-orange)]">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg md:text-xl font-bold text-foreground">
                    {title}
                  </h3>
                </div>
                <ul className="space-y-2.5 text-sm md:text-base text-foreground-muted">
                  {items.map((bullet) => (
                    <li key={bullet} className="flex gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--wish-orange)]/60" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.article>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
