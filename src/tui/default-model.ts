import { applyConfigEdit } from "../core/jsonc-editor.js"
import { setDefaultModel, setSmallModel } from "../core/provider-editor.js"
import type { ConfigDocument } from "../core/types.js"

export type DefaultModelKey = "model" | "small_model"

export type DefaultModelOption = {
  ref?: string
  providerID?: string
  providerName?: string
  modelID?: string
  modelName?: string
  label: string
  description: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function displayName(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined
}

export function collectDefaultModelOptions(config: Record<string, unknown>): DefaultModelOption[] {
  const options: DefaultModelOption[] = [
    {
      label: "(empty)",
      description: "Clear this setting",
    },
  ]
  const providerMap = isRecord(config.provider) ? config.provider : {}

  for (const [providerID, providerValue] of Object.entries(providerMap)) {
    if (!isRecord(providerValue)) continue
    const providerName = displayName(providerValue.name)
    const modelMap = isRecord(providerValue.models) ? providerValue.models : {}

    for (const [modelID, modelValue] of Object.entries(modelMap)) {
      const modelName = isRecord(modelValue) ? displayName(modelValue.name) : undefined
      const ref = `${providerID}/${modelID}`
      const names = [providerName, modelName].filter(Boolean).join(" / ")
      options.push({
        ref,
        providerID,
        providerName,
        modelID,
        modelName,
        label: names ? `${ref} (${names})` : ref,
        description: "Use this existing provider/model ref",
      })
    }
  }

  return options
}

export function applyDefaultModelSelection(config: Record<string, unknown>, key: DefaultModelKey, ref?: string): Record<string, unknown> {
  if (ref !== undefined) return key === "model" ? setDefaultModel(config, ref) : setSmallModel(config, ref)

  const next = structuredClone(config)
  delete next[key]
  return next
}

export function applyDefaultModelText(document: ConfigDocument, nextConfig: Record<string, unknown>, key: DefaultModelKey, ref?: string): string {
  let nextText = document.text || "{}\n"
  if (nextConfig.$schema !== undefined && (!document.target.exists || document.data.$schema !== nextConfig.$schema)) {
    nextText = applyConfigEdit({ ...document, text: nextText }, ["$schema"], nextConfig.$schema)
  }
  return applyConfigEdit({ ...document, text: nextText }, [key], ref)
}

export function isSelectableDefaultModelRef(options: DefaultModelOption[], ref: string) {
  return options.some((option) => option.ref === ref)
}
