import { isRecord } from "./object-utils.js"
import type { ConfigTarget } from "./types.js"

export class PluginEditorError extends Error {}

export type PluginOptions = Record<string, unknown>
export type PluginConfigEntry = string | [string, PluginOptions]
export type PluginStatus = "enabled" | "disabled"

export type PluginListItem = {
  index: number
  packageName: string
  options?: PluginOptions
  kind: "package" | "package-with-options"
  status: PluginStatus
  configKind?: "server" | "tui"
  configTarget?: ConfigTarget
}

function cloneConfig(config: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(config)
}

function ensureSchema(config: Record<string, unknown>, schema = "https://opencode.ai/config.json") {
  if (!config.$schema) config.$schema = schema
}

export function normalizePluginPackage(value: string) {
  const packageName = value.trim()
  if (!packageName) throw new PluginEditorError("Plugin package is required")
  if (/\s/.test(packageName)) throw new PluginEditorError("Plugin package must not contain whitespace")
  return packageName
}

function pluginArray(config: Record<string, unknown>): unknown[] {
  if (config.plugin === undefined) return []
  if (!Array.isArray(config.plugin)) throw new PluginEditorError("Top-level plugin config must be an array")
  return config.plugin
}

function ensurePluginArray(config: Record<string, unknown>): unknown[] {
  if (config.plugin === undefined) config.plugin = []
  if (!Array.isArray(config.plugin)) throw new PluginEditorError("Top-level plugin config must be an array")
  return config.plugin
}

function pluginEntryToItem(entry: unknown, index: number, status: PluginStatus): PluginListItem {
  if (typeof entry === "string") {
    return {
      index,
      packageName: normalizePluginPackage(entry),
      kind: "package",
      status,
    }
  }

  if (Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && isRecord(entry[1])) {
    return {
      index,
      packageName: normalizePluginPackage(entry[0]),
      options: entry[1],
      kind: "package-with-options",
      status,
    }
  }

  throw new PluginEditorError(`Plugin entry at index ${index} must be a package string or [package, options] tuple`)
}

export function pluginEntry(packageName: string, options?: PluginOptions): PluginConfigEntry {
  return options === undefined ? packageName : [packageName, options]
}

function findPluginIndex(entries: unknown[], packageName: string) {
  return entries.findIndex((entry, index) => pluginEntryToItem(entry, index, "enabled").packageName === packageName)
}

export function listPlugins(config: Record<string, unknown>, status: PluginStatus = "enabled"): PluginListItem[] {
  return pluginArray(config).map((entry, index) => pluginEntryToItem(entry, index, status))
}

export function findPlugin(config: Record<string, unknown>, packageValue: string): PluginListItem | undefined {
  const packageName = normalizePluginPackage(packageValue)
  return listPlugins(config).find((plugin) => plugin.packageName === packageName)
}

export function pluginItemToEntry(plugin: Pick<PluginListItem, "packageName" | "options">): PluginConfigEntry {
  return pluginEntry(plugin.packageName, plugin.options)
}

export function addPlugin(config: Record<string, unknown>, packageValue: string, options?: PluginOptions, schema?: string): Record<string, unknown> {
  const packageName = normalizePluginPackage(packageValue)
  const next = cloneConfig(config)
  ensureSchema(next, schema)
  const plugins = ensurePluginArray(next)
  if (findPluginIndex(plugins, packageName) !== -1) throw new PluginEditorError(`Plugin "${packageName}" already exists`)
  plugins.push(pluginEntry(packageName, options))
  return next
}

export function enablePlugin(config: Record<string, unknown>, packageValue: string, options?: PluginOptions, schema?: string): Record<string, unknown> {
  const packageName = normalizePluginPackage(packageValue)
  const next = cloneConfig(config)
  ensureSchema(next, schema)
  const plugins = ensurePluginArray(next)
  const index = findPluginIndex(plugins, packageName)
  if (index === -1) {
    plugins.push(pluginEntry(packageName, options))
    return next
  }
  if (options !== undefined) plugins[index] = pluginEntry(packageName, options)
  return next
}

export function updatePluginOptions(
  config: Record<string, unknown>,
  packageValue: string,
  patch: { options?: PluginOptions; clearOptions?: boolean },
): Record<string, unknown> {
  const packageName = normalizePluginPackage(packageValue)
  if (patch.options !== undefined && patch.clearOptions) throw new PluginEditorError("Cannot set and clear plugin options at the same time")
  if (patch.options === undefined && !patch.clearOptions) throw new PluginEditorError("No plugin option change was requested")

  const next = cloneConfig(config)
  const plugins = ensurePluginArray(next)
  const index = findPluginIndex(plugins, packageName)
  if (index === -1) throw new PluginEditorError(`Plugin "${packageName}" does not exist`)

  plugins[index] = patch.clearOptions ? packageName : pluginEntry(packageName, patch.options)
  return next
}

export function disablePlugin(config: Record<string, unknown>, packageValue: string): Record<string, unknown> {
  const packageName = normalizePluginPackage(packageValue)
  const next = cloneConfig(config)
  const plugins = ensurePluginArray(next)
  const index = findPluginIndex(plugins, packageName)
  if (index !== -1) plugins.splice(index, 1)
  return next
}

export function deletePlugin(config: Record<string, unknown>, packageValue: string): Record<string, unknown> {
  const packageName = normalizePluginPackage(packageValue)
  const next = cloneConfig(config)
  const plugins = ensurePluginArray(next)
  const index = findPluginIndex(plugins, packageName)
  if (index === -1) throw new PluginEditorError(`Plugin "${packageName}" does not exist`)
  plugins.splice(index, 1)
  return next
}
