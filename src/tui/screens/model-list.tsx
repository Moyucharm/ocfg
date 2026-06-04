import React, { useEffect, useState } from "react"
import { Text } from "ink"
import { locateConfig } from "../../core/config-locator.js"
import { isRecord } from "../../core/object-utils.js"
import { readConfig } from "../../core/config-reader.js"
import { useTuiText } from "../i18n.js"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { useRememberedOpenCodeMenuSelection } from "../menu-memory.js"
import type { TuiConfigSelection } from "../types.js"
import { OpenCodeMenu, openCodeMenuRows, useDelayedLoading, type OpenCodeMenuGroup } from "../ui.js"

export function ModelListScreen(props: {
  selection: TuiConfigSelection
  providerID: string
  onAddModel: () => void
  onSelectModel: (modelID: string) => void
  onDeleteModel: (modelID: string) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const [models, setModels] = useState<Array<{ id: string; name?: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()

  const groups: OpenCodeMenuGroup[] = [{
    title: t("model.models"),
    items: [
      { id: "__add", label: t("model.add") },
      ...models.map((model) => ({ id: model.id, label: model.id, description: model.name })),
    ],
  }]
  const { selected, setSelected, rememberSelected } = useRememberedOpenCodeMenuSelection({
    memoryKey: `model-list:${props.selection.target?.path ?? props.selection.scope}:${props.providerID}`,
    groups,
    initialSelected: models.length > 0 ? 1 : 0,
    ready: !loading && !error,
  })

  function selectedItem(index = selected) {
    return openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
  }

  function runSelected(index = selected) {
    const item = selectedItem(index)
    if (item?.kind !== "item") return
    rememberSelected(index)
    if (item.item.id === "__add") props.onAddModel()
    else props.onSelectModel(item.item.id)
  }

  useTuiInput((input, key) => {
    const rows = openCodeMenuRows(groups, "")
    const count = rows.filter((row) => row.kind === "item").length
    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
      props.onBack()
      return
    }
    if (key.ctrl && matchesKeybind("toggleAll", input, key, keybinds)) {
      props.onAddModel()
      return
    }
    if (matchesKeybind("delete", input, key, keybinds)) {
      const item = selectedItem()
      if (item?.kind === "item" && item.item.id !== "__add") {
        rememberSelected()
        props.onDeleteModel(item.item.id)
      }
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
        const provider = providerMap[props.providerID]
        if (!isRecord(provider)) throw new Error(`Provider "${props.providerID}" does not exist`)
        const modelMap = isRecord(provider.models) ? provider.models : {}
        const nextModels = Object.entries(modelMap).map(([id, value]) => ({
          id,
          name: isRecord(value) && typeof value.name === "string" ? value.name : undefined,
        }))
        if (!active) return
        setModels(nextModels)
        setSelected((current) => Math.min(current > 0 ? current : nextModels.length > 0 ? 1 : 0, nextModels.length))
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
  }, [props.providerID, props.selection])

  const showLoading = useDelayedLoading(loading)

  if (loading) return showLoading ? <Text>{t("model.loading")}</Text> : null
  if (error) return <Text color="red">{t("model.failed", { message: error })}</Text>

  return <OpenCodeMenu title={t("model.select")} query="" rows={openCodeMenuRows(groups, "")} selectedIndex={selected} footer={[`${t("common.open")}\tenter`, `${t("common.add")}\tctrl+a`, `${t("common.delete")}\td`, `${t("common.back")}\tesc`]} />
}
