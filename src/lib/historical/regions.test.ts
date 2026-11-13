import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { schemaFile } from "./authoring/tree"
import { REGIONS } from "./regions"

describe("chapter regions", () => {
  it("names exactly the regions the manifest schema accepts, in drawing order", () => {
    const schema = JSON.parse(readFileSync(schemaFile("chapter"), "utf8")) as {
      properties: { region: { enum: string[] } }
    }

    expect(REGIONS.map((region) => region.key)).toEqual(schema.properties.region.enum)
  })
})
