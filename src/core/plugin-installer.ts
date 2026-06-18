import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { promisify } from "node:util"
import { applyEdits, modify } from "jsonc-parser"
import { getDefaultOcfgDataPath, locateConfig } from "./config-locator.js"
import { readConfig } from "./config-reader.js"
import { isRecord } from "./object-utils.js"
import { normalizePluginPackage, pluginEntry, PluginEditorError, type PluginConfigEntry, type PluginOptions } from "./plugin-editor.js"
import type { ConfigDocument, ConfigLocatorOptions, ConfigTarget } from "./types.js"

const execFileAsync = promisify(execFile)
const npmViewMaxBuffer = 10 * 1024 * 1024

export class PluginInstallError extends Error {}

export type PluginHostKind = "server" | "tui"
export type PluginTargetSelection = "auto" | PluginHostKind | "both"

export type PluginInstallTarget = {
  kind: PluginHostKind
  options?: PluginOptions
}

export type PluginManifestResolver = (spec: string) => Promise<PluginInstallTarget[]>

export type PreparedPluginInstallWrite = {
  kind: PluginHostKind
  mode: "add" | "replace" | "noop"
  target: ConfigTarget
  document: ConfigDocument
  nextConfig: Record<string, unknown>
  nextText: string
}

export type PreparePluginInstallInput = ConfigLocatorOptions & {
  pluginTarget?: PluginTargetSelection
  options?: PluginOptions
  resolveManifest?: PluginManifestResolver
}

const formattingOptions = {
  insertSpaces: true,
  tabSize: 2,
  eol: "\n",
}

export function pluginSchemaForKind(kind: PluginHostKind) {
  return kind === "server" ? "https://opencode.ai/config.json" : "https://opencode.ai/tui.json"
}

function configNameForKind(kind: PluginHostKind) {
  return kind === "server" ? "opencode" : "tui"
}

function formatFromPath(filePath: string): "json" | "jsonc" {
  return filePath.endsWith(".json") ? "json" : "jsonc"
}

function expandHome(filePath: string, home: string) {
  if (filePath === "~") return home
  if (filePath.startsWith("~/") || filePath.startsWith("~\\")) return path.join(home, filePath.slice(2))
  return filePath
}

function pluginConfigPaths(directory: string, kind: PluginHostKind) {
  const name = configNameForKind(kind)
  return [path.join(directory, `${name}.json`), path.join(directory, `${name}.jsonc`)]
}

function configTarget(filePath: string, scope: ConfigTarget["scope"], home: string): ConfigTarget {
  return {
    scope,
    path: filePath,
    exists: existsSync(filePath),
    format: formatFromPath(filePath),
    ocfgDataPath: getDefaultOcfgDataPath(home),
  }
}

function firstPluginConfigTarget(directory: string, kind: PluginHostKind, scope: ConfigTarget["scope"], home: string) {
  const [jsonPath, jsoncPath] = pluginConfigPaths(directory, kind)
  const selected = existsSync(jsonPath) || !existsSync(jsoncPath) ? jsonPath : jsoncPath
  return configTarget(selected, scope, home)
}

function pluginConfigTargetsInDirectory(directory: string, kind: PluginHostKind, scope: ConfigTarget["scope"], home: string) {
  const existing = pluginConfigPaths(directory, kind)
    .filter((filePath) => existsSync(filePath))
    .map((filePath) => configTarget(filePath, scope, home))
  return existing.length > 0 ? existing : [firstPluginConfigTarget(directory, kind, scope, home)]
}

function globalPluginConfigDirectory(home: string) {
  return path.join(home, ".config", "opencode")
}

function hasProjectPluginConfig(directory: string) {
  return (["server", "tui"] as const).some((kind) => pluginConfigPaths(directory, kind).some((filePath) => existsSync(filePath)))
}

function projectPluginConfigDirectory(cwd = process.cwd()) {
  let current = path.resolve(cwd)

  while (true) {
    const directory = path.join(current, ".opencode")
    if (hasProjectPluginConfig(directory)) return directory

    const parent = path.dirname(current)
    if (parent === current) break
    if (existsSync(path.join(current, ".git"))) break
    current = parent
  }

  return path.join(path.resolve(cwd), ".opencode")
}

function customPluginConfigDirectory(configPath: string, home: string) {
  const expanded = expandHome(configPath, home)
  const resolved = path.isAbsolute(expanded) ? expanded : path.resolve(expanded)
  return path.dirname(resolved)
}

