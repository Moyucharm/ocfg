import { applyModelEdit, applyProviderEdit } from "../core/jsonc-editor.js"
import { recommendedNpmForChannelType } from "../core/channel-types.js"
import { defaultSecretFilePath } from "../core/secret-file.js"
import { updateModel, updateProvider } from "../core/provider-editor.js"
import { isRecord } from "../core/object-utils.js"
import type { EndpointKind, ModelDraft, ProviderDraft } from "../core/types.js"
import { canUseGpt5LongContextPreset, gpt5LimitForLongContext } from "../core/model-limit-presets.js"
import {
  loadConfigForCommand,
  parseModelRef,
  parseManagedApiKeyValue,
  parseEndpointKind,
  type ManagedSecretCommandOptions,
  writeMutation,
  type MutatingCommandOptions,
} from "./common.js"

export type EditProviderCommandOptions = MutatingCommandOptions &
  Partial<ManagedSecretCommandOptions> & {
    name?: string
    channelType?: string
    baseUrl?: string
    setCacheKey?: boolean
  }

export type EditModelCommandOptions = MutatingCommandOptions & {
  name?: string
  context?: string
  input?: string
  output?: string
  gpt5LongContext?: boolean
  reasoning?: boolean
  toolCall?: boolean
  temperature?: boolean
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

function hasSecretOption(options: EditProviderCommandOptions) {
  return options.apiKey !== undefined
}

function inferEndpointKindFromNpm(npm: unknown): EndpointKind | undefined {
  if (typeof npm !== "string") return undefined
  for (const kind of ["openai-compatible", "openai-responses", "anthropic-compatible", "gemini-compatible"] as const) {
    if (recommendedNpmForChannelType(kind) === npm) return kind
  }
  return undefined
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
  const currentKind = inferEndpointKindFromNpm(current.npm)

  if (options.name !== undefined) patch.name = options.name
  if (!currentKind && options.channelType === undefined) throw new Error("Unknown provider type; re-run with --channel-type to continue")
  if (options.channelType !== undefined) patch.npm = recommendedNpmForChannelType(parseEndpointKind(options.channelType))

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
  const secretFilePath = defaultSecretFilePath(providerID)
  if (hasSecretOption(options)) {
    optionsPatch.apiKey = `{file:${secretFilePath}}`
    hasOptionsPatch = true
  }
  if (hasOptionsPatch) patch.options = optionsPatch

  const nextConfig = updateProvider(document.data, providerID, patch)
  const nextText = applyProviderEdit(document, providerID, (nextConfig.provider as Record<string, unknown>)[providerID])

  return writeMutation({
    document,
    options,
    nextConfig,
    nextText,
    secretFile: hasSecretOption(options) ? { path: secretFilePath, value: parseManagedApiKeyValue(options) } : undefined,
  })
}

export async function editModelCommand(modelRef: string, options: EditModelCommandOptions) {
  const { providerID, modelID } = parseModelRef(modelRef)
  const { document } = await loadConfigForCommand(options)
  const current = existingModel(document.data, providerID, modelID)
  const patch: Partial<ModelDraft> = {}

  if (options.name !== undefined) patch.name = options.name
  const context = parseNumberOption(options.context, "--context")
  const input = parseNumberOption(options.input, "--input")
  const output = parseNumberOption(options.output, "--output")
  if (options.gpt5LongContext !== undefined && (context !== undefined || input !== undefined || output !== undefined)) {
    throw new Error("Use either --gpt-5-long-context/--no-gpt-5-long-context or manual --context/--input/--output limits, not both")
  }
  if (options.gpt5LongContext !== undefined) {
    if (!canUseGpt5LongContextPreset(modelID)) throw new Error(`Model "${providerID}/${modelID}" does not support the GPT-5 long context preset`)
    patch.limit = gpt5LimitForLongContext(options.gpt5LongContext)
  }
  if (context !== undefined || input !== undefined || output !== undefined) {
    const currentLimit = isRecord(current.limit) ? current.limit : {}
    patch.limit = {
      context: context ?? (typeof currentLimit.context === "number" ? currentLimit.context : 0),
      ...(input !== undefined || typeof currentLimit.input === "number" ? { input: input ?? (currentLimit.input as number) } : {}),
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
