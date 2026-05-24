import { describe, expect, test } from "vitest"
import { resolveModelTemplate } from "../src/core/template-resolver.js"

const modelsDevData = {
  openai: {
    id: "openai",
    name: "OpenAI",
    models: {
      "gpt-5": {
        id: "gpt-5",
        name: "GPT-5 From Models.dev",
        reasoning: true,
        tool_call: true,
        temperature: true,
        attachment: true,
        limit: { context: 400000, output: 128000 },
        modalities: { input: ["text", "image"], output: ["text"] },
        variants: {
          low: { reasoningEffort: "low" },
          high: { reasoningEffort: "high" },
        },
      },
      "gpt-5.4": {
        id: "gpt-5.4",
        name: "GPT-5.4 From Models.dev",
        reasoning: true,
        tool_call: true,
        temperature: false,
        attachment: true,
        limit: { context: 1050000, output: 128000 },
        modalities: { input: ["text", "image"], output: ["text"] },
        variants: {
          none: { reasoningEffort: "none" },
          low: { reasoningEffort: "low" },
          medium: { reasoningEffort: "medium" },
          high: { reasoningEffort: "high" },
          xhigh: { reasoningEffort: "xhigh" },
        },
      },
      "gpt-5.5": {
        id: "gpt-5.5",
        name: "GPT-5.5 From Models.dev",
        reasoning: true,
        tool_call: true,
        temperature: false,
        attachment: true,
        limit: { context: 1050000, input: 922000, output: 128000 },
        modalities: { input: ["text", "image"], output: ["text"] },
      },
    },
  },
}