function kindForCanonicalConfigPath(filePath: string): PluginHostKind | undefined {
  const basename = path.basename(filePath)
  if (basename === "opencode.json" || basename === "opencode.jsonc") return "server"
  if (basename === "tui.json" || basename === "tui.jsonc") return "tui"
}

function patch(text: string, patchPath: Array<string | number>, value: unknown, insert = false) {
  return applyEdits(
    text,
    modify(text, patchPath, value, {
      formattingOptions,
      getInsertionIndex: (properties) => properties.length,
      isArrayInsertion: insert,
    }),
  )
}

function exportValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const next = value.trim()
    return next || undefined
  }
  if (!isRecord(value)) return undefined

  for (const key of ["import", "default"]) {
    const raw = value[key]
    if (typeof raw !== "string") continue
    const next = raw.trim()
    if (next) return next
  }
}

function exportOptions(value: unknown): PluginOptions | undefined {
  if (!isRecord(value)) return undefined
  return isRecord(value.config) ? value.config : undefined
}

function exportTarget(pkg: Record<string, unknown>, kind: PluginHostKind): PluginInstallTarget | undefined {
  const exports = pkg.exports
  if (!isRecord(exports)) return undefined
  const value = exports[`./${kind}`]
  if (!exportValue(value)) return undefined
  return { kind, options: exportOptions(value) }
}

function hasMainTarget(pkg: Record<string, unknown>) {
  return typeof pkg.main === "string" && pkg.main.trim().length > 0
}

function isAbsoluteThemePath(value: string) {
  return path.isAbsolute(value) || path.win32.isAbsolute(value)
}

function hasPackageThemes(spec: string, pkg: Record<string, unknown>) {
  const themes = pkg["oc-themes"]
  if (themes === undefined) return false
  if (!Array.isArray(themes)) throw new PluginInstallError(`Plugin "${spec}" has invalid oc-themes field`)

  let validCount = 0
  for (const item of themes) {
    if (typeof item !== "string") throw new PluginInstallError(`Plugin "${spec}" has invalid oc-themes entry`)
    const raw = item.trim()
    if (!raw) throw new PluginInstallError(`Plugin "${spec}" has empty oc-themes entry`)
    if (raw.startsWith("file://") || isAbsoluteThemePath(raw)) throw new PluginInstallError(`Plugin "${spec}" oc-themes entry must be relative: ${item}`)

    const normalized = path.posix.normalize(raw.replace(/\\/g, "/"))
    if (normalized === ".." || normalized.startsWith("../")) throw new PluginInstallError(`Plugin "${spec}" oc-themes entry must stay inside the package: ${item}`)
    validCount += 1
  }

  return validCount > 0
}

export function pluginTargetsFromPackage(spec: string, pkg: Record<string, unknown>): PluginInstallTarget[] {
  const targets: PluginInstallTarget[] = []
  const server = exportTarget(pkg, "server")
  if (server) targets.push(server)
  else if (hasMainTarget(pkg)) targets.push({ kind: "server" })

  const tui = exportTarget(pkg, "tui")
  if (tui) targets.push(tui)
  if (!targets.some((target) => target.kind === "tui") && hasPackageThemes(spec, pkg)) targets.push({ kind: "tui" })

  return targets
}

export async function readNpmPluginManifest(spec: string): Promise<PluginInstallTarget[]> {
  const { stdout } = await execFileAsync("npm", ["view", spec, "--json"], { maxBuffer: npmViewMaxBuffer })
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch (caught) {
    throw new PluginInstallError(`Failed to parse npm metadata for "${spec}": ${caught instanceof Error ? caught.message : String(caught)}`)
  }

  const metadata = Array.isArray(parsed) ? parsed.at(-1) : parsed
  if (!isRecord(metadata)) throw new PluginInstallError(`npm metadata for "${spec}" must be an object`)
  const targets = pluginTargetsFromPackage(spec, metadata)
  if (targets.length === 0) throw new PluginInstallError(`"${spec}" does not expose server or TUI plugin targets`)
  return targets
}

export function parsePluginTargetSelection(value: unknown, fallback: PluginTargetSelection): PluginTargetSelection {
  if (value === undefined) return fallback
  if (value === "auto" || value === "server" || value === "tui" || value === "both") return value
  throw new PluginInstallError(`Invalid plugin target "${String(value)}". Expected auto, server, tui, or both.`)
}

