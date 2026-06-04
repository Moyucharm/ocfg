import type { ConfigDocument, Diagnostic } from "./types.js"
import { getEndpointTemplate } from "../templates/index.js"
import { isRecord } from "./object-utils.js"
import { looksLikeSecret } from "./secret-strategy.js"

export type DoctorLanguage = "en" | "zh-CN"

export type DoctorOptions = {
  language?: DoctorLanguage
}

function looksLikePlaintextApiKey(value: string) {
  return looksLikeSecret(value)
}

function providerModels(config: Record<string, unknown>, providerID: string): Record<string, unknown> | undefined {
  const provider = config.provider
  if (!isRecord(provider)) return undefined
  const providerConfig = provider[providerID]
  if (!isRecord(providerConfig)) return undefined
  return isRecord(providerConfig.models) ? providerConfig.models : undefined
}

function modelReferenceFormatMessage(language: DoctorLanguage, key: "model" | "small_model") {
  if (language === "zh-CN") return `${key} 必须使用 provider_id/model_id 格式`
  return `${key} must use provider_id/model_id format`
}

function missingProviderMessage(language: DoctorLanguage, key: "model" | "small_model", providerID: string) {
  if (language === "zh-CN") return `${key} 引用了当前配置中未定义的渠道 "${providerID}"；它可能是内置或合并后的渠道`
  return `${key} references provider "${providerID}" that is not defined in this config; it may be a built-in or merged provider`
}

function missingModelMessage(language: DoctorLanguage, key: "model" | "small_model", modelRef: string) {
  if (language === "zh-CN") return `${key} 引用了缺失的模型 "${modelRef}"`
  return `${key} references missing model "${modelRef}"`
}

function plaintextApiKeyMessage(language: DoctorLanguage, providerID: string) {
  if (language === "zh-CN") return `渠道 "${providerID}" 似乎存储了明文 API key；建议使用 {env:...} 或 {file:...}`
  return `Provider "${providerID}" appears to store a plaintext API key; prefer {env:...} or {file:...}`
}

function invalidBaseUrlMessage(language: DoctorLanguage, providerID: string) {
  if (language === "zh-CN") return `渠道 "${providerID}" 的 baseURL 必须是字符串`
  return `Provider "${providerID}" baseURL must be a string`
}

function missingProviderModelsMessage(language: DoctorLanguage, providerID: string) {
  if (language === "zh-CN") return `渠道 "${providerID}" 没有配置模型`
  return `Provider "${providerID}" has no configured models`
}

function mismatchedProviderNpmMessage(language: DoctorLanguage, providerID: string, npm: string, modelID: string, expectedNpm: string) {
  if (language === "zh-CN") return `渠道 "${providerID}" 使用 ${npm}，但模型 "${modelID}" 看起来可能需要 ${expectedNpm}`
  return `Provider "${providerID}" uses ${npm}, but model "${modelID}" looks like it may expect ${expectedNpm}`
}

function missingModelLimitMessage(language: DoctorLanguage, providerID: string, modelID: string) {
  if (language === "zh-CN") return `模型 "${providerID}/${modelID}" 缺少 limit 元数据`
  return `Model "${providerID}/${modelID}" has no limit metadata`
}

function checkModelReference(config: Record<string, unknown>, key: "model" | "small_model", language: DoctorLanguage): Diagnostic[] {
  const value = config[key]
  if (typeof value !== "string" || value.length === 0) return []

  const slash = value.indexOf("/")
  if (slash <= 0 || slash === value.length - 1) {
    return [
      {
        severity: "high",
        source: "doctor",
        path: `/${key}`,
        message: modelReferenceFormatMessage(language, key),
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
        message: missingProviderMessage(language, key, providerID),
      },
    ]
  }
  if (!isRecord(models[modelID])) {
    return [
      {
        severity: "high",
        source: "doctor",
        path: `/${key}`,
        message: missingModelMessage(language, key, `${providerID}/${modelID}`),
      },
    ]
  }

  return []
}

function checkProviders(config: Record<string, unknown>, language: DoctorLanguage): Diagnostic[] {
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
          message: plaintextApiKeyMessage(language, providerID),
        })
      }
      if ("baseURL" in options && typeof options.baseURL !== "string") {
        diagnostics.push({
          severity: "high",
          source: "doctor",
          path: `${path}/options/baseURL`,
          message: invalidBaseUrlMessage(language, providerID),
        })
      }
    }

    if (!isRecord(providerConfig.models) || Object.keys(providerConfig.models).length === 0) {
      diagnostics.push({
        severity: "high",
        source: "doctor",
        path: `${path}/models`,
        message: missingProviderModelsMessage(language, providerID),
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
          message: mismatchedProviderNpmMessage(language, providerID, npm, modelID, expectedNpm),
        })
      }
      if (!isRecord(modelConfig.limit)) {
        diagnostics.push({
          severity: "medium",
          source: "doctor",
          path: `${path}/models/${modelID}/limit`,
          message: missingModelLimitMessage(language, providerID, modelID),
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

export function runDoctor(document: ConfigDocument, options: DoctorOptions = {}): Diagnostic[] {
  const language = options.language ?? "en"
  const diagnostics: Diagnostic[] = [...document.diagnostics]
  if (document.diagnostics.some((diagnostic) => diagnostic.source === "parse" && diagnostic.severity === "high")) {
    return diagnostics
  }

  diagnostics.push(...checkModelReference(document.data, "model", language))
  diagnostics.push(...checkModelReference(document.data, "small_model", language))
  diagnostics.push(...checkProviders(document.data, language))
  return diagnostics
}

export function hasHighSeverity(diagnostics: Diagnostic[]) {
  return diagnostics.some((diagnostic) => diagnostic.severity === "high")
}
