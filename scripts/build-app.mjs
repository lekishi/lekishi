import { cpSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { spawnSync } from "node:child_process"
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

function build() {
  const vite = bin("vite", "bin/vite.js")
  const svelteKit = bin("@sveltejs/kit", "svelte-kit.js")
  const { LEKISHI_BUILD_ROUTES: _, ...sourceEnv } = process.env
  // Ctrl-C reaches Vite too, which stops; ignoring it here lets the cleanup
  // below run instead of leaving the scratch tree behind.
  const ignore = () => {}
  process.on("SIGINT", ignore)
  process.on("SIGTERM", ignore)

  prepareBuildRoutes()
  let result
  try {
    result = spawnSync(process.execPath, [vite, "build"], {
      cwd: root,
      env: { ...process.env, LEKISHI_BUILD_ROUTES: "1" },
      stdio: "inherit",
    })
  } finally {
    rmSync(path.dirname(buildRoutes), { recursive: true, force: true })
    // The build pointed `.svelte-kit/`'s generated client modules and `$types`
    // at the copy it just removed. Regenerate them from `src/routes`, or a dev
    // server running beside the build stops hydrating and `$types` go missing
    // until it restarts. (Its own output directory would avoid the window, but
    // SvelteKit then warns on every build that `tsconfig.json` extends the
    // wrong file.)
    spawnSync(process.execPath, [svelteKit, "sync"], {
      cwd: root,
      env: sourceEnv,
      stdio: "inherit",
    })
    process.off("SIGINT", ignore)
    process.off("SIGTERM", ignore)
  }

  if (result.error) throw result.error
  if (result.signal) console.error(`vite build stopped by ${result.signal}`)
  process.exitCode = result.status ?? 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build()
