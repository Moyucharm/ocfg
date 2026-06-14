import type { EndpointKind, ModelDraft } from "./types.js"
import type { ModelsDevModel, ModelsDevReasoningOption } from "./models-dev.js"

type VariantMap = NonNullable<ModelDraft["variants"]>
type OfficialReasoningStyle = "openai" | "anthropic" | "google" | "zai" | "deepseek" | "moonshot" | "minimax" | "xiaomi" | "alibaba" | "generic"

const encryptedReasoningInclude = ["reasoning.encrypted_content"]

const providerStyles: Record<string, OfficialReasoningStyle> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  "google-vertex": "google",
  deepseek: "deepseek",
  zai: "zai",
  zhipuai: "zai",
  "zai-coding-plan": "zai",
  "zhipuai-coding-plan": "zai",
  moonshotai: "moonshot",
  "moonshotai-cn": "moonshot",
  minimax: "minimax",
  "minimax-cn": "minimax",
  "minimax-coding-plan": "minimax",
  "minimax-cn-coding-plan": "minimax",
  xiaomi: "xiaomi",
  "xiaomi-token-plan-cn": "xiaomi",
  "xiaomi-token-plan-ams": "xiaomi",
  "xiaomi-token-plan-sgp": "xiaomi",
  alibaba: "alibaba",
  "alibaba-cn": "alibaba",
  "alibaba-token-plan": "alibaba",
  "alibaba-token-plan-cn": "alibaba",
  "alibaba-coding-plan": "alibaba",
  "alibaba-coding-plan-cn": "alibaba",
}

function optionType(option: ModelsDevReasoningOption) {
  return typeof option.type === "string" ? option.type : undefined
}

function optionField(option: ModelsDevReasoningOption, field: string) {
  return (option as Record<string, unknown>)[field]
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function outputBudgetLimit(model: ModelsDevModel) {
  const output = model.limit?.output
  return typeof output === "number" && Number.isFinite(output) && output > 1 ? output - 1 : undefined
}

function boundedBudget(target: number, input: { min?: unknown; max?: unknown; model: ModelsDevModel; cap?: number }) {
  const min = isFiniteNonNegative(input.min) ? input.min : undefined
  const maxCandidates = [input.max, outputBudgetLimit(input.model), input.cap].filter(isFiniteNonNegative)
  const max = maxCandidates.length > 0 ? Math.min(...maxCandidates) : undefined
  if (max !== undefined && min !== undefined && max < min) return undefined
  let budget = target
  if (min !== undefined && budget < min) budget = min
  if (max !== undefined && budget > max) budget = max
  if (!Number.isFinite(budget) || budget <= 0) return undefined
  return Math.floor(budget)
}

function maxBudget(input: { min?: unknown; max?: unknown; model: ModelsDevModel; cap?: number }) {
  const target = [input.max, outputBudgetLimit(input.model), input.cap].filter(isFiniteNonNegative)[0]
  return target === undefined ? undefined : boundedBudget(target, input)
}

function openAIResponsesEffort(effort: string) {
  return {
    reasoningEffort: effort,
    reasoningSummary: "auto",
    include: encryptedReasoningInclude,
  }
}

function openAIEffort(endpointKind: EndpointKind, effort: string) {
  return endpointKind === "openai-responses" ? openAIResponsesEffort(effort) : { reasoningEffort: effort }
}

function normalizedModelText(model: ModelsDevModel) {
  return `${model.id} ${model.name}`.toLowerCase().replace(/[._\s]+/g, "-")
}

function normalizeReasoningModelID(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[^:/]+:\s+/, "")
    .replace(/[._\s]+/g, "-")
    .replace(/(^|[-/])([a-z]+)(?=\d)/g, "$1$2-")
    .replace(/(^|[-/])gpt-(\d+)-(\d+)(?=$|[-/])/g, "$1gpt-$2.$3")
    .replace(/-+/g, "-")
}

function modelTextStartsWith(input: { modelID?: string; model: ModelsDevModel }, prefixes: string[]) {
  const ids = [input.modelID, input.model.id, input.model.name].filter((value): value is string => typeof value === "string").map(normalizeReasoningModelID)
  return ids.some((id) => prefixes.some((prefix) => id.startsWith(prefix) || id.includes(`/${prefix}`)))
}

function isMiniMaxM3(model: ModelsDevModel) {
  return normalizedModelText(model).includes("minimax-m3")
}

function versionAtLeast(text: string, family: string, major: number, minor: number) {
  const match = new RegExp(`${family}-(\\d+)-(\\d+)|(\\d+)-(\\d+)-${family}`).exec(text)
  if (!match) return false
  const actualMajor = Number(match[1] ?? match[3])
  const actualMinor = Number(match[2] ?? match[4])
  return actualMajor > major || (actualMajor === major && actualMinor >= minor)
}

function isClaudeModel(model: ModelsDevModel) {
  return normalizedModelText(model).includes("claude-")
}

