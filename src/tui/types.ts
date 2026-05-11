import type { ConfigDocument } from "../core/types.js"
import type { ConfigScope, ConfigTarget, Diagnostic, EndpointKind, SecretRef } from "../core/types.js"
import type { WriteConfigSafelyResult } from "../core/config-writer.js"

export type TuiRoute = "home" | "select-config" | "doctor" | "provider-list" | "provider-edit" | "model-edit" | "diff-review"

export type TuiAction = "doctor" | "add-provider" | "edit-provider" | "delete-provider" | "switch-config"

export type TuiConfigSelection = {
  scope: ConfigScope
  target?: ConfigTarget
}

export type DiffReviewState = {
  targetPath: string
  diff: string
  diagnostics?: Diagnostic[]
  document?: ConfigDocument
  nextConfig?: Record<string, unknown>
  nextText?: string
  result?: WriteConfigSafelyResult
  error?: string
  completed?: boolean
}

export type ProviderFlowDraft = {
  endpointKind: EndpointKind
  providerID: string
  name: string
  baseURL?: string
  apiKey: SecretRef
  setCacheKey: boolean
}
