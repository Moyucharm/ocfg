import { applyConfigEdit, applyConfigEdits } from "./jsonc-editor.js"
import { isRecord } from "./object-utils.js"
import type { ConfigDocument } from "./types.js"

const OPENCODE_SCHEMA = "https://opencode.ai/config.json"

export type CompactionSettings = {
  auto: boolean
  prune: boolean
  reserved: number
}

export const defaultCompactionSettings: CompactionSettings = {
  auto: true,
  prune: false,
  reserved: 10000,
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

function validateCompactionSettings(settings: CompactionSettings) {
  if (!nonNegativeInteger(settings.reserved)) throw new Error("compaction.reserved must be a non-negative integer")
}

export function readCompactionSettings(config: Record<string, unknown>): CompactionSettings {
  const compaction = isRecord(config.compaction) ? config.compaction : {}
  return {
    auto: typeof compaction.auto === "boolean" ? compaction.auto : defaultCompactionSettings.auto,
    prune: typeof compaction.prune === "boolean" ? compaction.prune : defaultCompactionSettings.prune,
    reserved: nonNegativeInteger(compaction.reserved) ? compaction.reserved : defaultCompactionSettings.reserved,
  }
}

export function applyCompactionSettings(config: Record<string, unknown>, settings: CompactionSettings): Record<string, unknown> {
  validateCompactionSettings(settings)
  const next = structuredClone(config)
  if (!next.$schema) next.$schema = OPENCODE_SCHEMA
  const currentCompaction = isRecord(next.compaction) ? next.compaction : {}
  next.compaction = {
    ...currentCompaction,
    auto: settings.auto,
    prune: settings.prune,
    reserved: settings.reserved,
  }
  return next
}

export function applyCompactionText(document: ConfigDocument, nextConfig: Record<string, unknown>): string {
  let nextText = document.text || "{}\n"
  if (nextConfig.$schema !== undefined && (!document.target.exists || document.data.$schema !== nextConfig.$schema)) {
    nextText = applyConfigEdit({ ...document, text: nextText }, ["$schema"], nextConfig.$schema)
  }

  if (isRecord(document.data.compaction) && isRecord(nextConfig.compaction)) {
    nextText = applyConfigEdits({ ...document, text: nextText }, [
      { path: ["compaction", "auto"], value: nextConfig.compaction.auto },
      { path: ["compaction", "prune"], value: nextConfig.compaction.prune },
      { path: ["compaction", "reserved"], value: nextConfig.compaction.reserved },
    ])
    return nextText
  }

  return applyConfigEdit({ ...document, text: nextText }, ["compaction"], nextConfig.compaction)
}
