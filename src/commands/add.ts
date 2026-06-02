import { addProvider } from "../core/provider-editor.js"
import { recommendedNpmForChannelType } from "../core/channel-types.js"
import { defaultSecretFilePath } from "../core/secret-file.js"
import { createProviderDraftFromEndpoint } from "../core/provider-generator.js"
import { applyProviderEdit } from "../core/jsonc-editor.js"
import { loadModelsDev } from "../core/models-dev.js"
import {
  loadConfigForCommand,
  parseEndpointKind,
  parseManagedApiKeyValue,
  writeMutation,
  type ManagedSecretCommandOptions,
  type MutatingCommandOptions,
} from "./common.js"

export type AddProviderCommandOptions = MutatingCommandOptions &
  ManagedSecretCommandOptions & {
    channelType: string
    name?: string
    baseUrl?: string
    gpt5LongContext?: boolean
    model?: string[]
  }

export async function addProviderCommand(providerID: string, options: AddProviderCommandOptions) {
  const { document } = await loadConfigForCommand(options)
  const modelIDs = options.model ?? []
  if (modelIDs.length === 0) throw new Error("At least one --model is required")
  let modelsDevData
  const metadataWarnings: string[] = []
  try {
    modelsDevData = await loadModelsDev()
  } catch (caught) {
    metadataWarnings.push(`models.dev metadata unavailable: ${caught instanceof Error ? caught.message : String(caught)}; no model limit or capabilities were guessed.`)
    modelsDevData = {}
  }

  const endpointKind = parseEndpointKind(options.channelType)
  const apiKeyFilePath = defaultSecretFilePath(providerID)
  const generated = await createProviderDraftFromEndpoint({
    endpointKind,
    providerID,
    name: options.name ?? providerID,
    baseURL: options.baseUrl,
    apiKey: { type: "file", path: apiKeyFilePath },
    modelIDs,
    gpt5LongContext: options.gpt5LongContext,
    modelsDev: { data: modelsDevData },
  })
  generated.provider.npm = recommendedNpmForChannelType(endpointKind)
  const nextConfig = addProvider(document.data, generated.provider)
  const nextText = applyProviderEdit(document, providerID, (nextConfig.provider as Record<string, unknown>)[providerID])

  return writeMutation({
    document,
    options,
    nextConfig,
    nextText,
    warnings: [...metadataWarnings, ...generated.warnings],
    secretFile: { path: apiKeyFilePath, value: parseManagedApiKeyValue(options) },
  })
}
