import React, { useState } from "react"
import { parseTuiMouseEvent } from "../mouse.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import type { TuiAction, TuiConfigSelection } from "../types.js"
import { menuItemIndexFromMouse, OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"
import { useTuiInput } from "../input.js"

const groups: OpenCodeMenuGroup[] = [
  {
    title: "Commands",
    items: [
      { id: "edit-provider", label: "Edit provider", shortcut: "ctrl+x e" },
      { id: "add-provider", label: "Connect provider", shortcut: "ctrl+a" },
      { id: "doctor", label: "Doctor", shortcut: "ctrl+x d" },
      { id: "set-default-model", label: "Select model", shortcut: "ctrl+x m" },
      { id: "switch-config", label: "Switch config target", shortcut: "ctrl+x c" },
      { id: "delete-provider", label: "Delete provider", shortcut: "ctrl+x delete", danger: true },
    ],
  },
]

function itemCount() {
  return openCodeMenuRows(groups, "").filter((row) => row.kind === "item").length
}

export function HomeScreen(props: { selection: TuiConfigSelection; onAction: (action: TuiAction) => void; onQuit: () => void }) {
  const [selected, setSelected] = useState(0)
  const keybinds = useTuiKeybinds()

  function runSelected(index = selected) {
    const item = openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind === "item") props.onAction(item.item.id as TuiAction)
  }

  useTuiInput((input, key) => {
    const mouse = parseTuiMouseEvent(input)
    const rows = openCodeMenuRows(groups, "")
    const count = itemCount()
    if (mouse) {
      if (mouse.kind === "wheel") {
        setSelected((current) => mouse.button === "wheel-up" ? Math.max(0, current - 1) : Math.min(Math.max(0, count - 1), current + 1))
        return
      }
      const clicked = menuItemIndexFromMouse(mouse, rows)
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
      title="Commands"
      query=""
      rows={openCodeMenuRows(groups, "")}
      selectedIndex={selected}
      footer={["Exit\tq", "Open commands\tctrl+p"]}
    />
  )
}
