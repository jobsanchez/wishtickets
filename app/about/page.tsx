import type { Metadata } from "next";
import { AboutContent } from "./about-content";

export const metadata: Metadata = {
  title: "About | Wish Tickets Portal",
  description:
    "Wish Ticket Portal features for producers - sell tickets, manage events, and run admissions for concerts, theater, conferences, sports, and live events.",
};

export default function AboutPage() {
  return <AboutContent />;
}
