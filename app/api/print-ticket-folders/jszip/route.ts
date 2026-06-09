import { readFile } from "node:fs/promises";
import { join } from "node:path";

const JSZIP_PATH = join(process.cwd(), "node_modules", "jszip", "dist", "jszip.min.js");

let cached: Buffer | null = null;

/**
 * Serves JSZip from `node_modules` so the folder viewer page stays under `script-src 'self'`
 * (CSP blocks third-party CDNs like jsDelivr).
 */
export async function GET() {
  try {
    if (!cached) {
      cached = await readFile(JSZIP_PATH);
    }
    return new Response(new Uint8Array(cached), {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("JSZip bundle not found", { status: 500 });
  }
}
