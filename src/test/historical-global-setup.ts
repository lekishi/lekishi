import type { TestProject } from "vitest/node"
import { readEntries, type ReadEntry } from "../lib/historical/authoring/tree"

declare module "vitest" {
  export interface ProvidedContext {
    historicalReads: ReadEntry[]
  }
}

/**
 * Parses and checks the record tree once per test run. Every test file runs in
 * its own worker, and each would otherwise pay that read (seconds, and growing
 * with every record) inside its first test; the workers seed their caches from
 * this instead (`historical-setup.ts`).
 */
export default function setup(project: TestProject): void {
  project.provide("historicalReads", readEntries())
}
