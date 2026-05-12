import type { EndpointKind, ModelDraft, ModelModality } from "./types.js"

export type ModelsDevModel = {
  id: string
  name: string
  family?: string
  release_date?: string
  attachment?: boolean
  reasoning?: boolean
  temperature?: boolean
  tool_call?: boolean
  limit?: { context: number; output: number; input?: number }
  modalities?: { input: ModelModality[]; output: ModelModality[] }
  options?: Record<string, unknown>
  headers?: Record<string, string>
  provider?: { npm?: string; api?: string }
  variants?: Record<string, Record<string, unknown>>
}

export type ModelsDevProvider = {
  id: string
  name: string
  npm?: string
  models: Record<string, ModelsDevModel>
}

export type ModelsDevData = Record<string, ModelsDevProvider>

export type ModelsDevOptions = {
  fetchImpl?: typeof fetch
  url?: string
  timeoutMs?: number
  data?: ModelsDevData
}

export type ModelsDevMatchConfidence = "exact-provider" | "candidate-provider" | "global-unique" | "global-candidate"

export type ModelsDevMatch = {
  providerID: string
  modelID: string
  model: ModelsDevModel
  confidence: ModelsDevMatchConfidence
}

let cachedData: ModelsDevData | undefined

export async function loadModelsDev(options: ModelsDevOptions = {}): Promise<ModelsDevData> {
  if (options.data) return options.data
  if (cachedData) return cachedData

  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(options.url ?? "https://models.dev/api.json", {
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
  })
  if (!response.ok) throw new Error(`Failed to fetch models.dev data: HTTP ${response.status}`)
  cachedData = (await response.json()) as ModelsDevData
  return cachedData
}

export function clearModelsDevCache() {
  cachedData = undefined
}

export async function findModelsDevModel(modelRef: string, options: ModelsDevOptions = {}) {
  const slash = modelRef.indexOf("/")
  if (slash <= 0 || slash === modelRef.length - 1) return undefined
  const providerID = modelRef.slice(0, slash)
  const modelID = modelRef.slice(slash + 1)
  const data = await loadModelsDev(options)
  return data[providerID]?.models?.[modelID]
}

function providerCandidates(kind: EndpointKind, providerID: string) {
  const candidates =
    kind === "openai-responses"
      ? [providerID, "openai"]
      : kind === "openai-compatible"
        ? [providerID, "openai"]
        : kind === "anthropic-compatible"
          ? [providerID, "anthropic"]
          : [providerID, "google", "gemini"]
  return Array.from(new Set(candidates.filter(Boolean)))
}

export async function findModelsDevModelForEndpoint(input: {
  endpointKind: EndpointKind
  providerID: string
  modelID: string
  options?: ModelsDevOptions
}): Promise<ModelsDevMatch | undefined> {
  const data = await loadModelsDev(input.options)
  const candidates = providerCandidates(input.endpointKind, input.providerID)

  const exact = data[input.providerID]?.models?.[input.modelID]
  if (exact) return { providerID: input.providerID, modelID: input.modelID, model: exact, confidence: "exact-provider" }

  for (const providerID of candidates) {
    if (providerID === input.providerID) continue
    const model = data[providerID]?.models?.[input.modelID]
    if (model) return { providerID, modelID: input.modelID, model, confidence: "candidate-provider" }
  }

  const matches: ModelsDevMatch[] = []
  for (const [providerID, provider] of Object.entries(data)) {
    const model = provider.models[input.modelID]
    if (model) matches.push({ providerID, modelID: input.modelID, model, confidence: "global-unique" })
  }
  if (matches.length === 1) return matches[0]
  for (const providerID of candidates) {
    const match = matches.find((candidate) => candidate.providerID === providerID)
    if (match) return { ...match, confidence: "global-candidate" }
  }
  return undefined
}

export function modelsDevToModelDraft(model: ModelsDevModel): ModelDraft {
  const draft: ModelDraft = {
    name: model.name,
  }
  if (model.family !== undefined) draft.family = model.family
  if (model.release_date !== undefined) draft.release_date = model.release_date
  if (model.attachment !== undefined) draft.attachment = model.attachment
  if (model.reasoning !== undefined) draft.reasoning = model.reasoning
  if (model.temperature !== undefined) draft.temperature = model.temperature
  if (model.tool_call !== undefined) draft.tool_call = model.tool_call
  if (model.limit) draft.limit = model.limit
  if (model.modalities) draft.modalities = model.modalities
  if (model.options) draft.options = model.options
  if (model.headers) draft.headers = model.headers
  if (model.provider) draft.provider = model.provider
  if (model.variants) draft.variants = model.variants
  return draft
}
