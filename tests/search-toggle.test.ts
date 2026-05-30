import { describe, expect, test } from "vitest"
import { enableExaSearchPermissions, hasExaSearchPermissions, isExaSearchEnabled, isExaSearchEnvEnabled } from "../src/core/search-toggle.js"

describe("Exa search toggle", () => {
  test("treats missing or false-ish env values as disabled", () => {
    expect(isExaSearchEnvEnabled(undefined)).toBe(false)
    expect(isExaSearchEnvEnabled("")).toBe(false)
    expect(isExaSearchEnvEnabled("0")).toBe(false)
    expect(isExaSearchEnvEnabled("false")).toBe(false)
  })

  test("accepts common true env values", () => {
    expect(isExaSearchEnvEnabled("1")).toBe(true)
    expect(isExaSearchEnvEnabled("true")).toBe(true)
    expect(isExaSearchEnvEnabled("YES")).toBe(true)
    expect(isExaSearchEnvEnabled("on")).toBe(true)
  })

  test("adds websearch and webfetch permissions to missing permission object", () => {
    const next = enableExaSearchPermissions({ $schema: "https://opencode.ai/config.json" })

    expect(next).toEqual({
      $schema: "https://opencode.ai/config.json",
      permission: {
        websearch: "allow",
        webfetch: "allow",
      },
    })
    expect(hasExaSearchPermissions(next)).toBe(true)
  })

  test("preserves existing permission entries", () => {
    const next = enableExaSearchPermissions({ permission: { edit: "deny", bash: { "git *": "allow" } } })

    expect(next.permission).toEqual({
      edit: "deny",
      bash: { "git *": "allow" },
      websearch: "allow",
      webfetch: "allow",
    })
  })

  test("keeps top-level allow unchanged", () => {
    const config = { permission: "allow" }

    expect(enableExaSearchPermissions(config)).toBe(config)
    expect(hasExaSearchPermissions(config)).toBe(true)
    expect(isExaSearchEnabled(config, "1")).toBe(true)
  })

  test("blocks unsafe top-level ask or deny strings", () => {
    expect(() => enableExaSearchPermissions({ permission: "ask" })).toThrow("Cannot safely enable websearch")
    expect(() => enableExaSearchPermissions({ permission: "deny" })).toThrow("Cannot safely enable websearch")
  })
})
