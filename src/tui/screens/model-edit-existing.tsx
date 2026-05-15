import React, { useState } from "react"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { parseTuiMouseEvent } from "../mouse.js"
import type { ExistingModelEditDraft } from "../model-edit-existing.js"
import { menuItemIndexFromMouse, OpenCodeMenu, openCodeMenuRows, OpenCodePrompt, type OpenCodeMenuGroup } from "../ui.js"

type Field = "name" | "context" | "output" | "reasoning" | "tool-call" | "temperature" | "attachment" | "review"
type Mode = "menu" | "name" | "context" | "output" | "boolean"
type BooleanField = "reasoning" | "toolCall" | "temperature" | "attachment"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function appendInput(value: string, input: string) {
  const printable = input.replace(/[\u0000-\u001F\u007F]/g, "")
  if (!printable || printable.startsWith("[<")) return value
  return `${value}${printable}`
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : ""
}

function limitValue(model: Record<string, unknown>, key: "context" | "output") {
  const limit = isRecord(model.limit) ? model.limit : {}
  return numberValue(limit[key])
}

function booleanValue(model: Record<string, unknown>, key: "reasoning" | "tool_call" | "temperature" | "attachment") {
  return typeof model[key] === "boolean" ? model[key] : false
}

function parsePositiveInteger(value: string, label: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`)
  return parsed
}

export function ModelEditExistingScreen(props: {
  providerID: string
  modelID: string
  model: Record<string, unknown>
  onComplete: (draft: ExistingModelEditDraft) => void
  onBack: () => void
}) {
  const [mode, setMode] = useState<Mode>("menu")
  const [selected, setSelected] = useState(0)
  const [draft, setDraft] = useState<ExistingModelEditDraft>({})
  const [inputValue, setInputValue] = useState("")
  const [booleanField, setBooleanField] = useState<BooleanField>("reasoning")
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()

  const currentName = typeof props.model.name === "string" ? props.model.name : ""

  function currentBooleanValue(field: BooleanField) {
    if (field === "toolCall") return draft.toolCall ?? booleanValue(props.model, "tool_call")
    return (draft[field] as boolean | undefined) ?? booleanValue(props.model, field)
  }

  const menuGroups: OpenCodeMenuGroup[] = [{
    title: "Model",
    items: [
      { id: "name", label: "Display name", meta: (draft.name ?? currentName) || "(missing)" },
      { id: "context", label: "Context limit", meta: String((draft.context ?? limitValue(props.model, "context")) || "(missing)") },
      { id: "output", label: "Output limit", meta: String((draft.output ?? limitValue(props.model, "output")) || "(missing)") },
      { id: "reasoning", label: "Reasoning", meta: String(currentBooleanValue("reasoning")) },
      { id: "tool-call", label: "Tool call", meta: String(currentBooleanValue("toolCall")) },
      { id: "temperature", label: "Temperature", meta: String(currentBooleanValue("temperature")) },
      { id: "attachment", label: "Attachment", meta: String(currentBooleanValue("attachment")) },
      { id: "review", label: "Review diff" },
    ],
  }]
  const booleanGroups: OpenCodeMenuGroup[] = [{ title: booleanField, items: [{ id: "false", label: "false" }, { id: "true", label: "true" }] }]

  function startField(field: Field) {
    setError(undefined)
    if (field === "review") return props.onComplete(draft)
    if (field === "name") {
      setInputValue(draft.name ?? currentName)
      setMode("name")
    }
    if (field === "context") {
      setInputValue(draft.context === undefined ? limitValue(props.model, "context") : String(draft.context))
      setMode("context")
    }
    if (field === "output") {
      setInputValue(draft.output === undefined ? limitValue(props.model, "output") : String(draft.output))
      setMode("output")
    }
    if (["reasoning", "tool-call", "temperature", "attachment"].includes(field)) {
      const nextField = field === "tool-call" ? "toolCall" : (field as BooleanField)
      setBooleanField(nextField)
      setSelected(currentBooleanValue(nextField) ? 1 : 0)
      setMode("boolean")
    }
  }

  function savePrompt() {
    try {
      if (mode === "name") setDraft((current) => ({ ...current, name: inputValue.trim() }))
      if (mode === "context") setDraft((current) => ({ ...current, context: parsePositiveInteger(inputValue.trim(), "context") }))
      if (mode === "output") setDraft((current) => ({ ...current, output: parsePositiveInteger(inputValue.trim(), "output") }))
      setInputValue("")
      setMode("menu")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  function runMenuIndex(index = selected) {
    const item = openCodeMenuRows(menuGroups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind === "item") startField(item.item.id as Field)
  }

  function runBooleanIndex(index = selected) {
    setDraft((current) => ({ ...current, [booleanField]: index === 1 }))
    setMode("menu")
    setSelected(0)
  }

  useTuiInput((input, key) => {
    if (["name", "context", "output"].includes(mode)) {
      if (matchesKeybind("cancel", input, key, keybinds)) {
        setMode("menu")
        setInputValue("")
        setError(undefined)
        return
      }
      if (key.backspace || key.delete) setInputValue((current) => current.slice(0, -1))
      else if (matchesKeybind("confirm", input, key, keybinds)) savePrompt()
      else setInputValue((current) => appendInput(current, input))
      return
    }
    const groups = mode === "boolean" ? booleanGroups : menuGroups
    const rows = openCodeMenuRows(groups, "")
    const count = rows.filter((row) => row.kind === "item").length
    const mouse = parseTuiMouseEvent(input)
    if (mouse) {
      const clicked = menuItemIndexFromMouse(mouse, rows)
      if (clicked !== undefined) {
        setSelected(clicked)
        if (mode === "boolean") runBooleanIndex(clicked)
        else runMenuIndex(clicked)
      }
      return
    }
    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
      if (mode === "menu") props.onBack()
      else setMode("menu")
      return
    }
    if (matchesKeybind("up", input, key, keybinds)) setSelected((current) => (current === 0 ? Math.max(0, count - 1) : current - 1))
    if (matchesKeybind("down", input, key, keybinds)) setSelected((current) => (current === count - 1 ? 0 : current + 1))
    if (matchesKeybind("confirm", input, key, keybinds)) {
      if (mode === "boolean") runBooleanIndex()
      else runMenuIndex()
    }
  })

  if (mode === "name" || mode === "context" || mode === "output") {
    return <OpenCodePrompt title={`Edit ${props.modelID}`} label={mode} value={inputValue} error={error} footer={["Save\tenter", "Cancel\tesc"]} />
  }

  return (
    <OpenCodeMenu
      title={mode === "boolean" ? booleanField : `Edit ${props.modelID}`}
      query=""
      rows={openCodeMenuRows(mode === "boolean" ? booleanGroups : menuGroups, "")}
      selectedIndex={selected}
      footer={mode === "boolean" ? ["Select\tenter", "Cancel\tesc"] : ["Open\tenter", "Back\tesc"]}
    />
  )
}
