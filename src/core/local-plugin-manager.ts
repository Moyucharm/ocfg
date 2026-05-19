import { copyFile, mkdir, readdir, rename, stat } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import type { ConfigScope } from "./types.js"

export class LocalPluginError extends Error {}

export type LocalPluginStatus = "enabled" | "disabled"

export type LocalPluginItem = {
  scope: ConfigScope
  directory: string
  fileName: string
  activeFileName: string
  name: string
  path: string
  status: LocalPluginStatus
}

export type LocalPluginMutationResult = {
  action: "install" | "enable" | "disable"
  scope: ConfigScope
  directory: string
  changed: boolean
  dryRun: boolean
  fromPath?: string
  toPath: string
}

export type LocalPluginManagerOptions = {
  scope?: ConfigScope
  cwd?: string
  home?: string
  dryRun?: boolean
}

const supportedExtensions = new Set([".js", ".mjs", ".cjs", ".ts"])
const disabledSuffix = ".disabled"

function localPluginDirectory(scope: ConfigScope, options: LocalPluginManagerOptions = {}) {
  if (scope === "project") return path.join(path.resolve(options.cwd ?? process.cwd()), ".opencode", "plugins")
  return path.join(options.home ?? os.homedir(), ".config", "opencode", "plugins")
}

function expandHome(filePath: string, home: string) {
  if (filePath === "~") return home
  if (filePath.startsWith("~/") || filePath.startsWith("~\\")) return path.join(home, filePath.slice(2))
  return filePath
}

function resolveUserPath(filePath: string, options: LocalPluginManagerOptions = {}) {
  const expanded = expandHome(filePath, options.home ?? os.homedir())
  return path.isAbsolute(expanded) ? expanded : path.resolve(options.cwd ?? process.cwd(), expanded)
}

function isSupportedPluginFile(fileName: string) {
  return supportedExtensions.has(path.extname(fileName))
}

function parsePluginFile(scope: ConfigScope, directory: string, fileName: string): LocalPluginItem | undefined {
  const disabled = fileName.endsWith(disabledSuffix)
  const activeFileName = disabled ? fileName.slice(0, -disabledSuffix.length) : fileName
  if (!isSupportedPluginFile(activeFileName)) return undefined

  return {
    scope,
    directory,
    fileName,
    activeFileName,
    name: path.basename(activeFileName, path.extname(activeFileName)),
    path: path.join(directory, fileName),
    status: disabled ? "disabled" : "enabled",
  }
}

function normalizeLocalPluginFileName(value: string) {
  const fileName = path.basename(value.trim())
  if (!fileName) throw new LocalPluginError("Local plugin file name is required")
  return fileName
}

function resolveScope(options: LocalPluginManagerOptions = {}) {
  return options.scope ?? "global"
}

async function pathExists(filePath: string) {
  return stat(filePath)
    .then(() => true)
    .catch(() => false)
}

function findLocalPlugin(plugins: LocalPluginItem[], value: string, status?: LocalPluginStatus) {
  const requested = normalizeLocalPluginFileName(value)
  return plugins.find((plugin) => {
    if (status && plugin.status !== status) return false
    return plugin.fileName === requested || plugin.activeFileName === requested || plugin.name === requested
  })
}

export function resolveLocalPluginDirectory(options: LocalPluginManagerOptions = {}) {
  return localPluginDirectory(resolveScope(options), options)
}

export async function listLocalPlugins(options: LocalPluginManagerOptions = {}): Promise<LocalPluginItem[]> {
  const scope = resolveScope(options)
  const directory = localPluginDirectory(scope, options)
  let entries: string[]
  try {
    entries = await readdir(directory)
  } catch {
    return []
  }

  return entries
    .map((entry) => parsePluginFile(scope, directory, entry))
    .filter((entry): entry is LocalPluginItem => entry !== undefined)
    .sort((left, right) => left.fileName.localeCompare(right.fileName))
}

export async function installLocalPlugin(sourcePath: string, options: LocalPluginManagerOptions & { name?: string } = {}): Promise<LocalPluginMutationResult> {
  const scope = resolveScope(options)
  const directory = localPluginDirectory(scope, options)
  const source = resolveUserPath(sourcePath, options)
  const sourceStats = await stat(source).catch(() => undefined)
  if (!sourceStats?.isFile()) throw new LocalPluginError(`Local plugin source "${source}" is not a file`)

  const fileName = normalizeLocalPluginFileName(options.name ?? source)
  if (!isSupportedPluginFile(fileName)) throw new LocalPluginError("Local plugin file must use .js, .mjs, .cjs, or .ts")
  const target = path.join(directory, fileName)
  if (await pathExists(target)) throw new LocalPluginError(`Local plugin "${fileName}" already exists`)

  const dryRun = options.dryRun ?? false
  if (!dryRun) {
    await mkdir(directory, { recursive: true })
    await copyFile(source, target)
  }

  return {
    action: "install",
    scope,
    directory,
    changed: !dryRun,
    dryRun,
    fromPath: source,
    toPath: target,
  }
}

export async function enableLocalPlugin(value: string, options: LocalPluginManagerOptions = {}): Promise<LocalPluginMutationResult> {
  const scope = resolveScope(options)
  const directory = localPluginDirectory(scope, options)
  const plugins = await listLocalPlugins(options)
  const enabled = findLocalPlugin(plugins, value, "enabled")
  if (enabled) {
    return { action: "enable", scope, directory, changed: false, dryRun: options.dryRun ?? false, toPath: enabled.path }
  }

  const disabled = findLocalPlugin(plugins, value, "disabled")
  if (!disabled) throw new LocalPluginError(`Local plugin "${value}" does not exist`)
  const target = path.join(directory, disabled.activeFileName)
  if (await pathExists(target)) throw new LocalPluginError(`Cannot enable local plugin because "${disabled.activeFileName}" already exists`)

  const dryRun = options.dryRun ?? false
  if (!dryRun) await rename(disabled.path, target)

  return {
    action: "enable",
    scope,
    directory,
    changed: !dryRun,
    dryRun,
    fromPath: disabled.path,
    toPath: target,
  }
}

export async function disableLocalPlugin(value: string, options: LocalPluginManagerOptions = {}): Promise<LocalPluginMutationResult> {
  const scope = resolveScope(options)
  const directory = localPluginDirectory(scope, options)
  const plugins = await listLocalPlugins(options)
  const disabled = findLocalPlugin(plugins, value, "disabled")
  if (disabled) {
    return { action: "disable", scope, directory, changed: false, dryRun: options.dryRun ?? false, toPath: disabled.path }
  }

  const enabled = findLocalPlugin(plugins, value, "enabled")
  if (!enabled) throw new LocalPluginError(`Local plugin "${value}" does not exist`)
  const target = path.join(directory, `${enabled.activeFileName}${disabledSuffix}`)
  if (await pathExists(target)) throw new LocalPluginError(`Cannot disable local plugin because "${path.basename(target)}" already exists`)

  const dryRun = options.dryRun ?? false
  if (!dryRun) await rename(enabled.path, target)

  return {
    action: "disable",
    scope,
    directory,
    changed: !dryRun,
    dryRun,
    fromPath: enabled.path,
    toPath: target,
  }
}
