import { describe, expect, test } from "vitest"
import { clearModelsDevCache, findModelsDevModel, findModelsDevModelForEndpoint, loadModelsDev, modelsDevToModelDraft } from "../src/core/models-dev.js"

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
        reasoning: true,
        temperature: true,
        tool_call: true,
        attachment: true,
        limit: { context: 400000, output: 128000 },
        modalities: { input: ["text", "image"], output: ["text"] },
        headers: { "OpenAI-Beta": "test" },
        variants: {
          low: { reasoningEffort: "low" },
          high: { reasoningEffort: "high" },
        },
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

  test("finds endpoint provider candidates for custom providers", async () => {
    const match = await findModelsDevModelForEndpoint({
      endpointKind: "openai-responses",
      providerID: "custom-openai",
      modelID: "gpt-5",
      options: { data },
    })

    expect(match?.providerID).toBe("openai")
    expect(match?.confidence).toBe("candidate-provider")
  })

  test("falls back to global unique model IDs", async () => {
    const match = await findModelsDevModelForEndpoint({
      endpointKind: "openai-compatible",
      providerID: "custom",
      modelID: "claude-test",
      options: { data },
    })

    expect(match?.providerID).toBe("anthropic")
    expect(match?.confidence).toBe("global-unique")
  })

  test("converts metadata to schema-safe model draft", () => {
    const model = data.openai.models["gpt-5"]
    const draft = modelsDevToModelDraft(model as any)
    expect(draft.limit?.context).toBe(400000)
    expect(draft.modalities?.input).toContain("image")
    expect(draft.headers?.["OpenAI-Beta"]).toBe("test")
    expect(draft.variants?.low?.reasoningEffort).toBe("low")
    expect(Object.keys(draft)).not.toContain("vision")
  })
})
