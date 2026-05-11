import type { Diagnostic } from "./types.js"

export type DetectedModel = {
  id: string
  name?: string
  source: "openai-compatible-models-endpoint"
  trusted: false
  capabilitiesResolved: false
}

export type ModelDetectionResult = {
  models: DetectedModel[]
  diagnostics: Diagnostic[]
}

export type DetectOpenAICompatibleModelsOptions = {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  apiKey?: string
  headers?: Record<string, string>
}

function modelsURL(baseURL: string) {
  const normalized = baseURL.replace(/\/+$/, "")
  return `${normalized}/models`
}

function parseModelsResponse(value: unknown): DetectedModel[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { data?: unknown }).data)) return []
  const data = (value as { data: unknown[] }).data
  const models: DetectedModel[] = []
  for (const item of data) {
    if (!item || typeof item !== "object") continue
      const id = (item as { id?: unknown }).id
      if (typeof id !== "string" || id.length === 0) continue
      const name = (item as { name?: unknown }).name
      models.push({
        id,
        ...(typeof name === "string" ? { name } : {}),
        source: "openai-compatible-models-endpoint",
        trusted: false,
        capabilitiesResolved: false,
      })
  }
  return models
}

export async function detectOpenAICompatibleModels(
  baseURL: string,
  options: DetectOpenAICompatibleModelsOptions = {},
): Promise<ModelDetectionResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const headers: Record<string, string> = { ...options.headers }
  if (options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`

  try {
    const response = await fetchImpl(modelsURL(baseURL), {
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    })

    if (!response.ok) {
      return {
        models: [],
        diagnostics: [
          {
            severity: "medium",
            source: "config",
            path: "/provider/options/baseURL",
            message: `Model probe failed: HTTP ${response.status}`,
          },
        ],
      }
    }

    const models = parseModelsResponse(await response.json())
    if (models.length === 0) {
      return {
        models: [],
        diagnostics: [
          {
            severity: "medium",
            source: "config",
            path: "/provider/models",
            message: "Model probe returned no usable model IDs",
          },
        ],
      }
    }

    return { models, diagnostics: [] }
  } catch (error) {
    return {
      models: [],
      diagnostics: [
        {
          severity: "medium",
          source: "config",
          path: "/provider/options/baseURL",
          message: `Model probe failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    }
  }
}
