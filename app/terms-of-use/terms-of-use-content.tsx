"use client";

import Link from "next/link";

const SECTIONS = [
  {
    id: "terms-of-use",
    title: "1. Terms of Use",
    body: (
      <>
        <p>
          This document contains the Terms and Conditions governing your use of
          the Wish Tickets Portal, including its website, online reservation
          system, and electronic ticketing system (collectively referred to as
          the “Service”).
        </p>
        <p className="mt-4">These Terms govern:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Your access to and use of the Wish Tickets Portal</li>
          <li>Your purchase of tickets for events offered through the platform</li>
          <li>
            Your participation in promotions, campaigns, or activities organized
            through the portal
          </li>
        </ul>
        <p className="mt-4">
          If you do not agree to these Terms and Conditions, please do not use
          or access the Service.
        </p>
        <p className="mt-4">
          Wish 107.5 reserves the right to modify or update these Terms and
          Conditions at any time at its sole discretion. Continued use of the
          Service after any changes are posted constitutes acceptance of the
          updated Terms. Users are encouraged to review these Terms regularly.
        </p>
      </>
    ),
  },
  {
    id: "disclaimer",
    title: "2. Disclaimer",
    body: (
      <>
        <p>
          The Wish Tickets Portal is provided as a convenient online platform
          for purchasing and managing tickets for Wish 107.5 events and related
          activities.
        </p>
        <p className="mt-4">
          Wish 107.5 makes no warranties or representations, express or implied,
          regarding:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>The availability or uninterrupted operation of the portal</li>
          <li>The accuracy or completeness of the information displayed</li>
          <li>The absence of technical errors, viruses, or harmful components</li>
        </ul>
        <p className="mt-4">Use of the portal is at your own risk.</p>
        <p className="mt-4">
          Wish 107.5 shall not be liable for any direct, indirect, incidental,
          or consequential damages resulting from the use of the portal.
        </p>
        <p className="mt-4">
          If applicable law does not allow limitation of liability, the total
          liability of Wish 107.5 shall not exceed the amount paid by the user
          for the ticket purchase through the portal.
        </p>
      </>
    ),
  },
  {
    id: "registration",
    title: "3. Registration",
    body: (
      <>
        <p>Certain features of the Wish Tickets Portal require account registration.</p>
        <p className="mt-4">By registering an account, you agree that:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>The information you provide is accurate and complete</li>
          <li>Your account credentials will be kept secure and confidential</li>
          <li>You will not transfer or sell your account to another person</li>
        </ul>
        <p className="mt-4">
          Users must be at least 18 years old to register. Individuals below 18
          may only use the Service under the supervision and consent of a parent
          or legal guardian.
        </p>
        <p className="mt-4">
          Wish 107.5 reserves the right to suspend or terminate accounts if:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Any Terms of Use are violated</li>
          <li>Fraudulent or suspicious activities are detected</li>
          <li>Information provided cannot be verified</li>
          <li>
            The account is used in a manner that may cause financial or legal
            harm to the platform
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "permitted-use",
    title: "4. Permitted Use",
    body: (
      <>
        <p>The Wish Tickets Portal is intended for personal and non-commercial use only.</p>
        <p className="mt-4">Users may access the portal to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Browse event listings</li>
          <li>Purchase tickets</li>
          <li>Manage reservations</li>
          <li>Receive event-related information</li>
        </ul>
        <p className="mt-4">Users agree not to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Duplicate or distribute portal content without permission</li>
          <li>Use automated bots, scripts, or macros to purchase tickets</li>
          <li>Attempt to bypass ticket purchase limits</li>
          <li>Use the platform for illegal or unauthorized purposes</li>
        </ul>
        <p className="mt-4">
          Violation of these rules may result in transaction cancellation,
          account suspension, or permanent ban from the platform.
        </p>
      </>
    ),
  },
  {
    id: "ip",
    title: "5. Copyright and Intellectual Property",
    body: (
      <>
        <p>All content on the Wish Tickets Portal, including:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Logos</li>
          <li>Graphics</li>
          <li>Website design</li>
          <li>Event information</li>
          <li>Text and media</li>
        </ul>
        <p className="mt-4">
          is owned by Wish 107.5 or its licensors and is protected by Philippine
          and international intellectual property laws.
        </p>
        <p className="mt-4">
          Users may not reproduce, distribute, modify, or publicly display any
          content without written permission from Wish 107.5.
        </p>
        <p className="mt-4">
          Users may download or print a single copy for personal, non-commercial
          use only.
        </p>
      </>
    ),
  },
  {
    id: "purchases",
    title: "6. Purchases",
    body: (
      <>
        <p>
          Tickets purchased through the Wish Tickets Portal are generally
          non-cancellable and non-exchangeable.
        </p>
        <p className="mt-4">Refunds may only be granted if:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>The event is cancelled</li>
          <li>The event is rescheduled and the ticket holder cannot attend</li>
          <li>Required by law or specific event policies</li>
        </ul>
        <p className="mt-4">
          A non-refundable convenience or processing fee may be charged for
          online transactions.
        </p>
        <p className="mt-4">
          Ticket holders must present the following when entering the event
          venue or claiming tickets:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Valid E-Ticket or QR Code issued through the portal</li>
          <li>Valid identification when required</li>
        </ul>
        <p className="mt-4">
          Tickets are subject to event organizer rules and venue policies,
          including age restrictions where applicable.
        </p>
        <p className="mt-4">
          Wish 107.5 reserves the right to verify ticket holder identity before
          or during entry.
        </p>
        <p className="mt-4">
          If fraudulent or irregular purchasing activity is detected, Wish 107.5
          reserves the right to cancel the transaction without prior notice.
        </p>
      </>
    ),
  },
  {
    id: "payments",
    title: "7. Payments",
    body: (
      <>
        <p>
          All payments made through the Wish Tickets Portal are processed
          through secure third-party payment providers.
        </p>
        <p className="mt-4">
          Wish 107.5 does not store sensitive payment information such as:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Credit card numbers</li>
          <li>PIN codes</li>
          <li>Banking passwords</li>
        </ul>
        <p className="mt-4">Users agree that:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Payment information provided is accurate</li>
          <li>Charges incurred will be honored by the payment provider</li>
          <li>
            Transactions are considered successful only when a purchase
            confirmation and E-Ticket are issued.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "reservations",
    title: "8. Reservations",
    body: (
      <>
        <p>Some events may allow temporary ticket reservations.</p>
        <p className="mt-4">
          Reserved tickets may have a limited validity period, after which the
          seats may be released for sale.
        </p>
        <p className="mt-4">
          Failure to complete reserved transactions multiple times may result in
          restricted access to reservation features.
        </p>
      </>
    ),
  },
  {
    id: "site-changes",
    title: "9. Site Changes or Suspension",
    body: (
      <>
        <p>
          Wish 107.5 reserves the right to modify, suspend, or discontinue the
          Wish Tickets Portal or any of its services at any time without prior
          notice.
        </p>
        <p className="mt-4">Temporary interruptions may occur due to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>System maintenance</li>
          <li>Platform upgrades</li>
          <li>Technical issues beyond our control</li>
        </ul>
        <p className="mt-4">
          Wish 107.5 shall not be liable for any losses resulting from such
          interruptions.
        </p>
      </>
    ),
  },
  {
    id: "third-party-links",
    title: "10. Third-Party Links",
    body: (
      <>
        <p>
          The portal may contain links to third-party websites for payment
          processing, promotions, or external services.
        </p>
        <p className="mt-4">
          Wish 107.5 does not control and is not responsible for:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Content of third-party websites</li>
          <li>Privacy practices of third-party services</li>
          <li>Transactions conducted outside the Wish Tickets Portal</li>
        </ul>
        <p className="mt-4">
          Users are encouraged to review the privacy policies of third-party
          platforms.
        </p>
      </>
    ),
  },
  {
    id: "ticket-holder-agreement",
    title: "11. Ticket Holder Agreement",
    body: (
      <>
        <p>
          Each ticket issued through the Wish Tickets Portal constitutes a
          revocable license to attend the specified event.
        </p>
        <p className="mt-4">
          By purchasing or using the ticket, the holder agrees that:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>The ticket is valid only for the event and seat specified</li>
          <li>Lost or stolen tickets may not be replaced</li>
          <li>Event organizers may refuse entry to individuals violating venue rules</li>
          <li>The holder may be subject to security inspection upon entry</li>
          <li>
            The event may be recorded, and attendees grant permission to appear
            in recordings or broadcasts without compensation
          </li>
        </ul>
        <p className="mt-4">Event organizers reserve the right to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Modify event programs or performers</li>
          <li>Adjust seating arrangements or capacity</li>
          <li>
            Enforce venue policies including prohibited items and re-entry
            restrictions
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "acceptance",
    title: "12. Acceptance of Terms",
    body: (
      <>
        <p>
          By accessing or using the Wish Tickets Portal, you acknowledge that
          you have read, understood, and agreed to these Terms of Use.
        </p>
        <p className="mt-4">
          If you do not agree with any part of these Terms, you should not use
          the Wish Tickets Portal.
        </p>
      </>
    ),
  },
] as const;

export function TermsOfUseContent() {
  return (
    <div className="container mx-auto px-4 py-12 md:py-16 min-h-[calc(100vh-4rem)]">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <p className="text-sm text-foreground-muted mb-2">
            Wish Tickets Portal
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            Terms of Use
          </h1>
          <p className="text-foreground-muted mt-3 leading-relaxed">
            These Terms and Conditions govern your access to and use of the Wish
            Tickets Portal, including ticket purchases, reservations, and
            participation in events and promotions.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-1.5 text-foreground-muted hover:text-foreground transition-colors"
            >
              Browse events
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-1.5 text-foreground-muted hover:text-foreground transition-colors"
            >
              Contact support
            </Link>
          </div>
        </div>

        <div className="space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-3">
                {section.title}
              </h2>
              <div className="space-y-3 text-foreground-muted leading-relaxed">
                {section.body}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

