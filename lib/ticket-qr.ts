import { createAdminClient } from "@/lib/supabase/admin";
import { generateQRBuffer } from "@/lib/qr";

const BUCKET = "ticket-qr";

/**
 * Generate a QR code from qr_data and upload to Supabase Storage.
 * Returns the public URL, or null on failure.
 */
export async function createAndUploadTicketQR(
  ticketId: string,
  qrData: string
): Promise<string | null> {
  try {
    const buffer = await generateQRBuffer(qrData);
    const adminClient = createAdminClient();
    const path = `${ticketId}.png`;

    const { error } = await adminClient.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (error) {
      console.error("[ticket-qr] Upload failed:", error.message);
      return null;
    }

    const { data } = adminClient.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.error("[ticket-qr] Error:", e);
    return null;
  }
}
