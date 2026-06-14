import { applyConfigEdit } from "../core/jsonc-editor.js"
import {
  disableLocalPlugin,
  enableLocalPlugin,
  installLocalPlugin,
  listLocalPlugins,
  type LocalPluginMutationResult,
} from "../core/local-plugin-manager.js"
import { findDisabledNpmPlugin, listNpmPlugins, prepareNpmPluginStateChange, removeDisabledNpmPluginState, type NpmPluginStateChange } from "../core/npm-plugin-state.js"
import { addPlugin, deletePlugin, disablePlugin, enablePlugin, findPlugin, updatePluginOptions, type PluginOptions } from "../core/plugin-editor.js"
import {
  loadConfigForCommand,
  printDiagnostics,
  setExitCodeForDiagnostics,
  writeMutation,
  type ConfigCommandOptions,
  type MutatingCommandOptions,
} from "./common.js"
import type { ConfigDocument, ConfigTarget } from "../core/types.js"

export type PluginOptionsCommandOptions = MutatingCommandOptions & {
  optionsJson?: string
  clearOptions?: boolean
  local?: boolean
  as?: string
}

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

async function writePluginMutationForDocument(
  document: ConfigDocument,
  options: MutatingCommandOptions,
  mutate: (config: Record<string, unknown>) => Record<string, unknown>,
  stateChange?: NpmPluginStateChange,
) {
  const nextConfig = mutate(document.data)
  const nextText = applyConfigEdit(document, ["plugin"], nextConfig.plugin)

  return writeMutation({
    document,
    options,
    nextConfig,
    nextText,
    beforeWrite: stateChange ? () => prepareNpmPluginStateChange(stateChange) : undefined,
  })
}

async function writePluginMutation(options: MutatingCommandOptions, mutate: (config: Record<string, unknown>) => Record<string, unknown>) {
  const { document } = await loadConfigForCommand(options)
  return writePluginMutationForDocument(document, options, mutate)
}

function printDisabledNpmPluginDeleted(target: ConfigTarget, packageName: string, dryRun = false, json = false) {
  if (json) {
    console.log(JSON.stringify({ action: "delete", target, packageName, status: "disabled", changed: !dryRun, dryRun }, null, 2))
    return
  }

  console.log(`${dryRun ? "Dry run delete" : "Deleted"} disabled npm plugin: ${packageName}`)
}

export async function listPluginsCommand(options: ConfigCommandOptions) {
  const { target, document } = await loadConfigForCommand(options)
  if (document.diagnostics.length > 0) {
    printDiagnostics(document.diagnostics, options.json)
    setExitCodeForDiagnostics(document.diagnostics)
    return
  }

  const plugins = await listNpmPlugins(document.data, target)
  const localPlugins = await listLocalPlugins({ scope: options.configScope ?? "global", cwd: options.cwd, home: options.home })
  if (options.json) {
    console.log(JSON.stringify({ target, plugins, npmPlugins: plugins, localPlugins }, null, 2))
    return
  }

  console.log(`Listing ${target.scope} plugins: ${target.path}${target.exists ? "" : " (missing; not created)"}`)
  if (plugins.length === 0 && localPlugins.length === 0) {
    console.log("No plugins configured.")
    return
  }

  if (plugins.length > 0) {
    console.log("npm plugins:")
    for (const plugin of plugins) {
      console.log(`- ${plugin.packageName} (${plugin.status})`)
    }
  }
  if (localPlugins.length > 0) {
    console.log("local plugins:")
    for (const plugin of localPlugins) console.log(`- ${plugin.fileName} (${plugin.status})`)
  }
}

export async function addPluginCommand(packageName: string, options: PluginOptionsCommandOptions) {
  const { target, document } = await loadConfigForCommand(options)
  return writePluginMutationForDocument(
    document,
    options,
    (config) => addPlugin(config, packageName, parsePluginOptionsJSON(options.optionsJson)),
    { action: "remove-disabled", target, packageName },
  )
}

export async function installPluginCommand(plugin: string, options: PluginOptionsCommandOptions) {
  if (options.local) {
    const result = await installLocalPlugin(plugin, { scope: options.configScope ?? "global", cwd: options.cwd, home: options.home, name: options.as, dryRun: options.dryRun })
    printLocalPluginResult(result, options.json)
    return result
  }

  const { target, document } = await loadConfigForCommand(options)
  return writePluginMutationForDocument(
    document,
    options,
    (config) => enablePlugin(config, plugin, parsePluginOptionsJSON(options.optionsJson)),
    { action: "remove-disabled", target, packageName: plugin },
  )
}

export async function enablePluginCommand(plugin: string, options: PluginOptionsCommandOptions) {
  if (options.local) {
    const result = await enableLocalPlugin(plugin, { scope: options.configScope ?? "global", cwd: options.cwd, home: options.home, dryRun: options.dryRun })
    printLocalPluginResult(result, options.json)
    return result
  }

  const { target, document } = await loadConfigForCommand(options)
  const existing = findPlugin(document.data, plugin)
  const disabled = await findDisabledNpmPlugin(target, plugin)
  const parsedOptions = parsePluginOptionsJSON(options.optionsJson)
  return writePluginMutationForDocument(
    document,
    options,
    (config) => enablePlugin(config, plugin, parsedOptions ?? (existing ? undefined : disabled?.options)),
    { action: "remove-disabled", target, packageName: plugin },
  )
}

export async function disablePluginCommand(plugin: string, options: PluginOptionsCommandOptions) {
  if (options.local) {
    const result = await disableLocalPlugin(plugin, { scope: options.configScope ?? "global", cwd: options.cwd, home: options.home, dryRun: options.dryRun })
    printLocalPluginResult(result, options.json)
    return result
  }

  const { target, document } = await loadConfigForCommand(options)
  const existing = findPlugin(document.data, plugin)
  return writePluginMutationForDocument(
    document,
    options,
    (config) => disablePlugin(config, plugin),
    existing ? { action: "disable", target, plugin: existing } : undefined,
  )
}

export async function editPluginCommand(packageName: string, options: PluginOptionsCommandOptions) {
  return writePluginMutation(options, (config) => updatePluginOptions(config, packageName, {
    options: parsePluginOptionsJSON(options.optionsJson),
    clearOptions: options.clearOptions,
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
  const { target, document } = await loadConfigForCommand(options)
  const existing = findPlugin(document.data, packageName)
  const disabled = await findDisabledNpmPlugin(target, packageName)
  if (!existing && disabled) {
    if (!options.dryRun) await removeDisabledNpmPluginState(target, packageName)
    printDisabledNpmPluginDeleted(target, disabled.packageName, options.dryRun ?? false, options.json)
    return { action: "delete", target, packageName: disabled.packageName, status: "disabled", changed: !options.dryRun, dryRun: options.dryRun ?? false }
  }

  return writePluginMutationForDocument(
    document,
    options,
    (config) => deletePlugin(config, packageName),
    { action: "remove-disabled", target, packageName },
  )
}