function manualTargets(selection: Exclude<PluginTargetSelection, "auto">, options?: PluginOptions): PluginInstallTarget[] {
  if (selection === "both") return [{ kind: "server", options }, { kind: "tui", options }]
  return [{ kind: selection, options }]
}

export async function resolvePluginInstallTargets(
  spec: string,
  selection: PluginTargetSelection,
  options?: PluginOptions,
  resolveManifest: PluginManifestResolver = readNpmPluginManifest,
): Promise<PluginInstallTarget[]> {
  const targets = selection === "auto" ? await resolveManifest(spec) : manualTargets(selection, options)
  if (targets.length === 0) throw new PluginInstallError(`"${spec}" does not expose server or TUI plugin targets`)
  return options === undefined ? targets : targets.map((target) => ({ ...target, options }))
}

function pluginSpec(entry: unknown) {
  if (typeof entry === "string") return entry
  if (!Array.isArray(entry) || typeof entry[0] !== "string") return undefined
  return entry[0]
}

export function packageNameForSpec(spec: string) {
  const value = spec.trim()
  if (value.startsWith("file://")) return value
  if (value.startsWith("@")) {
    const slash = value.indexOf("/")
    if (slash === -1) return value
    const version = value.indexOf("@", slash + 1)
    return version === -1 ? value : value.slice(0, version)
  }
  const version = value.indexOf("@")
  return version <= 0 ? value : value.slice(0, version)
}

function pluginList(config: Record<string, unknown>): unknown[] | undefined {
  if (config.plugin === undefined) return undefined
  if (!Array.isArray(config.plugin)) throw new PluginEditorError("Top-level plugin config must be an array")
  return config.plugin
}

function cloneConfig(config: Record<string, unknown>) {
  return structuredClone(config)
}

export function locatePluginHostConfig(options: ConfigLocatorOptions, kind: PluginHostKind) {
  const home = options.home ?? os.homedir()
  if (!options.configPath) return locatePluginHostConfigTargets(options, kind)[0] ?? firstPluginConfigTarget(globalPluginConfigDirectory(home), kind, "global", home)

  const explicitTarget = locateConfig(options)
  const explicitKind = kindForCanonicalConfigPath(explicitTarget.path)
  if (!explicitKind || explicitKind === kind) return explicitTarget

  return firstPluginConfigTarget(path.dirname(explicitTarget.path), kind, explicitTarget.scope, home)
}

export function locatePluginHostConfigTargets(options: ConfigLocatorOptions, kind: PluginHostKind): ConfigTarget[] {
  const home = options.home ?? os.homedir()
  if (!options.configPath) {
    if (options.scope === "project") return pluginConfigTargetsInDirectory(projectPluginConfigDirectory(options.cwd), kind, "project", home)
    return pluginConfigTargetsInDirectory(globalPluginConfigDirectory(home), kind, "global", home)
  }

  const explicitTarget = locateConfig(options)
  const explicitKind = kindForCanonicalConfigPath(explicitTarget.path)
  if (!explicitKind) return [explicitTarget]
  if (explicitKind === kind) {
    if (!explicitTarget.exists) return [explicitTarget]
    const targets = pluginConfigTargetsInDirectory(path.dirname(explicitTarget.path), kind, explicitTarget.scope, home)
    return [explicitTarget, ...targets.filter((target) => target.path !== explicitTarget.path)]
  }

  return pluginConfigTargetsInDirectory(customPluginConfigDirectory(explicitTarget.path, home), kind, explicitTarget.scope, home)
}

export async function readPluginHostConfig(target: ConfigTarget): Promise<ConfigDocument> {
  const document = await readConfig(target)
  if (!target.exists) return { ...document, data: {}, text: "" }
  return document
}

async function readPluginHostConfigs(options: ConfigLocatorOptions, kind: PluginHostKind) {
  return Promise.all(locatePluginHostConfigTargets(options, kind).map((target) => readPluginHostConfig(target)))
}

function pluginLocations(document: ConfigDocument, kind: PluginHostKind, packageKey: string) {
  const list = pluginList(document.data) ?? []
  return list
    .map((entry, index) => ({ kind, document, index, spec: pluginSpec(entry) }))
    .filter((location) => location.spec && !location.spec.startsWith("file://") && packageNameForSpec(location.spec) === packageKey)
}

function duplicateLocationMessage(spec: string, locations: Array<{ kind: PluginHostKind; document: ConfigDocument; spec?: string }>) {
  const files = locations.map((location) => `${location.kind}:${location.document.target.path}`).join(", ")
  return `Plugin "${spec}" already exists in multiple plugin config files: ${files}`
}

