import type { Metadata } from "next";
import { PrivacyPolicyContent } from "./privacy-policy-content";

export const metadata: Metadata = {
  title: "Privacy Policy | Wish Tickets Portal",
  description:
    "Learn how Wish Tickets Portal collects, uses, and protects personal data in accordance with the Data Privacy Act of 2012 (RA 10173).",
};

export default function PrivacyPolicyPage() {
  return <PrivacyPolicyContent />;
}

