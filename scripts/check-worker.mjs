#!/usr/bin/env node
/**
 * The members' draft path through the real Pages worker (RFD 6).
 *
 * The unit tests call the handlers with stubs; this runs the built worker. It
 * makes one approved chapter stale by retitling its manifest (the approval is
 * not touched, and the file is restored as soon as the build has finished),
 * builds the site as production does, serves `build/` with
 * `wrangler pages dev` and a throwaway session key, and checks what each reader
 * gets at the chapter's address:
 *
 * - no session, a session signed with another key, or an expired one: exactly
 *   what an address without a chapter gets;
 * - a member's session: the draft's page and its data, overlays included, which
 *   no cache may keep or share;
 * - the drafts' cards and search index: a member's only.
 *
 * The build invariant has already checked that no public file names the stale
 * chapter. The script leaves `build/` as that stale build; run `pnpm build`
 * again for an ordinary artifact.
 *
 * The manifest is restored when the build fails, when the script fails, and on
 * SIGINT or SIGTERM, after every process group the script started is empty. Nothing can
 * restore it after SIGKILL: `git status historical` shows a leftover edit.
 *
 * Usage: node scripts/check-worker.mjs [--skip-build]
 */
import { spawn } from "node:child_process"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { constants } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { SESSION_COOKIE, SESSION_SECONDS, createSession } from "../src/lib/server/session.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const chaptersDirectory = path.join(root, "historical", "chapters")
const SECRET = `worker-check-${crypto.randomUUID()}`
const MARK = " (worker check)"
const UNKNOWN = "no-such-chapter"
const REQUEST_MS = 15_000
const READY_MS = 120_000

/**
 * One journey id per chapter the check can make stale, from
 * `src/lib/atlas/overlay-definitions.ts` or the chapter's journey records: a
 * member's draft data must carry the chapter's own overlays, not the empty set
 * a chapter without definitions gets. The check uses the first approved
 * chapter listed here.
 */
const OVERLAY_MARKERS = {
  "qin-conquest-han-233-226": "hanfei-embassy",
  "tang-mission-750-754": "lks:journey:jianzhen-to-nara-753",
}

const failures = []
const check = (condition, message) => {
  if (!condition) failures.push(message)
}

// --- child processes and the manifest ------------------------------------------

/**
 * The process groups this script started. A child runs as the leader of its own
 * group, and the group is tracked until it is empty, not until the leader
 * exits: `pnpm` can exit while something it started (Vite, wrangler, workerd)
 * is still shutting down.
 */
const groups = new Set()

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function signalGroup(group, name) {
  try {
    process.kill(-group, name)
    return true
  } catch {
    return false
  }
}

/** Whether anything in the group still exists (signal 0 only checks). */
const alive = (group) => signalGroup(group, 0)

function start(command, args, env) {
  // Once shutdown has begun, nothing new may start: cleanup has already taken
  // its list of groups to stop.
  if (cleaning !== undefined) throw new Error("check-worker is stopping")
  const child = spawn(command, args, { cwd: root, env, stdio: "inherit", detached: true })
  groups.add(child.pid)
  const exited = new Promise((resolve) => {
    child.once("error", (error) => resolve({ code: null, signal: null, error }))
    child.once("exit", (code, signal) => resolve({ code, signal }))
  })
  return { group: child.pid, exited }
}

/**
 * Stops a whole group: SIGTERM, then SIGKILL for whatever is left after the
 * grace period. The grace is longer than `scripts/build-app.mjs` needs to stop
 * its own Vite group, so a cancelled build cleans up after itself first.
 */
async function stopGroup(group) {
  signalGroup(group, "SIGTERM")
  for (const deadline = Date.now() + 10_000; alive(group) && Date.now() < deadline;) {
    await sleep(100)
  }
  if (alive(group)) {
    signalGroup(group, "SIGKILL")
    for (const deadline = Date.now() + 2_000; alive(group) && Date.now() < deadline;) {
      await sleep(100)
    }
  }
  groups.delete(group)
}

let restoreManifest = () => {}

/** One cleanup, shared by the signal handlers and the normal exit. */
let cleaning
function cleanup() {
  cleaning ??= (async () => {
    await Promise.all([...groups].map(stopGroup))
    restoreManifest()
  })()
  return cleaning
}

for (const name of ["SIGINT", "SIGTERM"]) {
  process.once(name, async () => {
    console.error(`check-worker: stopped by ${name}`)
    await cleanup()
    process.exit(128 + constants.signals[name])
  })
}

/** A GET with a deadline, so a stalled worker fails the check instead of hanging it. */
async function get(origin, pathname, session) {
  const headers = session === undefined ? {} : { cookie: `${SESSION_COOKIE}=${session}` }
  const response = await fetch(`${origin}${pathname}`, {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_MS),
  })
  return { status: response.status, headers: response.headers, text: await response.text() }
}

// --- the check -----------------------------------------------------------------

