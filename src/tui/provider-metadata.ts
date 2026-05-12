import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import type { EndpointKind, SecretRef } from "../core/types.js"
import { endpointTemplates } from "../templates/index.js"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function optionValue(provider: Record<string, unknown>, key: string) {
  const options = isRecord(provider.options) ? provider.options : {}
  const value = options[key]
  return typeof value === "string" ? value : undefined
}

function expandHomePath(filePath: string) {
  if (filePath === "~") return homedir()
  if (filePath.startsWith("~/")) return `${homedir()}/${filePath.slice(2)}`
  return filePath
}

export function providerBaseURL(provider: Record<string, unknown>) {
  return optionValue(provider, "baseURL")
}

export function providerApiKeyRef(provider: Record<string, unknown>): SecretRef {
  const value = optionValue(provider, "apiKey")
  if (!value) throw new Error("Provider is missing options.apiKey")

  const envMatch = /^\{env:(.+)\}$/.exec(value)
  if (envMatch) return { type: "env", name: envMatch[1]! }

  const fileMatch = /^\{file:(.+)\}$/.exec(value)
  if (fileMatch) return { type: "file", path: fileMatch[1]! }

  return { type: "plaintext", value, explicit: true }
}

export async function resolveProviderApiKey(provider: Record<string, unknown>) {
  const ref = providerApiKeyRef(provider)
  if (ref.type === "env") {
    const value = process.env[ref.name]?.trim()
    if (!value) throw new Error(`Environment variable "${ref.name}" is empty or missing`)
    return value
  }
  if (ref.type === "file") {
    const value = (await readFile(expandHomePath(ref.path), "utf8")).trim()
    if (!value) throw new Error(`API key file "${ref.path}" is empty`)
    return value
  }
  return ref.value.trim()
}

export function inferEndpointKindFromProvider(provider: Record<string, unknown>): EndpointKind {
  const npm = typeof provider.npm === "string" ? provider.npm : undefined
  for (const [kind, template] of Object.entries(endpointTemplates) as Array<[EndpointKind, { recommendedNpm: string }]>) {
    if (template.recommendedNpm === npm) return kind
  }
  throw new Error(`Provider npm "${npm ?? "(missing)"}" does not map to a supported endpoint kind`)
}
