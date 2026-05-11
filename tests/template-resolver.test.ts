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
  })

  test("falls back to family template", async () => {
    const result = await resolveModelTemplate({
      endpointKind: "anthropic-compatible",
      providerID: "custom-claude",
      modelID: "claude-sonnet-4-5-20250929",
      modelsDev: { data: modelsDevData as any },
    })

    expect(result.confidence).toBe("family")
    expect(result.needsConfirmation).toBe(true)
    expect(result.model.reasoning).toBe(true)
    expect(result.model.modalities?.input).toContain("pdf")
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
    expect(result.model.limit?.context).toBe(128000)
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
