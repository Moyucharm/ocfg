import type { ModelDraft, ModelModality } from "./types.js"

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

export type ModelsDevMatchConfidence = "model-suffix"

export type ModelsDevMatch = {
  providerID: string
  modelID: string
  model: ModelsDevModel
  confidence: ModelsDevMatchConfidence
}

export type ModelsDevLookupResult = {
  match?: ModelsDevMatch
  warnings: string[]
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

function normalizeModelName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[^:/]+:\s+/, "")
    .replace(/[\s_]+/g, "-")
    .replace(/(^|[-/])([a-z]+)(?=\d+\.)/g, "$1$2-")
    .replace(/(^|[-/])gpt-(\d+)-(\d+)(?=$|[-/])/g, "$1gpt-$2.$3")
    .replace(/-+/g, "-")
}

function modelNameVariants(value: string) {
  const variants = new Set([value])
  for (const candidate of Array.from(variants)) {
    variants.add(candidate.replace(/(^|[-/])([a-z]+)(?=\d)/g, "$1$2-"))
    variants.add(candidate.replace(/(^|[-/])([a-z]+)-(?=\d)/g, "$1$2"))
    variants.add(candidate.replace(/(^|[-/])([a-z]+(?:-[a-z]+)*)-(\d{1,2})-(\d{1,2})(?=$|[-/])/g, "$1$2-$3.$4"))
    variants.add(candidate.replace(/(^|[-/])([a-z]+(?:-[a-z]+)*)-v-?(\d{1,2})-(\d{1,2})(?=$|[-/])/g, "$1$2-v$3.$4"))
  }
  return Array.from(variants)
}

function modelNameSuffixes(value: string) {
  const trimmed = value.trim()
  const suffixes = new Set([trimmed])
  const slashSuffix = trimmed.split("/").filter(Boolean).at(-1)
  const colonSuffix = trimmed.split(":").filter(Boolean).at(-1)?.trim()
  if (slashSuffix) suffixes.add(slashSuffix)
  if (colonSuffix) suffixes.add(colonSuffix)
  return Array.from(suffixes)
}

function normalizedModelAliases(value: string) {
  const normalized = modelNameSuffixes(value).map(normalizeModelName)
  return Array.from(new Set(normalized.flatMap(modelNameVariants))).filter(Boolean)
}

function modelAliases(modelID: string, model: ModelsDevModel) {
  return Array.from(new Set([
    ...normalizedModelAliases(modelID),
    ...normalizedModelAliases(model.id),
  ])).filter(Boolean)
}

function findAliasModels(provider: ModelsDevProvider | undefined, modelID: string) {
  if (!provider) return []
  const inputAliases = normalizedModelAliases(modelID)
  return Object.entries(provider.models)
    .filter(([candidateID, model]) => modelAliases(candidateID, model).some((alias) => inputAliases.some((inputAlias) => alias.endsWith(inputAlias))))
    .map(([candidateID, model]) => ({ modelID: candidateID, model }))
}

function missingLookup(modelID: string): ModelsDevLookupResult {
  return { warnings: [`models.dev metadata was not found for "${modelID}"; no model limit or capabilities were guessed.`] }
}

export async function lookupModelsDevModelBySuffix(input: {
  modelID: string
  options?: ModelsDevOptions
}): Promise<ModelsDevLookupResult> {
  const data = await loadModelsDev(input.options)
  for (const [providerID, provider] of Object.entries(data)) {
    for (const match of findAliasModels(provider, input.modelID)) {
      return { match: { providerID, modelID: match.modelID, model: match.model, confidence: "model-suffix" }, warnings: [] }
    }
  }

  return missingLookup(input.modelID)
}

export async function findModelsDevModelBySuffix(input: {
  modelID: string
  options?: ModelsDevOptions
}): Promise<ModelsDevMatch | undefined> {
  return (await lookupModelsDevModelBySuffix(input)).match
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