function targetKindsLabel(kinds: Set<PluginHostKind>) {
  return [...kinds].join(" and ")
}

export function preparePluginHostWrite(
  document: ConfigDocument,
  kind: PluginHostKind,
  specValue: string,
  options?: PluginOptions,
): PreparedPluginInstallWrite {
  const spec = normalizePluginPackage(specValue)
  const list = pluginList(document.data)
  const specPackage = packageNameForSpec(spec)
  const rows = (list ?? []).map((entry, index) => ({ entry, index, spec: pluginSpec(entry) }))
  const exact = rows.find((row) => row.spec === spec)
  const duplicatePackage = rows.find((row) => row.spec && !row.spec.startsWith("file://") && packageNameForSpec(row.spec) === specPackage)
  const nextConfig = cloneConfig(document.data)
  if (!nextConfig.$schema) nextConfig.$schema = pluginSchemaForKind(kind)
  const nextList = pluginList(nextConfig) ?? []
  if (!nextConfig.plugin) nextConfig.plugin = nextList

  const entry = pluginEntry(spec, options)
  let text = document.text || "{}\n"
  const hadSchema = document.target.exists && document.data.$schema !== undefined
  if (!hadSchema) text = patch(text, ["$schema"], pluginSchemaForKind(kind))

  if (exact) {
    if (options === undefined) {
      return { kind, mode: hadSchema ? "noop" : "replace", target: document.target, document, nextConfig, nextText: text }
    }
    nextList[exact.index] = entry
    text = patch(text, ["plugin", exact.index], entry)
    return { kind, mode: "replace", target: document.target, document, nextConfig, nextText: text }
  }

  if (duplicatePackage) {
    return { kind, mode: hadSchema ? "noop" : "replace", target: document.target, document, nextConfig, nextText: text }
  }

  nextList.push(entry)
  if (!list) text = patch(text, ["plugin"], [entry])
  else text = patch(text, ["plugin", list.length], entry, true)

  return { kind, mode: "add", target: document.target, document, nextConfig, nextText: text }
}

export async function preparePluginInstallWrites(input: PreparePluginInstallInput & { spec: string }): Promise<PreparedPluginInstallWrite[]> {
  const selection = input.pluginTarget ?? "auto"
  const targets = await resolvePluginInstallTargets(input.spec, selection, input.options, input.resolveManifest)
  const writes: PreparedPluginInstallWrite[] = []
  const targetKinds = new Set(targets.map((target) => target.kind))
  const packageKey = packageNameForSpec(normalizePluginPackage(input.spec))
  const documentsByKind = new Map<PluginHostKind, ConfigDocument[]>()

  async function documentsFor(kind: PluginHostKind) {
    const existing = documentsByKind.get(kind)
    if (existing) return existing
    const documents = await readPluginHostConfigs(input, kind)
    documentsByKind.set(kind, documents)
    return documents
  }

  if (selection !== "both") {
    for (const kind of ["server", "tui"] as const) {
      if (targetKinds.has(kind)) continue
      const duplicates = (await documentsFor(kind)).flatMap((document) => pluginLocations(document, kind, packageKey))
      if (duplicates.length > 0) {
        const targetsLabel = targetKindsLabel(targetKinds)
        if (selection === "auto") throw new PluginInstallError(`Plugin "${input.spec}" is already configured for ${kind} at ${duplicates[0]?.document.target.path}, but package metadata targets ${targetsLabel}. Remove the existing entry or pass --plugin-target ${kind} explicitly.`)
        throw new PluginInstallError(`Plugin "${input.spec}" is already configured for ${kind} at ${duplicates[0]?.document.target.path}. Remove the existing entry before installing it into ${targetsLabel}.`)
      }
    }
  }

  for (const target of targets) {
    const documents = await documentsFor(target.kind)
    const duplicates = documents.flatMap((document) => pluginLocations(document, target.kind, packageKey))
    if (duplicates.length > 1) throw new PluginInstallError(duplicateLocationMessage(input.spec, duplicates))

    const primaryTarget = locatePluginHostConfig(input, target.kind)
    const document = duplicates[0]?.document ?? documents.find((item) => item.target.path === primaryTarget.path) ?? await readPluginHostConfig(primaryTarget)
    writes.push(preparePluginHostWrite(document, target.kind, input.spec, target.options))
  }

  return writes
}
