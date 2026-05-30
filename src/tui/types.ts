import type { ConfigDocument } from "../core/types.js"
import type { ConfigScope, ConfigTarget, Diagnostic, EndpointKind, SecretRef } from "../core/types.js"
import type { WriteConfigSafelyResult } from "../core/config-writer.js"

export type TuiRoute =
  | "home"
  | "select-config"
  | "doctor"
  | "provider-list"
  | "provider-edit"
  | "provider-edit-existing"
  | "plugin-list"
  | "plugin-add"
  | "plugin-edit"
  | "plugin-local-edit"
  | "prompt-list"
  | "prompt-add"
  | "prompt-edit"
  | "model-list"
  | "model-add"
  | "model-edit-existing"
  | "delete-confirm"
  | "default-model"
  | "model-edit"
  | "language"
  | "tools"
  | "tools-result"
  | "diff-review"

export type ProviderListMode = "add" | "edit" | "delete"

export type DeleteTargetState =
  | {
      kind: "provider"
      providerID: string
      references: string[]
      error?: string
    }
  | {
      kind: "model"
      providerID: string
      modelID: string
      references: string[]
      error?: string
    }

export type TuiAction =
  | "doctor"
  | "add-provider"
  | "edit-provider"
  | "delete-provider"
  | "manage-plugins"
  | "manage-prompts"
  | "set-default-model"
  | "tools"
  | "switch-config"
  | "switch-language"

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
  secretFile?: {
    path: string
    value: string
  }
  secretFilePath?: string
  promptFile?: {
    action: "delete"
    target: ConfigTarget
    name: string
    path: string
  }
  promptFilePath?: string
  error?: string
  completed?: boolean
}

export type ToolsResultState = {
  message: string
  tone?: "warning" | "error" | "success"
}

export type ProviderFlowDraft = {
  endpointKind: EndpointKind
  providerID: string
  name: string
  baseURL?: string
  apiKey: SecretRef
  apiKeyValue: string
  apiKeyFilePath: string
  setCacheKey: boolean
}
