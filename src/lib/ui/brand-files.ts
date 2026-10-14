import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { BrandColours } from "./brand"

/**
 * Node-only helpers for the logo files' test and maintenance entry point. Never
 * import this from the site: it reads the repository from disk.
 */

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

/** The colours the shipped files use, read from the tokens so they cannot fork. */
export function tokenColours(): BrandColours {
  const css = readFileSync(path.join(ROOT, "src/app.css"), "utf8")
  const token = (name: string) => {
    const match = css.match(new RegExp(`--color-${name}:\\s*([^;]+);`))
    if (!match) throw new Error(`src/app.css has no --color-${name}`)
    return match[1].trim()
  }
  return { ink: token("ink"), accent: token("gold"), ground: token("lacquer") }
}