function isAnthropicAdaptiveEffortModel(model: ModelsDevModel) {
  const text = normalizedModelText(model)
  return text.includes("fable-5") || versionAtLeast(text, "opus", 4, 6) || versionAtLeast(text, "sonnet", 4, 6)
}

function anthropicEffortVariant(model: ModelsDevModel, effort: string) {
  if (isClaudeModel(model) && !isAnthropicAdaptiveEffortModel(model)) return { effort }
  return { thinking: { type: "adaptive" }, effort }
}

function resolveOfficialReasoningStyle(input: {
  providerID?: string
  modelID?: string
  model: ModelsDevModel
}): OfficialReasoningStyle {
  if (modelTextStartsWith(input, ["gpt-", "chatgpt-"]) || [input.modelID, input.model.id].some((value) => /^o-?[1-9](?:$|[-.])/.test(normalizeReasoningModelID(value ?? "")))) return "openai"
  if (modelTextStartsWith(input, ["claude-"])) return "anthropic"
  if (modelTextStartsWith(input, ["gemini-", "gemma-"])) return "google"
  if (modelTextStartsWith(input, ["deepseek-"])) return "deepseek"
  if (modelTextStartsWith(input, ["glm-", "chatglm-", "codegeex-"])) return "zai"
  if (modelTextStartsWith(input, ["kimi-", "moonshot-"])) return "moonshot"
  if (modelTextStartsWith(input, ["minimax-", "abab-"])) return "minimax"
  if (modelTextStartsWith(input, ["mimo-", "xiaomi-mimo-"])) return "xiaomi"
  if (modelTextStartsWith(input, ["qwen-", "qwq-", "qvq-", "wan-"])) return "alibaba"
  const providerStyle = input.providerID ? providerStyles[input.providerID] : undefined
  return providerStyle ?? "generic"
}

function deepSeekEffort(effort: string) {
  if (effort === "low" || effort === "medium") return "high"
  if (effort === "xhigh") return "max"
  return effort
}

function thinkingTypeEffort(type: "enabled" | "adaptive") {
  return { thinking: { type } }
}

function styleEffortVariant(style: OfficialReasoningStyle, endpointKind: EndpointKind, model: ModelsDevModel, effort: string): Record<string, unknown> | undefined {
  if (style === "generic") return endpointEffortVariant(endpointKind, model, effort)

  if (effort === "none") {
    switch (style) {
      case "openai":
        return openAIEffort(endpointKind, "none")
      case "google":
        return { thinkingConfig: { thinkingBudget: 0 } }
      case "anthropic":
      case "zai":
      case "deepseek":
      case "moonshot":
      case "minimax":
      case "xiaomi":
        return { thinking: { type: "disabled" } }
      case "alibaba":
        return { enable_thinking: false }
    }
  }

  switch (style) {
    case "openai":
      return openAIEffort(endpointKind, effort)
    case "anthropic":
      return anthropicEffortVariant(model, effort)
    case "google":
      return { thinkingConfig: { includeThoughts: true, thinkingLevel: effort } }
    case "zai":
      return thinkingTypeEffort("enabled")
    case "deepseek":
      return endpointKind === "anthropic-compatible"
        ? { thinking: { type: "enabled" }, output_config: { effort: deepSeekEffort(effort) } }
        : { thinking: { type: "enabled" }, reasoning_effort: deepSeekEffort(effort) }
    case "moonshot":
    case "xiaomi":
      return thinkingTypeEffort("enabled")
    case "minimax":
      return thinkingTypeEffort("adaptive")
    case "alibaba":
      return { enable_thinking: true }
  }
}

function endpointEffortVariant(endpointKind: EndpointKind, model: ModelsDevModel, effort: string): Record<string, unknown> | undefined {
  if (effort === "none") {
    switch (endpointKind) {
      case "openai-compatible":
        return { reasoningEffort: "none" }
      case "openai-responses":
        return openAIResponsesEffort("none")
      case "anthropic-compatible":
        return { thinking: { type: "disabled" } }
      case "gemini-compatible":
        return { thinkingConfig: { thinkingBudget: 0 } }
    }
  }

  switch (endpointKind) {
    case "openai-compatible":
      return { reasoningEffort: effort }
    case "openai-responses":
      return openAIResponsesEffort(effort)
    case "anthropic-compatible":
      return anthropicEffortVariant(model, effort)
    case "gemini-compatible":
      return { thinkingConfig: { includeThoughts: true, thinkingLevel: effort } }
  }
}

function styleToggleVariants(style: OfficialReasoningStyle, endpointKind: EndpointKind, model: ModelsDevModel): VariantMap {
  if (style === "generic") return endpointToggleVariants(endpointKind, model)
  if (style === "openai") return { none: openAIEffort(endpointKind, "none"), thinking: openAIEffort(endpointKind, "high") }
  if (style === "google") return { none: { thinkingConfig: { thinkingBudget: 0 } }, thinking: { thinkingConfig: { includeThoughts: true } } }
  if (style === "alibaba") return { none: { enable_thinking: false }, thinking: { enable_thinking: true } }
  const thinkingType = style === "minimax" ? "adaptive" : "enabled"
  return { none: { thinking: { type: "disabled" } }, thinking: { thinking: { type: thinkingType } } }
}

