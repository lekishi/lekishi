import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"

test("Pages restores tiles from its pnpm cache without touching pnpm's store", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lekishi-globe-cache-"))
  try {
    const repo = path.join(root, "repo")
    const home = path.join(root, "home")
    const script = path.join(repo, "scripts", "sync-globe-tiles.mjs")
    const tiles = path.join(repo, "static", "globe")
    const cache = path.join(repo, ".cache", "globe")
    const pagesCache = path.join(home, ".pnpm-store", "lekishi-globe")
    const pnpmFile = path.join(home, ".pnpm-store", "v11", "keep")
    for (const directory of [path.dirname(script), tiles, cache, path.dirname(pnpmFile)]) {
      mkdirSync(directory, { recursive: true })
    }
    cpSync(fileURLToPath(new URL("../../scripts/sync-globe-tiles.mjs", import.meta.url)), script)

    // A stamped fixture skips Python entirely, making an accidental repaint fail.
    const builder = "fixture: no executable builder"
    mkdirSync(path.join(repo, "scripts", "globe"))
    writeFileSync(path.join(repo, "scripts", "globe", "build-tiles.py"), builder)
    const stamp = createHash("sha256").update("build-tiles.py").update(builder).digest("hex")
    writeFileSync(path.join(cache, "tiles-stamp"), stamp)
    writeFileSync(path.join(tiles, "tileset.json"), '{"fixture":true}')
    const bundle = Buffer.from([0, 17, 255, 83])
    writeFileSync(path.join(tiles, "root.bin"), bundle)
    writeFileSync(pnpmFile, "pnpm-owned")

    const run = (pages: boolean) =>
      execFileSync(process.execPath, [script], {
        env: { ...process.env, HOME: home, CF_PAGES: pages ? "1" : "0" },
        encoding: "utf8",
      })

    run(false)
    expect(existsSync(pagesCache)).toBe(false)
    run(true)
    expect(readFileSync(path.join(pagesCache, "tiles-stamp"), "utf8")).toBe(stamp)

    // Simulate a fresh checkout retaining only the intended dependency cache.
    rmSync(tiles, { recursive: true })
    rmSync(cache, { recursive: true })
    const output = run(true)
    expect(output).toContain("globe tiles restored from the Cloudflare Pages build cache")
    expect(output).toContain("globe tiles already built in static/globe")
    expect(readFileSync(path.join(tiles, "tileset.json"), "utf8")).toBe('{"fixture":true}')
    expect(readFileSync(path.join(tiles, "root.bin"))).toEqual(bundle)
    expect(readFileSync(pnpmFile, "utf8")).toBe("pnpm-owned")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
