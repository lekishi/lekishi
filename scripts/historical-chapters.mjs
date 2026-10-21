/**
 * Serves the compiled chapters to the site as virtual modules, so nothing
 * compiled is ever written to disk or checked in (RFD 2, "Decided: the compiler
 * and what ships").
 *
 * - `virtual:lekishi-chapters` lists every manifest (id, title, summary, window,
 *   approval state) and loads a served chapter's bundle lazily.
 * - `virtual:lekishi-chapters/<id>` is one chapter's v0 documents and set, which
 *   Vite emits as one chunk: content costs one deployed file per chapter however
 *   many records it has.
 *
 * A chapter is served when its approval matches its content. A draft or a
 * stale chapter is left out of a production build entirely, index included, so
 * neither its content nor its title reaches the public bundle, and the build
 * warns instead of failing (the owner's decision of 2026-10-21: a missing
 * approval never fails a build). An edit to approved content still never
 * reaches readers without a new approval; the chapter is simply absent until
 * the owner approves it.
 *
 * A build that serves drafts (development and pull-request previews, never
 * production; see `draftChaptersServed` in `scripts/dev-pages.mjs`) also serves
 * every chapter without a matching approval, stale ones included, with its
 * draft preview set, so the owner can look at exactly what they are asked to
 * approve. The index says which chapters are drafts, and the site states it on
 * every surface that shows one.
 * The types the site imports are declared in
 * `src/lib/historical/authoring/virtual-chapters.d.ts`.
 *
 * The dev server watches `historical/` and reloads the page when a record file
 * changes.
 *
 * This module is part of the Vite config, which Node loads as it is, so it is
 * plain JavaScript and loads the TypeScript compiler in
 * `src/lib/historical/authoring/` through Vite's module runner.
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import { runnerImport } from "vite"

/** @typedef {import("../src/lib/historical/authoring/compile").ChapterBundle} ChapterBundle */

export const INDEX_ID = "virtual:lekishi-chapters"

const RESOLVED = `\0${INDEX_ID}`

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const HISTORICAL = path.join(ROOT, "historical")

/**
 * Imports one of the authoring modules through a module runner.
 *
 * @param {string} file the module's path below `src/lib/historical/authoring/`
 */
async function authoring(file) {
  const imported = await runnerImport(path.join(ROOT, "src/lib/historical/authoring", file), {
    root: ROOT,
    configFile: false,
    logLevel: "silent",
  })

  return imported.module
}

/**
 * Compiles every chapter. Only a build that serves drafts compiles the draft
 * preview sets; otherwise only approved content has a set to ship.
 *
 * @param {boolean} drafts
 * @returns {Promise<ChapterBundle[]>}
 */
export async function compileChapters(drafts = false) {
  const [compiler, tree] = await Promise.all([authoring("compile.ts"), authoring("tree.ts")])

  return compiler.compileAll(tree.readTree(), { preview: drafts })
}

/** @param {ChapterBundle[]} unserved */
function unservedMessage(unserved) {
  return [
    "These chapters have no approval matching their content, so this build leaves them out:",
    ...unserved.map((bundle) =>
      bundle.state === "stale"
        ? `  - ${bundle.id}: approved ${String(bundle.approval?.digest)}, content is now ${bundle.digest}`
        : `  - ${bundle.id}: draft, never approved`,
    ),
    "Run `pnpm approvals` to see what changed. Only the owner approves a chapter.",
  ].join("\n")
}

/**
 * @param {{ drafts?: boolean }} [options] `drafts`: serve the chapters without a
 *   matching approval as drafts. Never true for production.
 * @returns {import("vite").Plugin}
 */
export function historicalChapters({ drafts = false } = {}) {
  /** @type {Promise<ChapterBundle[]> | undefined} */
  let bundles

  /** @param {ChapterBundle} bundle */
  const served = (bundle) => bundle.state === "approved" || drafts

  /** The chapters this build serves; the rest are left out with a warning. */
  async function compiled() {
    if (bundles === undefined) {
      bundles = compileChapters(drafts)

      const unserved = (await bundles).filter((bundle) => !served(bundle))

      if (unserved.length > 0) {
        console.warn(unservedMessage(unserved))
      }
    }

    return (await bundles).filter(served)
  }

  /** @param {import("vite").ViteDevServer} server */
  function invalidate(server) {
    bundles = undefined

    for (const module of server.moduleGraph.idToModuleMap.values()) {
      if (module.id?.startsWith(RESOLVED)) {
        server.moduleGraph.invalidateModule(module)
      }
    }

    server.ws.send({ type: "full-reload" })
  }

  return {
    name: "lekishi-historical-chapters",
    buildStart() {
      bundles = undefined
    },
    resolveId(id) {
      return id === INDEX_ID || id.startsWith(`${INDEX_ID}/`) ? `\0${id}` : undefined
    },
    async load(id) {
      if (id === RESOLVED) {
        const all = await compiled()
        const index = all.map((bundle) => ({
          id: bundle.id,
          title: bundle.title,
          summary: bundle.summary,
          window: bundle.window,
          state: bundle.state,
          served: served(bundle),
          approval: bundle.approval,
        }))
        const loaders = all.map(
          (bundle) =>
            `  ${JSON.stringify(bundle.id)}: () => import(${JSON.stringify(`${INDEX_ID}/${bundle.id}`)}),`,
        )

        return [
          `export const CHAPTERS = ${JSON.stringify(index)}`,
          `export const DRAFTS = ${JSON.stringify(drafts)}`,
          `const loaders = {\n${loaders.join("\n")}\n}`,
          "export function loadBundle(id) {",
          "  const load = loaders[id]",
          "  return load === undefined ? Promise.resolve(undefined) : load().then((module) => module.default)",
          "}",
        ].join("\n")
      }

      if (id.startsWith(`${RESOLVED}/`)) {
        const name = id.slice(`${RESOLVED}/`.length)
        const bundle = (await compiled()).find((entry) => entry.id === name)

        if (bundle === undefined) {
          throw new Error(`${name} is not a served chapter`)
        }

        return `export default ${JSON.stringify({ documents: bundle.documents, sets: bundle.sets })}`
      }

      return undefined
    },
    configureServer(server) {
      server.watcher.add(HISTORICAL)
      server.watcher.on("all", (_event, file) => {
        if (
          file.startsWith(HISTORICAL) &&
          file.endsWith(".yaml") &&
          !path.basename(file).startsWith(".")
        ) {
          invalidate(server)
        }
      })
    },
  }
}
