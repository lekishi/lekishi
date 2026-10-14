import { cpSync, rmSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { devPagesEnabled, DEV_ROUTE_DIRECTORY } from "./dev-pages.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sourceRoutes = path.join(root, "src/routes")
const buildRoutes = path.join(root, ".amp/in/build-routes")

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

function build() {
  prepareBuildRoutes()
  let result
  try {
    result = spawnSync("vite", ["build"], {
      cwd: root,
      env: { ...process.env, LEKISHI_BUILD_ROUTES: "1" },
      stdio: "inherit",
    })
  } finally {
    rmSync(buildRoutes, { recursive: true, force: true })
  }

  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build()
