import type { ModelDraft, ProviderDraft } from "./types.js"

export class ProviderEditorError extends Error {}

export type DeleteOptions = {
  confirmReferencedDelete?: string
}

function cloneConfig(config: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(config)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function ensureSchema(config: Record<string, unknown>) {
  if (!config.$schema) config.$schema = "https://opencode.ai/config.json"
}

function ensureProviderMap(config: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(config.provider)) config.provider = {}
  return config.provider as Record<string, unknown>
}

function getProviderMap(config: Record<string, unknown>): Record<string, unknown> {
  return isRecord(config.provider) ? config.provider : {}
}

function getProvider(config: Record<string, unknown>, providerID: string): Record<string, unknown> {
  const provider = getProviderMap(config)[providerID]
  if (!isRecord(provider)) throw new ProviderEditorError(`Provider "${providerID}" does not exist`)
  return provider
}

function ensureModelMap(provider: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(provider.models)) provider.models = {}
  return provider.models as Record<string, unknown>
}

function modelRef(providerID: string, modelID: string) {
  return `${providerID}/${modelID}`
}

function assertConfirmation(expected: string, options?: DeleteOptions) {
  if (options?.confirmReferencedDelete !== expected) {
    throw new ProviderEditorError(`Deleting referenced config requires confirmation token "${expected}"`)
  }
}

function toProviderConfig(draft: ProviderDraft): Record<string, unknown> {
  return {
    npm: draft.npm,
    name: draft.name,
    options: draft.options,
    models: draft.models,
  }
}

export function addProvider(config: Record<string, unknown>, draft: ProviderDraft): Record<string, unknown> {
  const next = cloneConfig(config)
  ensureSchema(next)
  const providers = ensureProviderMap(next)
  if (providers[draft.id] !== undefined) throw new ProviderEditorError(`Provider "${draft.id}" already exists`)
  providers[draft.id] = toProviderConfig(draft)
  return next
}

export function updateProvider(
  config: Record<string, unknown>,
  providerID: string,
  patch: Partial<Omit<ProviderDraft, "id" | "models">> & { models?: Record<string, ModelDraft> },
): Record<string, unknown> {
  const next = cloneConfig(config)
  const provider = getProvider(next, providerID)
  if (patch.name !== undefined) provider.name = patch.name
  if (patch.npm !== undefined) provider.npm = patch.npm
  if (patch.options !== undefined) provider.options = patch.options
  if (patch.models !== undefined) provider.models = patch.models
  return next
}

export function findProviderReferences(config: Record<string, unknown>, providerID: string): string[] {
  const references: string[] = []
  for (const key of ["model", "small_model"] as const) {
    const value = config[key]
    if (typeof value === "string" && value.startsWith(`${providerID}/`)) references.push(`/${key}`)
  }
  return references
}

export function findModelReferences(config: Record<string, unknown>, providerID: string, modelID: string): string[] {
  const references: string[] = []
  const ref = modelRef(providerID, modelID)
  for (const key of ["model", "small_model"] as const) {
    if (config[key] === ref) references.push(`/${key}`)
  }
  return references
}

export function deleteProvider(config: Record<string, unknown>, providerID: string, options?: DeleteOptions): Record<string, unknown> {
  const refs = findProviderReferences(config, providerID)
  if (refs.length > 0) assertConfirmation(`delete:${providerID}`, options)

  const next = cloneConfig(config)
  const providers = getProviderMap(next)
  if (providers[providerID] === undefined) throw new ProviderEditorError(`Provider "${providerID}" does not exist`)
  delete providers[providerID]
  return next
}

export function addModel(
  config: Record<string, unknown>,
  providerID: string,
  modelID: string,
  draft: ModelDraft,
): Record<string, unknown> {
  const next = cloneConfig(config)
  const provider = getProvider(next, providerID)
  const models = ensureModelMap(provider)
  if (models[modelID] !== undefined) throw new ProviderEditorError(`Model "${providerID}/${modelID}" already exists`)
  models[modelID] = draft
  return next
}

export function updateModel(
  config: Record<string, unknown>,
  providerID: string,
  modelID: string,
  patch: Partial<ModelDraft>,
): Record<string, unknown> {
  const next = cloneConfig(config)
  const provider = getProvider(next, providerID)
  const models = ensureModelMap(provider)
  const model = models[modelID]
  if (!isRecord(model)) throw new ProviderEditorError(`Model "${providerID}/${modelID}" does not exist`)
  models[modelID] = { ...model, ...patch }
  return next
}

export function deleteModel(
  config: Record<string, unknown>,
  providerID: string,
  modelID: string,
  options?: DeleteOptions,
): Record<string, unknown> {
  const refs = findModelReferences(config, providerID, modelID)
  if (refs.length > 0) assertConfirmation(`delete:${providerID}/${modelID}`, options)

  const next = cloneConfig(config)
  const provider = getProvider(next, providerID)
  const models = ensureModelMap(provider)
  if (models[modelID] === undefined) throw new ProviderEditorError(`Model "${providerID}/${modelID}" does not exist`)
  delete models[modelID]
  return next
}

export function setDefaultModel(config: Record<string, unknown>, ref: string): Record<string, unknown> {
  const next = cloneConfig(config)
  ensureSchema(next)
  next.model = ref
  return next
}

export function setSmallModel(config: Record<string, unknown>, ref: string): Record<string, unknown> {
  const next = cloneConfig(config)
  ensureSchema(next)
  next.small_model = ref
  return next
}
