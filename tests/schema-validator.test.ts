import { describe, expect, test } from "vitest"
import { validateConfig } from "../src/core/schema-validator.js"

const schema = {
  type: "object",
  properties: {
    provider: { type: "object" },
    model: { $ref: "https://models.dev/model-schema.json#/$defs/Model" },
  },
  additionalProperties: false,
}

const modelSchema = {
  $id: "https://models.dev/model-schema.json",
  $defs: {
    Model: { type: "string" },
  },
}

describe("schema validator", () => {
  test("accepts valid configs", async () => {
    const result = await validateConfig({ model: "a/b" }, { schema, modelSchema })
    expect(result.valid).toBe(true)
    expect(result.diagnostics).toEqual([])
  })

  test("returns schema diagnostics", async () => {
    const result = await validateConfig({ unknown: true }, { schema, modelSchema })
    expect(result.valid).toBe(false)
    expect(result.diagnostics[0]?.source).toBe("schema")
    expect(result.diagnostics[0]?.severity).toBe("high")
  })
})
