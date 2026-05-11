import type { ModelDraft, ModelModality } from "./types.js"

export type ModelsDevModel = {
  id: string
  name: string
  attachment?: boolean
  reasoning?: boolean
  temperature?: boolean
  tool_call?: boolean
  limit?: { context: number; output: number; input?: number }
  modalities?: { input: ModelModality[]; output: ModelModality[] }
  options?: Record<string, unknown>
  provider?: { npm?: string; api?: string }
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

export function modelsDevToModelDraft(model: ModelsDevModel): ModelDraft {
  const draft: ModelDraft = {
    name: model.name,
  }
  if (model.attachment !== undefined) draft.attachment = model.attachment
  if (model.reasoning !== undefined) draft.reasoning = model.reasoning
  if (model.temperature !== undefined) draft.temperature = model.temperature
  if (model.tool_call !== undefined) draft.tool_call = model.tool_call
  if (model.limit) draft.limit = model.limit
  if (model.modalities) draft.modalities = model.modalities
  if (model.options) draft.options = model.options
  if (model.provider) draft.provider = model.provider
  return draft
}
