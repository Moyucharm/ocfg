import { describe, expect, test } from "vitest"
import { clearModelsDevCache, findModelsDevModel, findModelsDevModelBySuffix, loadModelsDev, lookupModelsDevModelBySuffix, modelsDevToModelDraft } from "../src/core/models-dev.js"

function fakeFetch(data: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(data), { status: 200 })) as typeof fetch
}

const data = {
  openai: {
    id: "openai",
    name: "OpenAI",
    models: {
      "gpt-5": {
        id: "gpt-5",
        name: "GPT-5",
        family: "gpt-5",
        release_date: "2026-01-01",
        reasoning: true,
        temperature: true,
        tool_call: true,
        attachment: true,
        interleaved: { field: "reasoning_content" },
        limit: { context: 400000, output: 128000 },
        modalities: { input: ["text", "image"], output: ["text"] },
        headers: { "OpenAI-Beta": "test" },
        reasoning_options: [{ type: "effort", values: ["low", "high"] }],
        variants: {
          low: { reasoningEffort: "low" },
          high: { reasoningEffort: "high" },
        },
      },
      "gpt-5.5": {
        id: "gpt-5.5",
        name: "GPT-5.5",
        reasoning: true,
        temperature: false,
        tool_call: true,
        attachment: true,
        limit: { context: 1050000, input: 922000, output: 128000 },
        modalities: { input: ["text", "image"], output: ["text"] },
      },
      "gpt-5.5-pro": {
        id: "gpt-5.5-pro",
        name: "GPT-5.5 Pro",
        reasoning: true,
        temperature: false,
        tool_call: true,
        attachment: true,
        limit: { context: 1050000, input: 922000, output: 128000 },
        modalities: { input: ["text", "image"], output: ["text"] },
      },
      "qwen-3.6-plus": {
        id: "qwen-3.6-plus",
        name: "Qwen3.6 Plus",
        reasoning: true,
        temperature: true,
        tool_call: true,
        limit: { context: 1000000, output: 65536 },
        modalities: { input: ["text"], output: ["text"] },
      },
      "deepseek-v3.2": {
        id: "deepseek-v3.2",
        name: "DeepSeek V3.2",
        reasoning: true,
        temperature: true,
        tool_call: true,
        limit: { context: 163840, output: 65536 },
        modalities: { input: ["text"], output: ["text"] },
      },
      "glm-4.6": {
        id: "glm-4.6",
        name: "GLM-4.6",
        reasoning: true,
        temperature: true,
        tool_call: true,
        limit: { context: 204800, output: 131072 },
        modalities: { input: ["text"], output: ["text"] },
      },
      "kimi-k2.5": {
        id: "kimi-k2.5",
        name: "Kimi K2.5",
        reasoning: true,
        temperature: true,
        tool_call: true,
        limit: { context: 262144, output: 262144 },
        modalities: { input: ["text"], output: ["text"] },
      },
    },
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    models: {
      "claude-test": {
        id: "claude-test",
        name: "Claude Test",
      },
    },
  },
}

