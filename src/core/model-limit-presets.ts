import { isRecord } from "./object-utils.js"
import type { ModelDraft } from "./types.js"

export const gpt5BudgetLimit = {
  context: 400_000,
  input: 272_000,
  output: 128_000,
}

export const gpt5LongContextLimit = {
  context: 1_050_000,
  input: 922_000,
  output: 128_000,
}

const openAIGpt5LongContextModels = new Set(["gpt-5.4", "gpt-5.4-pro", "gpt-5.5", "gpt-5.5-pro"])

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function modelIDFromRef(value: string) {
  return value.trim().split("/").filter(Boolean).at(-1)?.trim() ?? value.trim()
}

export function canonicalOpenAIGpt5LongContextModelID(value: string) {
  const modelID = modelIDFromRef(value).toLowerCase()
  return openAIGpt5LongContextModels.has(modelID) ? modelID : undefined
}

export function isGpt5LongContextModel(modelID: string) {
  return canonicalOpenAIGpt5LongContextModelID(modelID) !== undefined
}

function limitFromModel(model: Record<string, unknown>) {
  return isRecord(model.limit) ? model.limit : undefined
}

function sameLimit(limit: Record<string, unknown> | undefined, expected: ModelDraft["limit"]) {
  return limit !== undefined
    && numberValue(limit.context) === expected?.context
    && numberValue(limit.input) === expected?.input
    && numberValue(limit.output) === expected?.output
}

function isLongContextLike(limit: Record<string, unknown> | undefined) {
  const context = numberValue(limit?.context)
  const input = numberValue(limit?.input)
  return context !== undefined
    && context >= 1_000_000
    && numberValue(limit?.output) === gpt5LongContextLimit.output
    && (input === undefined || input >= 900_000)
}

export function gpt5LongContextState(model: Record<string, unknown>) {
  const limit = limitFromModel(model)
  if (sameLimit(limit, gpt5LongContextLimit)) return true
  if (sameLimit(limit, gpt5BudgetLimit)) return false
  if (isLongContextLike(limit)) return true
  return undefined
}

export function canUseGpt5LongContextPreset(modelID: string) {
  return isGpt5LongContextModel(modelID)
}

export function gpt5LimitForLongContext(enabled: boolean): ModelDraft["limit"] {
  return enabled ? { ...gpt5LongContextLimit } : { ...gpt5BudgetLimit }
}

export function applyGpt5LongContextLimit(model: ModelDraft, enabled: boolean): ModelDraft {
  return { ...model, limit: gpt5LimitForLongContext(enabled) }
}
