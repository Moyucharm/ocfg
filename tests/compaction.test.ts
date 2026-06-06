import { describe, expect, test } from "vitest"
import { parse } from "jsonc-parser"
import { applyCompactionSettings, applyCompactionText, defaultCompactionSettings, readCompactionSettings } from "../src/core/compaction.js"
import type { ConfigDocument } from "../src/core/types.js"

function doc(text: string, exists = true): ConfigDocument {
  return {
    target: { scope: "project", path: "/tmp/opencode.jsonc", exists, format: "jsonc" },
    text,
    data: text ? parse(text) as Record<string, unknown> : { $schema: "https://opencode.ai/config.json" },
    diagnostics: [],
  }
}

describe("compaction config helpers", () => {
  test("reads documented defaults when compaction is missing", () => {
    expect(readCompactionSettings({})).toEqual(defaultCompactionSettings)
  })

  test("applies settings without mutating input and preserves extra compaction fields", () => {
    const input = { compaction: { tail_turns: 3 } }

    const next = applyCompactionSettings(input, { auto: false, prune: true, reserved: 0 })

    expect(input).toEqual({ compaction: { tail_turns: 3 } })
    expect(next.$schema).toBe("https://opencode.ai/config.json")
    expect(next.compaction).toEqual({ tail_turns: 3, auto: false, prune: true, reserved: 0 })
  })

  test("writes compaction while preserving JSONC comments", () => {
    const document = doc(`{
  // keep root comment
  "compaction": {
    // keep compaction comment
    "tail_turns": 2
  }
}
`)
    const nextConfig = applyCompactionSettings(document.data, { auto: false, prune: true, reserved: 12000 })
    const nextText = applyCompactionText(document, nextConfig)
    const parsed = parse(nextText)

    expect(nextText).toContain("// keep root comment")
    expect(nextText).toContain("// keep compaction comment")
    expect(parsed.compaction).toEqual({ tail_turns: 2, auto: false, prune: true, reserved: 12000 })
  })

  test("replaces malformed compaction values with an object", () => {
    const document = doc(`{
  "compaction": false
}
`)
    const nextConfig = applyCompactionSettings(document.data, { auto: true, prune: true, reserved: 10000 })
    const nextText = applyCompactionText(document, nextConfig)

    expect(parse(nextText).compaction).toEqual({ auto: true, prune: true, reserved: 10000 })
  })

  test("creates missing config text with schema and compaction", () => {
    const document = doc("", false)
    const nextConfig = applyCompactionSettings(document.data, { auto: true, prune: false, reserved: 10000 })
    const nextText = applyCompactionText(document, nextConfig)
    const parsed = parse(nextText)

    expect(parsed.$schema).toBe("https://opencode.ai/config.json")
    expect(parsed.compaction).toEqual({ auto: true, prune: false, reserved: 10000 })
  })

  test("requires reserved to be a non-negative integer", () => {
    expect(() => applyCompactionSettings({}, { auto: true, prune: false, reserved: -1 })).toThrow("non-negative integer")
    expect(() => applyCompactionSettings({}, { auto: true, prune: false, reserved: 1.5 })).toThrow("non-negative integer")
  })
})