function endpointToggleVariants(endpointKind: EndpointKind, model: ModelsDevModel): VariantMap {
  const thinkingType = isMiniMaxM3(model) ? "adaptive" : "enabled"
  switch (endpointKind) {
    case "openai-compatible":
      return {
        none: { thinking: { type: "disabled" } },
        thinking: { thinking: { type: thinkingType } },
      }
    case "openai-responses":
      return {
        none: openAIResponsesEffort("none"),
        thinking: openAIResponsesEffort("high"),
      }
    case "anthropic-compatible":
      return {
        none: { thinking: { type: "disabled" } },
        thinking: { thinking: { type: thinkingType } },
      }
    case "gemini-compatible":
      return {
        none: { thinkingConfig: { thinkingBudget: 0 } },
        thinking: { thinkingConfig: { includeThoughts: true } },
      }
  }
}

function styleBudgetVariant(style: OfficialReasoningStyle, endpointKind: EndpointKind, budget: number): Record<string, unknown> | undefined {
  if (style === "generic") return endpointBudgetVariant(endpointKind, budget)
  switch (style) {
    case "openai":
      return undefined
    case "anthropic":
      return { thinking: { type: "enabled", budgetTokens: budget } }
    case "google":
      return { thinkingConfig: { includeThoughts: true, thinkingBudget: budget } }
    case "zai":
    case "deepseek":
    case "moonshot":
    case "minimax":
    case "xiaomi":
      return undefined
    case "alibaba":
      return { enable_thinking: true, thinking_budget: budget }
  }
}

function endpointBudgetVariant(endpointKind: EndpointKind, budget: number): Record<string, unknown> | undefined {
  switch (endpointKind) {
    case "openai-compatible":
      return { thinking: { type: "enabled", budget_tokens: budget } }
    case "openai-responses":
      return undefined
    case "anthropic-compatible":
      return { thinking: { type: "enabled", budgetTokens: budget } }
    case "gemini-compatible":
      return { thinkingConfig: { includeThoughts: true, thinkingBudget: budget } }
  }
}

function setMissingVariant(variants: VariantMap, name: string, value: Record<string, unknown> | undefined) {
  if (!value || Object.hasOwn(variants, name)) return
  variants[name] = value
}

function effortValues(option: ModelsDevReasoningOption) {
  const rawValues = optionField(option, "values")
  const values = Array.isArray(rawValues) ? rawValues : []
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value !== "default" && value !== "null")
}

export function variantsFromReasoningOptions(input: {
  endpointKind: EndpointKind
  providerID?: string
  modelID?: string
  model: ModelsDevModel
}): VariantMap | undefined {
  if (input.model.reasoning !== true || !Array.isArray(input.model.reasoning_options)) return undefined

  const style = resolveOfficialReasoningStyle({ providerID: input.providerID, modelID: input.modelID, model: input.model })
  const variants: VariantMap = {}
  for (const option of input.model.reasoning_options) {
    switch (optionType(option)) {
      case "toggle":
        for (const [name, value] of Object.entries(styleToggleVariants(style, input.endpointKind, input.model))) setMissingVariant(variants, name, value)
        break

      case "effort":
        for (const effort of effortValues(option)) setMissingVariant(variants, effort, styleEffortVariant(style, input.endpointKind, input.model, effort))
        break

      case "budget_tokens": {
        const min = optionField(option, "min")
        const max = optionField(option, "max")
        if (isFiniteNonNegative(min) && min === 0) {
          setMissingVariant(variants, "none", styleToggleVariants(style, input.endpointKind, input.model).none)
        }
        const cap = style === "anthropic" || (style === "generic" && (input.endpointKind === "anthropic-compatible" || input.endpointKind === "openai-compatible")) ? 31_999 : undefined
        const high = boundedBudget(16_000, { min, max, model: input.model, cap })
        const maximum = maxBudget({ min, max, model: input.model, cap })
        setMissingVariant(variants, "high", high === undefined ? undefined : styleBudgetVariant(style, input.endpointKind, high))
        setMissingVariant(variants, "max", maximum === undefined ? undefined : styleBudgetVariant(style, input.endpointKind, maximum))
        break
      }
    }
  }

  return Object.keys(variants).length > 0 ? variants : undefined
}

export function mergeGeneratedVariants(input: {
  existing?: VariantMap
  generated?: VariantMap
}): VariantMap | undefined {
  if (!input.existing) return input.generated
  if (!input.generated) return input.existing
  const variants: VariantMap = { ...input.existing }
  for (const [name, value] of Object.entries(input.generated)) setMissingVariant(variants, name, value)
  return variants
}
