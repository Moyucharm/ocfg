import { applyEdits, modify } from "jsonc-parser"
import type { ConfigDocument } from "./types.js"

const formattingOptions = {
  insertSpaces: true,
  tabSize: 2,
  eol: "\n",
}

export function applyConfigEdit(document: ConfigDocument, path: (string | number)[], value: unknown): string {
  const source = document.text || "{}\n"
  const edits = modify(source, path, value, {
    formattingOptions,
    getInsertionIndex: (properties) => properties.length,
  })
  return applyEdits(source, edits)
}

export function applyProviderEdit(document: ConfigDocument, providerID: string, providerConfig: unknown): string {
  return applyConfigEdit(document, ["provider", providerID], providerConfig)
}

export function applyModelEdit(
  document: ConfigDocument,
  providerID: string,
  modelID: string,
  modelConfig: unknown,
): string {
  return applyConfigEdit(document, ["provider", providerID, "models", modelID], modelConfig)
}
