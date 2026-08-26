import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const port = Number(process.env.PORT || 4173);
const host = "0.0.0.0";

const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

function fileFromUrl(urlPath) {
  const pathname = decodeURIComponent((urlPath ?? "/").split("?")[0] || "/");
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const full = normalize(join(root, relative));
  const rootWithSep = normalize(root + sep);
  if (full !== normalize(root) && !full.startsWith(rootWithSep)) {
    return join(root, "index.html");
  }
  return full;
}

const server = createServer(async (req, res) => {
  try {
    let file = fileFromUrl(req.url);
    let info = await stat(file).catch(() => null);
    if (!info?.isFile()) {
      file = join(root, "index.html");
      info = await stat(file);
    }
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] ?? "application/octet-stream",
    });
    res.end(body);
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end("Frontend dist not found. Check the Railway build logs.");
  }
});

server.listen(port, host, () => {
  console.log(`Frontend listening on http://${host}:${port}`);
});
