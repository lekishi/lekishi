import { inject } from "vitest"
import { seedReadCache } from "../lib/historical/authoring/tree"

// The record tree the run's global setup parsed and checked once.
seedReadCache(inject("historicalReads"))
