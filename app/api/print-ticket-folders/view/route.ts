import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "ticket-images";

function htmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function attrEscape(s: string): string {
  return htmlEscape(s).replace(/'/g, "&#39;");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const folder = (url.searchParams.get("folder") ?? "").trim();
  const eventId = (url.searchParams.get("eventId") ?? "").trim() || "Event";
  const autoZip = url.searchParams.get("autoZip") === "1";

  if (
    !folder ||
    (!folder.startsWith("print-bulk-folders/") && !folder.startsWith("print-by-section/"))
  ) {
    return new Response("Invalid folder", { status: 400 });
  }

  const admin = createAdminClient();
  const { data: listed, error: listErr } = await admin.storage.from(BUCKET).list(folder, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (listErr) {
    return new Response(`Failed to list folder: ${listErr.message}`, { status: 500 });
  }

  const fileNames = (listed ?? [])
    .map((x) => x.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);

  // Use public object URLs (same bucket used by existing `ticket_image_url`) to keep this endpoint fast.
  const signed: Array<{ name: string; url: string }> = fileNames
    .map((name) => {
      const p = `${folder}/${name}`;
      const publicUrl = admin.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;
      return publicUrl ? { name, url: publicUrl } : null;
    })
    .filter((x): x is { name: string; url: string } => x != null);

  const rows = signed
    .map(
      (e, i) =>
        `<li style="margin:8px 0;"><a href="${attrEscape(e.url)}" download="${attrEscape(e.name)}" target="_blank" rel="noopener noreferrer">${i + 1}. ${htmlEscape(e.name)}</a></li>`
    )
    .join("\n");

  const downloadZipHref = `/api/print-ticket-folders/download-zip?${new URLSearchParams({
    eventId,
    folder,
  }).toString()}`;

  const downloadZipHrefJson = JSON.stringify(downloadZipHref).replace(/</g, "\\u003c");

  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Ticket files</title>
</head>
<body style="font-family:Arial,sans-serif;max-width:920px;margin:24px auto;padding:0 12px;line-height:1.5;">
  <h1 style="margin:0 0 12px;">Ticket files</h1>
  <p style="margin:0 0 8px;">Event: <strong>${htmlEscape(eventId)}</strong></p>
  <p style="margin:0 0 8px;">Folder: <code>${htmlEscape(folder)}</code></p>
  <p style="margin:0 0 12px;">Files: <strong>${signed.length}</strong></p>
  <p style="margin:0 0 12px;font-size:18px;"><a href="${attrEscape(downloadZipHref)}" style="display:inline-block;background:#ea580c;color:#fff;padding:12px 20px;border-radius:8px;font-weight:bold;text-decoration:none;">Download entire folder (ZIP)</a></p>
  <ol style="padding-left:22px;">${rows}</ol>
  <script>
(function () {
  if (${autoZip ? "true" : "false"}) {
    window.location.href = ${downloadZipHrefJson};
  }
})();
  </script>
</body>
</html>`;

  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
