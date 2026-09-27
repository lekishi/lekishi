#!/usr/bin/env node
/**
 * Publication gate for the reviewed chapter content.
 *
 * `pnpm build` must not bundle a chapter whose publication is invalid. An edit
 * to an approved revision, a missing source pin, or a record published at a
 * revision it does not carry has to fail the build, because the artifact is
 * what a reviewer opens as reviewed content — and because a Cloudflare Pages
 * build runs exactly this command.
 *
 * The gate also carries the publication approval checkpoint: a set the owner
 * decision ledger does not cover fails here, so no version of the content can
 * exist that no person decided on.
 *
 * The contract's validator needs `node:fs` (schemas) and `node:crypto`
 * (revision and source hashes), so it cannot run in the browser bundle. This
 * gate runs the chapter's own contract test and the projection's test suite
 * through Vitest before Vite bundles anything: the validator stays the single
 * source of truth, and the browser keeps the browser-safe projection.
 *
 * The projection also fails the prerender when published content cannot be
 * represented at all (see `src/lib/atlas/chapter-content.ts`), and
 * `scripts/check-static-build.mjs` checks what the artifact actually contains.
 * The three are separate on purpose: validation, representability, and
 * artifact contents.
 */
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const gate = [
  "src/lib/historical/contract/tang-chapter.test.ts",
  "src/lib/historical/contract/qin-chapter.test.ts",
  "src/lib/historical/contract/publication-approval.test.ts",
  "src/lib/atlas/projection.test.ts",
  "src/lib/atlas/chapter-catalog.test.ts",
]

const result = spawnSync(
  process.execPath,
  [path.join(repoRoot, "node_modules", "vitest", "vitest.mjs"), "run", ...gate],
  { cwd: repoRoot, stdio: "inherit" },
)

if (result.error !== undefined) {
  console.error("The chapter publication gate could not run:")
  console.error(`  ${result.error.message}`)
  process.exit(1)
}

if (result.status !== 0) {
  console.error("")
  console.error("A reviewed chapter did not pass its own contract and projection tests.")
  console.error(
    "Refusing to build: the artifact must not ship content that review did not approve.",
  )
  process.exit(result.status ?? 1)
}
