import { describe, expect, test } from "vitest"
import { endpointTemplates, getEndpointTemplate, matchFamilyTemplate } from "../src/templates/index.js"

describe("endpoint templates", () => {
  test("defines all endpoint kinds", () => {
    expect(Object.keys(endpointTemplates).sort()).toEqual([
      "anthropic-compatible",
      "gemini-compatible",
      "openai-compatible",
      "openai-responses",
    ])
  })

  test("uses expected npm packages", () => {
    expect(getEndpointTemplate("openai-compatible").recommendedNpm).toBe("@ai-sdk/openai-compatible")
    expect(getEndpointTemplate("openai-responses").recommendedNpm).toBe("@ai-sdk/openai")
    expect(getEndpointTemplate("anthropic-compatible").recommendedNpm).toBe("@ai-sdk/anthropic")
    expect(getEndpointTemplate("gemini-compatible").recommendedNpm).toBe("@ai-sdk/google")
  })

  test("provides complete descriptor metadata", () => {
    for (const template of Object.values(endpointTemplates)) {
      expect(template.label.length).toBeGreaterThan(0)
      expect(template.recommendedNpm.length).toBeGreaterThan(0)
      expect(template.genericModel.limit).toBeDefined()
      expect(template.genericModel.modalities?.input.length).toBeGreaterThan(0)
      expect(template.genericModel.modalities?.output.length).toBeGreaterThan(0)
    }
  })

  test("marks only openai-compatible as probeable for now", () => {
    expect(getEndpointTemplate("openai-compatible").supportsModelProbe).toBe(true)
    expect(getEndpointTemplate("openai-responses").supportsModelProbe).toBe(false)
    expect(getEndpointTemplate("anthropic-compatible").supportsModelProbe).toBe(false)
    expect(getEndpointTemplate("gemini-compatible").supportsModelProbe).toBe(false)
  })

  test("keeps gemini default separate from openai-compatible proxies", () => {
    expect(getEndpointTemplate("gemini-compatible").recommendedNpm).toBe("@ai-sdk/google")
    expect(getEndpointTemplate("openai-compatible").recommendedNpm).toBe("@ai-sdk/openai-compatible")
  })

  test("matches family templates", () => {
    expect(matchFamilyTemplate(getEndpointTemplate("anthropic-compatible"), "claude-sonnet-4-5-20250929")?.family).toBe(
      "claude-sonnet-4",
    )
    expect(matchFamilyTemplate(getEndpointTemplate("gemini-compatible"), "gemini-2.5-pro")?.family).toBe("gemini-2.5")
  })

  test("templates only emit schema-supported model fields", () => {
    const allowed = new Set([
      "id",
      "name",
      "family",
      "release_date",
      "attachment",
      "reasoning",
      "temperature",
      "tool_call",
      "interleaved",
      "cost",
      "limit",
      "modalities",
      "experimental",
      "status",
      "provider",
      "options",
      "headers",
      "variants",
    ])

    for (const template of Object.values(endpointTemplates)) {
      for (const model of [template.genericModel, ...template.families.map((family) => family.model)]) {
        expect(Object.keys(model).every((key) => allowed.has(key))).toBe(true)
      }
    }
  })
})
