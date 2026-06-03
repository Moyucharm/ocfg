import React, { useState } from "react"
import { canUseGpt5LongContextPreset, gpt5LongContextState } from "../../core/model-limit-presets.js"
import { isRecord } from "../../core/object-utils.js"
import { useTuiText } from "../i18n.js"
import { deleteEditableTextInputBackward, deleteEditableTextInputForward, editableTextInput, insertEditableTextInput, moveEditableTextInput, useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import type { ExistingModelEditDraft } from "../model-edit-existing.js"
import { OpenCodeMenu, openCodeMenuRows, OpenCodePrompt, type OpenCodeMenuGroup } from "../ui.js"

type Field = "name" | "context" | "input" | "output" | "gpt5-long-context" | "reasoning" | "tool-call" | "temperature" | "attachment" | "review"
type Mode = "menu" | "name" | "context" | "input" | "output" | "boolean" | "gpt5-preset"
type BooleanField = "reasoning" | "toolCall" | "temperature" | "attachment"

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : ""
}

function limitValue(model: Record<string, unknown>, key: "context" | "input" | "output") {
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

function gpt5LongContextLabel(value: boolean | undefined, t: ReturnType<typeof useTuiText>) {
  if (value === true) return t("model.gpt5LongContext.long")
  if (value === false) return t("model.gpt5LongContext.budget")
  return t("model.gpt5LongContext.custom")
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
  const [inputValue, setInputValue] = useState(() => editableTextInput())
  const [booleanField, setBooleanField] = useState<BooleanField>("reasoning")
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()

  const currentName = typeof props.model.name === "string" ? props.model.name : ""
  const currentGpt5LongContext = draft.gpt5LongContext ?? gpt5LongContextState(props.model)

  function currentBooleanValue(field: BooleanField) {
    if (field === "toolCall") return draft.toolCall ?? booleanValue(props.model, "tool_call")
    return (draft[field] as boolean | undefined) ?? booleanValue(props.model, field)
  }

  const showGpt5LongContextPreset = canUseGpt5LongContextPreset(props.modelID)

  const menuGroups: OpenCodeMenuGroup[] = [{
    title: t("model.model"),
    items: [
      { id: "name", label: t("provider.displayName"), meta: (draft.name ?? currentName) || t("common.missing") },
      { id: "context", label: t("model.field.context"), meta: String((draft.context ?? limitValue(props.model, "context")) || t("common.missing")) },
      { id: "input", label: t("model.field.input"), meta: String((draft.input ?? limitValue(props.model, "input")) || t("common.missing")) },
      { id: "output", label: t("model.field.output"), meta: String((draft.output ?? limitValue(props.model, "output")) || t("common.missing")) },
      ...(showGpt5LongContextPreset ? [{ id: "gpt5-long-context", label: t("model.gpt5LongContext"), meta: gpt5LongContextLabel(currentGpt5LongContext, t) }] : []),
      { id: "reasoning", label: t("model.field.reasoning"), meta: t(currentBooleanValue("reasoning") ? "common.true" : "common.false") },
      { id: "tool-call", label: t("model.field.toolCall"), meta: t(currentBooleanValue("toolCall") ? "common.true" : "common.false") },
      { id: "temperature", label: t("model.field.temperature"), meta: t(currentBooleanValue("temperature") ? "common.true" : "common.false") },
      { id: "attachment", label: t("model.field.attachment"), meta: t(currentBooleanValue("attachment") ? "common.true" : "common.false") },
      { id: "review", label: t("provider.reviewDiff") },
    ],
  }]
  const booleanGroups: OpenCodeMenuGroup[] = [{ title: booleanFieldLabel(booleanField, t), items: [{ id: "false", label: t("common.false") }, { id: "true", label: t("common.true") }] }]
  const gpt5PresetGroups: OpenCodeMenuGroup[] = [{ title: t("model.gpt5LongContext"), items: [{ id: "budget", label: t("model.gpt5LongContext.budget") }, { id: "long", label: t("model.gpt5LongContext.long") }] }]

  function startField(field: Field) {
    setError(undefined)
    if (field === "review") return props.onComplete(draft)
    if (field === "name") {
      setInputValue(editableTextInput(draft.name ?? currentName))
      setMode("name")
    }
    if (field === "context") {
      setInputValue(editableTextInput(draft.context === undefined ? limitValue(props.model, "context") : String(draft.context)))
      setMode("context")
    }
    if (field === "input") {
      setInputValue(editableTextInput(draft.input === undefined ? limitValue(props.model, "input") : String(draft.input)))
      setMode("input")
    }
    if (field === "output") {
      setInputValue(editableTextInput(draft.output === undefined ? limitValue(props.model, "output") : String(draft.output)))
      setMode("output")
    }
    if (field === "gpt5-long-context") {
      setSelected(currentGpt5LongContext === true ? 1 : 0)
      setMode("gpt5-preset")
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
      if (mode === "name") setDraft((current) => ({ ...current, name: inputValue.value.trim() }))
      if (mode === "context") setDraft((current) => ({ ...current, context: parsePositiveInteger(inputValue.value.trim(), t("model.error.positiveInteger", { label: t("model.field.context") })) }))
      if (mode === "input") setDraft((current) => ({ ...current, input: parsePositiveInteger(inputValue.value.trim(), t("model.error.positiveInteger", { label: t("model.field.input") })) }))
      if (mode === "output") setDraft((current) => ({ ...current, output: parsePositiveInteger(inputValue.value.trim(), t("model.error.positiveInteger", { label: t("model.field.output") })) }))
      setInputValue(editableTextInput())
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

  function menuIndexForGpt5Preset() {
    const item = openCodeMenuRows(menuGroups, "").find((row) => row.kind === "item" && row.item.id === "gpt5-long-context")
    return item?.kind === "item" ? item.itemIndex : 0
  }

  function runBooleanIndex(index = selected) {
    setDraft((current) => ({ ...current, [booleanField]: index === 1 }))
    setMode("menu")
    setSelected(menuIndexForBooleanField(booleanField))
  }

  function runGpt5PresetIndex(index = selected) {
    setDraft((current) => ({ ...current, gpt5LongContext: index === 1 }))
    setMode("menu")
    setSelected(menuIndexForGpt5Preset())
  }

  useTuiInput((input, key) => {
    if (["name", "context", "input", "output"].includes(mode)) {
      if (matchesKeybind("cancel", input, key, keybinds)) {
        setMode("menu")
        setInputValue(editableTextInput())
        setError(undefined)
        return
      }
      if (matchesKeybind("left", input, key, keybinds)) setInputValue((current) => moveEditableTextInput(current, "left"))
      else if (matchesKeybind("right", input, key, keybinds)) setInputValue((current) => moveEditableTextInput(current, "right"))
      else if (key.backspace) setInputValue(deleteEditableTextInputBackward)
      else if (key.delete) setInputValue(deleteEditableTextInputForward)
      else if (matchesKeybind("confirm", input, key, keybinds)) savePrompt()
      else setInputValue((current) => insertEditableTextInput(current, input))
      return
    }
    const groups = mode === "boolean" ? booleanGroups : mode === "gpt5-preset" ? gpt5PresetGroups : menuGroups
    const rows = openCodeMenuRows(groups, "")
    const count = rows.filter((row) => row.kind === "item").length
    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
      if (mode === "menu") props.onBack()
      else setMode("menu")
      return
    }
    if (matchesKeybind("up", input, key, keybinds)) setSelected((current) => (current === 0 ? Math.max(0, count - 1) : current - 1))
    if (matchesKeybind("down", input, key, keybinds)) setSelected((current) => (current === count - 1 ? 0 : current + 1))
    if (matchesKeybind("confirm", input, key, keybinds)) {
      if (mode === "boolean") runBooleanIndex()
      else if (mode === "gpt5-preset") runGpt5PresetIndex()
      else runMenuIndex()
    }
  })

  if (mode === "name" || mode === "context" || mode === "input" || mode === "output") {
    return <OpenCodePrompt title={t("model.title.editId", { id: props.modelID })} label={mode === "name" ? t("provider.displayName") : mode === "context" ? t("model.field.context") : mode === "input" ? t("model.field.input") : t("model.field.output")} value={inputValue.value} cursor={inputValue.cursor} error={error} footer={[`${t("common.save")}\tenter`, `${t("common.cancel")}\tesc`]} />
  }

  return (
    <OpenCodeMenu
      title={mode === "boolean" ? booleanFieldLabel(booleanField, t) : mode === "gpt5-preset" ? t("model.gpt5LongContext") : t("model.title.editId", { id: props.modelID })}
      query=""
      rows={openCodeMenuRows(mode === "boolean" ? booleanGroups : mode === "gpt5-preset" ? gpt5PresetGroups : menuGroups, "")}
      selectedIndex={selected}
      footer={mode === "boolean" || mode === "gpt5-preset" ? [`${t("common.select")}\tenter`, `${t("common.cancel")}\tesc`] : [`${t("common.open")}\tenter`, `${t("common.back")}\tesc`]}
    />
  )
}
