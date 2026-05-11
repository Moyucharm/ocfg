import type { EndpointKind, ProviderDraft, SecretRef } from "./types.js"
import { renderSecretRef } from "./secret-strategy.js"
import { resolveModelTemplate } from "./template-resolver.js"
import { getEndpointTemplate } from "../templates/index.js"
import type { ModelsDevOptions } from "./models-dev.js"

export type CreateProviderDraftInput = {
  endpointKind: EndpointKind
  providerID: string
  name: string
  baseURL?: string
  apiKey: SecretRef
  modelIDs: string[]
  setCacheKey?: boolean
  modelsDev?: ModelsDevOptions
}

export type GeneratedProviderDraft = {
  provider: ProviderDraft
  modelConfirmations: Record<string, boolean>
}

function shouldSetCacheKey(kind: EndpointKind) {
  return kind === "openai-compatible" || kind === "anthropic-compatible"
}

export async function createProviderDraftFromEndpoint(input: CreateProviderDraftInput): Promise<GeneratedProviderDraft> {
  const template = getEndpointTemplate(input.endpointKind)
  const models: ProviderDraft["models"] = {}
  const modelConfirmations: Record<string, boolean> = {}

  for (const modelID of input.modelIDs) {
    const resolved = await resolveModelTemplate({
      endpointKind: input.endpointKind,
      providerID: input.providerID,
      modelID,
      modelsDev: input.modelsDev,
    })
    models[modelID] = resolved.model
    modelConfirmations[modelID] = resolved.needsConfirmation
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
  }
}
