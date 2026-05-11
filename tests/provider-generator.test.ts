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
})
