import React, { useState } from "react"
import { parseTuiMouseEvent } from "../mouse.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { useTuiText } from "../i18n.js"
import type { TuiAction, TuiConfigSelection } from "../types.js"
import { menuItemIndexFromMouse, OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"
import { useTuiInput } from "../input.js"

function itemCount(groups: OpenCodeMenuGroup[]) {
  return openCodeMenuRows(groups, "").filter((row) => row.kind === "item").length
}

export function HomeScreen(props: { selection: TuiConfigSelection; onAction: (action: TuiAction) => void; onQuit: () => void }) {
  const t = useTuiText()
  const [selected, setSelected] = useState(0)
  const keybinds = useTuiKeybinds()
  const groups: OpenCodeMenuGroup[] = [
    {
      title: t("home.group.commands"),
      items: [
        { id: "edit-provider", label: t("home.editProvider") },
        { id: "add-provider", label: t("home.connectProvider") },
        { id: "manage-plugins", label: t("home.managePlugins") },
        { id: "doctor", label: t("home.doctor") },
        { id: "set-default-model", label: t("home.setDefaultModel") },
        { id: "switch-config", label: t("home.switchConfig") },
        { id: "switch-language", label: t("home.switchLanguage") },
        { id: "delete-provider", label: t("home.deleteProvider"), danger: true },
      ],
    },
  ]

  function runSelected(index = selected) {
    const item = openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind === "item") props.onAction(item.item.id as TuiAction)
  }

  useTuiInput((input, key) => {
    const mouse = parseTuiMouseEvent(input)
    const rows = openCodeMenuRows(groups, "")
    const count = itemCount(groups)
    if (mouse) {
      if (mouse.kind === "wheel") {
        setSelected((current) => mouse.button === "wheel-up" ? Math.max(0, current - 1) : Math.min(Math.max(0, count - 1), current + 1))
        return
      }
      const clicked = menuItemIndexFromMouse(mouse, rows, { selectedIndex: selected, hasFooter: true })
      if (clicked !== undefined) {
        setSelected(clicked)
        runSelected(clicked)
      }
      return
    }
    if (matchesKeybind("quit", input, key, keybinds)) props.onQuit()
    if (matchesKeybind("up", input, key, keybinds)) setSelected((current) => (current === 0 ? Math.max(0, count - 1) : current - 1))
    if (matchesKeybind("down", input, key, keybinds)) setSelected((current) => (current === count - 1 ? 0 : current + 1))
    if (matchesKeybind("confirm", input, key, keybinds)) runSelected()
  })

  return (
    <OpenCodeMenu
      title={t("home.title")}
      query=""
      rows={openCodeMenuRows(groups, "")}
      selectedIndex={selected}
      footer={[`${t("common.select")}\tenter`, `${t("common.exit")}\tq`]}
    />
  )
}
