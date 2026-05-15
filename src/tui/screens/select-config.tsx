import React, { useState } from "react"
import { locateConfig } from "../../core/config-locator.js"
import type { ConfigScope } from "../../core/types.js"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { parseTuiMouseEvent } from "../mouse.js"
import type { TuiConfigSelection } from "../types.js"
import { menuItemIndexFromMouse, OpenCodeMenu, openCodeMenuRows, type OpenCodeMenuGroup } from "../ui.js"

const scopes: ConfigScope[] = ["global", "project"]

export function SelectConfigScreen(props: {
  selection: TuiConfigSelection
  onSelect: (selection: TuiConfigSelection) => void
  onBack: () => void
}) {
  const [selected, setSelected] = useState(() => Math.max(0, scopes.indexOf(props.selection.scope)))
  const keybinds = useTuiKeybinds()
  const groups: OpenCodeMenuGroup[] = [{
    title: "Config target",
    items: scopes.map((scope) => {
      const target = locateConfig({ scope })
      return { id: scope, label: scope, description: target.path, meta: target.exists ? "" : "missing" }
    }),
  }]

  function selectIndex(index = selected) {
    const item = openCodeMenuRows(groups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind !== "item") return
    const scope = item.item.id as ConfigScope
    props.onSelect({ scope, target: locateConfig({ scope }) })
  }

  useTuiInput((input, key) => {
    const rows = openCodeMenuRows(groups, "")
    const count = rows.filter((row) => row.kind === "item").length
    const mouse = parseTuiMouseEvent(input)
    if (mouse) {
      const clicked = menuItemIndexFromMouse(mouse, rows)
      if (clicked !== undefined) {
        setSelected(clicked)
        selectIndex(clicked)
      }
      return
    }
    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) props.onBack()
    if (matchesKeybind("up", input, key, keybinds)) setSelected((current) => (current === 0 ? Math.max(0, count - 1) : current - 1))
    if (matchesKeybind("down", input, key, keybinds)) setSelected((current) => (current === count - 1 ? 0 : current + 1))
    if (matchesKeybind("confirm", input, key, keybinds)) selectIndex()
  })

  return <OpenCodeMenu title="Select config" query="" rows={openCodeMenuRows(groups, "")} selectedIndex={selected} footer={["Back\tesc", "Select\tenter"]} />
}
