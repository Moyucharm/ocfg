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
  { kind: "openai-compatible", providerID: "custom-openai", modelID: "gpt-5", npm: "@ai-sdk/openai-compatible" },
  { kind: "openai-responses", providerID: "openai", modelID: "gpt-5", npm: "@ai-sdk/openai" },
  { kind: "anthropic-compatible", providerID: "custom-claude", modelID: "claude-sonnet-4-5", npm: "@ai-sdk/anthropic" },
  { kind: "gemini-compatible", providerID: "custom-gemini", modelID: "gemini-2.5-pro", npm: "@ai-sdk/google" },
]

describe("provider generator", () => {
  const modelData = {
    openai: {
      id: "openai",
      name: "OpenAI",
      models: {
        "gpt-5": { id: "gpt-5", name: "GPT-5", limit: { context: 400000, output: 128000 } },
      },
    },
    anthropic: {
      id: "anthropic",
      name: "Anthropic",
      models: {
        "claude-sonnet-4-5": { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", limit: { context: 200000, output: 64000 } },
      },
    },
    google: {
      id: "google",
      name: "Google",
      models: {
        "gemini-2.5-pro": { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", limit: { context: 1000000, output: 65536 } },
      },
    },
  }

  test.each(cases)("generates valid provider config for $kind", async ({ kind, providerID, modelID, npm }) => {
    const result = await createProviderDraftFromEndpoint({
      endpointKind: kind,
      providerID,
      name: providerID,
      baseURL: "https://example.com/v1",
      apiKey: { type: "env", name: "CUSTOM_API_KEY" },
      modelIDs: [modelID],
      modelsDev: { data: modelData as any },
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
    expect(result.warnings).toEqual([])
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
      modelIDs: ["gpt-5", "gpt-5-codex", "gpt5.5"],
      modelsDev: { data: {} },
    })

    expect(result.provider.models["gpt-5"].name).toBe("GPT-5")
    expect(result.provider.models["gpt-5-codex"].name).toBe("GPT-5 Codex")
    expect(result.provider.models["gpt5.5"].name).toBe("GPT-5.5")
    expect(result.provider.models["gpt-5-codex"].variants).toBeUndefined()
    expect(result.provider.models["gpt5.5"].variants).toBeUndefined()
  })

  test("uses models.dev metadata for normalized model names", async () => {
    const result = await createProviderDraftFromEndpoint({
      endpointKind: "openai-compatible",
      providerID: "123456",
      name: "Custom",
      apiKey: { type: "file", path: "~/.secrets/shenye" },
      modelIDs: ["gpt5.5"],
      modelsDev: {
        data: {
          openai: {
            id: "openai",
            name: "OpenAI",
            models: {
              "gpt-5.5": {
                id: "gpt-5.5",
                name: "GPT-5.5 From Models.dev",
                limit: { context: 1050000, input: 922000, output: 128000 },
                modalities: { input: ["text", "image"], output: ["text"] },
                reasoning: true,
                tool_call: true,
                temperature: false,
              },
            },
          },
        } as any,
      },
    })

    expect(result.modelConfirmations["gpt5.5"]).toBe(false)
    expect(result.provider.models["gpt5.5"].name).toBe("GPT-5.5 From Models.dev")
    expect(result.provider.models["gpt5.5"].limit).toEqual({ context: 1050000, input: 922000, output: 128000 })
  })

  test("does not use provider suffixes as model aliases", async () => {
    const result = await createProviderDraftFromEndpoint({
      endpointKind: "openai-compatible",
      providerID: "shenye",
      name: "Shenye",
      apiKey: { type: "file", path: "~/.secrets/shenye" },
      modelIDs: ["gpt5.5-shenye"],
      modelsDev: {
        data: {
          openai: {
            id: "openai",
            name: "OpenAI",
            models: {
              "gpt-5.5": {
                id: "gpt-5.5",
                name: "GPT-5.5 From Models.dev",
                limit: { context: 1050000, input: 922000, output: 128000 },
              },
            },
          },
        } as any,
      },
    })

    expect(result.modelConfirmations["gpt5.5-shenye"]).toBe(true)
    expect(result.provider.models["gpt5.5-shenye"].limit).toBeUndefined()
    expect(result.warnings[0]).toContain("no model limit or capabilities were guessed")
  })

  test("does not write guessed token limits for unknown models", async () => {
    const result = await createProviderDraftFromEndpoint({
      endpointKind: "openai-compatible",
      providerID: "custom",
      name: "Custom",
      apiKey: { type: "env", name: "CUSTOM_API_KEY" },
      modelIDs: ["unknown-model"],
      modelsDev: { data: {} },
    })

    expect(result.provider.models["unknown-model"].limit).toBeUndefined()
    expect(result.provider.models["unknown-model"].reasoning).toBeUndefined()
    expect(result.provider.models["unknown-model"].tool_call).toBeUndefined()
    expect(result.provider.models["unknown-model"].temperature).toBeUndefined()
    expect(result.warnings[0]).toContain("no model limit or capabilities were guessed")
  })

  test("uses the first matching metadata when multiple models match", async () => {
    const result = await createProviderDraftFromEndpoint({
      endpointKind: "openai-compatible",
      providerID: "custom",
      name: "Custom",
      apiKey: { type: "env", name: "CUSTOM_API_KEY" },
      modelIDs: ["shared-model"],
      modelsDev: {
        data: {
          first: { id: "first", name: "First", models: { "shared-model": { id: "shared-model", name: "First Shared", limit: { context: 1, output: 1 } } } },
          second: { id: "second", name: "Second", models: { "shared-model": { id: "shared-model", name: "Second Shared", limit: { context: 2, output: 2 } } } },
        } as any,
      },
    })

    expect(result.modelConfirmations["shared-model"]).toBe(false)
    expect(result.provider.models["shared-model"].name).toBe("First Shared")
    expect(result.provider.models["shared-model"].limit).toEqual({ context: 1, output: 1 })
    expect(result.warnings).toEqual([])
  })

  test("matches capabilities globally without endpoint provider prefixes", async () => {
    const result = await createProviderDraftFromEndpoint({
      endpointKind: "openai-compatible",
      providerID: "custom-openai-proxy",
      name: "Custom OpenAI Proxy",
      apiKey: { type: "env", name: "CUSTOM_API_KEY" },
      modelIDs: ["deepseek-v4-flash"],
      modelsDev: {
        data: {
          deepseek: {
            id: "deepseek",
            name: "DeepSeek",
            models: {
              "deepseek-v4-flash": {
                id: "deepseek-v4-flash",
                name: "DeepSeek V4 Flash",
                limit: { context: 256000, output: 64000 },
                reasoning: true,
                tool_call: true,
                temperature: true,
              },
            },
          },
        } as any,
      },
    })

    expect(result.modelConfirmations["deepseek-v4-flash"]).toBe(false)
    expect(result.provider.models["deepseek-v4-flash"].name).toBe("DeepSeek V4 Flash")
    expect(result.provider.models["deepseek-v4-flash"].limit).toEqual({ context: 256000, output: 64000 })
    expect(result.modelResolutions["deepseek-v4-flash"].sources.find((source) => source.type === "models.dev")?.providerID).toBe("deepseek")
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
