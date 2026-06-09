import type { Metadata } from "next";
import { TermsOfUseContent } from "./terms-of-use-content";

export const metadata: Metadata = {
  title: "Terms of Use | Wish Tickets Portal",
  description:
    "Read the Terms and Conditions governing the use of the Wish Tickets Portal ticketing and reservation services.",
};

export default function TermsOfUsePage() {
  return <TermsOfUseContent />;
}

