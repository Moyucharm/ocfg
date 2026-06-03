import type { Dispatch, SetStateAction } from "react"
import { matchesKeybind, useTuiKeybinds } from "./keybinds.js"
import { useTuiInput } from "./input.js"
import { openCodeMenuRows, type OpenCodeMenuGroup } from "./ui.js"

export function openCodeMenuItemCount(groups: OpenCodeMenuGroup[], query = "") {
  return openCodeMenuRows(groups, query).filter((row) => row.kind === "item").length
}

export function useOpenCodeMenuInput(options: {
  groups: OpenCodeMenuGroup[]
  selected: number
  setSelected: Dispatch<SetStateAction<number>>
  onSelect: (index: number) => void
  onBack?: () => void
  onQuit?: () => void
  query?: string
}) {
  const keybinds = useTuiKeybinds()
  const query = options.query ?? ""

  useTuiInput((input, key) => {
    const rows = openCodeMenuRows(options.groups, query)
    const count = rows.filter((row) => row.kind === "item").length

    if (options.onQuit && matchesKeybind("quit", input, key, keybinds)) {
      options.onQuit()
      return
    }
    if (options.onBack && (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds))) {
      options.onBack()
      return
    }
    if (matchesKeybind("up", input, key, keybinds)) options.setSelected((current) => (current === 0 ? Math.max(0, count - 1) : current - 1))
    if (matchesKeybind("down", input, key, keybinds)) options.setSelected((current) => (current === count - 1 ? 0 : current + 1))
    if (matchesKeybind("confirm", input, key, keybinds)) options.onSelect(options.selected)
  })
}
