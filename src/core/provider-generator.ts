import type { EndpointKind, ProviderDraft, SecretRef } from "./types.js"
import { renderSecretRef } from "./secret-strategy.js"
import { resolveModelTemplate, type ModelMetadataSource } from "./template-resolver.js"
import { getEndpointTemplate } from "../templates/index.js"
import type { ModelsDevOptions } from "./models-dev.js"
import { applyGpt5LongContextLimit, isGpt5LongContextModel } from "./model-limit-presets.js"

export type CreateProviderDraftInput = {
  endpointKind: EndpointKind
  providerID: string
  name: string
  baseURL?: string
  apiKey: SecretRef
  modelIDs: string[]
  setCacheKey?: boolean
  gpt5LongContext?: boolean
  modelsDev?: ModelsDevOptions
}

export type GeneratedProviderDraft = {
  provider: ProviderDraft
  modelConfirmations: Record<string, boolean>
  modelResolutions: Record<string, GeneratedModelResolution>
  warnings: string[]
}

export type GeneratedModelResolution = {
  modelID: string
  sources: ModelMetadataSource[]
  needsConfirmation: boolean
  supportsGpt5LongContext: boolean
  warnings: string[]
}

function shouldSetCacheKey(kind: EndpointKind) {
  return kind === "openai-compatible" || kind === "anthropic-compatible"
}

export async function createProviderDraftFromEndpoint(input: CreateProviderDraftInput): Promise<GeneratedProviderDraft> {
  const template = getEndpointTemplate(input.endpointKind)
  const models: ProviderDraft["models"] = {}
  const modelConfirmations: Record<string, boolean> = {}
  const modelResolutions: Record<string, GeneratedModelResolution> = {}
  const warnings: string[] = []

  for (const modelID of input.modelIDs) {
    const resolved = await resolveModelTemplate({
      endpointKind: input.endpointKind,
      providerID: input.providerID,
      modelID,
      modelsDev: input.modelsDev,
    })
    const supportsGpt5LongContext = isGpt5LongContextModel(modelID)
    models[modelID] = supportsGpt5LongContext ? applyGpt5LongContextLimit(resolved.model, input.gpt5LongContext === true) : resolved.model
    modelConfirmations[modelID] = resolved.needsConfirmation
    modelResolutions[modelID] = {
      modelID,
      sources: resolved.sources,
      needsConfirmation: resolved.needsConfirmation,
      supportsGpt5LongContext,
      warnings: resolved.warnings,
    }
    warnings.push(...resolved.warnings)
  }

  const options: ProviderDraft["options"] = {
    apiKey: renderSecretRef(input.apiKey),
  }
  if (input.baseURL) options.baseURL = input.baseURL
  const setCacheKey = input.setCacheKey ?? shouldSetCacheKey(input.endpointKind)
  if (setCacheKey) options.setCacheKey = true

  return {
    provider: {
      id: input.providerID,
      name: input.name,
      npm: template.recommendedNpm,
      options,
      models,
    },
    modelConfirmations,
    modelResolutions,
    warnings,
  }
}

export function generatedSupportsGpt5LongContext(generated: GeneratedProviderDraft | undefined) {
  return generated !== undefined && Object.values(generated.modelResolutions).some((resolution) => resolution.supportsGpt5LongContext)
}

export function applyGeneratedGpt5LongContext(generated: GeneratedProviderDraft, enabled: boolean): GeneratedProviderDraft {
  const models = Object.fromEntries(Object.entries(generated.provider.models).map(([modelID, model]) => [
    modelID,
    generated.modelResolutions[modelID]?.supportsGpt5LongContext ? applyGpt5LongContextLimit(model, enabled) : model,
  ]))

  return {
    ...generated,
    provider: {
      ...generated.provider,
      models,
    },
  }
}
