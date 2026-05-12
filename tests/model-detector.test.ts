import { describe, expect, test } from "vitest"
import { detectModels, detectOpenAICompatibleModels } from "../src/core/model-detector.js"

function responseFetch(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch
}

describe("model detector", () => {
  test("detects model IDs from OpenAI-compatible /models", async () => {
    let requestedURL: string | URL | Request | undefined
    const fetchImpl = (async (url) => {
      requestedURL = url
      return new Response(JSON.stringify({ data: [{ id: "gpt-test" }, { id: "claude-test", name: "Claude Test" }] }))
    }) as typeof fetch

    const result = await detectOpenAICompatibleModels("https://example.com/v1", {
      fetchImpl,
    })

    expect(requestedURL).toBe("https://example.com/v1/models")
    expect(result.diagnostics).toEqual([])
    expect(result.models).toEqual([
      {
        id: "gpt-test",
        source: "models-endpoint",
        trusted: false,
        capabilitiesResolved: false,
      },
      {
        id: "claude-test",
        name: "Claude Test",
        source: "models-endpoint",
        trusted: false,
        capabilitiesResolved: false,
      },
    ])
  })

  test("passes authorization header when api key is provided", async () => {
    let authorization: string | undefined
    const fetchImpl = (async (_url, init) => {
      authorization = (init?.headers as Record<string, string>).Authorization
      return new Response(JSON.stringify({ data: [{ id: "m" }] }), { status: 200 })
    }) as typeof fetch

    await detectOpenAICompatibleModels("https://example.com/v1", { fetchImpl, apiKey: "sk-test" })
    expect(authorization).toBe("Bearer sk-test")
  })

  test("detects OpenAI Responses models from /models", async () => {
    let requestedURL: string | URL | Request | undefined
    const fetchImpl = (async (url) => {
      requestedURL = url
      return new Response(JSON.stringify({ data: [{ id: "gpt-5" }] }))
    }) as typeof fetch

    const result = await detectModels("openai-responses", "https://api.openai.com/v1", { fetchImpl })

    expect(requestedURL).toBe("https://api.openai.com/v1/models")
    expect(result.models.map((model) => model.id)).toEqual(["gpt-5"])
  })

  test("detects Anthropic models with Anthropic headers", async () => {
    let headers: Record<string, string> | undefined
    const fetchImpl = (async (_url, init) => {
      headers = init?.headers as Record<string, string>
      return new Response(JSON.stringify({ data: [{ id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5" }] }))
    }) as typeof fetch

    const result = await detectModels("anthropic-compatible", "https://api.anthropic.com/v1", { fetchImpl, apiKey: "sk-ant" })

    expect(headers).toEqual({ "x-api-key": "sk-ant", "anthropic-version": "2023-06-01" })
    expect(result.models).toEqual([
      {
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5",
        source: "models-endpoint",
        trusted: false,
        capabilitiesResolved: false,
      },
    ])
  })

  test("detects Gemini models and normalizes model names", async () => {
    let requestedURL: string | URL | Request | undefined
    let headers: Record<string, string> | undefined
    const fetchImpl = (async (url, init) => {
      requestedURL = url
      headers = init?.headers as Record<string, string>
      return new Response(JSON.stringify({ models: [{ name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro" }] }))
    }) as typeof fetch

    const result = await detectModels("gemini-compatible", "https://generativelanguage.googleapis.com/v1beta", {
      fetchImpl,
      apiKey: "AIza-test",
    })

    expect(requestedURL).toBe("https://generativelanguage.googleapis.com/v1beta/models")
    expect(headers).toEqual({ "x-goog-api-key": "AIza-test" })
    expect(result.models).toEqual([
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        source: "models-endpoint",
        trusted: false,
        capabilitiesResolved: false,
      },
    ])
  })

  test("preserves custom headers while adding authorization", async () => {
    let headers: Record<string, string> | undefined
    const fetchImpl = (async (_url, init) => {
      headers = init?.headers as Record<string, string>
      return new Response(JSON.stringify({ data: [{ id: "m" }] }), { status: 200 })
    }) as typeof fetch

    await detectOpenAICompatibleModels("https://example.com/v1/", {
      fetchImpl,
      apiKey: "sk-test",
      headers: { "X-Test": "yes" },
    })

    expect(headers).toEqual({ "X-Test": "yes", Authorization: "Bearer sk-test" })
  })

  test("passes a timeout abort signal to fetch", async () => {
    let signal: AbortSignal | null | undefined
    const fetchImpl = (async (_url, init) => {
      signal = init?.signal
      return new Response(JSON.stringify({ data: [{ id: "m" }] }), { status: 200 })
    }) as typeof fetch

    await detectOpenAICompatibleModels("https://example.com/v1", { fetchImpl, timeoutMs: 123 })
    expect(signal).toBeInstanceOf(AbortSignal)
  })

  test("returns recoverable diagnostics on http failure", async () => {
    const result = await detectOpenAICompatibleModels("https://example.com/v1", {
      fetchImpl: responseFetch({ error: "no" }, 500),
    })
    expect(result.models).toEqual([])
    expect(result.diagnostics[0]?.message).toContain("HTTP 500")
  })

  test("returns diagnostics for invalid response", async () => {
    const result = await detectOpenAICompatibleModels("https://example.com/v1", { fetchImpl: responseFetch({ data: [{}] }) })
    expect(result.models).toEqual([])
    expect(result.diagnostics[0]?.message).toContain("no usable model IDs")
  })

  test("returns diagnostics on thrown network errors", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down")
    }) as typeof fetch
    const result = await detectOpenAICompatibleModels("https://example.com/v1", { fetchImpl })
    expect(result.diagnostics[0]?.message).toContain("network down")
  })
})
