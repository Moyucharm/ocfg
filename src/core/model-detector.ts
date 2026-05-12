import type { Diagnostic, EndpointKind } from "./types.js"

export type DetectedModel = {
  id: string
  name?: string
  source: "models-endpoint"
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

export type DetectModelsOptions = DetectOpenAICompatibleModelsOptions

function modelsURL(baseURL: string) {
  const normalized = baseURL.replace(/\/+$/, "")
  return `${normalized}/models`
}

function detectedModel(id: string, name?: unknown): DetectedModel {
  return {
    id,
    ...(typeof name === "string" ? { name } : {}),
    source: "models-endpoint",
    trusted: false,
    capabilitiesResolved: false,
  }
}

function parseDataModelsResponse(value: unknown): DetectedModel[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { data?: unknown }).data)) return []
  const data = (value as { data: unknown[] }).data
  const models: DetectedModel[] = []
  for (const item of data) {
    if (!item || typeof item !== "object") continue
      const id = (item as { id?: unknown }).id
      if (typeof id !== "string" || id.length === 0) continue
      const name = (item as { name?: unknown }).name
      const displayName = name ?? (item as { display_name?: unknown }).display_name
      models.push(detectedModel(id, displayName))
  }
  return models
}

function parseGeminiModelsResponse(value: unknown): DetectedModel[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { models?: unknown }).models)) return []
  const data = (value as { models: unknown[] }).models
  const models: DetectedModel[] = []
  for (const item of data) {
    if (!item || typeof item !== "object") continue
    const rawName = (item as { name?: unknown }).name
    if (typeof rawName !== "string" || rawName.length === 0) continue
    const id = rawName.startsWith("models/") ? rawName.slice("models/".length) : rawName
    const displayName = (item as { displayName?: unknown }).displayName
    models.push(detectedModel(id, displayName))
  }
  return models
}

function modelProbeHeaders(kind: EndpointKind, options: DetectModelsOptions) {
  const headers: Record<string, string> = { ...options.headers }
  if (!options.apiKey) return headers
  if (kind === "anthropic-compatible") {
    headers["x-api-key"] = options.apiKey
    headers["anthropic-version"] ??= "2023-06-01"
    return headers
  }
  if (kind === "gemini-compatible") {
    headers["x-goog-api-key"] = options.apiKey
    return headers
  }
  headers.Authorization = `Bearer ${options.apiKey}`
  return headers
}

function parseModelsByEndpoint(kind: EndpointKind, value: unknown) {
  if (kind === "gemini-compatible") return parseGeminiModelsResponse(value)
  return parseDataModelsResponse(value)
}

export async function detectModels(
  endpointKind: EndpointKind,
  baseURL: string,
  options: DetectModelsOptions = {},
): Promise<ModelDetectionResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const headers = modelProbeHeaders(endpointKind, options)

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

    const models = parseModelsByEndpoint(endpointKind, await response.json())
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

export async function detectOpenAICompatibleModels(
  baseURL: string,
  options: DetectOpenAICompatibleModelsOptions = {},
): Promise<ModelDetectionResult> {
  return detectModels("openai-compatible", baseURL, options)
}
