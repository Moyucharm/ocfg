import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { listPlugins, normalizePluginPackage, pluginItemToEntry, type PluginConfigEntry, type PluginListItem } from "./plugin-editor.js"
import type { ConfigTarget } from "./types.js"

export class NpmPluginStateError extends Error {}

type DisabledNpmPluginStore = {
  version: 1
  configs: Record<string, { plugins: PluginConfigEntry[] }>
}

export type DisabledNpmPluginStateSnapshot = {
  path: string
  exists: boolean
  text?: string
}

export type NpmPluginStateChange =
  | { action: "disable"; target: ConfigTarget; plugin: Pick<PluginListItem, "packageName" | "options"> }
  | { action: "remove-disabled"; target: ConfigTarget; packageName: string }

function ocfgDataPath(target: ConfigTarget) {
  return target.ocfgDataPath ?? process.env.OCFG_DATA_DIR ?? path.join(process.env.HOME || os.homedir(), ".config", "ocfg")
}

export function disabledNpmPluginStatePath(target: ConfigTarget) {
  return path.join(ocfgDataPath(target), "plugins", "disabled-npm.json")
}

async function fileExists(filePath: string) {
  return stat(filePath)
    .then(() => true)
    .catch(() => false)
}

function emptyStore(): DisabledNpmPluginStore {
  return { version: 1, configs: {} }
}

function parseStore(value: string): DisabledNpmPluginStore {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (caught) {
    throw new NpmPluginStateError(`Invalid disabled npm plugin state: ${caught instanceof Error ? caught.message : String(caught)}`)
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new NpmPluginStateError("Disabled npm plugin state must be an object")
  const record = parsed as Record<string, unknown>
  if (record.version !== 1) throw new NpmPluginStateError("Unsupported disabled npm plugin state version")
  if (!record.configs || typeof record.configs !== "object" || Array.isArray(record.configs)) throw new NpmPluginStateError("Disabled npm plugin state configs must be an object")

  return record as DisabledNpmPluginStore
}

async function readStore(target: ConfigTarget) {
  const filePath = disabledNpmPluginStatePath(target)
  if (!(await fileExists(filePath))) return emptyStore()
  return parseStore(await readFile(filePath, "utf8"))
}

async function writeStore(target: ConfigTarget, store: DisabledNpmPluginStore) {
  const filePath = disabledNpmPluginStatePath(target)
  await writeStateText(filePath, `${JSON.stringify(store, null, 2)}\n`)
}

async function writeStateText(filePath: string, text: string) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`)
  await writeFile(tempPath, text, "utf8")
  await rename(tempPath, filePath)
}

function configPlugins(store: DisabledNpmPluginStore, target: ConfigTarget) {
  return store.configs[target.path]?.plugins ?? []
}

function setConfigPlugins(store: DisabledNpmPluginStore, target: ConfigTarget, plugins: PluginConfigEntry[]) {
  if (plugins.length === 0) {
    delete store.configs[target.path]
    return
  }

  store.configs[target.path] = { plugins }
}

export async function listDisabledNpmPlugins(target: ConfigTarget): Promise<PluginListItem[]> {
  const store = await readStore(target)
  return listPlugins({ plugin: configPlugins(store, target) }, "disabled")
}

export async function findDisabledNpmPlugin(target: ConfigTarget, packageValue: string): Promise<PluginListItem | undefined> {
  const packageName = normalizePluginPackage(packageValue)
  return (await listDisabledNpmPlugins(target)).find((plugin) => plugin.packageName === packageName)
}

export async function listNpmPlugins(config: Record<string, unknown>, target: ConfigTarget): Promise<PluginListItem[]> {
  const enabled = listPlugins(config, "enabled")
  const enabledNames = new Set(enabled.map((plugin) => plugin.packageName))
  const disabled = (await listDisabledNpmPlugins(target)).filter((plugin) => !enabledNames.has(plugin.packageName))
  return [...enabled, ...disabled]
}

export async function snapshotDisabledNpmPluginState(target: ConfigTarget): Promise<DisabledNpmPluginStateSnapshot> {
  const filePath = disabledNpmPluginStatePath(target)
  if (!(await fileExists(filePath))) return { path: filePath, exists: false }
  return { path: filePath, exists: true, text: await readFile(filePath, "utf8") }
}

export async function restoreDisabledNpmPluginState(snapshot: DisabledNpmPluginStateSnapshot) {
  if (snapshot.exists) {
    await writeStateText(snapshot.path, snapshot.text ?? "")
    return
  }

  await unlink(snapshot.path).catch((caught: unknown) => {
    if (caught && typeof caught === "object" && "code" in caught && caught.code === "ENOENT") return
    throw caught
  })
}

export async function disableNpmPluginState(target: ConfigTarget, plugin: Pick<PluginListItem, "packageName" | "options">) {
  const store = await readStore(target)
  const packageName = normalizePluginPackage(plugin.packageName)
  const plugins = configPlugins(store, target).filter((entry) => listPlugins({ plugin: [entry] })[0]?.packageName !== packageName)
  plugins.push(pluginItemToEntry(plugin))
  setConfigPlugins(store, target, plugins)
  await writeStore(target, store)
}

export async function removeDisabledNpmPluginState(target: ConfigTarget, packageValue: string) {
  const store = await readStore(target)
  const packageName = normalizePluginPackage(packageValue)
  const before = configPlugins(store, target)
  const after = before.filter((entry) => listPlugins({ plugin: [entry] })[0]?.packageName !== packageName)
  if (before.length === after.length) return false
  setConfigPlugins(store, target, after)
  await writeStore(target, store)
  return true
}

export async function applyNpmPluginStateChange(change: NpmPluginStateChange) {
  if (change.action === "disable") {
    await disableNpmPluginState(change.target, change.plugin)
    return
  }

  await removeDisabledNpmPluginState(change.target, change.packageName)
}

export async function prepareNpmPluginStateChange(change: NpmPluginStateChange) {
  const snapshot = await snapshotDisabledNpmPluginState(change.target)
  await applyNpmPluginStateChange(change)
  return () => restoreDisabledNpmPluginState(snapshot)
}
