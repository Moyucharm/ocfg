import { applyConfigEdit } from "../core/jsonc-editor.js"
import { deleteModel, deleteProvider } from "../core/provider-editor.js"
import { loadConfigForCommand, parseModelRef, writeMutation, type MutatingCommandOptions } from "./common.js"

export type DeleteCommandOptions = MutatingCommandOptions & {
  confirmToken?: string
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
