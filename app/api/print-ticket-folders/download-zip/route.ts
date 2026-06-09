import archiver from "archiver";
import { PassThrough } from "node:stream";
import { Readable } from "node:stream";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAllowedFolder(folder: string): boolean {
  return (
    folder.startsWith("print-bulk-folders/") ||
    folder.startsWith("print-by-section/")
  );
}

function isAllowedZipObject(zipObjectPath: string): boolean {
  return zipObjectPath.startsWith("print-section-zips/");
}

function isAllowedTicketImageObjectPath(objectPath: string): boolean {
  const norm = objectPath.replace(/^\/+/, "").trim();
  if (!/\.(png|jpe?g)$/i.test(norm)) return false;
  return norm.startsWith("print-bulk-folders/") || norm.startsWith("print-by-section/");
}

function parseFilesParam(url: URL): string[] {
  const raw = url.searchParams.getAll("files");
  const merged: string[] = [];
  for (const entry of raw) {
    for (const part of entry.split(",")) {
      const trimmed = part.trim();
      if (trimmed) merged.push(trimmed);
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const path of merged) {
    if (!isAllowedTicketImageObjectPath(path) || seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}

function asciiFilenameFromObjectPaths(objectPaths: string[]): string {
  if (objectPaths.length === 1) {
    const name = objectPaths[0]!.split("/").filter(Boolean).slice(-1)[0] ?? "tickets";
    return name.replace(/\.(png|jpe?g)$/i, "");
  }
  const folder = objectPaths[0]!.slice(0, objectPaths[0]!.lastIndexOf("/"));
  return asciiFilenameFromFolder(folder);
}

const BUCKET = "ticket-images";
const DOWNLOAD_CONCURRENCY = 6;

function asciiFilenameFromFolder(folder: string): string {
  const tail = folder
    .split("/")
    .filter(Boolean)
    .slice(-2)
    .join("-")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return tail.length > 0 ? tail : "tickets";
}

async function listAllFileNames(
  admin: ReturnType<typeof createAdminClient>,
  folder: string
): Promise<string[]> {
  const names: string[] = [];
  let offset = 0;
  for (;;) {
    const { data: page, error } = await admin.storage.from(BUCKET).list(folder, {
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      throw new Error(error.message);
    }
    if (!page?.length) break;
    for (const item of page) {
      if (typeof item.name !== "string" || !item.name) continue;
      if (!/\.(png|jpe?g)$/i.test(item.name)) continue;
      names.push(item.name);
    }
    if (page.length === 0) break;
    offset += page.length;
  }
  return names;
}

async function streamZipFromObjectPaths(
  admin: ReturnType<typeof createAdminClient>,
  objectPaths: string[],
  baseName: string
): Promise<Response> {
  const passthrough = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 0 } });
  archive.on("error", (err) => {
    passthrough.destroy(err);
  });
  archive.pipe(passthrough);

  void (async () => {
    try {
      for (let i = 0; i < objectPaths.length; i += DOWNLOAD_CONCURRENCY) {
        const chunk = objectPaths.slice(i, i + DOWNLOAD_CONCURRENCY);
        const buffers = await Promise.all(
          chunk.map(async (objectPath) => {
            const { data, error } = await admin.storage.from(BUCKET).download(objectPath);
            if (error || !data) return null;
            const buf = Buffer.from(await data.arrayBuffer());
            const name = objectPath.split("/").filter(Boolean).slice(-1)[0] ?? "ticket.png";
            return { name, buf };
          })
        );
        for (const row of buffers) {
          if (row) archive.append(row.buf, { name: row.name });
        }
      }
      await archive.finalize();
    } catch (err) {
      try {
        archive.abort();
      } catch {
        /* ignore */
      }
      passthrough.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  const webBody = Readable.toWeb(passthrough) as unknown as ReadableStream<Uint8Array>;
  return new Response(webBody, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${baseName}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const folder = (url.searchParams.get("folder") ?? "").trim();
  const zipObject = (url.searchParams.get("zipObject") ?? "").trim();
  const filePaths = parseFilesParam(url);

  if (zipObject) {
    if (!isAllowedZipObject(zipObject)) {
      return new Response("Invalid ZIP object path", { status: 400 });
    }
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(BUCKET).download(zipObject);
    if (error || !data) {
      return new Response(error?.message ?? "ZIP not found", { status: 404 });
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    const baseName = zipObject
      .split("/")
      .filter(Boolean)
      .slice(-1)[0]
      ?.replace(/\.zip$/i, "") || "tickets";
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${baseName}.zip"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "no-store",
      },
    });
  }

  const admin = createAdminClient();

  if (filePaths.length > 0) {
    const baseName = asciiFilenameFromObjectPaths(filePaths);
    return streamZipFromObjectPaths(admin, filePaths, baseName);
  }

  if (!folder || !isAllowedFolder(folder)) {
    return new Response("Invalid folder", { status: 400 });
  }

  let fileNames: string[];
  try {
    fileNames = await listAllFileNames(admin, folder);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "List failed";
    return new Response(msg, { status: 500 });
  }

  if (fileNames.length === 0) {
    return new Response("No ticket image files in this folder", { status: 404 });
  }

  const baseName = asciiFilenameFromFolder(folder);
  const objectPaths = fileNames.map((name) => `${folder}/${name}`);
  return streamZipFromObjectPaths(admin, objectPaths, baseName);
}
