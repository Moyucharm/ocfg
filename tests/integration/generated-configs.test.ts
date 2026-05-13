import { readFile } from "node:fs/promises"
import { parse, type ParseError } from "jsonc-parser"
import { describe, expect, test } from "vitest"
import { createProviderDraftFromEndpoint } from "../../src/core/provider-generator.js"
import { validateConfig } from "../../src/core/schema-validator.js"
import type { EndpointKind } from "../../src/core/types.js"

const allowedModelFields = new Set([
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

const configSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    $schema: { type: "string" },
    provider: {
      type: "object",
      minProperties: 1,
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        properties: {
          api: { type: "string" },
          name: { type: "string" },
          env: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
          id: { type: "string" },
          npm: { type: "string" },
          whitelist: { type: "array", items: { type: "string" } },
          blacklist: { type: "array", items: { type: "string" } },
          options: {
            type: "object",
            additionalProperties: true,
            properties: {
              apiKey: { type: "string" },
              baseURL: { type: "string" },
              enterpriseUrl: { type: "string" },
              setCacheKey: { type: "boolean" },
              timeout: { oneOf: [{ type: "number" }, { const: false }] },
              chunkTimeout: { type: "number" },
            },
          },
          models: {
            type: "object",
            minProperties: 1,
            additionalProperties: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                family: { type: "string" },
                release_date: { type: "string" },
                attachment: { type: "boolean" },
                reasoning: { type: "boolean" },
                temperature: { type: "boolean" },
                tool_call: { type: "boolean" },
                interleaved: {
                  oneOf: [
                    { const: true },
                    {
                      type: "object",
                      additionalProperties: false,
                      properties: { field: { enum: ["reasoning_content", "reasoning_details"] } },
                      required: ["field"],
                    },
                  ],
                },
                cost: { type: "object", additionalProperties: true },
                limit: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    context: { type: "number" },
                    output: { type: "number" },
                    input: { type: "number" },
                  },
                  required: ["context", "output"],
                },
                modalities: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    input: { type: "array", items: { enum: ["text", "audio", "image", "video", "pdf"] } },
                    output: { type: "array", items: { enum: ["text", "audio", "image", "video", "pdf"] } },
                  },
                  required: ["input", "output"],
                },
                experimental: { type: "object", additionalProperties: true },
                status: { type: "string" },
                provider: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    npm: { type: "string" },
                    api: { type: "string" },
                  },
                },
                options: { type: "object", additionalProperties: true },
                headers: { type: "object", additionalProperties: { type: "string" } },
                variants: { type: "object", additionalProperties: { type: "object", additionalProperties: true } },
              },
            },
          },
        },
        required: ["npm", "name", "options", "models"],
      },
    },
    model: { $ref: "https://models.dev/model-schema.json#/$defs/Model" },
    small_model: { $ref: "https://models.dev/model-schema.json#/$defs/Model" },
  },
  required: ["$schema", "provider"],
}

const modelSchema = {
  $id: "https://models.dev/model-schema.json",
  $defs: {
    Model: { type: "string", pattern: "^[^/]+/.+$" },
  },
}

