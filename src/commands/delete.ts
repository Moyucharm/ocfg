import { applyConfigEdit, applyConfigEdits } from "../core/jsonc-editor.js"
import { deleteModel, deleteProvider, findModelReferenceKeys } from "../core/provider-editor.js"
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
  const referenceKeys = findModelReferenceKeys(document.data, providerID, modelID)
  const nextConfig = deleteModel(document.data, providerID, modelID, { confirmReferencedDelete: options.confirmToken })
  const nextText = applyConfigEdits(document, [
    ...referenceKeys.map((key) => ({ path: [key], value: undefined })),
    { path: ["provider", providerID, "models", modelID], value: undefined },
  ])

  return writeMutation({ document, options, nextConfig, nextText })
}
