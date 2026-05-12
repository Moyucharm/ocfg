import { describe, expect, test } from "vitest"
import { parse } from "jsonc-parser"
import { applyConfigEdit, applyModelEdit, applyProviderEdit } from "../src/core/jsonc-editor.js"
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

  test("sets top-level model with path edit", () => {
    const source = `{
  // keep
  "$schema": "https://opencode.ai/config.json"
}
`
    const nextText = applyConfigEdit(doc(source), ["model"], "custom/model")

    expect(nextText).toContain("// keep")
    expect(parse(nextText).model).toBe("custom/model")
  })

  test("adds model under provider while preserving provider comments", () => {
    const source = `{
  "provider": {
    // keep provider comment
    "custom": {
      "models": {}
    }
  }
}
`
    const nextText = applyModelEdit(doc(source), "custom", "model", { limit: { context: 10, output: 2 } })

    expect(nextText).toContain("// keep provider comment")
    expect(parse(nextText).provider.custom.models.model.limit.context).toBe(10)
  })

  test("replaces provider models map while preserving outer comments", () => {
    const source = `{
  "provider": {
    // keep provider comment
    "custom": {
      "models": {
        "old": { "name": "Old" }
      }
    }
  }
}
`
    const nextText = applyConfigEdit(doc(source), ["provider", "custom", "models"], {
      old: { name: "Old" },
      fresh: { limit: { context: 10, output: 2 } },
    })

    expect(nextText).toContain("// keep provider comment")
    expect(parse(nextText).provider.custom.models.old.name).toBe("Old")
    expect(parse(nextText).provider.custom.models.fresh.limit.output).toBe(2)
  })

  test("creates valid text from empty documents", () => {
    const nextText = applyProviderEdit(
      {
        target: { scope: "project", path: "/tmp/opencode.jsonc", exists: false, format: "jsonc" },
        text: "",
        data: {},
        diagnostics: [],
      },
      "custom",
      { npm: "@ai-sdk/openai-compatible", models: {} },
    )

    expect(parse(nextText).provider.custom.npm).toBe("@ai-sdk/openai-compatible")
  })
})
