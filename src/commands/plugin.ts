import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { applyConfigEdits } from "../core/jsonc-editor.js"
import { writeConfigSafely, type ValidationResult, type WriteConfigSafelyResult } from "../core/config-writer.js"
import {
  disableLocalPlugin,
  enableLocalPlugin,
  installLocalPlugin,
  listLocalPlugins,
  type LocalPluginMutationResult,
} from "../core/local-plugin-manager.js"
import { findDisabledNpmPlugin, listNpmPlugins, prepareNpmPluginStateChange, type NpmPluginStateChange } from "../core/npm-plugin-state.js"
import { addPlugin, deletePlugin, disablePlugin, enablePlugin, findPlugin, updatePluginOptions, type PluginOptions } from "../core/plugin-editor.js"
import {
  locatePluginHostConfig,
  parsePluginTargetSelection,
  preparePluginInstallWrites,
  pluginSchemaForKind,
  readPluginHostConfig,
  type PluginHostKind,
  type PluginManifestResolver,
  type PluginTargetSelection,
  type PreparedPluginInstallWrite,
} from "../core/plugin-installer.js"
import { validateConfig, validateTuiConfig } from "../core/schema-validator.js"
import {
  loadConfigForCommand,
  printDiagnostics,
  printWriteResult,
  setExitCodeForDiagnostics,
  writeMutation,
  type ConfigCommandOptions,
  type MutatingCommandOptions,
} from "./common.js"
import type { ConfigDocument, ConfigLocatorOptions, ConfigTarget, Diagnostic } from "../core/types.js"
import type { PluginListItem } from "../core/plugin-editor.js"

export type PluginOptionsCommandOptions = MutatingCommandOptions & {
  optionsJson?: string
  clearOptions?: boolean
  local?: boolean
  as?: string
  pluginTarget?: PluginTargetSelection
  resolveManifest?: PluginManifestResolver
}

type PluginInstallWriteOutput = {
  kind: PluginHostKind
  mode: PreparedPluginInstallWrite["mode"]
  target: ConfigTarget
  result?: WriteConfigSafelyResult
}

type PluginInstallWriteResult = {
  spec: string
  outputs: PluginInstallWriteOutput[]
  diagnostics: Diagnostic[]
  dryRun: boolean
}

type PluginManagementAction = "add" | "edit" | "enable" | "disable" | "delete"

type PluginManagementTarget = {
  kind: PluginHostKind
  target: ConfigTarget
  document: ConfigDocument
  existing?: PluginListItem
  disabled?: PluginListItem
}

type ConfigFileSnapshot = {
  path: string
  exists: boolean
  text?: string
}

type PreparedPluginMutation = {
  target: PluginManagementTarget
  nextConfig?: Record<string, unknown>
  nextText?: string
  stateChange?: NpmPluginStateChange
  disabledDelete?: PluginListItem
}

type PluginMutationOutput =
  | { kind: PluginHostKind; target: ConfigTarget; result: WriteConfigSafelyResult }
  | { kind: PluginHostKind; target: ConfigTarget; action: "delete"; packageName: string; status: "disabled"; changed: boolean; dryRun: boolean }

