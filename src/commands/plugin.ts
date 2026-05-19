import { applyConfigEdit } from "../core/jsonc-editor.js"
import {
  disableLocalPlugin,
  enableLocalPlugin,
  installLocalPlugin,
  listLocalPlugins,
  type LocalPluginMutationResult,
} from "../core/local-plugin-manager.js"
import { addPlugin, deletePlugin, disablePlugin, enablePlugin, listPlugins, updatePluginOptions, type PluginOptions } from "../core/plugin-editor.js"
import {
  loadConfigForCommand,
  printDiagnostics,
  setExitCodeForDiagnostics,
  writeMutation,
  type ConfigCommandOptions,
  type MutatingCommandOptions,
} from "./common.js"

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

export async function listPluginsCommand(options: ConfigCommandOptions) {
  const { target, document } = await loadConfigForCommand(options)
  if (document.diagnostics.length > 0) {
    printDiagnostics(document.diagnostics, options.json)
    setExitCodeForDiagnostics(document.diagnostics)
    return
  }

  const plugins = listPlugins(document.data)
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
      const suffix = plugin.options ? " (options)" : ""
      console.log(`- ${plugin.packageName}${suffix}`)
    }
  }
  if (localPlugins.length > 0) {
    console.log("local plugins:")
    for (const plugin of localPlugins) console.log(`- ${plugin.fileName} (${plugin.status})`)
  }
}

export async function addPluginCommand(packageName: string, options: PluginOptionsCommandOptions) {
  const { document } = await loadConfigForCommand(options)
  const nextConfig = addPlugin(document.data, packageName, parsePluginOptionsJSON(options.optionsJson))
  const nextText = applyConfigEdit(document, ["plugin"], nextConfig.plugin)

  return writeMutation({ document, options, nextConfig, nextText })
}

export async function installPluginCommand(plugin: string, options: PluginOptionsCommandOptions) {
  if (options.local) {
    const result = await installLocalPlugin(plugin, { scope: options.configScope ?? "global", cwd: options.cwd, home: options.home, name: options.as, dryRun: options.dryRun })
    printLocalPluginResult(result, options.json)
    return result
  }

  const { document } = await loadConfigForCommand(options)
  const nextConfig = enablePlugin(document.data, plugin, parsePluginOptionsJSON(options.optionsJson))
  const nextText = applyConfigEdit(document, ["plugin"], nextConfig.plugin)

  return writeMutation({ document, options, nextConfig, nextText })
}

export async function enablePluginCommand(plugin: string, options: PluginOptionsCommandOptions) {
  if (options.local) {
    const result = await enableLocalPlugin(plugin, { scope: options.configScope ?? "global", cwd: options.cwd, home: options.home, dryRun: options.dryRun })
    printLocalPluginResult(result, options.json)
    return result
  }

  const { document } = await loadConfigForCommand(options)
  const nextConfig = enablePlugin(document.data, plugin, parsePluginOptionsJSON(options.optionsJson))
  const nextText = applyConfigEdit(document, ["plugin"], nextConfig.plugin)

  return writeMutation({ document, options, nextConfig, nextText })
}

export async function disablePluginCommand(plugin: string, options: PluginOptionsCommandOptions) {
  if (options.local) {
    const result = await disableLocalPlugin(plugin, { scope: options.configScope ?? "global", cwd: options.cwd, home: options.home, dryRun: options.dryRun })
    printLocalPluginResult(result, options.json)
    return result
  }

  const { document } = await loadConfigForCommand(options)
  const nextConfig = disablePlugin(document.data, plugin)
  const nextText = applyConfigEdit(document, ["plugin"], nextConfig.plugin)

  return writeMutation({ document, options, nextConfig, nextText })
}

export async function editPluginCommand(packageName: string, options: PluginOptionsCommandOptions) {
  const { document } = await loadConfigForCommand(options)
  const nextConfig = updatePluginOptions(document.data, packageName, {
    options: parsePluginOptionsJSON(options.optionsJson),
    clearOptions: options.clearOptions,
  })
  const nextText = applyConfigEdit(document, ["plugin"], nextConfig.plugin)

  return writeMutation({ document, options, nextConfig, nextText })
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
  const { document } = await loadConfigForCommand(options)
  const nextConfig = deletePlugin(document.data, packageName)
  const nextText = applyConfigEdit(document, ["plugin"], nextConfig.plugin)

  return writeMutation({ document, options, nextConfig, nextText })
}
