import QRCode from "qrcode";

export async function generateQRBuffer(data: string): Promise<Buffer> {
  return await QRCode.toBuffer(data, { type: "png", margin: 2 });
}

export async function generateQRDataURL(data: string): Promise<string> {
  return await QRCode.toDataURL(data, { margin: 2 });
}
