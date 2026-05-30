import React, { useEffect, useState } from "react"
import { Text } from "ink"
import { locateConfig } from "../../core/config-locator.js"
import { isRecord } from "../../core/object-utils.js"
import { readConfig } from "../../core/config-reader.js"
import { useTuiText } from "../i18n.js"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { parseTuiMouseEvent } from "../mouse.js"
import type { ProviderListMode, TuiConfigSelection } from "../types.js"
import { menuItemIndexFromMouse, OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"

export function ProviderListScreen(props: {
  selection: TuiConfigSelection
  mode?: ProviderListMode
  onAdd?: () => void
  onSelectProvider?: (providerID: string) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const [providers, setProviders] = useState<Array<{ id: string; name?: string; modelCount: number }>>([])
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const mode = props.mode ?? "add"
  const keybinds = useTuiKeybinds()

  const groups: OpenCodeMenuGroup[] = [{
    title: t("provider.providers"),
    items: [
      ...(mode === "add" ? [{ id: "__add", label: t("provider.title.connect") }] : []),
      ...providers.map((provider) => ({
        id: provider.id,
        label: provider.id,
        description: provider.name,
        meta: t("provider.count", { count: provider.modelCount }),
        danger: mode === "delete",
      })),
    ],
  }]

  function runSelected(index = selected) {
    const item = openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind !== "item") return
    if (item.item.id === "__add") props.onAdd?.()
    else props.onSelectProvider?.(item.item.id)
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
        const providerMap = isRecord(document.data.provider) ? document.data.provider : {}
        const nextProviders = Object.entries(providerMap).map(([id, value]) => ({
          id,
          name: isRecord(value) && typeof value.name === "string" ? value.name : undefined,
          modelCount: isRecord(value) && isRecord(value.models) ? Object.keys(value.models).length : 0,
        }))
        if (!active) return
        setProviders(nextProviders)
        setSelected((current) => Math.min(current, Math.max(0, nextProviders.length + (mode === "add" ? 1 : 0) - 1)))
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
  }, [mode, props.selection])

  if (loading) return <Text>{t("provider.loading")}</Text>
  if (error) return <Text color="red">{t("provider.failed", { message: error })}</Text>

  const title = mode === "edit" ? t("provider.title.edit") : mode === "delete" ? t("provider.title.delete") : t("provider.title.connect")
  return <OpenCodeMenu title={title} query="" rows={openCodeMenuRows(groups, "")} selectedIndex={selected} footer={[`${t("common.back")}\tesc`, `${t("common.select")}\tenter`]} />
}
