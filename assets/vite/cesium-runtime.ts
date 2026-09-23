import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import type { Plugin } from "vite"

/**
 * Cesium loads workers, textures, terrain fixtures, and widget styles at runtime
 * by resolving paths against `window.CESIUM_BASE_URL`. Vite bundles the Cesium
 * JavaScript library, but it cannot know about those runtime files, so a Phoenix
 * release would otherwise ship a map with no workers and no globe textures.
 *
 * This plugin copies the Cesium runtime directories into `priv/static/cesium`
 * during every Vite build. Phoenix serves them through `Plug.Static` and
 * `mix phx.digest`, so production never needs the Vite development server.
 */
const RUNTIME_DIRECTORIES = ["Workers", "Assets", "Widgets", "ThirdParty"] as const

/** Written inside the copied tree so watch rebuilds can skip an unchanged copy. */
const VERSION_MARKER = ".lekishi-cesium-version"

export type CesiumRuntimeOptions = {
  /** Destination relative to the repository root. */
  destination?: string
}

export function cesiumRuntime({ destination = "priv/static/cesium" }: CesiumRuntimeOptions = {}): Plugin {
  let projectRoot = process.cwd()

  return {
    name: "lekishi:cesium-runtime",
    apply: "build",
    configResolved(config) {
      projectRoot = path.resolve(config.root, "..")
    },
    closeBundle() {
      const require = createRequire(import.meta.url)
      const packageJsonPath = require.resolve("cesium/package.json")
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string }
      const buildDirectory = path.join(path.dirname(packageJsonPath), "Build", "Cesium")
      const target = path.resolve(projectRoot, destination)
      const marker = path.join(target, VERSION_MARKER)

      if (existsSync(marker) && readFileSync(marker, "utf8") === packageJson.version) {
        return
      }

      rmSync(target, { recursive: true, force: true })
      mkdirSync(target, { recursive: true })

      for (const directory of RUNTIME_DIRECTORIES) {
        cpSync(path.join(buildDirectory, directory), path.join(target, directory), { recursive: true })
      }

      writeFileSync(marker, packageJson.version)
      this.info(`copied Cesium ${packageJson.version} runtime to ${path.relative(projectRoot, target)}`)
    },
  }
}
