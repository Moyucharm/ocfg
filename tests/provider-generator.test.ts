import { describe, expect, test } from "vitest"
import { validateConfig } from "../src/core/schema-validator.js"
import { createProviderDraftFromEndpoint } from "../src/core/provider-generator.js"
import type { EndpointKind } from "../src/core/types.js"

const configSchema = {
  type: "object",
  properties: {
    $schema: { type: "string" },
    provider: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          npm: { type: "string" },
          name: { type: "string" },
          options: { type: "object" },
          models: { type: "object" },
        },
        required: ["npm", "name", "options", "models"],
      },
    },
  },
  required: ["$schema", "provider"],
}

const modelSchema = { $id: "https://models.dev/model-schema.json", $defs: { Model: { type: "string" } } }

const cases: Array<{ kind: EndpointKind; providerID: string; modelID: string; npm: string }> = [
  { kind: "openai-compatible", providerID: "custom-openai", modelID: "gpt-5-compatible", npm: "@ai-sdk/openai-compatible" },
  { kind: "openai-responses", providerID: "openai", modelID: "gpt-5", npm: "@ai-sdk/openai" },
  { kind: "anthropic-compatible", providerID: "custom-claude", modelID: "claude-sonnet-4-5", npm: "@ai-sdk/anthropic" },
  { kind: "gemini-compatible", providerID: "custom-gemini", modelID: "gemini-2.5-pro", npm: "@ai-sdk/google" },
]

describe("provider generator", () => {
  test.each(cases)("generates valid provider config for $kind", async ({ kind, providerID, modelID, npm }) => {
    const result = await createProviderDraftFromEndpoint({
      endpointKind: kind,
      providerID,
      name: providerID,
      baseURL: "https://example.com/v1",
      apiKey: { type: "env", name: "CUSTOM_API_KEY" },
      modelIDs: [modelID],
      modelsDev: { data: {} },
    })

    const config = {
      $schema: "https://opencode.ai/config.json",
      provider: {
        [providerID]: {
          npm: result.provider.npm,
          name: result.provider.name,
          options: result.provider.options,
          models: result.provider.models,
        },
      },
    }

    expect(result.provider.npm).toBe(npm)
    expect(result.provider.options.apiKey).toBe("{env:CUSTOM_API_KEY}")
    expect(JSON.stringify(config)).not.toContain("vision")
    expect(config.provider[providerID].models[modelID]).toBeDefined()
    expect(config.provider[providerID].models[modelID].limit).toBeDefined()
    const validation = await validateConfig(config, { schema: configSchema, modelSchema })
    expect(validation.valid).toBe(true)
  })

  test("tracks whether generated model capabilities need confirmation", async () => {
    const result = await createProviderDraftFromEndpoint({
      endpointKind: "openai-compatible",
      providerID: "custom",
      name: "Custom",
      apiKey: { type: "file", path: "~/.secrets/custom" },
      modelIDs: ["unknown-model"],
      modelsDev: { data: {} },
    })

    expect(result.provider.options.apiKey).toBe("{file:~/.secrets/custom}")
    expect(result.modelConfirmations["unknown-model"]).toBe(true)
  })

  test("keeps generated GPT model display names distinct", async () => {
    const result = await createProviderDraftFromEndpoint({
      endpointKind: "openai-responses",
      providerID: "custom-openai",
      name: "Custom OpenAI",
      apiKey: { type: "file", path: "~/.secrets/custom-openai" },
      modelIDs: ["gpt-5.2", "gpt-5.3-codex", "gpt-5.4"],
      modelsDev: { data: {} },
    })

    expect(result.provider.models["gpt-5.2"].name).toBe("GPT-5.2")
    expect(result.provider.models["gpt-5.3-codex"].name).toBe("GPT-5.3 Codex")
    expect(result.provider.models["gpt-5.4"].name).toBe("GPT-5.4")
    expect(Object.keys(result.provider.models["gpt-5.4"].variants ?? {})).toEqual(["none", "low", "medium", "high", "xhigh"])
  })

  test("uses models.dev metadata for custom provider model capabilities", async () => {
    const result = await createProviderDraftFromEndpoint({
      endpointKind: "openai-responses",
      providerID: "test-mimi",
      name: "Test Mimi",
      apiKey: { type: "file", path: "~/.secrets/test-mimi" },
      modelIDs: ["gpt-5.4"],
      modelsDev: {
        data: {
          openai: {
            id: "openai",
            name: "OpenAI",
            models: {
              "gpt-5.4": {
                id: "gpt-5.4",
                name: "GPT-5.4 From Models.dev",
                limit: { context: 1050000, output: 128000 },
                modalities: { input: ["text", "image"], output: ["text"] },
                reasoning: true,
                tool_call: true,
                temperature: false,
                variants: { low: { reasoningEffort: "low" }, high: { reasoningEffort: "high" } },
              },
            },
          },
        } as any,
      },
    })

    expect(result.modelConfirmations["gpt-5.4"]).toBe(false)
    expect(result.provider.models["gpt-5.4"].name).toBe("GPT-5.4 From Models.dev")
    expect(result.provider.models["gpt-5.4"].limit?.context).toBe(1050000)
    expect(result.provider.models["gpt-5.4"].variants?.low?.reasoningEffort).toBe("low")
    expect(result.modelResolutions["gpt-5.4"].sources.some((source) => source.type === "models.dev")).toBe(true)
  })

  test("uses openai-compatible npm for explicitly selected gemini proxy", async () => {
    const result = await createProviderDraftFromEndpoint({
      endpointKind: "openai-compatible",
      providerID: "gemini-proxy",
      name: "Gemini Proxy",
      apiKey: { type: "env", name: "GEMINI_PROXY_API_KEY" },
      modelIDs: ["gemini-2.5-pro"],
      modelsDev: { data: {} },
    })

    expect(result.provider.npm).toBe("@ai-sdk/openai-compatible")
    expect(result.provider.models["gemini-2.5-pro"]).toBeDefined()
  })

  test("allows callers to override setCacheKey defaults", async () => {
    const result = await createProviderDraftFromEndpoint({
      endpointKind: "openai-compatible",
      providerID: "custom",
      name: "Custom",
      apiKey: { type: "env", name: "CUSTOM_API_KEY" },
      modelIDs: ["model"],
      setCacheKey: false,
      modelsDev: { data: {} },
    })

    expect(result.provider.options.setCacheKey).toBeUndefined()
  })
})
