import { createHash, randomBytes } from "crypto";

export function formatQrData(params: {
  eventCode: string;
  sectionCode: string;
  rowLabel: string;
  seatNumber: string;
}): string {
  const ev = (params.eventCode || "XXX").slice(0, 3).toUpperCase();
  const sec = (params.sectionCode || "000").toUpperCase().padEnd(3, "0").slice(0, 3);
  const row = params.rowLabel ?? "-";
  const seat = params.seatNumber ?? "-";
  return `${ev}${sec}${row}${seat}`;
}

export function buildEncryptedQrFromQrData(qrData: string): string {
  const normalized = String(qrData ?? "").trim().toUpperCase();
  const hashHex = createHash("sha256").update(normalized).digest("hex").toUpperCase();
  return hashHex.replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

/** New encrypted code after invalidation / seat release (non-deterministic, 10-char scan shape). */
export function rotateSeatEncryptedQr(input: {
  seatId: string;
  eventId: string;
  scanCode: string | null | undefined;
}): string {
  const nonce = randomBytes(16).toString("hex");
  const payload = [
    input.seatId,
    input.eventId,
    (input.scanCode ?? "").trim(),
    Date.now().toString(),
    nonce,
  ].join("|");
  const hashHex = createHash("sha256").update(payload).digest("hex").toUpperCase();
  return hashHex.replace(/[^A-Z0-9]/g, "").slice(0, 10);
}
