import path from "node:path"
import { fileURLToPath } from "node:url"
import { runnerImport, type Plugin, type ViteDevServer } from "vite"
import type { ChapterBundle } from "./compile"

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
 * A chapter is served when its approval matches its content. A draft is listed
 * but not served. A stale approval fails the build here, before anything is
 * bundled, and fails the dev server's page with the same message, because an
 * edit to approved content must never reach readers without a new approval.
 *
 * The dev server watches `historical/` and reloads the page when a record file
 * changes.
 *
 * The compiler is loaded through Vite's module runner rather than imported here:
 * this module is part of the Vite config, which Node loads natively, and the
 * compiler's TypeScript imports are written without extensions like the rest of
 * `src/`.
 */

export const INDEX_ID = "virtual:lekishi-chapters"

const RESOLVED = "\0virtual:lekishi-chapters"

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url))

const HISTORICAL = path.join(ROOT, "historical")

/** Imports one of the authoring modules beside this file through a module runner. */
async function authoring<T>(file: string): Promise<T> {
  const imported = await runnerImport<T>(fileURLToPath(new URL(file, import.meta.url)), {
    root: ROOT,
    configFile: false,
    logLevel: "silent",
  })

  return imported.module
}

/** Compiles every chapter, without the preview sets: only approved content ships. */
async function compileChapters(): Promise<ChapterBundle[]> {
  const [compiler, tree] = await Promise.all([
    authoring<typeof import("./compile")>("./compile.ts"),
    authoring<typeof import("./tree")>("./tree.ts"),
  ])

  return compiler.compileAll(tree.readTree())
}

function staleMessage(stale: ChapterBundle[]): string {
  return [
    "A chapter's approval no longer matches its content, so it cannot be served:",
    ...stale.map(
      (bundle) =>
        `  - ${bundle.id}: approved ${String(bundle.approval?.digest)}, content is now ${bundle.digest}`,
    ),
    "Run `pnpm approvals` to see what changed. Only the owner approves a chapter.",
  ].join("\n")
}

export function historicalChapters(): Plugin {
  let bundles: Promise<ChapterBundle[]> | undefined

  async function compiled(): Promise<ChapterBundle[]> {
    bundles ??= compileChapters()

    const all = await bundles
    const stale = all.filter((bundle) => bundle.state === "stale")

    if (stale.length > 0) {
      throw new Error(staleMessage(stale))
    }

    return all
  }

  function invalidate(server: ViteDevServer): void {
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
          approval: bundle.approval,
        }))
        const loaders = all
          .filter((bundle) => bundle.state === "approved")
          .map(
            (bundle) =>
              `  ${JSON.stringify(bundle.id)}: () => import(${JSON.stringify(`${INDEX_ID}/${bundle.id}`)}),`,
          )

        return [
          `export const CHAPTERS = ${JSON.stringify(index)}`,
          `const loaders = {\n${loaders.join("\n")}\n}`,
          "export function loadBundle(id) {",
          "  const load = loaders[id]",
          "  return load === undefined ? Promise.resolve(undefined) : load().then((module) => module.default)",
          "}",
        ].join("\n")
      }

      if (id.startsWith(`${RESOLVED}/`)) {
        const name = id.slice(`${RESOLVED}/`.length)
        const bundle = (await compiled()).find(
          (entry) => entry.id === name && entry.state === "approved",
        )

        if (bundle === undefined) {
          throw new Error(`${name} is not an approved chapter`)
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