async function main() {
  // The first approved chapter with an overlay marker, in file order.
  const manifest = readdirSync(chaptersDirectory)
    .filter((file) => file.endsWith(".yaml") && path.basename(file, ".yaml") in OVERLAY_MARKERS)
    .sort()
    .map((file) => path.join(chaptersDirectory, file))
    .find((file) => /^approval:/m.test(readFileSync(file, "utf8")))
  if (manifest === undefined)
    throw new Error("no approved chapter in OVERLAY_MARKERS to make stale")

  const id = path.basename(manifest, ".yaml")
  const original = readFileSync(manifest, "utf8")
  const title = original.match(/^title: (.+)$/m)?.[1]
  if (title === undefined) throw new Error(`${path.relative(root, manifest)} has no one-line title`)
  const overlay = OVERLAY_MARKERS[id]
  if (overlay === undefined) throw new Error(`OVERLAY_MARKERS has no journey id for ${id}`)
  const draftTitle = `${title}${MARK}`

  if (!process.argv.includes("--skip-build")) {
    let modified = false
    restoreManifest = () => {
      if (modified) writeFileSync(manifest, original)
      modified = false
    }
    try {
      modified = true
      writeFileSync(manifest, original.replace(/^title: .+$/m, `title: ${draftTitle}`))

      const env = { ...process.env }
      // As production builds: no drafts served publicly, not a preview.
      delete env.LEKISHI_DRAFTS
      delete env.CF_PAGES_BRANCH
      const build = start("pnpm", ["build"], env)
      const { code, signal, error } = await build.exited
      // Nothing the build started may outlive it.
      await stopGroup(build.group)
      if (code !== 0) {
        throw new Error(
          `the production build with ${id} stale failed (${error?.message ?? signal ?? `exit ${code}`})`,
        )
      }
    } finally {
      restoreManifest()
    }
  }

  const port = await new Promise((resolve) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
  const origin = `http://127.0.0.1:${port}`

  let serverExit = null
  start(
    "pnpm",
    [
      "exec",
      "wrangler",
      "pages",
      "dev",
      "build",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--binding",
      `SESSION_SECRET=${SECRET}`,
      "--show-interactive-dev-session=false",
      "--log-level",
      "warn",
    ],
    { ...process.env, WRANGLER_SEND_METRICS: "false" },
  ).exited.then((outcome) => (serverExit = outcome))

  const deadline = Date.now() + READY_MS
  for (;;) {
    if (serverExit !== null) {
      throw new Error(`wrangler pages dev exited (${serverExit.signal ?? serverExit.code})`)
    }
    if (Date.now() > deadline) throw new Error("wrangler pages dev did not start in time")
    try {
      if ((await get(origin, "/")).status === 200) break
    } catch {
      // Not listening yet, or the probe timed out.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  const now = Date.now()
  const valid = await createSession("worker-check", SECRET, now)
  const readers = {
    "no session": undefined,
    "a session signed with another key": await createSession("worker-check", "another-key", now),
    "an expired session": await createSession("worker-check", SECRET, now - SESSION_SECONDS * 1000),
  }
  const page = `/chapters/${id}`
  const data = `${page}/__data.json`
  const private_ = (pathname, response) => {
    check(
      response.headers.get("cache-control") === "private, no-store",
      `${pathname} for a member: Cache-Control ${response.headers.get("cache-control")}`,
    )
    check(
      /(^|,\s*)cookie(\s*,|$)/i.test(response.headers.get("vary") ?? ""),
      `${pathname} for a member: Vary ${response.headers.get("vary")}`,
    )
  }

  // Anyone but a member gets exactly what an address without a chapter gets,
  // with the id swapped in: the status (a data request answers 200 with a 404
  // error node, as SvelteKit does for any missing page) and the body.
  for (const [reader, session] of Object.entries(readers)) {
    for (const pathname of [page, data]) {
      const response = await get(origin, pathname, session)
      const unknown = await get(origin, pathname.replace(id, UNKNOWN), session)
      check(
        response.status === unknown.status && response.status === (pathname === data ? 200 : 404),
        `${pathname} with ${reader}: ${response.status}, an unknown chapter ${unknown.status}`,
      )
      check(
        response.text === unknown.text.replaceAll(UNKNOWN, id),
        `${pathname} with ${reader} differs from an unknown chapter's answer`,
      )
    }
    for (const pathname of ["/drafts.json", "/drafts/search-index.json"]) {
      const response = await get(origin, pathname, session)
      check(response.status === 404, `${pathname} with ${reader}: ${response.status}, not 404`)
      check(!response.text.includes(id), `${pathname} with ${reader} names ${id}`)
    }
  }

  for (const pathname of [page, data]) {
    const response = await get(origin, pathname, valid)
    check(response.status === 200, `${pathname} for a member: ${response.status}, not 200`)
    check(response.text.includes(draftTitle), `${pathname} for a member lacks the draft's title`)
    private_(pathname, response)
    if (pathname === data) {
      check(
        response.text.includes('"overlays"') && response.text.includes(`"${overlay}"`),
        `${data} for a member lacks ${id}'s overlays (${overlay})`,
      )
    }
  }

  const cards = await get(origin, "/drafts.json", valid)
  check(
    cards.status === 200 && JSON.parse(cards.text).some((card) => card.id === id),
    `/drafts.json for a member does not list ${id}`,
  )
  private_("/drafts.json", cards)
  const search = await get(origin, "/drafts/search-index.json", valid)
  check(
    search.status === 200 && search.text.includes(id),
    `/drafts/search-index.json for a member does not cover ${id}`,
  )
  private_("/drafts/search-index.json", search)

  check(
    (await get(origin, `/chapters/${UNKNOWN}`, valid)).status === 404,
    "an unknown chapter is not a 404 for a member",
  )

  return id
}

let verified
try {
  verified = await main()
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error))
} finally {
  await cleanup()
}

if (failures.length > 0) {
  console.error(
    `check-worker: ${failures.length} failed:\n${failures.map((f) => `  - ${f}`).join("\n")}`,
  )
  process.exit(1)
}

console.log(
  `Worker verified: ${verified}, made stale, is a member's draft and unknown to everyone else.`,
)
