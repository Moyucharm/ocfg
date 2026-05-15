import React, { useState } from "react"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { parseTuiMouseEvent } from "../mouse.js"
import type { DeleteTargetState } from "../types.js"
import { menuItemIndexFromMouse, OpenCodeMenu, openCodeMenuRows, OpenCodePrompt, type OpenCodeMenuGroup } from "../ui.js"

const actions = ["Confirm", "Cancel"] as const

function appendInput(value: string, input: string) {
  const printable = input.replace(/[\u0000-\u001F\u007F]/g, "")
  if (!printable || printable.startsWith("[<")) return value
  return `${value}${printable}`
}

export function DeleteConfirmScreen(props: {
  target: DeleteTargetState
  onConfirm: (token?: string) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState(0)
  const [token, setToken] = useState("")
  const keybinds = useTuiKeybinds()
  const requiresToken = props.target.references.length > 0
  const targetLabel = props.target.kind === "provider" ? props.target.providerID : `${props.target.providerID}/${props.target.modelID}`
  const expectedToken = props.target.kind === "provider" ? `delete:${props.target.providerID}` : `delete:${props.target.providerID}/${props.target.modelID}`
  const groups: OpenCodeMenuGroup[] = [{
    title: "Delete",
    items: actions.map((action) => ({ id: action, label: action, shortcut: action === "Confirm" ? targetLabel : "esc", danger: action === "Confirm" })),
  }]

  function runSelected(index = selected) {
    const item = openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind !== "item") return
    if (item.item.id === "Confirm") props.onConfirm()
    else props.onCancel()
  }

  useTuiInput((input, key) => {
    if (requiresToken) {
      if (matchesKeybind("cancel", input, key, keybinds)) return props.onCancel()
      if (key.backspace || key.delete) setToken((current) => current.slice(0, -1))
      else if (matchesKeybind("confirm", input, key, keybinds)) props.onConfirm(token.trim())
      else setToken((current) => appendInput(current, input))
      return
    }
    const rows = openCodeMenuRows(groups, "")
    const mouse = parseTuiMouseEvent(input)
    if (mouse) {
      const clicked = menuItemIndexFromMouse(mouse, rows)
      if (clicked !== undefined) {
        setSelected(clicked)
        runSelected(clicked)
      }
      return
    }
    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) return props.onCancel()
    if (matchesKeybind("up", input, key, keybinds) || matchesKeybind("left", input, key, keybinds)) setSelected((current) => (current === 0 ? actions.length - 1 : current - 1))
    if (matchesKeybind("down", input, key, keybinds) || matchesKeybind("right", input, key, keybinds)) setSelected((current) => (current === actions.length - 1 ? 0 : current + 1))
    if (matchesKeybind("confirm", input, key, keybinds)) runSelected()
  })

  if (requiresToken) {
    return (
      <OpenCodePrompt
        title={`Delete ${props.target.kind}`}
        label={`Type ${expectedToken}`}
        value={token}
        error={props.target.error}
        hint={`Referenced by: ${props.target.references.join(", ")}`}
        footer={["Continue\tenter", "Cancel\tesc"]}
      />
    )
  }

  return <OpenCodeMenu title={`Delete ${props.target.kind}`} query="" rows={openCodeMenuRows(groups, "")} selectedIndex={selected} footer={["Select\tenter", "Cancel\tesc"]} />
}
