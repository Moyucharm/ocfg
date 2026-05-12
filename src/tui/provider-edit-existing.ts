import { renderSecretRef } from "../core/secret-strategy.js"
import type { ProviderDraft, SecretRef } from "../core/types.js"

export type ExistingProviderEditDraft = {
  name?: string
  npm?: string
  baseURL?: string
  apiKey?: SecretRef
  setCacheKey?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function buildExistingProviderEditPatch(
  current: Record<string, unknown>,
  draft: ExistingProviderEditDraft,
): Partial<Omit<ProviderDraft, "id" | "models">> {
  const patch: Partial<Omit<ProviderDraft, "id" | "models">> = {}

  if (draft.name !== undefined) patch.name = draft.name
  if (draft.npm !== undefined) patch.npm = draft.npm

  const currentOptions = isRecord(current.options) ? current.options : {}
  const options = { ...currentOptions }
  let hasOptionsPatch = false

  if (draft.baseURL !== undefined) {
    if (draft.baseURL.length > 0) options.baseURL = draft.baseURL
    else delete options.baseURL
    hasOptionsPatch = true
  }
  if (draft.apiKey !== undefined) {
    options.apiKey = renderSecretRef(draft.apiKey)
    hasOptionsPatch = true
  }
  if (draft.setCacheKey !== undefined) {
    options.setCacheKey = draft.setCacheKey
    hasOptionsPatch = true
  }

  if (hasOptionsPatch) patch.options = options as ProviderDraft["options"]

  return patch
}
