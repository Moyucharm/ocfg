import React, { useState } from "react"
import type { PluginListItem, PluginOptions } from "../../core/plugin-editor.js"
import { useTuiText } from "../i18n.js"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { parseTuiMouseEvent } from "../mouse.js"
import { menuItemIndexFromMouse, OpenCodeMenu, openCodeMenuRows, OpenCodePrompt, type OpenCodeMenuGroup } from "../ui.js"

type Mode = "menu" | "options"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function appendInput(value: string, input: string) {
  const printable = input.replace(/[\u0000-\u001F\u007F]/g, "")
  if (!printable || printable.startsWith("[<")) return value
  return `${value}${printable}`
}

function parseOptions(value: string): PluginOptions {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (caught) {
    throw new Error(caught instanceof Error ? caught.message : String(caught))
  }
  if (!isRecord(parsed)) throw new Error("Plugin options must be a JSON object")
  return parsed
}

export function PluginEditScreen(props: {
  plugin: PluginListItem
  onSaveOptions: (packageName: string, options: PluginOptions) => void
  onClearOptions: (packageName: string) => void
  onDisable: (packageName: string) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const [mode, setMode] = useState<Mode>("menu")
  const [selected, setSelected] = useState(0)
  const [inputValue, setInputValue] = useState(props.plugin.options ? JSON.stringify(props.plugin.options) : "{}")
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()

  const menuGroups: OpenCodeMenuGroup[] = [{
    title: t("plugin.plugin"),
    items: [
      { id: "options", label: t("plugin.options"), meta: props.plugin.options ? t("plugin.hasOptions") : t("common.empty") },
      { id: "clear-options", label: t("plugin.clearOptions") },
      { id: "disable", label: t("plugin.disable"), danger: true },
    ],
  }]

  function startAction(action: string) {
    setError(undefined)
    if (action === "options") {
      setInputValue(props.plugin.options ? JSON.stringify(props.plugin.options) : "{}")
      setMode("options")
      return
    }
    if (action === "clear-options") props.onClearOptions(props.plugin.packageName)
    if (action === "disable") props.onDisable(props.plugin.packageName)
  }

  function saveOptions() {
    try {
      props.onSaveOptions(props.plugin.packageName, parseOptions(inputValue.trim() || "{}"))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  function runSelected(index = selected) {
    const item = openCodeMenuRows(menuGroups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind === "item") startAction(item.item.id)
  }

  useTuiInput((input, key) => {
    if (mode === "options") {
      if (matchesKeybind("cancel", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
        setMode("menu")
        setError(undefined)
        return
      }
      if (key.backspace || key.delete) setInputValue((current) => current.slice(0, -1))
      else if (matchesKeybind("confirm", input, key, keybinds)) saveOptions()
      else {
        setError(undefined)
        setInputValue((current) => appendInput(current, input))
      }
      return
    }

    const rows = openCodeMenuRows(menuGroups, "")
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

  if (mode === "options") {
    return (
      <OpenCodePrompt
        title={t("plugin.title.editId", { id: props.plugin.packageName })}
        label={t("plugin.optionsJson")}
        value={inputValue}
        error={error}
        hint={t("plugin.optionsHint")}
        footer={[`${t("common.save")}\tenter`, `${t("common.cancel")}\tesc`]}
      />
    )
  }

  return (
    <OpenCodeMenu
      title={t("plugin.title.editId", { id: props.plugin.packageName })}
      query=""
      rows={openCodeMenuRows(menuGroups, "")}
      selectedIndex={selected}
      footer={[`${t("common.open")}\tenter`, `${t("common.back")}\tesc`]}
      emptyText={error}
    />
  )
}
