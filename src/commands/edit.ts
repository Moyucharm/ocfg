import { applyModelEdit, applyProviderEdit } from "../core/jsonc-editor.js"
import { updateModel, updateProvider } from "../core/provider-editor.js"
import { renderSecretRef } from "../core/secret-strategy.js"
import type { ModelDraft, ProviderDraft } from "../core/types.js"
import {
  loadConfigForCommand,
  parseSecretRef,
  writeMutation,
  type MutatingCommandOptions,
  type SecretCommandOptions,
} from "./common.js"

export type EditProviderCommandOptions = MutatingCommandOptions &
  Partial<SecretCommandOptions> & {
    name?: string
    npm?: string
    baseUrl?: string
    setCacheKey?: boolean
  }

export type EditModelCommandOptions = MutatingCommandOptions & {
  name?: string
  context?: string
  output?: string
  reasoning?: boolean
  toolCall?: boolean
  temperature?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function existingProvider(config: Record<string, unknown>, providerID: string) {
  const providerMap = config.provider
  const provider = isRecord(providerMap) ? providerMap[providerID] : undefined
  if (!isRecord(provider)) throw new Error(`Provider "${providerID}" does not exist`)
  return provider
}

function existingModel(config: Record<string, unknown>, providerID: string, modelID: string) {
  const provider = existingProvider(config, providerID)
  const models = provider.models
  const model = isRecord(models) ? models[modelID] : undefined
  if (!isRecord(model)) throw new Error(`Model "${providerID}/${modelID}" does not exist`)
  return model
}

function parseModelRef(ref: string) {
  const slash = ref.indexOf("/")
  if (slash <= 0 || slash === ref.length - 1) throw new Error("Model ref must use provider_id/model_id format")
  return { providerID: ref.slice(0, slash), modelID: ref.slice(slash + 1) }
}

function hasSecretOption(options: EditProviderCommandOptions) {
  return options.apiKeyEnv !== undefined || options.apiKeyFile !== undefined || options.apiKeyPlaintext !== undefined
}

function parseNumberOption(value: string | undefined, label: string) {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`)
  return parsed
}

export async function editProviderCommand(providerID: string, options: EditProviderCommandOptions) {
  const { document } = await loadConfigForCommand(options)
  const current = existingProvider(document.data, providerID)
  const patch: Partial<Omit<ProviderDraft, "id" | "models">> = {}

  if (options.name !== undefined) patch.name = options.name
  if (options.npm !== undefined) patch.npm = options.npm

  const optionsPatch: ProviderDraft["options"] = {
    ...(isRecord(current.options) ? current.options : {}),
  }
  let hasOptionsPatch = false
  if (options.baseUrl !== undefined) {
    optionsPatch.baseURL = options.baseUrl
    hasOptionsPatch = true
  }
  if (options.setCacheKey !== undefined) {
    optionsPatch.setCacheKey = options.setCacheKey
    hasOptionsPatch = true
  }
  if (hasSecretOption(options)) {
    optionsPatch.apiKey = renderSecretRef(parseSecretRef(options as SecretCommandOptions))
    hasOptionsPatch = true
  }
  if (hasOptionsPatch) patch.options = optionsPatch

  const nextConfig = updateProvider(document.data, providerID, patch)
  const nextText = applyProviderEdit(document, providerID, (nextConfig.provider as Record<string, unknown>)[providerID])

  return writeMutation({ document, options, nextConfig, nextText })
}

export async function editModelCommand(modelRef: string, options: EditModelCommandOptions) {
  const { providerID, modelID } = parseModelRef(modelRef)
  const { document } = await loadConfigForCommand(options)
  const current = existingModel(document.data, providerID, modelID)
  const patch: Partial<ModelDraft> = {}

  if (options.name !== undefined) patch.name = options.name
  const context = parseNumberOption(options.context, "--context")
  const output = parseNumberOption(options.output, "--output")
  if (context !== undefined || output !== undefined) {
    const currentLimit = isRecord(current.limit) ? current.limit : {}
    patch.limit = {
      context: context ?? (typeof currentLimit.context === "number" ? currentLimit.context : 0),
      output: output ?? (typeof currentLimit.output === "number" ? currentLimit.output : 0),
    }
  }
  if (options.reasoning !== undefined) patch.reasoning = options.reasoning
  if (options.toolCall !== undefined) patch.tool_call = options.toolCall
  if (options.temperature !== undefined) patch.temperature = options.temperature

  const nextConfig = updateModel(document.data, providerID, modelID, patch)
  const provider = (nextConfig.provider as Record<string, unknown>)[providerID] as { models: Record<string, unknown> }
  const nextText = applyModelEdit(document, providerID, modelID, provider.models[modelID])

  return writeMutation({ document, options, nextConfig, nextText })
}
