import { describe, expect, test } from "vitest"
import { parse } from "jsonc-parser"
import { applyProviderEdit } from "../src/core/jsonc-editor.js"
import type { ConfigDocument } from "../src/core/types.js"

function doc(text: string): ConfigDocument {
  return {
    target: { scope: "project", path: "/tmp/opencode.jsonc", exists: true, format: "jsonc" },
    text,
    data: parse(text),
    diagnostics: [],
  }
}

describe("jsonc editor", () => {
  test("adds provider while preserving unrelated comments", () => {
    const source = `{
  // keep root comment
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    // keep old provider comment
    "old": {
      "npm": "@ai-sdk/openai-compatible",
      "models": {}
    }
  }
}
`
    const nextText = applyProviderEdit(doc(source), "new", {
      npm: "@ai-sdk/openai-compatible",
      models: {},
    })

    expect(nextText).toContain("// keep root comment")
    expect(nextText).toContain("// keep old provider comment")
    expect(nextText).toContain('"old"')
    expect(nextText).toContain('"new"')
    expect(parse(nextText).provider.new.npm).toBe("@ai-sdk/openai-compatible")
  })
})
