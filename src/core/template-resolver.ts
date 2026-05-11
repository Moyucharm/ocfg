import type { EndpointKind, ModelDraft } from "./types.js"
import { findModelsDevModel, modelsDevToModelDraft, type ModelsDevOptions } from "./models-dev.js"
import { getEndpointTemplate, matchFamilyTemplate } from "../templates/index.js"

export type ResolutionConfidence = "exact" | "family" | "generic" | "manual"

export type ResolvedModel = {
  model: ModelDraft
  confidence: ResolutionConfidence
  sources: ResolutionConfidence[]
  needsConfirmation: boolean
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

export async function resolveModelTemplate(input: {
  endpointKind: EndpointKind
  providerID: string
  modelID: string
  manual?: ModelDraft
  modelsDev?: ModelsDevOptions
}): Promise<ResolvedModel> {
  const template = getEndpointTemplate(input.endpointKind)
  const sources: ResolutionConfidence[] = []
  let model: ModelDraft = {}

  const exact = await findModelsDevModel(`${input.providerID}/${input.modelID}`, input.modelsDev)
  if (exact) {
    model = mergeModel(model, modelsDevToModelDraft(exact))
    sources.push("exact")
  }

  const family = matchFamilyTemplate(template, input.modelID)
  if (family) {
    model = mergeModel(family.model, model)
    sources.push("family")
  }

  model = mergeModel(template.genericModel, model)
  sources.push("generic")

  if (hasManualDraft(input.manual)) {
    model = mergeModel(model, input.manual!)
    sources.push("manual")
  }

  const confidence = sources.includes("manual")
    ? "manual"
    : sources.includes("exact")
      ? "exact"
      : sources.includes("family")
        ? "family"
        : "generic"

  const needsConfirmation = confidence === "family" || confidence === "generic"

  return { model, confidence, sources, needsConfirmation }
}
