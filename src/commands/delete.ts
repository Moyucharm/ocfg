import { applyConfigEdit } from "../core/jsonc-editor.js"
import { deleteModel, deleteProvider } from "../core/provider-editor.js"
import { loadConfigForCommand, writeMutation, type MutatingCommandOptions } from "./common.js"

export type DeleteCommandOptions = MutatingCommandOptions & {
  confirmToken?: string
}

function parseModelRef(ref: string) {
  const slash = ref.indexOf("/")
  if (slash <= 0 || slash === ref.length - 1) throw new Error("Model ref must use provider_id/model_id format")
  return { providerID: ref.slice(0, slash), modelID: ref.slice(slash + 1) }
}

export async function deleteProviderCommand(providerID: string, options: DeleteCommandOptions) {
  const { document } = await loadConfigForCommand(options)
  const nextConfig = deleteProvider(document.data, providerID, { confirmReferencedDelete: options.confirmToken })
  const nextText = applyConfigEdit(document, ["provider", providerID], undefined)

  return writeMutation({ document, options, nextConfig, nextText })
}

export async function deleteModelCommand(modelRef: string, options: DeleteCommandOptions) {
  const { providerID, modelID } = parseModelRef(modelRef)
  const { document } = await loadConfigForCommand(options)
  const nextConfig = deleteModel(document.data, providerID, modelID, { confirmReferencedDelete: options.confirmToken })
  const nextText = applyConfigEdit(document, ["provider", providerID, "models", modelID], undefined)

  return writeMutation({ document, options, nextConfig, nextText })
}
