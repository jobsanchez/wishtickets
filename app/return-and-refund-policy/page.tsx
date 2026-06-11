import type { Metadata } from "next";
import { ReturnAndRefundPolicyContent } from "./return-and-refund-policy-content";

export const metadata: Metadata = {
  title: "Return and Refund Policy | Wish Tickets Portal",
  description:
    "Wish Tickets Portal return, refund, and exchange policy for online and outlet ticket purchases.",
};

export default function ReturnAndRefundPolicyPage() {
  return <ReturnAndRefundPolicyContent />;
}
