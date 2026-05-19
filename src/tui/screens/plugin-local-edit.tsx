import React, { useState } from "react"
import type { LocalPluginItem } from "../../core/local-plugin-manager.js"
import { useTuiText } from "../i18n.js"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { parseTuiMouseEvent } from "../mouse.js"
import { menuItemIndexFromMouse, OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"

export function PluginLocalEditScreen(props: {
  plugin: LocalPluginItem
  onToggle: (plugin: LocalPluginItem) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const [selected, setSelected] = useState(0)
  const keybinds = useTuiKeybinds()
  const isEnabled = props.plugin.status === "enabled"

  const groups: OpenCodeMenuGroup[] = [{
    title: t("plugin.localPlugin"),
    items: [{
      id: "toggle",
      label: t(isEnabled ? "plugin.disable" : "plugin.enable"),
      description: props.plugin.fileName,
      meta: t(isEnabled ? "plugin.enabled" : "plugin.disabled"),
      detail: props.plugin.path,
      tone: isEnabled ? "danger" : "success",
    }],
  }]

  function runSelected(index = selected) {
    const item = openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind === "item" && item.item.id === "toggle") props.onToggle(props.plugin)
  }

  useTuiInput((input, key) => {
    const rows = openCodeMenuRows(groups, "")
    const count = rows.filter((row) => row.kind === "item").length
    const mouse = parseTuiMouseEvent(input)
    if (mouse) {
      if (mouse.kind === "wheel") setSelected((current) => mouse.button === "wheel-up" ? Math.max(0, current - 1) : Math.min(Math.max(0, count - 1), current + 1))
      const clicked = menuItemIndexFromMouse(mouse, rows, { selectedIndex: selected, hasFooter: true, hasDetail: true })
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

  return (
    <OpenCodeMenu
      title={t("plugin.title.editId", { id: props.plugin.fileName })}
      query=""
      rows={openCodeMenuRows(groups, "")}
      selectedIndex={selected}
      footer={[`${t("common.select")}\tenter`, `${t("common.back")}\tesc`]}
    />
  )
}