describe("template resolver", () => {
  test("uses exact models.dev metadata when available", async () => {
    const result = await resolveModelTemplate({
      endpointKind: "openai-responses",
      providerID: "openai",
      modelID: "gpt-5",
      modelsDev: { data: modelsDevData as any },
    })

    expect(result.confidence).toBe("exact")
    expect(result.needsConfirmation).toBe(false)
    expect(result.model.name).toBe("GPT-5 From Models.dev")
    expect(result.model.limit?.context).toBe(400000)
    expect(result.model.variants?.low?.reasoningEffort).toBe("low")
    expect(result.sources.some((source) => source.type === "models.dev")).toBe(true)
  })

  test("matches custom providers to models.dev endpoint candidates", async () => {
    const result = await resolveModelTemplate({
      endpointKind: "openai-responses",
      providerID: "test-mimi",
      modelID: "gpt-5.4",
      modelsDev: { data: modelsDevData as any },
    })

    expect(result.confidence).toBe("exact")
    expect(result.needsConfirmation).toBe(false)
    expect(result.model.name).toBe("GPT-5.4 From Models.dev")
    expect(result.model.limit?.context).toBe(1050000)
    expect(Object.keys(result.model.variants ?? {})).toEqual(["none", "low", "medium", "high", "xhigh"])
    expect(result.sources.find((source) => source.type === "models.dev")?.type).toBe("models.dev")
  })

  test("does not fall back to family templates for unknown models", async () => {
    const result = await resolveModelTemplate({
      endpointKind: "anthropic-compatible",
      providerID: "custom-claude",
      modelID: "claude-sonnet-4-5-20250929",
      modelsDev: { data: modelsDevData as any },
    })

    expect(result.confidence).toBe("generic")
    expect(result.needsConfirmation).toBe(true)
    expect(result.model.reasoning).toBeUndefined()
    expect(result.model.modalities).toBeUndefined()
    expect(result.warnings[0]).toContain("no model limit or capabilities were guessed")
  })

  test("uses model ID as display name without guessing capabilities", async () => {
    const result = await resolveModelTemplate({
      endpointKind: "openai-responses",
      providerID: "custom-openai",
      modelID: "gpt-5-codex",
      modelsDev: { data: modelsDevData as any },
    })

    expect(result.confidence).toBe("generic")
    expect(result.model.name).toBe("GPT-5 Codex")
    expect(result.model.variants).toBeUndefined()
    expect(result.model.temperature).toBeUndefined()
  })

  test("falls back to generic endpoint template", async () => {
    const result = await resolveModelTemplate({
      endpointKind: "openai-compatible",
      providerID: "custom",
      modelID: "unknown-model",
      modelsDev: { data: modelsDevData as any },
    })

    expect(result.confidence).toBe("generic")
    expect(result.needsConfirmation).toBe(true)
    expect(result.model.name).toBe("Unknown Model")
    expect(result.model.limit).toBeUndefined()
  })

  test("does not guess token limits for unknown compatible models", async () => {
    for (const endpointKind of ["openai-compatible", "anthropic-compatible", "gemini-compatible"] as const) {
      const result = await resolveModelTemplate({
        endpointKind,
        providerID: "custom",
        modelID: `unknown-${endpointKind}`,
        modelsDev: { data: modelsDevData as any },
      })

      expect(result.confidence).toBe("generic")
      expect(result.model.limit).toBeUndefined()
      expect(result.model.reasoning).toBeUndefined()
      expect(result.model.tool_call).toBeUndefined()
      expect(result.model.temperature).toBeUndefined()
      expect(result.warnings[0]).toContain("no model limit or capabilities were guessed")
    }
  })

  test("only writes GPT-5 metadata when models.dev has that exact model", async () => {
    for (const modelID of ["gpt-5-codex", "gpt-5-mini"]) {
      const result = await resolveModelTemplate({
        endpointKind: "openai-compatible",
        providerID: "custom-openai",
        modelID,
        modelsDev: { data: modelsDevData as any },
      })

      expect(result.confidence).toBe("generic")
      expect(result.model.limit).toBeUndefined()
      expect(result.model.variants).toBeUndefined()
    }
  })

  test("uses models.dev metadata for GPT model-name aliases", async () => {
    for (const modelID of ["gpt5.5", "gpt-5.5", "openai/gpt-5.5"]) {
      const result = await resolveModelTemplate({
        endpointKind: "openai-compatible",
        providerID: "123456",
        modelID,
        modelsDev: { data: modelsDevData as any },
      })

      expect(result.confidence).toBe("exact")
      expect(result.needsConfirmation).toBe(false)
      expect(result.model.name).toBe("GPT-5.5 From Models.dev")
      expect(result.model.limit).toEqual({ context: 1050000, input: 922000, output: 128000 })
    }
  })

  test("does not use provider suffixes to find metadata", async () => {
    const result = await resolveModelTemplate({
      endpointKind: "openai-compatible",
      providerID: "shenye",
      modelID: "gpt-5.5-shenye",
      modelsDev: { data: modelsDevData as any },
    })

    expect(result.confidence).toBe("generic")
    expect(result.model.limit).toBeUndefined()
    expect(result.warnings[0]).toContain("no model limit or capabilities were guessed")
  })

  test("manual draft overrides automatic metadata", async () => {
    const result = await resolveModelTemplate({
      endpointKind: "openai-responses",
      providerID: "openai",
      modelID: "gpt-5",
      manual: { limit: { context: 123, output: 456 }, name: "Manual Name" },
      modelsDev: { data: modelsDevData as any },
    })

    expect(result.confidence).toBe("manual")
    expect(result.needsConfirmation).toBe(false)
    expect(result.model.name).toBe("Manual Name")
    expect(result.model.limit).toEqual({ context: 123, output: 456 })
  })

  test("does not emit unsupported fields", async () => {
    const result = await resolveModelTemplate({
      endpointKind: "gemini-compatible",
      providerID: "google",
      modelID: "gemini-3-pro-preview",
      modelsDev: { data: modelsDevData as any },
    })
    expect(Object.keys(result.model)).not.toContain("vision")
  })
})
