"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";

export interface ConfirmationTicket {
  id: string;
  ticket_image_url?: string | null;
  qr_data?: string | null;
  encrypted_qr?: string | null;
  qr_image_url?: string | null;
  quantity?: number;
  seatLabel?: string | null;
}

function getTicketImageSrc(bookingId: string, ticketId: string): string {
  return `/api/bookings/${bookingId}/tickets/${ticketId}/image`;
}

/** Renders a QR from payload on the client so the confirmation RSC does not run Sharp/qrcode per ticket. */
function ClientQrDataUrl({ data }: { data: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const QRCode = (await import("qrcode")).default;
      const url = await QRCode.toDataURL(data, { margin: 2, width: 160 });
      if (!cancelled) setSrc(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (!src) {
    return <div className="w-full h-full animate-pulse rounded bg-white/15" aria-hidden />;
  }
  return (
    <Image
      src={src}
      alt="Ticket QR"
      className="w-full h-full object-contain"
      width={80}
      height={80}
      unoptimized
    />
  );
}

function QrFallback({ ticket }: { ticket: ConfirmationTicket }) {
  const ticketCode = ticket.encrypted_qr ?? ticket.qr_data ?? ticket.id.slice(0, 8);
  if (ticket.qr_image_url) {
    return (
      <Image
        src={ticket.qr_image_url}
        alt={`Ticket ${ticketCode} QR`}
        className="w-full h-full object-contain"
        width={80}
        height={80}
        unoptimized
      />
    );
  }
  if (ticket.encrypted_qr ?? ticket.qr_data) {
    return <ClientQrDataUrl data={ticket.encrypted_qr ?? ticket.qr_data ?? ""} />;
  }
  return null;
}

function TicketTile({
  bookingId,
  ticket,
  isPriority,
}: {
  bookingId: string;
  ticket: ConfirmationTicket;
  isPriority: boolean;
}) {
  const imageSrc = getTicketImageSrc(bookingId, ticket.id);
  const [artStatus, setArtStatus] = useState<"loading" | "ok" | "fail">("loading");

  useEffect(() => {
    setArtStatus("loading");
  }, [ticket.id, imageSrc]);

  const qrBox = (
    <div className="w-20 h-20 mx-auto flex items-center justify-center bg-white rounded p-1">
      <QrFallback ticket={ticket} />
    </div>
  );

  return (
    <div className="flex w-[180px] flex-col items-stretch gap-2 p-2 rounded-lg bg-white/5 border border-[var(--glass-border)]">
      {artStatus === "ok" ? (
        <div className="flex flex-col gap-1 items-center">
          <PhotoView src={imageSrc}>
            <Image
              src={imageSrc}
              alt={`Ticket ${ticket.encrypted_qr ?? ticket.qr_data ?? ticket.id.slice(0, 8)}`}
              width={180}
              height={240}
              className="w-full h-auto object-contain rounded border border-[var(--glass-border)] cursor-zoom-in"
              unoptimized
              priority={isPriority}
            />
          </PhotoView>
        </div>
      ) : artStatus === "fail" ? (
        qrBox
      ) : (
        <div className="flex flex-col gap-2 items-center min-h-[120px] justify-center">
          {qrBox}
          <span className="text-[10px] text-foreground-muted text-center px-1">
            Loading ticket image…
          </span>
          {/* Hidden probe: full ticket art is generated/served by the API on demand (not on this RSC). */}
          <Image
            src={imageSrc}
            alt=""
            width={1}
            height={1}
            className="block w-0 h-0 overflow-hidden opacity-0 pointer-events-none"
            unoptimized
            onLoad={() => setArtStatus("ok")}
            onError={() => setArtStatus("fail")}
          />
        </div>
      )}
      <div className="text-xs sm:text-sm text-foreground-muted text-center">
        <span>Ticket #{ticket.encrypted_qr ?? ticket.qr_data ?? ticket.id.slice(0, 8)}</span>
        {ticket.seatLabel && <span> · {ticket.seatLabel}</span>}
        {ticket.quantity && ticket.quantity > 1 && <span> × {ticket.quantity}</span>}
      </div>
    </div>
  );
}

export function ConfirmationTickets({
  bookingId,
  tickets,
}: {
  bookingId: string;
  tickets: ConfirmationTicket[];
}) {
  if (tickets.length === 0) return null;

  return (
    <div className="space-y-4">
      <PhotoProvider>
        <div className="flex flex-wrap justify-center gap-4">
          {tickets.map((t, index) => (
            <TicketTile
              key={t.id}
              bookingId={bookingId}
              ticket={t}
              isPriority={index === 0}
            />
          ))}
        </div>
      </PhotoProvider>
    </div>
  );
}