const fixtureCases: Array<{
  kind: EndpointKind
  fileName: string
  providerID: string
  modelID: string
  expectedNpm: string
  secretEnv: string
}> = [
  {
    kind: "openai-compatible",
    fileName: "openai-compatible.config.jsonc",
    providerID: "custom-openai",
    modelID: "gpt-5-compatible",
    expectedNpm: "@ai-sdk/openai-compatible",
    secretEnv: "CUSTOM_OPENAI_API_KEY",
  },
  {
    kind: "openai-responses",
    fileName: "openai-responses.config.jsonc",
    providerID: "openai",
    modelID: "gpt-5",
    expectedNpm: "@ai-sdk/openai",
    secretEnv: "OPENAI_API_KEY",
  },
  {
    kind: "anthropic-compatible",
    fileName: "anthropic-compatible.config.jsonc",
    providerID: "custom-claude",
    modelID: "claude-sonnet-4-5",
    expectedNpm: "@ai-sdk/anthropic",
    secretEnv: "CUSTOM_CLAUDE_API_KEY",
  },
  {
    kind: "gemini-compatible",
    fileName: "gemini-compatible.config.jsonc",
    providerID: "custom-gemini",
    modelID: "gemini-2.5-pro",
    expectedNpm: "@ai-sdk/google",
    secretEnv: "CUSTOM_GEMINI_API_KEY",
  },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

async function readFixture(fileName: string) {
  return readFile(new URL(`../fixtures/${fileName}`, import.meta.url), "utf8")
}

function parseJsonc(text: string) {
  const errors: ParseError[] = []
  const value = parse(text, errors, { allowTrailingComma: false })
  expect(errors).toEqual([])
  expect(isRecord(value)).toBe(true)
  return value as Record<string, unknown>
}

function providers(config: Record<string, unknown>) {
  expect(isRecord(config.provider)).toBe(true)
  return config.provider as Record<string, unknown>
}

function providerConfig(config: Record<string, unknown>, providerID: string) {
  const provider = providers(config)[providerID]
  expect(isRecord(provider)).toBe(true)
  return provider as Record<string, unknown>
}

function modelConfigs(provider: Record<string, unknown>) {
  expect(isRecord(provider.models)).toBe(true)
  return provider.models as Record<string, unknown>
}

function assertProviderNpm(config: Record<string, unknown>, providerID: string, expectedNpm: string) {
  expect(providerConfig(config, providerID).npm).toBe(expectedNpm)
}

function assertNoPlaintextApiKeys(config: Record<string, unknown>, sourceText = JSON.stringify(config)) {
  const secretPatterns = [/\bsk-[A-Za-z0-9_-]{8,}/i, /\bak-[A-Za-z0-9_-]{8,}/i, /Bearer\s+[A-Za-z0-9._-]{8,}/i]
  expect(secretPatterns.filter((pattern) => pattern.test(sourceText))).toEqual([])

  for (const provider of Object.values(providers(config))) {
    if (!isRecord(provider)) continue
    const options = isRecord(provider.options) ? provider.options : {}
    if (options.apiKey === undefined) continue

    expect(typeof options.apiKey).toBe("string")
    expect(/^\{(?:env:[A-Z0-9_]+|file:.+)\}$/.test(options.apiKey as string)).toBe(true)
  }
}

function assertSupportedModelFields(config: Record<string, unknown>) {
  const unsupportedFields: string[] = []
  for (const [providerID, provider] of Object.entries(providers(config))) {
    if (!isRecord(provider)) continue
    for (const [modelID, model] of Object.entries(modelConfigs(provider))) {
      if (!isRecord(model)) continue
      for (const field of Object.keys(model)) {
        if (!allowedModelFields.has(field)) unsupportedFields.push(`${providerID}/${modelID}:${field}`)
      }
    }
  }

  expect(unsupportedFields).toEqual([])
}

async function assertValidConfig(config: Record<string, unknown>) {
  const validation = await validateConfig(config, { schema: configSchema, modelSchema, relaxModelEnum: false })
  expect(validation.diagnostics).toEqual([])
  expect(validation.valid).toBe(true)
}

describe("generated provider config fixtures", () => {
  test("fixtures cover all endpoint kinds", () => {
    expect(fixtureCases.map((fixture) => fixture.kind).sort()).toEqual([
      "anthropic-compatible",
      "gemini-compatible",
      "openai-compatible",
      "openai-responses",
    ])
  })

  test.each(fixtureCases)("validates $kind fixture", async ({ fileName, providerID, modelID, expectedNpm }) => {
    const text = await readFixture(fileName)
    const config = parseJsonc(text)
    const provider = providerConfig(config, providerID)

    expect(modelConfigs(provider)[modelID]).toBeDefined()
    expect(config.model).toBe(`${providerID}/${modelID}`)
    assertProviderNpm(config, providerID, expectedNpm)
    assertNoPlaintextApiKeys(config, text)
    assertSupportedModelFields(config)
    await assertValidConfig(config)
  })

  test.each(fixtureCases)("validates generated $kind config", async ({ kind, providerID, modelID, expectedNpm, secretEnv }) => {
    const generated = await createProviderDraftFromEndpoint({
      endpointKind: kind,
      providerID,
      name: providerID,
      baseURL: "https://example.com/v1",
      apiKey: { type: "env", name: secretEnv },
      modelIDs: [modelID],
      modelsDev: { data: {} },
    })
    const config = {
      $schema: "https://opencode.ai/config.json",
      provider: {
        [providerID]: {
          npm: generated.provider.npm,
          name: generated.provider.name,
          options: generated.provider.options,
          models: generated.provider.models,
        },
      },
      model: `${providerID}/${modelID}`,
    }

    assertProviderNpm(config, providerID, expectedNpm)
    assertNoPlaintextApiKeys(config)
    assertSupportedModelFields(config)
    await assertValidConfig(config)
  })
})
