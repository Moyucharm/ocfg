import { describe, expect, test } from "vitest"
import { runDoctor } from "../src/core/doctor.js"
import type { ConfigDocument } from "../src/core/types.js"

function doc(data: Record<string, unknown>): ConfigDocument {
  return {
    target: { scope: "project", path: "/tmp/opencode.jsonc", exists: true, format: "jsonc" },
    text: "",
    data,
    diagnostics: [],
  }
}

describe("doctor", () => {
  test("notes provider references that are not defined locally", () => {
    const diagnostics = runDoctor(doc({ model: "missing/model" }))
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.severity === "low" && diagnostic.message.includes('provider "missing" that is not defined'),
      ),
    ).toBe(true)
  })

  test("reports missing default model", () => {
    const diagnostics = runDoctor(
      doc({
        model: "p/missing",
        provider: { p: { models: { other: {} } } },
      }),
    )
    expect(diagnostics.some((diagnostic) => diagnostic.message.includes('missing model "p/missing"'))).toBe(true)
  })

  test("warns on plaintext api keys", () => {
    const diagnostics = runDoctor(
      doc({
        provider: { p: { options: { apiKey: "sk-test123456789012345678901234567890" }, models: { m: {} } } },
      }),
    )
    expect(diagnostics.some((diagnostic) => diagnostic.path === "/provider/p/options/apiKey")).toBe(true)
  })

  test("warns when model limit is missing", () => {
    const diagnostics = runDoctor(doc({ provider: { p: { models: { m: {} } } } }))
    expect(diagnostics.some((diagnostic) => diagnostic.path === "/provider/p/models/m/limit")).toBe(true)
  })

  test("warns when model family appears mismatched with provider npm", () => {
    const diagnostics = runDoctor(
      doc({
        provider: {
          p: {
            npm: "@ai-sdk/openai-compatible",
            models: { "claude-sonnet-4-5": { limit: { context: 1, output: 1 } } },
          },
        },
      }),
    )
    expect(diagnostics.some((diagnostic) => diagnostic.message.includes("may expect @ai-sdk/anthropic"))).toBe(true)
  })

  test("warns when gemini model appears mismatched with provider npm", () => {
    const diagnostics = runDoctor(
      doc({
        provider: {
          p: {
            npm: "@ai-sdk/anthropic",
            models: { "gemini-2.5-pro": { limit: { context: 1, output: 1 } } },
          },
        },
      }),
    )
    expect(diagnostics.some((diagnostic) => diagnostic.message.includes("may expect @ai-sdk/google"))).toBe(true)
  })

  test("does not warn when model family matches provider npm", () => {
    const diagnostics = runDoctor(
      doc({
        provider: {
          p: {
            npm: "@ai-sdk/anthropic",
            models: { "claude-sonnet-4-5": { limit: { context: 1, output: 1 } } },
          },
        },
      }),
    )
    expect(diagnostics.some((diagnostic) => diagnostic.message.includes("may expect"))).toBe(false)
  })
})