describe("models.dev", () => {
  test("loads data with injected fetch", async () => {
    clearModelsDevCache()
    const loaded = await loadModelsDev({ fetchImpl: fakeFetch(data) })
    expect(loaded.openai?.models["gpt-5"]?.name).toBe("GPT-5")
  })

  test("passes timeout signal when fetching metadata", async () => {
    clearModelsDevCache()
    let signal: AbortSignal | null | undefined
    const fetchImpl = (async (_url, init) => {
      signal = init?.signal
      return new Response(JSON.stringify(data), { status: 200 })
    }) as typeof fetch

    await loadModelsDev({ fetchImpl, timeoutMs: 123 })
    expect(signal).toBeInstanceOf(AbortSignal)
  })

  test("finds provider/model references", async () => {
    const model = await findModelsDevModel("openai/gpt-5", { data })
    expect(model?.name).toBe("GPT-5")
  })

  test("returns undefined for unknown refs", async () => {
    expect(await findModelsDevModel("missing/model", { data })).toBeUndefined()
  })

  test("finds model metadata through global suffix lookup", async () => {
    const match = await findModelsDevModelBySuffix({
      modelID: "gpt-5",
      options: { data },
    })

    expect(match?.providerID).toBe("openai")
    expect(match?.confidence).toBe("model-suffix")
  })

  test("matches normalized model names without relying on custom provider IDs", async () => {
    const match = await findModelsDevModelBySuffix({
      modelID: "gpt5.5",
      options: { data },
    })

    expect(match?.providerID).toBe("openai")
    expect(match?.modelID).toBe("gpt-5.5")
    expect(match?.confidence).toBe("model-suffix")
    expect(match?.model.limit?.context).toBe(1050000)
  })

  test("strips model namespace prefixes before matching model names", async () => {
    const match = await findModelsDevModelBySuffix({
      modelID: "openai/gpt-5.5",
      options: { data },
    })

    expect(match?.providerID).toBe("openai")
    expect(match?.modelID).toBe("gpt-5.5")
    expect(match?.model.name).toBe("GPT-5.5")
  })

  test("does not treat custom provider suffixes as model aliases", async () => {
    const match = await findModelsDevModelBySuffix({
      modelID: "gpt-5.5-custom",
      options: { data },
    })

    expect(match).toBeUndefined()
  })

  test("does not match a base model name to a suffixed model", async () => {
    const match = await findModelsDevModelBySuffix({
      modelID: "gpt-5.5",
      options: {
        data: {
          openai: {
            id: "openai",
            name: "OpenAI",
            models: {
              "gpt-5.5-mini": {
                id: "gpt-5.5-mini",
                name: "GPT-5.5 Mini",
                limit: { context: 1000, output: 1000 },
              },
            },
          },
        } as any,
      },
    })

    expect(match).toBeUndefined()
  })

  test("does not use display names to collapse model suffixes", async () => {
    const match = await findModelsDevModelBySuffix({
      modelID: "gpt-5.5",
      options: {
        data: {
          openai: {
            id: "openai",
            name: "OpenAI",
            models: {
              "gpt-5.5-mini": {
                id: "gpt-5.5-mini",
                name: "GPT-5.5",
                limit: { context: 1000, output: 1000 },
              },
            },
          },
        } as any,
      },
    })

    expect(match).toBeUndefined()
  })

  test("does not match a suffixed model name to a base model", async () => {
    const match = await findModelsDevModelBySuffix({
      modelID: "gpt-5.5-mini",
      options: {
        data: {
          openai: {
            id: "openai",
            name: "OpenAI",
            models: {
              "gpt-5.5": {
                id: "gpt-5.5",
                name: "GPT-5.5",
                limit: { context: 1000, output: 1000 },
              },
            },
          },
        } as any,
      },
    })

    expect(match).toBeUndefined()
  })

  test("does not collapse official model suffixes", async () => {
    const match = await findModelsDevModelBySuffix({
      modelID: "gpt-5.5-pro",
      options: { data },
    })

    expect(match?.modelID).toBe("gpt-5.5-pro")
    expect(match?.model.name).toBe("GPT-5.5 Pro")
  })

  test("normalizes common domestic model name separators", async () => {
    for (const [modelID, expected] of [
      ["qwen3.6-plus", "qwen-3.6-plus"],
      ["qwen-3-6-plus", "qwen-3.6-plus"],
      ["deepseek-v3.2", "deepseek-v3.2"],
      ["glm4.6", "glm-4.6"],
      ["kimi-k2.5", "kimi-k2.5"],
    ] as const) {
      const match = await findModelsDevModelBySuffix({
        modelID,
        options: { data },
      })

      expect(match?.providerID).toBe("openai")
      expect(match?.modelID).toBe(expected)
      expect(match?.model.limit).toBeDefined()
    }
  })

  test("matches model IDs across all providers", async () => {
    const match = await findModelsDevModelBySuffix({
      modelID: "claude-test",
      options: { data },
    })

    expect(match?.providerID).toBe("anthropic")
    expect(match?.confidence).toBe("model-suffix")
  })

  test("uses the first suffix match when multiple models match", async () => {
    const result = await lookupModelsDevModelBySuffix({
      modelID: "shared-model",
      options: {
        data: {
          first: { id: "first", name: "First", models: { "shared-model": { id: "shared-model", name: "Shared Model", limit: { context: 1, output: 1 } } } },
          second: { id: "second", name: "Second", models: { "shared-model": { id: "shared-model", name: "Shared Model", limit: { context: 2, output: 2 } } } },
        } as any,
      },
    })

    expect(result.match?.providerID).toBe("first")
    expect(result.match?.model.limit?.context).toBe(1)
    expect(result.warnings).toEqual([])
  })

  test("prefers official provider metadata with reasoning options over earlier weak matches", async () => {
    const result = await lookupModelsDevModelBySuffix({
      modelID: "gemini-3.5-flash",
      options: {
        data: {
          vercel: {
            id: "vercel",
            name: "Vercel",
            models: {
              "google/gemini-3.5-flash": { id: "google/gemini-3.5-flash", name: "Gemini 3.5 Flash", reasoning: true, limit: { context: 1, output: 1 } },
            },
          },
          google: {
            id: "google",
            name: "Google",
            models: {
              "gemini-3.5-flash": { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", reasoning: true, reasoning_options: [{ type: "effort", values: ["low", "high"] }], limit: { context: 2, output: 2 } },
            },
          },
        } as any,
      },
    })

    expect(result.match?.providerID).toBe("google")
    expect(result.match?.modelID).toBe("gemini-3.5-flash")
    expect(result.match?.model.reasoning_options).toEqual([{ type: "effort", values: ["low", "high"] }])
  })

  test("prefers official provider metadata for common model families", async () => {
    for (const [modelID, weakProviderID, officialProviderID, officialModelID] of [
      ["deepseek-v4-pro", "alibaba-cn", "deepseek", "deepseek-v4-pro"],
      ["claude-opus-4-8", "vercel", "anthropic", "claude-opus-4-8"],
      ["kimi-k2.5", "qiniu-ai", "moonshotai", "kimi-k2.5"],
      ["minimax-m3", "vercel", "minimax", "MiniMax-M3"],
      ["mimo-v2.5-pro", "vercel", "xiaomi", "mimo-v2.5-pro"],
    ] as const) {
      const result = await lookupModelsDevModelBySuffix({
        modelID,
        options: {
          data: {
            [weakProviderID]: {
              id: weakProviderID,
              name: weakProviderID,
              models: {
                [`${officialProviderID}/${officialModelID}`]: { id: `${officialProviderID}/${officialModelID}`, name: modelID, reasoning: true, limit: { context: 1, output: 1 } },
              },
            },
            [officialProviderID]: {
              id: officialProviderID,
              name: officialProviderID,
              models: {
                [officialModelID]: { id: officialModelID, name: modelID, reasoning: true, reasoning_options: [{ type: "toggle" }], limit: { context: 2, output: 2 } },
              },
            },
          } as any,
        },
      })

      expect(result.match?.providerID).toBe(officialProviderID)
      expect(result.match?.modelID).toBe(officialModelID)
      expect(result.match?.model.reasoning_options).toEqual([{ type: "toggle" }])
    }
  })

  test("falls back to non-official metadata with reasoning options", async () => {
    const result = await lookupModelsDevModelBySuffix({
      modelID: "custom-reasoner",
      options: {
        data: {
          first: { id: "first", name: "First", models: { "custom-reasoner": { id: "custom-reasoner", name: "Custom Reasoner", reasoning: true, limit: { context: 1, output: 1 } } } },
          second: { id: "second", name: "Second", models: { "custom-reasoner": { id: "custom-reasoner", name: "Custom Reasoner", reasoning: true, reasoning_options: [{ type: "effort", values: ["high"] }], limit: { context: 2, output: 2 } } } },
        } as any,
      },
    })

    expect(result.match?.providerID).toBe("second")
    expect(result.match?.model.reasoning_options).toEqual([{ type: "effort", values: ["high"] }])
  })

  test("does not apply official provider priority to substring matches", async () => {
    const result = await lookupModelsDevModelBySuffix({
      modelID: "my-gemini-proxy",
      options: {
        data: {
          custom: { id: "custom", name: "Custom", models: { "my-gemini-proxy": { id: "my-gemini-proxy", name: "My Gemini Proxy", reasoning: true, limit: { context: 1, output: 1 } } } },
          google: { id: "google", name: "Google", models: { "my-gemini-proxy": { id: "my-gemini-proxy", name: "My Gemini Proxy", reasoning: true, limit: { context: 2, output: 2 } } } },
        } as any,
      },
    })

    expect(result.match?.providerID).toBe("custom")
  })

  test("uses official provider priority for namespaced model inputs", async () => {
    const result = await lookupModelsDevModelBySuffix({
      modelID: "google/gemini-3.5-flash",
      options: {
        data: {
          vercel: { id: "vercel", name: "Vercel", models: { "google/gemini-3.5-flash": { id: "google/gemini-3.5-flash", name: "Gemini 3.5 Flash", reasoning: true, limit: { context: 1, output: 1 } } } },
          google: { id: "google", name: "Google", models: { "gemini-3.5-flash": { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", reasoning: true, reasoning_options: [{ type: "effort", values: ["high"] }], limit: { context: 2, output: 2 } } } },
        } as any,
      },
    })

    expect(result.match?.providerID).toBe("google")
    expect(result.match?.modelID).toBe("gemini-3.5-flash")
  })

  test("does not use provider IDs as metadata matching input", async () => {
    const match = await findModelsDevModelBySuffix({
      modelID: "gpt-5",
      options: { data },
    })

    expect(match?.providerID).toBe("openai")
    expect(match?.modelID).toBe("gpt-5")
  })

  test("converts metadata to schema-safe model draft", () => {
    const model = data.openai.models["gpt-5"]
    const draft = modelsDevToModelDraft(model as any)
    expect(draft.limit?.context).toBe(400000)
    expect(draft.modalities?.input).toContain("image")
    expect(draft.headers?.["OpenAI-Beta"]).toBe("test")
    expect(draft.interleaved).toEqual({ field: "reasoning_content" })
    expect(draft.variants?.low?.reasoningEffort).toBe("low")
    expect(Object.keys(draft)).not.toContain("family")
    expect(Object.keys(draft)).not.toContain("release_date")
    expect(Object.keys(draft)).not.toContain("vision")
    expect(Object.keys(draft)).not.toContain("reasoning_options")
  })
})
