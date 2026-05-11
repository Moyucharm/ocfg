import type { ConfigScope, ConfigTarget, Diagnostic } from "../core/types.js"

export type TuiRoute = "home" | "select-config" | "doctor" | "diff-review"

export type TuiAction = "doctor" | "add-provider" | "edit-provider" | "delete-provider" | "switch-config"

export type TuiConfigSelection = {
  scope: ConfigScope
  target?: ConfigTarget
}

export type DiffReviewState = {
  targetPath: string
  diff: string
  diagnostics?: Diagnostic[]
  completed?: boolean
}
