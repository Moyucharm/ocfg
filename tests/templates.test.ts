import { describe, expect, test } from "vitest"
import { endpointTemplates, getEndpointTemplate } from "../src/templates/index.js"

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
    }
  })

  test("does not carry hidden model capability fallbacks", () => {
    for (const template of Object.values(endpointTemplates)) {
      expect("genericModel" in template).toBe(false)
      expect("families" in template).toBe(false)
    }
  })

  test("marks all endpoints as probeable through baseURL/models", () => {
    expect(getEndpointTemplate("openai-compatible").supportsModelProbe).toBe(true)
    expect(getEndpointTemplate("openai-responses").supportsModelProbe).toBe(true)
    expect(getEndpointTemplate("anthropic-compatible").supportsModelProbe).toBe(true)
    expect(getEndpointTemplate("gemini-compatible").supportsModelProbe).toBe(true)
  })

  test("uses versioned model probe base URLs", () => {
    expect(getEndpointTemplate("anthropic-compatible").baseURLHint).toBe("https://api.anthropic.com/v1")
    expect(getEndpointTemplate("gemini-compatible").baseURLHint).toBe("https://generativelanguage.googleapis.com/v1beta")
  })

  test("keeps gemini default separate from openai-compatible proxies", () => {
    expect(getEndpointTemplate("gemini-compatible").recommendedNpm).toBe("@ai-sdk/google")
    expect(getEndpointTemplate("openai-compatible").recommendedNpm).toBe("@ai-sdk/openai-compatible")
  })

})
