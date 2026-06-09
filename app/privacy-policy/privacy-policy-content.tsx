"use client";

import Link from "next/link";

const SECTIONS = [
  {
    id: "privacy-statement",
    title: "1. Privacy Statement",
    body: (
      <>
        <p>
          The Wish Tickets Portal, operated by Wish 107.5, collects, processes,
          and stores personal data when you purchase tickets, access the
          ticketing platform, participate in events organized or supported by
          Wish 107.5, or otherwise interact with the portal (collectively
          referred to as the “Services”).
        </p>
        <p>
          This Privacy Policy explains how the Wish Tickets Portal collects,
          uses, processes, and protects your personal data. It is intended to
          inform users about how their information is handled in accordance with
          Republic Act No. 10173, otherwise known as the Data Privacy Act of
          2012, and its Implementing Rules and Regulations.
        </p>
        <p>
          By using the Wish Tickets Portal and its Services, you acknowledge
          that you have read and understood this Privacy Policy and consent to
          the collection and processing of your personal data as described
          herein.
        </p>
      </>
    ),
  },
  {
    id: "collection",
    title: "2. Collection of Personal Data",
    body: (
      <>
        <p>The Wish Tickets Portal collects personal information that you voluntarily provide when you:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Purchase or reserve tickets through the portal</li>
          <li>Create or manage an account</li>
          <li>Submit payment information or proof of payment</li>
          <li>Contact customer support</li>
          <li>Participate in ticket promotions, events, or surveys</li>
          <li>
            Communicate or interact with Wish 107.5 regarding ticket purchases
            or event participation
          </li>
        </ul>
        <p className="mt-4">The personal data collected may include, but is not limited to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Full name</li>
          <li>Email address</li>
          <li>Mobile number</li>
          <li>Billing and payment information</li>
          <li>Ticket purchase details</li>
          <li>Proof of payment or transaction records</li>
        </ul>
      </>
    ),
  },
  {
    id: "use-processing",
    title: "3. Use and Processing of Personal Data",
    body: (
      <>
        <p>The personal data collected may be used and processed for the following purposes:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Processing ticket purchases and confirming transactions</li>
          <li>Issuing tickets and managing event access or check-in</li>
          <li>Providing updates related to events or ticket purchases</li>
          <li>Responding to inquiries and providing customer support</li>
          <li>Improving the ticketing platform and user experience</li>
          <li>
            Sending announcements, promotions, or marketing communications
            related to Wish 107.5 events and services
          </li>
        </ul>
        <p className="mt-4">
          At all times, personal data will not be used or processed for any
          purpose that is contrary to law, morals, or public policy.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "4. Sharing of Personal Data",
    body: (
      <>
        <p>The Wish Tickets Portal may share personal data with:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            Authorized personnel of Wish 107.5 and affiliated organizations
            involved in event management and ticketing operations
          </li>
          <li>
            Payment gateways or financial service providers used for processing
            ticket payments
          </li>
          <li>
            Event organizers, venue operators, or service providers necessary to
            facilitate ticket distribution and event access
          </li>
          <li>
            Vendors, consultants, and service providers who perform services on
            behalf of the Wish Tickets Portal
          </li>
        </ul>
        <p className="mt-4">
          All data sharing shall be conducted in accordance with the Data Privacy
          Act and, when necessary, covered by appropriate data sharing
          agreements.
        </p>
        <p>
          Personal data may also be disclosed when required by law, regulation,
          or order from a competent government authority.
        </p>
      </>
    ),
  },
  {
    id: "storage-protection",
    title: "5. Storage and Protection of Personal Data",
    body: (
      <>
        <p>
          The Wish Tickets Portal implements appropriate organizational,
          technical, and physical security measures to safeguard personal data
          against unauthorized access, disclosure, alteration, or destruction.
        </p>
        <p className="mt-4">Security measures include but are not limited to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Restricted access to personal data by authorized personnel only</li>
          <li>Secure servers and encrypted communications</li>
          <li>Confidentiality agreements with employees and service providers</li>
          <li>Regular system monitoring for vulnerabilities and security threats</li>
        </ul>
        <p className="mt-4">
          Payment transactions are processed through secure third-party payment
          gateways, and sensitive financial information is not stored directly on
          Wish Tickets Portal servers.
        </p>
        <p>
          While every reasonable effort is made to protect personal data, no
          system can guarantee absolute security. The Wish Tickets Portal
          continually reviews and improves its safeguards in compliance with the
          Data Privacy Act.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "6. Use of Cookies",
    body: (
      <>
        <p>
          The Wish Tickets Portal uses cookies and similar technologies to
          improve the functionality and performance of its website.
        </p>
        <p className="mt-4">
          Cookies are small files stored on your device that help the system:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Recognize your browser</li>
          <li>Remember user preferences</li>
          <li>Analyze site traffic and usage patterns</li>
          <li>Improve platform performance and user experience</li>
        </ul>
        <p className="mt-4">
          Users may choose to disable cookies through their browser settings.
          However, disabling cookies may affect certain features or
          functionalities of the portal.
        </p>
      </>
    ),
  },
  {
    id: "user-responsibility",
    title: "7. User Responsibility",
    body: (
      <>
        <p>
          Users are encouraged to take reasonable precautions to protect their
          personal information, including using updated web browsers and
          safeguarding account credentials.
        </p>
        <p className="mt-4">
          The Wish Tickets Portal may contain links to third-party websites.
          These sites operate independently and may have their own privacy
          policies. Wish 107.5 is not responsible for the privacy practices of
          such third-party websites.
        </p>
        <p>
          Users are encouraged to review the privacy policies of any external
          websites they visit.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "8. Your Rights under the Data Privacy Act",
    body: (
      <>
        <p>As a data subject under the Data Privacy Act, you have the following rights:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Right to be informed about the collection and processing of your personal data</li>
          <li>Right to object to the processing of your personal data</li>
          <li>Right to access your personal data held by the Wish Tickets Portal</li>
          <li>Right to rectify inaccurate or incomplete personal data</li>
          <li>Right to suspend, withdraw, or request deletion of personal data when applicable</li>
          <li>
            Right to data portability, allowing you to obtain a copy of your
            personal data in a structured format
          </li>
          <li>Right to be indemnified for damages caused by unlawful processing of personal data</li>
        </ul>
        <p className="mt-4">
          Requests related to these rights may be submitted through the Wish
          Tickets Portal’s designated contact channels.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "9. Changes to the Privacy Policy",
    body: (
      <>
        <p>
          The Wish Tickets Portal may update or modify this Privacy Policy from
          time to time to reflect changes in services, legal requirements, or
          operational practices.
        </p>
        <p className="mt-4">
          Users will be notified of significant changes through the portal,
          email notifications, or other appropriate means. Continued use of the
          Services after such updates constitutes acceptance of the revised
          Privacy Policy.
        </p>
      </>
    ),
  },
  {
    id: "consent",
    title: "10. Consent",
    body: (
      <>
        <p>
          By using the Wish Tickets Portal and submitting your personal data,
          you consent to the collection, use, and processing of your personal
          information in accordance with this Privacy Policy.
        </p>
        <p className="mt-4">
          Consent shall remain valid only for the purposes for which the data
          was collected, or for the period required by law or necessary for
          legitimate business and operational purposes related to ticketing and
          event management.
        </p>
        <p className="mt-4">
          If you are below eighteen (18) years old, parental or legal guardian
          consent may be required to use the Services.
        </p>
      </>
    ),
  },
] as const;

export function PrivacyPolicyContent() {
  return (
    <div className="container mx-auto px-4 py-12 md:py-16 min-h-[calc(100vh-4rem)]">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <p className="text-sm text-foreground-muted mb-2">
            Wish Tickets Portal
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            Privacy Policy
          </h1>
          <p className="text-foreground-muted mt-3 leading-relaxed">
            This page explains how we collect, use, share, and protect personal
            data when you use the Wish Tickets Portal.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Link
              href="/signup"
              className="inline-flex items-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-1.5 text-foreground-muted hover:text-foreground transition-colors"
            >
              Create an account
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

