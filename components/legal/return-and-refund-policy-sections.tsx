import { cn } from "@/lib/utils";

export const RETURN_REFUND_SUPPORT_EMAIL = "wishticketsportal@gmail.com";

export const RETURN_AND_REFUND_POLICY_SECTIONS = [
  {
    id: "where-to-buy",
    title: "Where to Buy Tickets",
    body: (
      <>
        <p>
          <strong>Online:</strong>{" "}
          <a
            href="https://www.wishtickets.net"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--wish-orange)] hover:underline"
          >
            www.wishtickets.net
          </a>
        </p>
        <p className="mt-4">
          <strong>Physical locations:</strong> Official Ticket Outlets (announced
          via the Wish 107.5 Facebook Page)
        </p>
      </>
    ),
  },
  {
    id: "general-policy",
    title: "General Policy",
    body: (
      <p>
        All ticket sales are final. Tickets cannot be refunded, transferred,
        exchanged, or changed to a different tier if you can no longer attend due
        to personal reasons. Refunds or changes are only allowed if there is an
        issue with the event itself, or if specified by the event organizer.
      </p>
    ),
  },
  {
    id: "discounts",
    title: "Discounts Available",
    body: (
      <>
        <p>
          PWD, Senior Citizen, and other government discounts are available!
        </p>
        <ul className="list-disc pl-6 space-y-1 mt-4">
          <li>You must show a valid government ID</li>
          <li>Buy tickets online at regular price first</li>
          <li>Go to the ticket booth at the venue before the event starts</li>
          <li>We will refund your discount at the booth</li>
        </ul>
      </>
    ),
  },
  {
    id: "refund-exchange",
    title: "Refund and Exchange Policy",
    body: (
      <>
        <h3 className="text-base font-medium text-foreground mb-2">
          Can I return my tickets?
        </h3>
        <p>No, all ticket sales are final. You cannot:</p>
        <ul className="list-disc pl-6 space-y-1 mt-4">
          <li>Exchange tickets</li>
          <li>Upgrade or downgrade tickets</li>
          <li>Get refunds for changing your mind</li>
        </ul>
        <h3 className="text-base font-medium text-foreground mt-6 mb-2">
          What happens if the event is cancelled or postponed?
        </h3>
        <p>We will notify you through your registered email address.</p>
        <ul className="list-disc pl-6 space-y-1 mt-4">
          <li>
            You can choose to keep your ticket for the new date OR request a
            refund
          </li>
          <li>Online fees cannot be refunded</li>
        </ul>
      </>
    ),
  },
  {
    id: "how-to-request-refund",
    title: "How to Request a Refund",
    body: (
      <>
        <p>
          If our event is cancelled or postponed, email us with the following:
        </p>
        <ul className="list-disc pl-6 space-y-1 mt-4">
          <li>Event Name</li>
          <li>Full Name</li>
          <li>Email Address</li>
          <li>Mobile Number</li>
        </ul>
      </>
    ),
  },
  {
    id: "important-rules",
    title: "Important Rules",
    body: (
      <ul className="list-disc pl-6 space-y-1">
        <li>Tickets are only valid for the specific event and seat listed</li>
        <li>Lost, stolen, or damaged tickets cannot be replaced</li>
        <li>Reselling tickets is illegal and prohibited</li>
        <li>
          Management can remove anyone who breaks rules (no refund given)
        </li>
        <li>
          Only buy from official sources — fake tickets cannot be refunded
        </li>
      </ul>
    ),
  },
  {
    id: "contact",
    title: "Customer Service / Contact Information",
    body: (
      <>
        <p>Questions? Contact our customer support for help!</p>
        <p className="mt-4">
          Email us at{" "}
          <a
            href={`mailto:${RETURN_REFUND_SUPPORT_EMAIL}`}
            className="text-[var(--wish-orange)] hover:underline"
          >
            {RETURN_REFUND_SUPPORT_EMAIL}
          </a>
        </p>
      </>
    ),
  },
  {
    id: "dispute",
    title: "Dispute",
    body: (
      <p>
        To resolve disputes, incorrect ticket issuances, or missing vouchers with
        Wish Tickets, email our official support team at{" "}
        <a
          href={`mailto:${RETURN_REFUND_SUPPORT_EMAIL}`}
          className="text-[var(--wish-orange)] hover:underline"
        >
          {RETURN_REFUND_SUPPORT_EMAIL}
        </a>
        .
      </p>
    ),
  },
] as const;

type ReturnAndRefundPolicySectionsProps = {
  headingLevel?: "h2" | "h3";
  className?: string;
};

export function ReturnAndRefundPolicySections({
  headingLevel = "h2",
  className = "",
}: ReturnAndRefundPolicySectionsProps) {
  const HeadingTag = headingLevel;

  return (
    <div className={cn("space-y-8", className)}>
      {RETURN_AND_REFUND_POLICY_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-24">
          <HeadingTag
            className={
              headingLevel === "h2"
                ? "text-xl md:text-2xl font-semibold text-foreground mb-3"
                : "text-base font-semibold text-foreground mb-2"
            }
          >
            {section.title}
          </HeadingTag>
          <div className="space-y-3 text-foreground-muted leading-relaxed text-sm">
            {section.body}
          </div>
        </section>
      ))}
    </div>
  );
}
