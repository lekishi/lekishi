// A plain static server over the repository root for the spike pages. It serves
// node_modules too (Cesium's runtime and Three's module build), which the
// artifact server deliberately does not.
import { createServer } from "node:http"
import { createReadStream, statSync } from "node:fs"
import { extname, join, normalize, resolve } from "node:path"
const root = resolve(process.argv[2] ?? ".")
const port = Number(process.argv[3] ?? 4300)
// HOST=0.0.0.0 serves the local network, so a tablet or phone can open the
// pages for real-device frame times (static files only; nothing is uploaded).
const host = process.env.HOST ?? "127.0.0.1"
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ttf": "font/ttf", ".webm": "video/webm", ".mp4": "video/mp4" }
createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname)
  if (path.endsWith("/")) path += "index.html"
  const file = normalize(join(root, path))
  if (!file.startsWith(root)) { res.writeHead(403); return res.end() }
  let st; try { st = statSync(file) } catch { res.writeHead(404); return res.end("not found") }
  if (st.isDirectory()) { res.writeHead(301, { Location: path + "/" }); return res.end() }
  res.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream", "Content-Length": st.size, "Cache-Control": "no-store" })
  createReadStream(file).pipe(res)
}).listen(port, host, () => console.log(`serving ${root} on http://${host}:${port}`))
