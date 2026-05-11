import type { ConfigDocument, Diagnostic } from "./types.js"
import { getEndpointTemplate } from "../templates/index.js"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function looksLikePlaintextApiKey(value: string) {
  if (value.startsWith("{env:") || value.startsWith("{file:")) return false
  return /^(sk-|sk_|AIza|xai-|claude-|[A-Za-z0-9_-]{32,})/.test(value)
}

function providerModels(config: Record<string, unknown>, providerID: string): Record<string, unknown> | undefined {
  const provider = config.provider
  if (!isRecord(provider)) return undefined
  const providerConfig = provider[providerID]
  if (!isRecord(providerConfig)) return undefined
  return isRecord(providerConfig.models) ? providerConfig.models : undefined
}

function checkModelReference(config: Record<string, unknown>, key: "model" | "small_model"): Diagnostic[] {
  const value = config[key]
  if (typeof value !== "string" || value.length === 0) return []

  const slash = value.indexOf("/")
  if (slash <= 0 || slash === value.length - 1) {
    return [
      {
        severity: "high",
        source: "doctor",
        path: `/${key}`,
        message: `${key} must use provider_id/model_id format`,
      },
    ]
  }

  const providerID = value.slice(0, slash)
  const modelID = value.slice(slash + 1)
  const models = providerModels(config, providerID)
  if (!models) {
    return [
      {
        severity: "low",
        source: "doctor",
        path: `/${key}`,
        message: `${key} references provider "${providerID}" that is not defined in this config; it may be a built-in or merged provider`,
      },
    ]
  }
  if (!isRecord(models[modelID])) {
    return [
      {
        severity: "high",
        source: "doctor",
        path: `/${key}`,
        message: `${key} references missing model "${providerID}/${modelID}"`,
      },
    ]
  }

  return []
}

function checkProviders(config: Record<string, unknown>): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  if (!isRecord(config.provider)) return diagnostics

  for (const [providerID, providerConfig] of Object.entries(config.provider)) {
    if (!isRecord(providerConfig)) continue

    const path = `/provider/${providerID}`
    const options = providerConfig.options
    if (isRecord(options)) {
      if (typeof options.apiKey === "string" && looksLikePlaintextApiKey(options.apiKey)) {
        diagnostics.push({
          severity: "medium",
          source: "doctor",
          path: `${path}/options/apiKey`,
          message: `Provider "${providerID}" appears to store a plaintext API key; prefer {env:...} or {file:...}`,
        })
      }
      if ("baseURL" in options && typeof options.baseURL !== "string") {
        diagnostics.push({
          severity: "high",
          source: "doctor",
          path: `${path}/options/baseURL`,
          message: `Provider "${providerID}" baseURL must be a string`,
        })
      }
    }

    if (!isRecord(providerConfig.models) || Object.keys(providerConfig.models).length === 0) {
      diagnostics.push({
        severity: "high",
        source: "doctor",
        path: `${path}/models`,
        message: `Provider "${providerID}" has no configured models`,
      })
      continue
    }

    for (const [modelID, modelConfig] of Object.entries(providerConfig.models)) {
      if (!isRecord(modelConfig)) continue
      const npm = typeof providerConfig.npm === "string" ? providerConfig.npm : undefined
      const expectedNpm = expectedNpmForModel(modelID)
      if (expectedNpm && npm && npm !== expectedNpm) {
        diagnostics.push({
          severity: "medium",
          source: "doctor",
          path: `${path}/npm`,
          message: `Provider "${providerID}" uses ${npm}, but model "${modelID}" looks like it may expect ${expectedNpm}`,
        })
      }
      if (!isRecord(modelConfig.limit)) {
        diagnostics.push({
          severity: "medium",
          source: "doctor",
          path: `${path}/models/${modelID}/limit`,
          message: `Model "${providerID}/${modelID}" has no limit metadata`,
        })
      }
    }
  }

  return diagnostics
}

function expectedNpmForModel(modelID: string) {
  if (/claude/i.test(modelID)) return getEndpointTemplate("anthropic-compatible").recommendedNpm
  if (/gemini/i.test(modelID)) return getEndpointTemplate("gemini-compatible").recommendedNpm
  return undefined
}

export function runDoctor(document: ConfigDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [...document.diagnostics]
  if (document.diagnostics.some((diagnostic) => diagnostic.source === "parse" && diagnostic.severity === "high")) {
    return diagnostics
  }

  diagnostics.push(...checkModelReference(document.data, "model"))
  diagnostics.push(...checkModelReference(document.data, "small_model"))
  diagnostics.push(...checkProviders(document.data))
  return diagnostics
}

export function hasHighSeverity(diagnostics: Diagnostic[]) {
  return diagnostics.some((diagnostic) => diagnostic.severity === "high")
}
