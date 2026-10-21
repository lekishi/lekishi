#!/usr/bin/env node
/**
 * `pnpm approvals`: lists every chapter as approved, draft, or stale, and shows
 * what changed since each chapter's last approval. The logic, and the rules it
 * follows, are in `src/lib/historical/authoring/approvals.ts`; this launcher
 * loads that TypeScript through Vite's module runner, as the build does.
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import { runnerImport } from "vite"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const { module } = await runnerImport(
  path.join(root, "src/lib/historical/authoring/approvals.ts"),
  { root, configFile: false, logLevel: "silent" },
)

process.exitCode = await module.main(process.argv.slice(2))
