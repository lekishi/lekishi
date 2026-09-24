#!/usr/bin/env node
/**
 * A file-only static server for the built artifact.
 *
 * `vite preview` is not a static host. SvelteKit's preview middleware serves its
 * own output and can render a page through the SSR runtime, so a browser suite
 * that runs against it does not prove the artifact is deployable as plain files.
 * This server does what a static host does and nothing else:
 *
 *   * it serves only files under the artifact directory (`build/` by default),
 *     and refuses a path that escapes it,
 *   * a request without an extension resolves to `<path>.html` (clean URLs; the
 *     same rule `static/_redirects` states explicitly for `/atlas`),
 *   * a request for a directory or a trailing slash resolves to its `index.html`,
 *     and otherwise to the clean URL of the directory,
 *   * anything else is answered from `404.html` with a 404 status,
 *   * there is no module graph, no server-side rendering, and no access to
 *     `.svelte-kit` or any other build input.
 *
 * `Cache-Control: no-store` is deliberate: a review or test server must never
 * serve a stale artifact from its own cache after a rebuild.
 *
 * Usage: node scripts/serve-static.mjs [--directory build] [--port 4173] [--host 127.0.0.1]
 */
import { createReadStream, existsSync, statSync } from "node:fs"
import { createServer } from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
}

function parseArguments(argv) {
  const options = {
    directory: "build",
    port: Number(process.env.PORT ?? 4173),
    host: process.env.HOST ?? "127.0.0.1",
  }

  for (let index = 0; index < argv.length; index += 1) {
    const [name, inlineValue] = argv[index].split("=")
    const value = inlineValue ?? argv[index + 1]

    if (name === "--directory") {
      options.directory = value
      index += inlineValue === undefined ? 1 : 0
    } else if (name === "--port") {
      options.port = Number(value)
      index += inlineValue === undefined ? 1 : 0
    } else if (name === "--host") {
      options.host = value
      index += inlineValue === undefined ? 1 : 0
    }
  }

  return options
}

const options = parseArguments(process.argv.slice(2))
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", options.directory)

if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(`No artifact directory at ${root}. Run \`pnpm build\` first.`)
  process.exit(1)
}

/** A regular file inside the artifact directory, or null. */
function fileWithinRoot(candidate) {
  const resolved = path.resolve(candidate)

  // A path that escapes the artifact directory is not part of the artifact.
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    return null
  }

  return existsSync(resolved) && statSync(resolved).isFile() ? resolved : null
}

/** The file a static host would serve for a request path, or null. */
function resolveRequest(pathname) {
  const candidates = []

  if (pathname.endsWith("/")) {
    candidates.push(path.join(root, pathname, "index.html"))
    // `/atlas/` is the trailing-slash form of the clean URL `/atlas`.
    candidates.push(path.join(root, `${pathname.slice(0, -1)}.html`))
  } else {
    candidates.push(path.join(root, pathname))

    if (path.extname(pathname) === "") {
      candidates.push(path.join(root, `${pathname}.html`))
      candidates.push(path.join(root, pathname, "index.html"))
    }
  }

  for (const candidate of candidates) {
    const file = fileWithinRoot(candidate)

    if (file !== null) {
      return file
    }
  }

  return null
}

const notFoundFile = fileWithinRoot(path.join(root, "404.html"))

function send(response, status, file, { head = false } = {}) {
  response.writeHead(status, {
    "content-type": CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream",
    "cache-control": "no-store",
  })

  if (head) {
    response.end()
    return
  }

  createReadStream(file).pipe(response)
}

const server = createServer((request, response) => {
  const head = request.method === "HEAD"
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`)
  let pathname

  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" })
    response.end("Bad request")
    return
  }

  const file = resolveRequest(pathname)

  if (file !== null) {
    send(response, 200, file, { head })
    return
  }

  if (notFoundFile !== null) {
    send(response, 404, notFoundFile, { head })
    return
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
  response.end("Not found")
})

server.listen(options.port, options.host, () => {
  console.log(
    `serving ${path.relative(process.cwd(), root) || "."} as files on http://${options.host}:${options.port}`,
  )
})
