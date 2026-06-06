import React, { useEffect, useState } from "react"
import { Text } from "ink"
import { readCompactionSettings, type CompactionSettings } from "../../core/compaction.js"
import { locateConfig } from "../../core/config-locator.js"
import { readConfig } from "../../core/config-reader.js"
import { useTuiText } from "../i18n.js"
import { deleteEditableTextInputBackward, deleteEditableTextInputForward, editableTextInput, insertEditableTextInput, isBackwardDeleteInput, isForwardDeleteInput, moveEditableTextInput, useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { useRememberedOpenCodeMenuSelection } from "../menu-memory.js"
import type { TuiConfigSelection } from "../types.js"
import { OpenCodeMenu, openCodeMenuRows, OpenCodePrompt, useDelayedLoading, type OpenCodeMenuGroup, type OpenCodeMenuItem } from "../ui.js"

type Mode = "menu" | "reserved"
type Field = "auto" | "prune" | "reserved" | "review"

function booleanMeta(value: boolean, t: ReturnType<typeof useTuiText>) {
  return t(value ? "common.true" : "common.false")
}

function selectedItem(groups: OpenCodeMenuGroup[], index: number): OpenCodeMenuItem | undefined {
  const row = openCodeMenuRows(groups, "").find((entry) => entry.kind === "item" && entry.itemIndex === index)
  return row?.kind === "item" ? row.item : undefined
}

export function CompactionScreen(props: {
  selection: TuiConfigSelection
  onReview: (settings: CompactionSettings) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const keybinds = useTuiKeybinds()
  const [mode, setMode] = useState<Mode>("menu")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [promptError, setPromptError] = useState<string>()
  const [settings, setSettings] = useState<CompactionSettings>(() => readCompactionSettings({}))
  const [inputValue, setInputValue] = useState(() => editableTextInput())

  const groups: OpenCodeMenuGroup[] = [{
    title: t("compaction.group"),
    items: [
      { id: "auto", label: t("compaction.auto"), meta: booleanMeta(settings.auto, t), detail: t("compaction.autoDetail") },
      { id: "prune", label: t("compaction.prune"), meta: booleanMeta(settings.prune, t), detail: t("compaction.pruneDetail") },
      { id: "reserved", label: t("compaction.reserved"), meta: String(settings.reserved), detail: t("compaction.reservedDetail") },
      { id: "review", label: t("compaction.reviewDiff") },
    ],
  }]
  const { selected, setSelected, rememberSelected } = useRememberedOpenCodeMenuSelection({
    memoryKey: `compaction:${props.selection.target?.path ?? props.selection.scope}`,
    groups,
    ready: !loading && !error,
  })

  function startField(field: Field) {
    setPromptError(undefined)
    if (field === "auto") {
      setSettings((current) => ({ ...current, auto: !current.auto }))
      return
    }
    if (field === "prune") {
      setSettings((current) => ({ ...current, prune: !current.prune }))
      return
    }
    if (field === "reserved") {
      setInputValue(editableTextInput(String(settings.reserved)))
      setMode("reserved")
      return
    }
    props.onReview(settings)
  }

  function runSelected(index = selected) {
    if (loading || error) return
    const item = selectedItem(groups, index)
    if (!item) return
    rememberSelected(index)
    startField(item.id as Field)
  }

  function saveReserved() {
    const trimmed = inputValue.value.trim()
    const parsed = Number(trimmed)
    if (!trimmed || !Number.isInteger(parsed) || parsed < 0) {
      setPromptError(t("compaction.error.nonNegativeInteger", { label: t("compaction.reserved") }))
      return
    }
    setSettings((current) => ({ ...current, reserved: parsed }))
    setInputValue(editableTextInput())
    setPromptError(undefined)
    setMode("menu")
  }

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError(undefined)
      try {
        const target = props.selection.target ?? locateConfig({ scope: props.selection.scope })
        const document = await readConfig(target)
        if (!active) return
        if (document.diagnostics.length > 0) throw new Error(document.diagnostics.map((diagnostic) => diagnostic.message).join("\n"))
        setSettings(readCompactionSettings(document.data))
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : String(caught))
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [props.selection])

  const rows = openCodeMenuRows(groups, "")
  const count = rows.filter((row) => row.kind === "item").length

  useEffect(() => {
    if (selected >= count && count > 0) setSelected(count - 1)
  }, [count, selected, setSelected])

  useTuiInput((input, key) => {
    if (mode === "reserved") {
      if (matchesKeybind("cancel", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
        setMode("menu")
        setPromptError(undefined)
        setInputValue(editableTextInput())
        return
      }
      if (matchesKeybind("left", input, key, keybinds)) setInputValue((current) => moveEditableTextInput(current, "left"))
      else if (matchesKeybind("right", input, key, keybinds)) setInputValue((current) => moveEditableTextInput(current, "right"))
      else if (isBackwardDeleteInput(input, key)) setInputValue(deleteEditableTextInputBackward)
      else if (isForwardDeleteInput(input, key)) setInputValue(deleteEditableTextInputForward)
      else if (matchesKeybind("confirm", input, key, keybinds)) saveReserved()
      else {
        setPromptError(undefined)
        setInputValue((current) => insertEditableTextInput(current, input))
      }
      return
    }

    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
      props.onBack()
      return
    }
    if (loading || error) return
    if (matchesKeybind("up", input, key, keybinds)) setSelected((current) => (current === 0 ? Math.max(0, count - 1) : current - 1))
    if (matchesKeybind("down", input, key, keybinds)) setSelected((current) => (current === count - 1 ? 0 : current + 1))
    if (matchesKeybind("toggle", input, key, keybinds)) {
      const item = selectedItem(groups, selected)
      if (item?.id === "auto" || item?.id === "prune") runSelected()
    }
    if (matchesKeybind("confirm", input, key, keybinds)) runSelected()
  })

  const showLoading = useDelayedLoading(loading)

  if (loading) return showLoading ? <Text>{t("compaction.loading")}</Text> : null
  if (error) return <Text color="red">{t("compaction.failed", { message: error })}</Text>

  if (mode === "reserved") {
    return (
      <OpenCodePrompt
        title={t("compaction.title")}
        label={t("compaction.reserved")}
        value={inputValue.value}
        cursor={inputValue.cursor}
        error={promptError}
        hint={t("compaction.reservedHint")}
        footer={[`${t("common.save")}\tenter`, `${t("common.cancel")}\tesc`]}
      />
    )
  }

  return (
    <OpenCodeMenu
      title={t("compaction.title")}
      query=""
      rows={rows}
      selectedIndex={selected}
      footer={[`${t("common.open")}\tenter`, `${t("common.toggle")}\tspace`, `${t("common.back")}\tesc`]}
    />
  )
}
