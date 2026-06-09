import type { Metadata } from "next";
import { ContactContent } from "./contact-content";

export const metadata: Metadata = {
  title: "Contact | Wish Tickets Portal",
  description: "Contact Wish Tickets Portal for support or inquiries.",
};

export default function ContactPage() {
  return <ContactContent />;
}
