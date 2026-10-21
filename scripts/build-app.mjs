import { cpSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { constants } from "node:os"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { devPagesEnabled, DEV_ROUTE_DIRECTORY } from "./dev-pages.mjs"

/**
 * The route copy one wrapped build reads, relative to the repository root:
 * build scratch owned by this script, ignored by Git and Prettier, and removed
 * after every build.
 */
export const BUILD_ROUTES_DIRECTORY = ".svelte-kit-build/routes"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sourceRoutes = path.join(root, "src/routes")
const buildRoutes = path.join(root, BUILD_ROUTES_DIRECTORY)

/**
 * Build from an exact copy of the route tree so production can omit `/dev`
 * before SvelteKit discovers routes and writes its client manifest. The copy
 * is scratch input for one Vite build and is always removed afterwards.
 */
export function prepareBuildRoutes({
  source = sourceRoutes,
  destination = buildRoutes,
  includeDevPages = devPagesEnabled(),
} = {}) {
  rmSync(destination, { recursive: true, force: true })
  cpSync(source, destination, {
    recursive: true,
    filter: (file) => {
      if (includeDevPages) return true
      const relative = path.relative(source, file)
      return (
        relative !== DEV_ROUTE_DIRECTORY &&
        !relative.startsWith(`${DEV_ROUTE_DIRECTORY}${path.sep}`)
      )
    },
  })
}

/** A package's command-line entry point, run with this Node rather than PATH. */
function bin(packageName, file) {
  const manifest = createRequire(import.meta.url).resolve(`${packageName}/package.json`)
  return path.join(path.dirname(manifest), file)
}

async function build() {
  const vite = bin("vite", "bin/vite.js")
  const svelteKit = bin("@sveltejs/kit", "svelte-kit.js")
  const { LEKISHI_BUILD_ROUTES: _, ...sourceEnv } = process.env

  prepareBuildRoutes()
  let outcome
  // Vite runs as the leader of its own process group. adapter-cloudflare starts
  // wrangler's platform proxy (a `workerd` process) to emulate Pages while
  // prerendering and never disposes it, so each build would leave one running.
  // Because the group is detached, Ctrl-C at a terminal reaches this wrapper
  // only: SIGINT and SIGTERM are forwarded to the whole group, and a group that
  // has not stopped 3 seconds later is killed, so the build then fails with the
  // signal and the cleanup below still runs instead of leaving the scratch
  // tree. Whatever is left in the group once Vite exits is stopped as well.
  let received
  const group = (signal) => {
    try {
      process.kill(-child.pid, signal)
      return true
    } catch {
      // Nothing left in the group.
      return false
    }
  }
  let force
  const forward = (signal) => {
    received = signal
    group(signal)
    force ??= setTimeout(() => group("SIGKILL"), 3_000)
  }
  const stopGroup = async () => {
    group("SIGTERM")
    for (const deadline = Date.now() + 3_000; group(0) && Date.now() < deadline;) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    group("SIGKILL")
  }
  const child = spawn(process.execPath, [vite, "build"], {
    cwd: root,
    env: { ...process.env, LEKISHI_BUILD_ROUTES: "1" },
    stdio: "inherit",
    detached: true,
  })
  process.on("SIGINT", forward)
  process.on("SIGTERM", forward)
  try {
    outcome = await new Promise((resolve, reject) => {
      child.once("error", reject)
      child.once("exit", (code, signal) => resolve({ code, signal: received ?? signal }))
    })
  } finally {
    await stopGroup()
    // After the wait, so a timer armed by a signal during it is cleared too.
    clearTimeout(force)
    rmSync(path.dirname(buildRoutes), { recursive: true, force: true })
    // The build pointed `.svelte-kit/`'s generated client modules and `$types`
    // at the copy it just removed. Regenerate them from `src/routes`, or a dev
    // server running beside the build stops hydrating and `$types` go missing
    // until it restarts. (Its own output directory would avoid the window, but
    // SvelteKit then warns on every build that `tsconfig.json` extends the
    // wrong file.)
    const sync = spawnSync(process.execPath, [svelteKit, "sync"], {
      cwd: root,
      env: sourceEnv,
      stdio: "inherit",
    })
    if (sync.status !== 0) {
      console.error("svelte-kit sync failed: .svelte-kit still points at the removed route copy")
      process.exitCode = 1
    }
    process.off("SIGINT", forward)
    process.off("SIGTERM", forward)
  }

  // A signal that arrived while the group was being stopped still fails the build.
  outcome = { ...outcome, signal: received ?? outcome.signal }
  if (outcome.signal) {
    console.error(`vite build stopped by ${outcome.signal}`)
    process.exitCode = 128 + (constants.signals[outcome.signal] ?? 0)
  } else if (outcome.code !== 0) {
    process.exitCode = outcome.code ?? 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build()
}
