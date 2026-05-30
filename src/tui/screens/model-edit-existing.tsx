import React, { useState } from "react"
import { isRecord } from "../../core/object-utils.js"
import { useTuiText } from "../i18n.js"
import { appendPrintableInput, useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { parseTuiMouseEvent } from "../mouse.js"
import type { ExistingModelEditDraft } from "../model-edit-existing.js"
import { menuItemIndexFromMouse, OpenCodeMenu, openCodeMenuRows, OpenCodePrompt, type OpenCodeMenuGroup } from "../ui.js"

type Field = "name" | "context" | "output" | "reasoning" | "tool-call" | "temperature" | "attachment" | "review"
type Mode = "menu" | "name" | "context" | "output" | "boolean"
type BooleanField = "reasoning" | "toolCall" | "temperature" | "attachment"

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

function parsePositiveInteger(value: string, errorMessage: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(errorMessage)
  return parsed
}

function booleanFieldLabel(field: BooleanField, t: ReturnType<typeof useTuiText>) {
  if (field === "toolCall") return t("model.field.toolCall")
  if (field === "reasoning") return t("model.field.reasoning")
  if (field === "temperature") return t("model.field.temperature")
  return t("model.field.attachment")
}

export function ModelEditExistingScreen(props: {
  providerID: string
  modelID: string
  model: Record<string, unknown>
  onComplete: (draft: ExistingModelEditDraft) => void
  onBack: () => void
}) {
  const t = useTuiText()
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
    title: t("model.model"),
    items: [
      { id: "name", label: t("provider.displayName"), meta: (draft.name ?? currentName) || t("common.missing") },
      { id: "context", label: t("model.field.context"), meta: String((draft.context ?? limitValue(props.model, "context")) || t("common.missing")) },
      { id: "output", label: t("model.field.output"), meta: String((draft.output ?? limitValue(props.model, "output")) || t("common.missing")) },
      { id: "reasoning", label: t("model.field.reasoning"), meta: t(currentBooleanValue("reasoning") ? "common.true" : "common.false") },
      { id: "tool-call", label: t("model.field.toolCall"), meta: t(currentBooleanValue("toolCall") ? "common.true" : "common.false") },
      { id: "temperature", label: t("model.field.temperature"), meta: t(currentBooleanValue("temperature") ? "common.true" : "common.false") },
      { id: "attachment", label: t("model.field.attachment"), meta: t(currentBooleanValue("attachment") ? "common.true" : "common.false") },
      { id: "review", label: t("provider.reviewDiff") },
    ],
  }]
  const booleanGroups: OpenCodeMenuGroup[] = [{ title: booleanFieldLabel(booleanField, t), items: [{ id: "false", label: t("common.false") }, { id: "true", label: t("common.true") }] }]

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
      if (mode === "context") setDraft((current) => ({ ...current, context: parsePositiveInteger(inputValue.trim(), t("model.error.positiveInteger", { label: t("model.field.context") })) }))
      if (mode === "output") setDraft((current) => ({ ...current, output: parsePositiveInteger(inputValue.trim(), t("model.error.positiveInteger", { label: t("model.field.output") })) }))
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

  function menuIndexForBooleanField(field: BooleanField) {
    const menuID = field === "toolCall" ? "tool-call" : field
    const item = openCodeMenuRows(menuGroups, "").find((row) => row.kind === "item" && row.item.id === menuID)
    return item?.kind === "item" ? item.itemIndex : 0
  }

  function runBooleanIndex(index = selected) {
    setDraft((current) => ({ ...current, [booleanField]: index === 1 }))
    setMode("menu")
    setSelected(menuIndexForBooleanField(booleanField))
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
      else setInputValue((current) => appendPrintableInput(current, input))
      return
    }
    const groups = mode === "boolean" ? booleanGroups : menuGroups
    const rows = openCodeMenuRows(groups, "")
    const count = rows.filter((row) => row.kind === "item").length
    const mouse = parseTuiMouseEvent(input)
    if (mouse) {
      const clicked = menuItemIndexFromMouse(mouse, rows, { selectedIndex: selected, hasFooter: true })
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
    return <OpenCodePrompt title={t("model.title.editId", { id: props.modelID })} label={mode === "name" ? t("provider.displayName") : mode === "context" ? t("model.field.context") : t("model.field.output")} value={inputValue} error={error} footer={[`${t("common.save")}\tenter`, `${t("common.cancel")}\tesc`]} />
  }

  return (
    <OpenCodeMenu
      title={mode === "boolean" ? booleanFieldLabel(booleanField, t) : t("model.title.editId", { id: props.modelID })}
      query=""
      rows={openCodeMenuRows(mode === "boolean" ? booleanGroups : menuGroups, "")}
      selectedIndex={selected}
      footer={mode === "boolean" ? [`${t("common.select")}\tenter`, `${t("common.cancel")}\tesc`] : [`${t("common.open")}\tenter`, `${t("common.back")}\tesc`]}
    />
  )
}
