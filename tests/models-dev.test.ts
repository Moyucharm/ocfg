import { describe, expect, test } from "vitest"
import { clearModelsDevCache, findModelsDevModel, loadModelsDev, modelsDevToModelDraft } from "../src/core/models-dev.js"

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

  test("converts metadata to schema-safe model draft", () => {
    const model = data.openai.models["gpt-5"]
    const draft = modelsDevToModelDraft(model as any)
    expect(draft.limit?.context).toBe(400000)
    expect(draft.modalities?.input).toContain("image")
    expect(Object.keys(draft)).not.toContain("vision")
  })
})
