export const TICKET_SCAN_SOURCE_KEY = "ticket_scanning_source_mode";

export const TICKET_SCAN_SOURCE_OPTIONS = [
  { value: "qr_data", label: "QR Data" },
  { value: "encrypted_qr", label: "Encrypted QR" },
  {
    value: "encrypted_then_qr_fallback",
    label: "Encrypted QR first then QR Data as Fallback",
  },
] as const;

export type TicketScanSourceMode = (typeof TICKET_SCAN_SOURCE_OPTIONS)[number]["value"];

export const DEFAULT_TICKET_SCAN_SOURCE_MODE: TicketScanSourceMode =
  "encrypted_then_qr_fallback";

export function parseTicketScanSourceMode(input: unknown): TicketScanSourceMode {
  if (typeof input !== "string") return DEFAULT_TICKET_SCAN_SOURCE_MODE;
  const normalized = input.trim();
  return TICKET_SCAN_SOURCE_OPTIONS.some((x) => x.value === normalized)
    ? (normalized as TicketScanSourceMode)
    : DEFAULT_TICKET_SCAN_SOURCE_MODE;
}

export function ticketMatchesScanValue(
  mode: TicketScanSourceMode,
  scanInput: string,
  ticketEncryptedQr: string | null | undefined,
  ticketQrData: string | null | undefined
): boolean {
  const scan = scanInput.trim();
  const enc = (ticketEncryptedQr ?? "").trim();
  const qr = (ticketQrData ?? "").trim();
  if (!scan) return false;
  if (mode === "encrypted_qr") return scan === enc;
  if (mode === "qr_data") return scan === qr;
  return scan === enc || scan === qr;
}

export function buildTicketOrFilter(mode: TicketScanSourceMode, scanInput: string): string {
  const scan = scanInput.trim();
  if (mode === "encrypted_qr") return `encrypted_qr.eq.${scan}`;
  if (mode === "qr_data") return `qr_data.eq.${scan}`;
  return `encrypted_qr.eq.${scan},qr_data.eq.${scan}`;
}