function parsePluginOptionsJSON(value: string | undefined): PluginOptions | undefined {
  if (value === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (caught) {
    throw new Error(`Invalid --options-json: ${caught instanceof Error ? caught.message : String(caught)}`)
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("--options-json must be a JSON object")
  return parsed as PluginOptions
}

function sameJSON(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function pluginMutationText(document: ConfigDocument, nextConfig: Record<string, unknown>) {
  const changes: { path: (string | number)[]; value: unknown }[] = []
  if (!sameJSON(document.data.$schema, nextConfig.$schema)) changes.push({ path: ["$schema"], value: nextConfig.$schema })
  if (!sameJSON(document.data.plugin, nextConfig.plugin)) changes.push({ path: ["plugin"], value: nextConfig.plugin })
  if (changes.length === 0) return document.text || "{}\n"
  return applyConfigEdits(document, changes)
}

function locatorOptions(options: ConfigCommandOptions): ConfigLocatorOptions {
  return { scope: options.configScope, configPath: options.configPath, cwd: options.cwd, home: options.home }
}

function parseInstallTarget(options: PluginOptionsCommandOptions) {
  return parsePluginTargetSelection(options.pluginTarget, "auto")
}

function parseManagementTarget(options: PluginOptionsCommandOptions | MutatingCommandOptions, fallback: PluginTargetSelection) {
  return parsePluginTargetSelection((options as PluginOptionsCommandOptions).pluginTarget, fallback)
}

async function validatePluginHostKind(kind: PluginHostKind, config: Record<string, unknown>, validate: MutatingCommandOptions["validate"]): Promise<ValidationResult> {
  if (validate) return validate(config)
  if (kind === "tui") return validateTuiConfig(config)
  return validateConfig(config, { relaxModelEnum: true })
}

function pluginTargetLabel(kind: PluginHostKind) {
  return kind === "server" ? "server" : "tui"
}

function isNotFoundError(caught: unknown) {
  return caught && typeof caught === "object" && "code" in caught && caught.code === "ENOENT"
}

async function snapshotConfigFile(document: ConfigDocument): Promise<ConfigFileSnapshot> {
  const targetPath = document.target.path
  if (!document.target.exists) return { path: targetPath, exists: false }
  return { path: targetPath, exists: true, text: await readFile(targetPath, "utf8") }
}

async function snapshotConfigFiles(documents: ConfigDocument[], dryRun: boolean): Promise<ConfigFileSnapshot[]> {
  if (dryRun) return []

  const snapshots: ConfigFileSnapshot[] = []
  const seen = new Set<string>()
  for (const document of documents) {
    if (seen.has(document.target.path)) continue
    seen.add(document.target.path)
    snapshots.push(await snapshotConfigFile(document))
  }
  return snapshots
}

async function restoreConfigSnapshot(snapshot: ConfigFileSnapshot) {
  if (snapshot.exists) {
    await mkdir(path.dirname(snapshot.path), { recursive: true })
    await writeFile(snapshot.path, snapshot.text ?? "", "utf8")
    return
  }

  await unlink(snapshot.path).catch((caught: unknown) => {
    if (isNotFoundError(caught)) return
    throw caught
  })
}

async function rollbackPluginBatch(configSnapshots: ConfigFileSnapshot[], stateRollbacks: Array<() => Promise<void>>) {
  for (const rollback of [...stateRollbacks].reverse()) await rollback()
  for (const snapshot of [...configSnapshots].reverse()) await restoreConfigSnapshot(snapshot)
}

function kindsForSelection(selection: PluginTargetSelection): PluginHostKind[] {
  return selection === "server" || selection === "tui" ? [selection] : ["server", "tui"]
}

async function readPluginManagementCandidates(packageName: string, options: ConfigCommandOptions, kinds: PluginHostKind[]): Promise<PluginManagementTarget[]> {
  const targets: PluginManagementTarget[] = []
  for (const kind of kinds) {
    const target = locatePluginHostConfig(locatorOptions(options), kind)
    const document = await readPluginHostConfig(target)
    if (document.diagnostics.length > 0) throw new Error(`Invalid ${pluginTargetLabel(kind)} plugin config at ${target.path}: ${document.diagnostics.map((diagnostic) => diagnostic.message).join("; ")}`)
    const existing = findPlugin(document.data, packageName)
    const disabled = await findDisabledNpmPlugin(target, packageName)
    targets.push({ kind, target, document, existing, disabled })
  }
  return targets
}

function hasPluginForAction(target: PluginManagementTarget, action: PluginManagementAction) {
  if (action === "add") return false
  if (action === "edit" || action === "disable") return target.existing !== undefined
  if (action === "delete") return target.existing !== undefined || target.disabled !== undefined
  return target.existing !== undefined || target.disabled !== undefined
}

function selectedManagementTargets(candidates: PluginManagementTarget[], selection: PluginTargetSelection, action: PluginManagementAction) {
  if (selection === "server" || selection === "tui") {
    const target = candidates.find((candidate) => candidate.kind === selection)
    return target ? [target] : []
  }

  if (selection === "both") {
    if (action === "add" || action === "enable" || action === "edit") return candidates
    return candidates.filter((candidate) => hasPluginForAction(candidate, action))
  }

  return []
}

async function resolvePluginManagementTargets(
  packageName: string,
  options: PluginOptionsCommandOptions | MutatingCommandOptions,
  action: PluginManagementAction,
  fallback: PluginTargetSelection,
): Promise<PluginManagementTarget[]> {
  const selection = parseManagementTarget(options, fallback)
  const candidates = await readPluginManagementCandidates(packageName, options, kindsForSelection(selection))
  if (selection === "auto") {
    const matches = candidates.filter((candidate) => hasPluginForAction(candidate, action))
    if (matches.length === 0) throw new Error(`Plugin "${packageName}" does not exist. Pass --plugin-target server, tui, or both to choose the config file explicitly.`)
    if (matches.length > 1) throw new Error(`Plugin "${packageName}" exists in multiple plugin targets. Pass --plugin-target server, tui, or both.`)
    return matches
  }

  const selected = selectedManagementTargets(candidates, selection, action)
  if (action === "add" || action === "enable") return selected
  if (selected.length === 0) throw new Error(`Plugin "${packageName}" does not exist in the selected plugin target.`)
  if (action === "edit" && selected.some((target) => !target.existing)) throw new Error(`Plugin "${packageName}" does not exist in the selected plugin target.`)
  if (action === "disable" && selected.some((target) => !target.existing)) throw new Error(`Plugin "${packageName}" is not enabled in the selected plugin target.`)
  if (action === "delete" && selected.some((target) => !target.existing && !target.disabled)) throw new Error(`Plugin "${packageName}" does not exist in the selected plugin target.`)
  return selected
}

async function validatePluginInstallWrite(write: PreparedPluginInstallWrite, validate: MutatingCommandOptions["validate"]): Promise<ValidationResult> {
  return validatePluginHostKind(write.kind, write.nextConfig, validate)
}

function printPluginInstallResult(result: PluginInstallWriteResult, json = false) {
  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (result.diagnostics.length > 0) {
    printDiagnostics(result.diagnostics)
    return
  }

  for (const output of result.outputs) {
    if (output.mode === "noop") {
      console.log(`Already configured in ${output.target.path}`)
      continue
    }
    if (output.result) printWriteResult(output.result)
  }
}

async function writePluginInstallWrites(spec: string, writes: PreparedPluginInstallWrite[], options: MutatingCommandOptions): Promise<PluginInstallWriteResult> {
  const validations = await Promise.all(writes.map((write) => validatePluginInstallWrite(write, options.validate)))
  const diagnostics = validations.flatMap((validation) => validation.diagnostics)
  const dryRun = options.dryRun ?? false

  if (diagnostics.length > 0) {
    const result = {
      spec,
      outputs: writes.map((write) => ({ kind: write.kind, mode: write.mode, target: write.target })),
      diagnostics,
      dryRun,
    }
    printPluginInstallResult(result, options.json)
    setExitCodeForDiagnostics(diagnostics)
    return result
  }

  const outputs: PluginInstallWriteOutput[] = []
  const stateRollbacks: Array<() => Promise<void>> = []
  const configSnapshots = await snapshotConfigFiles(writes.filter((write) => write.mode !== "noop").map((write) => write.document), dryRun)
  try {
    for (let index = 0; index < writes.length; index += 1) {
      const write = writes[index]
      if (!write || write.mode === "noop") {
        if (write) outputs.push({ kind: write.kind, mode: write.mode, target: write.target })
        continue
      }

      if (!dryRun) stateRollbacks.push(await prepareNpmPluginStateChange({ action: "remove-disabled", target: write.target, packageName: spec }))
      const result = await writeConfigSafely({
        document: write.document,
        nextConfig: write.nextConfig,
        nextText: write.nextText,
        dryRun,
        validate: () => validations[index] ?? { valid: true, diagnostics: [] },
      })
      outputs.push({ kind: write.kind, mode: write.mode, target: write.target, result })
      if (result.diagnostics.length > 0) {
        if (!dryRun) await rollbackPluginBatch(configSnapshots, stateRollbacks)
        const failed = { spec, outputs, diagnostics: result.diagnostics, dryRun }
        printPluginInstallResult(failed, options.json)
        setExitCodeForDiagnostics(result.diagnostics)
        return failed
      }
    }
  } catch (caught) {
    if (!dryRun) await rollbackPluginBatch(configSnapshots, stateRollbacks)
    throw caught
  }

  const result = { spec, outputs, diagnostics: [], dryRun }
  printPluginInstallResult(result, options.json)
  return result
}

async function writePluginMutationForDocument(
  kind: PluginHostKind,
  document: ConfigDocument,
  options: MutatingCommandOptions,
  mutate: (config: Record<string, unknown>) => Record<string, unknown>,
  stateChange?: NpmPluginStateChange,
) {
  const nextConfig = mutate(document.data)
  const nextText = pluginMutationText(document, nextConfig)

  return writeMutation({
    document,
    options,
    nextConfig,
    nextText,
    beforeWrite: stateChange ? () => prepareNpmPluginStateChange(stateChange) : undefined,
    validateWrite: (config) => validatePluginHostKind(kind, config, options.validate),
  })
}

async function writePluginMutation(options: MutatingCommandOptions, mutate: (config: Record<string, unknown>) => Record<string, unknown>) {
  const { document } = await loadConfigForCommand(options)
  return writePluginMutationForDocument("server", document, options, mutate)
}

async function writePluginMutations(
  targets: PluginManagementTarget[],
  options: MutatingCommandOptions,
  build: (target: PluginManagementTarget) => { nextConfig?: Record<string, unknown>; stateChange?: NpmPluginStateChange; disabledDelete?: PluginListItem },
) {
  const prepared: PreparedPluginMutation[] = targets.map((target) => {
    const { nextConfig, stateChange, disabledDelete } = build(target)
    return {
      target,
      nextConfig,
      nextText: nextConfig ? pluginMutationText(target.document, nextConfig) : undefined,
      stateChange,
      disabledDelete,
    }
  })
  const validations = await Promise.all(prepared.map((item) => item.nextConfig ? validatePluginHostKind(item.target.kind, item.nextConfig, options.validate) : { valid: true, diagnostics: [] }))
  const diagnostics = validations.flatMap((validation) => validation.diagnostics)
  if (diagnostics.length > 0) {
    printDiagnostics(diagnostics, options.json)
    setExitCodeForDiagnostics(diagnostics)
    return { written: false, dryRun: options.dryRun ?? false, diagnostics }
  }

  const dryRun = options.dryRun ?? false
  const results: PluginMutationOutput[] = []
  const configSnapshots = await snapshotConfigFiles(prepared.filter((item) => item.nextConfig).map((item) => item.target.document), dryRun)
  const stateRollbacks: Array<() => Promise<void>> = []
  try {
    for (let index = 0; index < prepared.length; index += 1) {
      const item = prepared[index]
      if (!item) continue

      if (!dryRun && item.stateChange) stateRollbacks.push(await prepareNpmPluginStateChange(item.stateChange))

      if (item.nextConfig && item.nextText) {
        const result = await writeConfigSafely({
          document: item.target.document,
          nextConfig: item.nextConfig,
          nextText: item.nextText,
          dryRun,
          validate: () => validations[index] ?? { valid: true, diagnostics: [] },
        })
        results.push({ kind: item.target.kind, target: item.target.target, result })
        if (result.diagnostics.length > 0) {
          if (!dryRun) await rollbackPluginBatch(configSnapshots, stateRollbacks)
          printDiagnostics(result.diagnostics, options.json)
          setExitCodeForDiagnostics(result.diagnostics)
          return { results, diagnostics: result.diagnostics }
        }
        continue
      }

      if (item.disabledDelete) {
        results.push({
          kind: item.target.kind,
          target: item.target.target,
          action: "delete",
          packageName: item.disabledDelete.packageName,
          status: "disabled",
          changed: !dryRun,
          dryRun,
        })
      }
    }
  } catch (caught) {
    if (!dryRun) await rollbackPluginBatch(configSnapshots, stateRollbacks)
    throw caught
  }

  if (options.json) {
    console.log(JSON.stringify({ results }, null, 2))
  } else {
    for (const result of results) {
      if ("result" in result) printWriteResult(result.result)
      else printDisabledNpmPluginDeleted(result.target, result.packageName, result.dryRun, false)
    }
  }
  return { results }
}

function printDisabledNpmPluginDeleted(target: ConfigTarget, packageName: string, dryRun = false, json = false) {
  if (json) {
    console.log(JSON.stringify({ action: "delete", target, packageName, status: "disabled", changed: !dryRun, dryRun }, null, 2))
    return
  }

  console.log(`${dryRun ? "Dry run delete" : "Deleted"} disabled npm plugin: ${packageName}`)
}

export async function listPluginsCommand(options: ConfigCommandOptions) {
  const serverTarget = locatePluginHostConfig(locatorOptions(options), "server")
  const serverDocument = await readPluginHostConfig(serverTarget)
  if (serverDocument.diagnostics.length > 0) {
    printDiagnostics(serverDocument.diagnostics, options.json)
    setExitCodeForDiagnostics(serverDocument.diagnostics)
    return
  }

  const serverPlugins = (await listNpmPlugins(serverDocument.data, serverTarget)).map((plugin) => ({ ...plugin, configKind: "server" as const, configTarget: serverTarget }))
  const tuiTarget = locatePluginHostConfig(locatorOptions(options), "tui")
  const tuiDocument = tuiTarget.path !== serverTarget.path && tuiTarget.exists ? await readPluginHostConfig(tuiTarget) : undefined
  if (tuiDocument && tuiDocument.diagnostics.length > 0) {
    printDiagnostics(tuiDocument.diagnostics, options.json)
    setExitCodeForDiagnostics(tuiDocument.diagnostics)
    return
  }
  const tuiPlugins = tuiDocument
    ? (await listNpmPlugins(tuiDocument.data, tuiTarget)).map((plugin) => ({ ...plugin, configKind: "tui" as const, configTarget: tuiTarget }))
    : []
  const plugins = [...serverPlugins, ...tuiPlugins]
  const localPlugins = await listLocalPlugins({ scope: options.configScope ?? "global", cwd: options.cwd, home: options.home })
  if (options.json) {
    console.log(JSON.stringify({ target: serverTarget, targets: { server: serverTarget, tui: tuiTarget }, plugins, npmPlugins: plugins, localPlugins }, null, 2))
    return
  }

  console.log(`Listing ${serverTarget.scope} plugins: ${serverTarget.path}${serverTarget.exists ? "" : " (missing; not created)"}`)
  if (plugins.length === 0 && localPlugins.length === 0) {
    console.log("No plugins configured.")
    return
  }

  if (plugins.length > 0) {
    console.log("npm plugins:")
    for (const plugin of plugins) {
      console.log(`- ${plugin.packageName} (${plugin.status}, ${plugin.configKind ?? "server"})`)
    }
  }
  if (localPlugins.length > 0) {
    console.log("local plugins:")
    for (const plugin of localPlugins) console.log(`- ${plugin.fileName} (${plugin.status})`)
  }
}

export async function addPluginCommand(packageName: string, options: PluginOptionsCommandOptions) {
  const targets = await resolvePluginManagementTargets(packageName, options, "add", "server")
  const parsedOptions = parsePluginOptionsJSON(options.optionsJson)
  return writePluginMutations(targets, options, (target) => ({
    nextConfig: addPlugin(target.document.data, packageName, parsedOptions, pluginSchemaForKind(target.kind)),
    stateChange: { action: "remove-disabled", target: target.target, packageName },
  }))
}

export async function installPluginCommand(plugin: string, options: PluginOptionsCommandOptions) {
  if (options.local) {
    const result = await installLocalPlugin(plugin, { scope: options.configScope ?? "global", cwd: options.cwd, home: options.home, name: options.as, dryRun: options.dryRun })
    printLocalPluginResult(result, options.json)
    return result
  }

  const pluginOptions = parsePluginOptionsJSON(options.optionsJson)
  const pluginTarget = parseInstallTarget(options)
  try {
    const writes = await preparePluginInstallWrites({
      ...locatorOptions(options),
      spec: plugin,
      pluginTarget,
      options: pluginOptions,
      resolveManifest: options.resolveManifest,
    })
    return writePluginInstallWrites(plugin, writes, options)
  } catch (caught) {
    if (pluginTarget === "auto") {
      throw new Error(`${caught instanceof Error ? caught.message : String(caught)}. Pass --plugin-target server, tui, or both to choose the config file explicitly.`)
    }
    throw caught
  }
}

export async function enablePluginCommand(plugin: string, options: PluginOptionsCommandOptions) {
  if (options.local) {
    const result = await enableLocalPlugin(plugin, { scope: options.configScope ?? "global", cwd: options.cwd, home: options.home, dryRun: options.dryRun })
    printLocalPluginResult(result, options.json)
    return result
  }

  const parsedOptions = parsePluginOptionsJSON(options.optionsJson)
  const targets = await resolvePluginManagementTargets(plugin, options, "enable", "auto")
  return writePluginMutations(targets, options, (target) => ({
    nextConfig: enablePlugin(target.document.data, plugin, parsedOptions ?? (target.existing ? undefined : target.disabled?.options), pluginSchemaForKind(target.kind)),
    stateChange: { action: "remove-disabled", target: target.target, packageName: plugin },
  }))
}

export async function disablePluginCommand(plugin: string, options: PluginOptionsCommandOptions) {
  if (options.local) {
    const result = await disableLocalPlugin(plugin, { scope: options.configScope ?? "global", cwd: options.cwd, home: options.home, dryRun: options.dryRun })
    printLocalPluginResult(result, options.json)
    return result
  }

  const targets = await resolvePluginManagementTargets(plugin, options, "disable", "auto")
  return writePluginMutations(targets, options, (target) => ({
    nextConfig: disablePlugin(target.document.data, plugin),
    stateChange: target.existing ? { action: "disable", target: target.target, plugin: target.existing } : undefined,
  }))
}

export async function editPluginCommand(packageName: string, options: PluginOptionsCommandOptions) {
  const targets = await resolvePluginManagementTargets(packageName, options, "edit", "auto")
  return writePluginMutations(targets, options, (target) => ({
    nextConfig: updatePluginOptions(target.document.data, packageName, {
      options: parsePluginOptionsJSON(options.optionsJson),
      clearOptions: options.clearOptions,
    }),
  }))
}

function printLocalPluginResult(result: LocalPluginMutationResult, json = false) {
  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  const scope = result.scope
  const pastTense = result.action === "install" ? "installed" : result.action === "enable" ? "enabled" : "disabled"
  const action = result.dryRun ? `Dry run ${result.action}` : result.changed ? pastTense : `${result.action} unchanged`
  console.log(`${action} ${scope} local plugin: ${result.toPath}`)
  if (result.fromPath) console.log(`Source: ${result.fromPath}`)
}

export async function deletePluginCommand(packageName: string, options: MutatingCommandOptions) {
  const targets = await resolvePluginManagementTargets(packageName, options, "delete", "auto")
  return writePluginMutations(targets, options, (target) => ({
    nextConfig: target.existing ? deletePlugin(target.document.data, packageName) : undefined,
    stateChange: { action: "remove-disabled", target: target.target, packageName },
    disabledDelete: target.existing ? undefined : target.disabled,
  }))
}
