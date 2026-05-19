import React, { useEffect, useState } from "react"
import { Text } from "ink"
import { locateConfig } from "../../core/config-locator.js"
import { readConfig } from "../../core/config-reader.js"
import { listLocalPlugins, type LocalPluginItem } from "../../core/local-plugin-manager.js"
import { listPlugins, type PluginListItem } from "../../core/plugin-editor.js"
import { useTuiText } from "../i18n.js"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { parseTuiMouseEvent } from "../mouse.js"
import type { TuiConfigSelection } from "../types.js"
import { menuItemIndexFromMouse, OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"

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
  const [selected, setSelected] = useState(0)
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
        id: `npm:${plugin.packageName}`,
        label: plugin.packageName,
        meta: plugin.options ? t("plugin.hasOptions") : t("plugin.enabled"),
        tone: "success",
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

  function selectedItem(index = selected) {
    return openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
  }

  function selectedPlugin(index = selected) {
    const item = selectedItem(index)
    if (item?.kind !== "item" || !item.item.id.startsWith("npm:")) return undefined
    const packageName = item.item.id.slice("npm:".length)
    return plugins.find((plugin) => plugin.packageName === packageName)
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
    const mouse = parseTuiMouseEvent(input)
    if (mouse) {
      if (mouse.kind === "wheel") setSelected((current) => mouse.button === "wheel-up" ? Math.max(0, current - 1) : Math.min(Math.max(0, count - 1), current + 1))
      const clicked = menuItemIndexFromMouse(mouse, rows, { selectedIndex: selected, hasFooter: true })
      if (clicked !== undefined) {
        setSelected(clicked)
        runSelected(clicked)
      }
      return
    }
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
        const target = props.selection.target ?? locateConfig({ scope: props.selection.scope })
        const document = await readConfig(target)
        const nextPlugins = listPlugins(document.data)
        const nextLocalPlugins = await listLocalPlugins({ scope: props.selection.scope })
        if (!active) return
        setPlugins(nextPlugins)
        setLocalPlugins(nextLocalPlugins)
        setSelected(0)
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

  if (loading) return <Text>{t("plugin.loading")}</Text>
  if (error) return <Text color="red">{t("plugin.failed", { message: error })}</Text>

  return <OpenCodeMenu title={t("plugin.title")} query="" rows={openCodeMenuRows(groups, "")} selectedIndex={selected} footer={[`${t("common.open")}\tenter`, `${t("common.back")}\tesc`]} />
}
