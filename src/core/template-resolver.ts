import type { EndpointKind, ModelDraft } from "./types.js"
import { findModelsDevModelForEndpoint, modelsDevToModelDraft, type ModelsDevMatch, type ModelsDevOptions } from "./models-dev.js"
import { getEndpointTemplate, matchFamilyTemplate } from "../templates/index.js"

export type ResolutionConfidence = "exact" | "family" | "generic" | "manual"

export type ModelMetadataSource =
  | { type: "models.dev"; providerID: string; modelID: string; confidence: ModelsDevMatch["confidence"]; fields: string[] }
  | { type: "template"; template: "family" | "generic"; family?: string; fields: string[] }
  | { type: "manual"; fields: string[] }

export type ResolvedModel = {
  model: ModelDraft
  confidence: ResolutionConfidence
  sources: ModelMetadataSource[]
  needsConfirmation: boolean
  warnings: string[]
}

function mergeModel(base: ModelDraft, patch: ModelDraft): ModelDraft {
  return {
    ...base,
    ...patch,
    limit: patch.limit ?? base.limit,
    modalities: patch.modalities ?? base.modalities,
    options: patch.options ?? base.options,
    headers: patch.headers ?? base.headers,
    variants: patch.variants ?? base.variants,
    provider: patch.provider ?? base.provider,
  }
}

function hasManualDraft(draft?: ModelDraft) {
  return draft !== undefined && Object.keys(draft).length > 0
}

function modelFields(model: ModelDraft) {
  return Object.keys(model).sort()
}

function displayNameFromModelID(modelID: string) {
  const gptMatch = /^gpt[._-]?(.+)$/i.exec(modelID)
  if (gptMatch?.[1]) {
    const [version, ...rest] = gptMatch[1].split(/[-_]+/).filter(Boolean)
    return [`GPT-${version}`, ...rest.map(formatDisplayNamePart)].join(" ")
  }
  return modelID
    .split(/[-_]+/)
    .filter(Boolean)
    .map(formatDisplayNamePart)
    .join(" ")
}

function formatDisplayNamePart(part: string) {
  if (/^gpt$/i.test(part)) return "GPT"
  if (/^api$/i.test(part)) return "API"
  if (/^ai$/i.test(part)) return "AI"
  if (/^glm$/i.test(part)) return "GLM"
  if (/^qwen$/i.test(part)) return "Qwen"
  if (/^codex$/i.test(part)) return "Codex"
  if (/^\d+(?:\.\d+)*$/.test(part)) return part
  return `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`
}

export async function resolveModelTemplate(input: {
  endpointKind: EndpointKind
  providerID: string
  modelID: string
  manual?: ModelDraft
  modelsDev?: ModelsDevOptions
}): Promise<ResolvedModel> {
  const template = getEndpointTemplate(input.endpointKind)
  const sources: ModelMetadataSource[] = []
  const warnings: string[] = []
  let model: ModelDraft = mergeModel({}, template.genericModel)
  sources.push({ type: "template", template: "generic", fields: modelFields(template.genericModel) })

  const family = matchFamilyTemplate(template, input.modelID)
  if (family) {
    model = mergeModel(model, family.model)
    sources.push({ type: "template", template: "family", family: family.family, fields: modelFields(family.model) })
  }

  let modelsDevMatch: ModelsDevMatch | undefined
  try {
    modelsDevMatch = await findModelsDevModelForEndpoint({
      endpointKind: input.endpointKind,
      providerID: input.providerID,
      modelID: input.modelID,
      options: input.modelsDev,
    })
  } catch (caught) {
    warnings.push(`models.dev metadata unavailable: ${caught instanceof Error ? caught.message : String(caught)}`)
  }
  if (modelsDevMatch) {
    const draft = modelsDevToModelDraft(modelsDevMatch.model)
    model = mergeModel(model, draft)
    sources.push({
      type: "models.dev",
      providerID: modelsDevMatch.providerID,
      modelID: modelsDevMatch.modelID,
      confidence: modelsDevMatch.confidence,
      fields: modelFields(draft),
    })
  }

  if (hasManualDraft(input.manual)) {
    model = mergeModel(model, input.manual!)
    sources.push({ type: "manual", fields: modelFields(input.manual!) })
  }

  const hasModelsDev = sources.some((source) => source.type === "models.dev")
  const hasFamily = sources.some((source) => source.type === "template" && source.template === "family")
  const confidence = sources.some((source) => source.type === "manual")
    ? "manual"
    : hasModelsDev
      ? "exact"
      : hasFamily
        ? "family"
        : "generic"

  const needsConfirmation = !hasModelsDev || warnings.length > 0
  if (needsConfirmation) model.name = displayNameFromModelID(input.modelID)

  return { model, confidence, sources, needsConfirmation, warnings }
}
