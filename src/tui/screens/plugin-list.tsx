import React, { useEffect, useState } from "react"
import { Text } from "ink"
import { readConfig } from "../../core/config-reader.js"
import { listLocalPlugins, type LocalPluginItem } from "../../core/local-plugin-manager.js"
import { listNpmPlugins } from "../../core/npm-plugin-state.js"
import { locatePluginHostConfig } from "../../core/plugin-installer.js"
import type { PluginListItem } from "../../core/plugin-editor.js"
import { useTuiText } from "../i18n.js"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { useRememberedOpenCodeMenuSelection } from "../menu-memory.js"
import type { TuiConfigSelection } from "../types.js"
import { OpenCodeMenu, openCodeMenuRows, useDelayedLoading, type OpenCodeMenuGroup } from "../ui.js"

export function PluginListScreen(props: {
  selection: TuiConfigSelection
  onInstallNpmPlugin: () => void
  onInstallLocalPlugin: () => void
  onEditPlugin: (plugin: PluginListItem) => void
  onEditLocalPlugin: (plugin: LocalPluginItem) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const [plugins, setPlugins] = useState<PluginListItem[]>([])
  const [localPlugins, setLocalPlugins] = useState<LocalPluginItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()

  const groups: OpenCodeMenuGroup[] = [
    {
      title: t("plugin.actions"),
      items: [
        { id: "__install_npm", label: t("plugin.installNpm") },
        { id: "__install_local", label: t("plugin.installLocal") },
      ],
    },
    {
      title: t("plugin.npmPlugins"),
      items: plugins.map((plugin) => ({
        id: `npm:${plugin.configKind ?? "server"}:${plugin.packageName}`,
        label: plugin.packageName,
        meta: `${t(plugin.status === "enabled" ? "plugin.enabled" : "plugin.disabled")} ${plugin.configKind ?? "server"}`,
        tone: plugin.status === "enabled" ? "success" : "danger",
        description: plugin.configTarget?.path,
      })),
    },
    {
      title: t("plugin.localPlugins"),
      items: localPlugins.map((plugin) => ({
        id: `local:${plugin.fileName}`,
        label: plugin.fileName,
        meta: t(plugin.status === "enabled" ? "plugin.enabled" : "plugin.disabled"),
        tone: plugin.status === "enabled" ? "success" : "danger",
        description: plugin.directory,
      })),
    },
  ]
  const { selected, setSelected, rememberSelected } = useRememberedOpenCodeMenuSelection({
    memoryKey: `plugin-list:${props.selection.target?.path ?? props.selection.scope}`,
    groups,
    ready: !loading && !error,
  })

  function selectedItem(index = selected) {
    return openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
  }

  function selectedPlugin(index = selected) {
    const item = selectedItem(index)
    if (item?.kind !== "item" || !item.item.id.startsWith("npm:")) return undefined
    const [, configKind, packageName] = item.item.id.match(/^npm:([^:]+):(.+)$/) ?? []
    return plugins.find((plugin) => plugin.packageName === packageName && (plugin.configKind ?? "server") === configKind)
  }

  function selectedLocalPlugin(index = selected) {
    const item = selectedItem(index)
    if (item?.kind !== "item" || !item.item.id.startsWith("local:")) return undefined
    const fileName = item.item.id.slice("local:".length)
    return localPlugins.find((plugin) => plugin.fileName === fileName)
  }

  function runSelected(index = selected) {
    const item = selectedItem(index)
    if (item?.kind !== "item") return
    rememberSelected(index)
    if (item.item.id === "__install_npm") {
      props.onInstallNpmPlugin()
      return
    }
    if (item.item.id === "__install_local") {
      props.onInstallLocalPlugin()
      return
    }
    const plugin = selectedPlugin(index)
    if (plugin) {
      props.onEditPlugin(plugin)
      return
    }
    const localPlugin = selectedLocalPlugin(index)
    if (localPlugin) props.onEditLocalPlugin(localPlugin)
  }

  useTuiInput((input, key) => {
    const rows = openCodeMenuRows(groups, "")
    const count = rows.filter((row) => row.kind === "item").length
    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
      props.onBack()
      return
    }
    if (matchesKeybind("up", input, key, keybinds)) setSelected((current) => (current === 0 ? Math.max(0, count - 1) : current - 1))
    if (matchesKeybind("down", input, key, keybinds)) setSelected((current) => (current === count - 1 ? 0 : current + 1))
    if (matchesKeybind("confirm", input, key, keybinds)) runSelected()
  })

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError(undefined)
      try {
        const target = locatePluginHostConfig({ scope: props.selection.scope, configPath: props.selection.target?.path }, "server")
        const tuiTarget = locatePluginHostConfig({ scope: props.selection.scope, configPath: props.selection.target?.path }, "tui")
        const document = await readConfig(target)
        if (document.diagnostics.length > 0) throw new Error(document.diagnostics.map((diagnostic) => diagnostic.message).join("\n"))
        const serverPlugins = (await listNpmPlugins(document.data, target)).map((plugin) => ({ ...plugin, configKind: "server" as const, configTarget: target }))
        const tuiDocument = tuiTarget.exists ? await readConfig(tuiTarget) : undefined
        if (tuiDocument && tuiDocument.diagnostics.length > 0) throw new Error(tuiDocument.diagnostics.map((diagnostic) => diagnostic.message).join("\n"))
        const tuiPlugins = tuiDocument
          ? (await listNpmPlugins(tuiDocument.data, tuiTarget)).map((plugin) => ({ ...plugin, configKind: "tui" as const, configTarget: tuiTarget }))
          : []
        const nextPlugins = [...serverPlugins, ...tuiPlugins]
        const nextLocalPlugins = await listLocalPlugins({ scope: props.selection.scope })
        if (!active) return
        setPlugins(nextPlugins)
        setLocalPlugins(nextLocalPlugins)
        setSelected((current) => Math.min(current, Math.max(0, 2 + nextPlugins.length + nextLocalPlugins.length - 1)))
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : String(caught))
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [props.selection])

  const showLoading = useDelayedLoading(loading)

  if (loading) return showLoading ? <Text>{t("plugin.loading")}</Text> : null
  if (error) return <Text color="red">{t("plugin.failed", { message: error })}</Text>

  return <OpenCodeMenu title={t("plugin.title")} query="" rows={openCodeMenuRows(groups, "")} selectedIndex={selected} footer={[`${t("common.open")}\tenter`, `${t("common.back")}\tesc`]} />
}
