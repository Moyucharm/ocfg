import { defaultSecretFilePath } from "../core/secret-file.js"
import { recommendedNpmForChannelType } from "../core/channel-types.js"
import { isRecord } from "../core/object-utils.js"
import type { EndpointKind, ProviderDraft } from "../core/types.js"

export type ExistingProviderEditDraft = {
  name?: string
  endpointKind?: EndpointKind
  baseURL?: string
  apiKeyValue?: string
  setCacheKey?: boolean
}

export function buildExistingProviderEditPatch(
  current: Record<string, unknown>,
  draft: ExistingProviderEditDraft,
  providerID: string,
): Partial<Omit<ProviderDraft, "id" | "models">> {
  const patch: Partial<Omit<ProviderDraft, "id" | "models">> = {}

  if (draft.name !== undefined) patch.name = draft.name
  if (draft.endpointKind !== undefined) patch.npm = recommendedNpmForChannelType(draft.endpointKind)

  const currentOptions = isRecord(current.options) ? current.options : {}
  const options = { ...currentOptions }
  let hasOptionsPatch = false

  if (draft.baseURL !== undefined) {
    if (draft.baseURL.length > 0) options.baseURL = draft.baseURL
    else delete options.baseURL
    hasOptionsPatch = true
  }
  if (draft.apiKeyValue !== undefined) {
    options.apiKey = `{file:${defaultSecretFilePath(providerID)}}`
    hasOptionsPatch = true
  }
  if (draft.setCacheKey !== undefined) {
    options.setCacheKey = draft.setCacheKey
    hasOptionsPatch = true
  }

  if (hasOptionsPatch) patch.options = options as ProviderDraft["options"]

  return patch
}
