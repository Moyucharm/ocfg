import type { TuiAction } from "./types.js"

export type TuiCommand = {
  label: string
  description: string
  action: TuiAction
}

export const tuiCommands: TuiCommand[] = [
  { label: "Doctor", description: "Inspect provider configuration diagnostics", action: "doctor" },
  { label: "Add Provider", description: "Start provider creation flow", action: "add-provider" },
  { label: "Edit Provider", description: "Edit an existing provider", action: "edit-provider" },
  { label: "Delete Provider", description: "Delete provider or model safely", action: "delete-provider" },
  { label: "Set Default Model", description: "Set or clear model and small_model", action: "set-default-model" },
  { label: "Switch Config Target", description: "Choose global or project config", action: "switch-config" },
]
