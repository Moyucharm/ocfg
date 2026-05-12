import { addProvider } from "../core/provider-editor.js"
import { createProviderDraftFromEndpoint } from "../core/provider-generator.js"
import { applyProviderEdit } from "../core/jsonc-editor.js"
import { loadModelsDev } from "../core/models-dev.js"
import {
  loadConfigForCommand,
  parseEndpointKind,
  parseSecretRef,
  writeMutation,
  type MutatingCommandOptions,
  type SecretCommandOptions,
} from "./common.js"

export type AddProviderCommandOptions = MutatingCommandOptions &
  SecretCommandOptions & {
    endpointKind: string
    name?: string
    baseUrl?: string
    model?: string[]
  }

export async function addProviderCommand(providerID: string, options: AddProviderCommandOptions) {
  const { document } = await loadConfigForCommand(options)
  const modelIDs = options.model ?? []
  if (modelIDs.length === 0) throw new Error("At least one --model is required")
  let modelsDevData
  try {
    modelsDevData = await loadModelsDev()
  } catch {
    modelsDevData = {}
  }

  const generated = await createProviderDraftFromEndpoint({
    endpointKind: parseEndpointKind(options.endpointKind),
    providerID,
    name: options.name ?? providerID,
    baseURL: options.baseUrl,
    apiKey: parseSecretRef(options),
    modelIDs,
    modelsDev: { data: modelsDevData },
  })
  const nextConfig = addProvider(document.data, generated.provider)
  const nextText = applyProviderEdit(document, providerID, (nextConfig.provider as Record<string, unknown>)[providerID])

  return writeMutation({ document, options, nextConfig, nextText })
}
