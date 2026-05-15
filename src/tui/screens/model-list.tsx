import React, { useEffect, useState } from "react"
import { Text } from "ink"
import { locateConfig } from "../../core/config-locator.js"
import { readConfig } from "../../core/config-reader.js"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { parseTuiMouseEvent } from "../mouse.js"
import type { TuiConfigSelection } from "../types.js"
import { menuItemIndexFromMouse, OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function ModelListScreen(props: {
  selection: TuiConfigSelection
  providerID: string
  onAddModel: () => void
  onSelectModel: (modelID: string) => void
  onDeleteModel: (modelID: string) => void
  onBack: () => void
}) {
  const [models, setModels] = useState<Array<{ id: string; name?: string }>>([])
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()

  const groups: OpenCodeMenuGroup[] = [{
    title: "Models",
    items: [
      { id: "__add", label: "Add model" },
      ...models.map((model) => ({ id: model.id, label: model.id, description: model.name })),
    ],
  }]

  function selectedItem(index = selected) {
    return openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
  }

  function runSelected(index = selected) {
    const item = selectedItem(index)
    if (item?.kind !== "item") return
    if (item.item.id === "__add") props.onAddModel()
    else props.onSelectModel(item.item.id)
  }

  useTuiInput((input, key) => {
    const rows = openCodeMenuRows(groups, "")
    const count = rows.filter((row) => row.kind === "item").length
    const mouse = parseTuiMouseEvent(input)
    if (mouse) {
      if (mouse.kind === "wheel") setSelected((current) => mouse.button === "wheel-up" ? Math.max(0, current - 1) : Math.min(Math.max(0, count - 1), current + 1))
      const clicked = menuItemIndexFromMouse(mouse, rows)
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
    if (matchesKeybind("delete", input, key, keybinds)) {
      const item = selectedItem()
      if (item?.kind === "item" && item.item.id !== "__add") props.onDeleteModel(item.item.id)
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
  }, [props.providerID, props.selection])

  if (loading) return <Text>Loading models...</Text>
  if (error) return <Text color="red">Failed to load models: {error}</Text>

  return <OpenCodeMenu title="Select model" query="" rows={openCodeMenuRows(groups, "")} selectedIndex={selected} footer={["Add\tctrl+a", "Delete\td", "Back\tesc"]} />
}
