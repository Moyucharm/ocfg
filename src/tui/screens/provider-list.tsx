import React, { useEffect, useState } from "react"
import { Text } from "ink"
import { locateConfig } from "../../core/config-locator.js"
import { isRecord } from "../../core/object-utils.js"
import { readConfig } from "../../core/config-reader.js"
import { useTuiText } from "../i18n.js"
import { deleteEditableTextInputBackward, deleteEditableTextInputForward, editableTextInput, insertEditableTextInput, isBackwardDeleteInput, isForwardDeleteInput, moveEditableTextInput, printableInput, useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import type { ProviderListMode, TuiConfigSelection } from "../types.js"
import { OpenCodeMenu, openCodeMenuRows, useDelayedLoading, type OpenCodeMenuGroup } from "../ui.js"

export function ProviderListScreen(props: {
  selection: TuiConfigSelection
  mode?: ProviderListMode
  onSelectProvider?: (providerID: string) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const [providers, setProviders] = useState<Array<{ id: string; name?: string; modelCount: number }>>([])
  const [selected, setSelected] = useState(0)
  const [query, setQuery] = useState(() => editableTextInput())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const mode = props.mode ?? "edit"
  const keybinds = useTuiKeybinds()

  const groups: OpenCodeMenuGroup[] = [{
    title: t("provider.providers"),
    items: [
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
    const item = openCodeMenuRows(groups, query.value).find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind !== "item") return
    props.onSelectProvider?.(item.item.id)
  }

  useTuiInput((input, key) => {
    const rows = openCodeMenuRows(groups, query.value)
    const count = rows.filter((row) => row.kind === "item").length
    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
      props.onBack()
      return
    }
    if (matchesKeybind("left", input, key, keybinds)) {
      setQuery((current) => moveEditableTextInput(current, "left"))
      return
    }
    if (matchesKeybind("right", input, key, keybinds)) {
      setQuery((current) => moveEditableTextInput(current, "right"))
      return
    }
    if (isBackwardDeleteInput(input, key)) {
      setQuery(deleteEditableTextInputBackward)
      setSelected(0)
      return
    }
    if (isForwardDeleteInput(input, key)) {
      setQuery(deleteEditableTextInputForward)
      setSelected(0)
      return
    }
    if (matchesKeybind("up", input, key, keybinds)) {
      setSelected((current) => (current === 0 ? Math.max(0, count - 1) : current - 1))
      return
    }
    if (matchesKeybind("down", input, key, keybinds)) {
      setSelected((current) => (current === count - 1 ? 0 : current + 1))
      return
    }
    if (matchesKeybind("confirm", input, key, keybinds)) {
      runSelected()
      return
    }
    if (printableInput(input)) {
      setQuery((current) => insertEditableTextInput(current, input))
      setSelected(0)
    }
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
        setSelected((current) => Math.min(current, Math.max(0, nextProviders.length - 1)))
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

  const showLoading = useDelayedLoading(loading)

  if (loading) return showLoading ? <Text>{t("provider.loading")}</Text> : null
  if (error) return <Text color="red">{t("provider.failed", { message: error })}</Text>

  const title = mode === "edit" ? t("provider.title.edit") : t("provider.title.delete")
  return <OpenCodeMenu title={title} query={query.value} queryCursor={query.cursor} rows={openCodeMenuRows(groups, query.value)} selectedIndex={selected} showSearch footer={[`${t("common.back")}\tesc`, `${t("common.select")}\tenter`]} />
}
