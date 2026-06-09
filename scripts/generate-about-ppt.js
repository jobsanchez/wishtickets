#!/usr/bin/env node
/**
 * Generates a beautiful PowerPoint from the Wish Ticket Portal About page content.
 * Run: node scripts/generate-about-ppt.js
 * Output: public/Wish_Ticket_Portal_Features_for_Producers.pptx
 */

const PptxGenJS = require("pptxgenjs");
const path = require("path");

// Wish brand colors (hex without #)
const COLORS = {
  orange: "FF6600",
  orangeLight: "FF8533",
  dark: "0D0A0A",
  darkCard: "1A1614",
  white: "FFFFFF",
  muted: "A8A29E",
};

const features = [
  {
    title: "1. Sell Tickets Online",
    items: [
      "Multi-channel discovery (homepage, search, filters, featured events)",
      "Assigned seating – Interactive seat map (rows & seats)",
      "Free seating – Section + quantity (general admission)",
      "Standing – Capacity-based sections",
      "Smart reservations with time-limited cart & auto-release",
    ],
  },
  {
    title: "2. Payment Options (PH-Ready)",
    items: [
      "Credit/Debit Cards",
      "GCash, PayMaya, GrabPay, Shopee Pay",
      "Online checkout via PayMongo",
      "On-site payment (admin-accepted walk-ins)",
      "Free tickets support",
    ],
  },
  {
    title: "3. Promote and Discount",
    items: [
      "Promo codes (percentage or fixed amount)",
      "Optional stacking (multiple codes per order)",
      "Date range & usage limits",
      "Per-event or platform-wide codes",
    ],
  },
  {
    title: "4. Manage Events End-to-End",
    items: [
      "Event setup (title, description, date, venue)",
      "Assign producer for tracking",
      "Featured events & seat map images",
      "Venue management & reusable seat templates",
      "Per-section pricing & early bird pricing",
    ],
  },
  {
    title: "5. Manual & VIP Distribution",
    items: [
      "Assign seats to specific people (VIP, press, sponsors)",
      "Mark tickets as complimentary",
      "Email tickets with QR codes",
      "Send per person or per section",
      "Printable ticket images",
    ],
  },
  {
    title: "6. Insights & Reporting",
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
    title: "7. Door Operations (Admissions)",
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
    title: "8. Producer Profile & Organization",
    items: [
      "Create producers (name, representative, contact, email)",
      "Assign producer per event",
      "Filter events by producer",
      "Assign event administrators",
      "Role-based access (sales vs analytics)",
    ],
  },
  {
    title: "9. Operational Tools",
    items: [
      "Refund lookup (Booking ID → PayMongo Payment ID)",
      "Custom ticket layout with overlays (QR, section, row, seat)",
      "Print tickets for manual distribution",
      "Async generation for large batches",
      "Email delivery to recipients",
    ],
  },
];

function main() {
  const pptx = new PptxGenJS();

  pptx.author = "Wish Tickets Portal";
  pptx.title = "Wish Ticket Portal – Features for Producers";
  pptx.subject = "Producer features overview";
  pptx.layout = "LAYOUT_16x9";

  // Define slide dimensions (16:9)
  const slideW = 10;
  const slideH = 5.625;
  const margin = 0.5;

  // Slide 1: Title + Overview
  const slide1 = pptx.addSlide();
  slide1.background = { color: COLORS.dark };

  // Decorative orange bar
  slide1.addShape("rect", {
    x: "25%",
    y: 0.9,
    w: "50%",
    h: 0.04,
    fill: { color: COLORS.orange },
  });

  slide1.addText("Wish Ticket Portal", {
    x: margin,
    y: 1.0,
    w: slideW - 2 * margin,
    h: 0.9,
    fontSize: 48,
    fontFace: "Arial",
    bold: true,
    color: COLORS.white,
    align: "center",
  });

  slide1.addText("Features", {
    x: margin,
    y: 2.0,
    w: slideW - 2 * margin,
    h: 0.5,
    fontSize: 26,
    fontFace: "Arial",
    color: COLORS.orange,
    align: "center",
  });

  slide1.addText(
    [
      {
        text: "One platform to sell tickets, manage events, and run admissions.",
        options: { bullet: true, breakLine: true, fontSize: 18, color: COLORS.muted },
      },
      {
        text: "For concerts, theater, conferences, sports, and live events.",
        options: { bullet: true, fontSize: 18, color: COLORS.muted },
      },
    ],
    {
      x: margin + 0.5,
      y: 2.7,
      w: slideW - 2 * margin - 1,
      h: 1.5,
      margin: 0.2,
    }
  );

  // Slides 2–10: Feature cards
  features.forEach(({ title, items }) => {
    const slide = pptx.addSlide();
    slide.background = { color: COLORS.dark };

    // Title with orange accent bar
    slide.addShape("rect", {
      x: margin,
      y: margin,
      w: 0.08,
      h: 0.6,
      fill: { color: COLORS.orange },
    });

    slide.addText(title, {
      x: margin + 0.15,
      y: margin,
      w: slideW - 2 * margin - 0.2,
      h: 0.7,
      fontSize: 28,
      fontFace: "Arial",
      bold: true,
      color: COLORS.white,
    });

    // Bullet list
    const bulletText = items.map((item, i) => ({
      text: item,
      options: {
        bullet: true,
        breakLine: i < items.length - 1,
        fontSize: 14,
        color: COLORS.muted,
      },
    }));

    slide.addText(bulletText, {
      x: margin + 0.3,
      y: 1.1,
      w: slideW - 2 * margin - 0.6,
      h: slideH - 1.8,
      margin: 0.15,
      valign: "top",
    });
  });

  // Slide 11: Thank you / closing
  const slideEnd = pptx.addSlide();
  slideEnd.background = { color: COLORS.dark };

  slideEnd.addShape("rect", {
    x: "30%",
    y: 2.0,
    w: "40%",
    h: 0.04,
    fill: { color: COLORS.orange },
  });

  slideEnd.addText("Thank you", {
    x: margin,
    y: 2.1,
    w: slideW - 2 * margin,
    h: 0.7,
    fontSize: 36,
    fontFace: "Arial",
    bold: true,
    color: COLORS.white,
    align: "center",
  });

  slideEnd.addText("Wish Ticket Portal", {
    x: margin,
    y: 2.9,
    w: slideW - 2 * margin,
    h: 0.5,
    fontSize: 20,
    fontFace: "Arial",
    color: COLORS.orange,
    align: "center",
  });

  const outPath = path.join(__dirname, "..", "public", "Wish_Ticket_Portal_Features_for_Producers.pptx");
  pptx.writeFile({ fileName: outPath });

  console.log(`Generated: ${outPath}`);
}

main();
