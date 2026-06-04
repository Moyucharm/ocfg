import React, { useState } from "react"
import { channelTypeOptions, channelTypeLabel } from "../../core/channel-types.js"
import { isRecord } from "../../core/object-utils.js"
import { defaultSecretFilePath } from "../../core/secret-file.js"
import type { EndpointKind } from "../../core/types.js"
import { useTuiText } from "../i18n.js"
import { deleteEditableTextInputBackward, deleteEditableTextInputForward, editableTextInput, insertEditableTextInput, isBackwardDeleteInput, isForwardDeleteInput, moveEditableTextInput, useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { useRememberedOpenCodeMenuSelection } from "../menu-memory.js"
import type { ExistingProviderEditDraft } from "../provider-edit-existing.js"
import { tryInferEndpointKindFromProvider } from "../provider-metadata.js"
import { maskSecret, OpenCodeMenu, openCodeMenuRows, OpenCodePrompt, type OpenCodeMenuGroup } from "../ui.js"

type Mode = "menu" | "name" | "base-url" | "api-key" | "channel-type" | "cache"
type Field = "channel-type" | "name" | "base-url" | "api-key" | "cache" | "edit-models" | "review" | "delete"

function optionValue(provider: Record<string, unknown>, key: string) {
  const options = isRecord(provider.options) ? provider.options : {}
  const value = options[key]
  return typeof value === "string" ? value : value === undefined ? undefined : String(value)
}

function cacheValue(provider: Record<string, unknown>) {
  const options = isRecord(provider.options) ? provider.options : {}
  return typeof options.setCacheKey === "boolean" ? options.setCacheKey : false
}

export function ProviderEditExistingScreen(props: {
  providerID: string
  provider: Record<string, unknown>
  onComplete: (draft: ExistingProviderEditDraft) => void
  onEditModels: () => void
  onDelete: () => void
  onBack: () => void
}) {
  const t = useTuiText()
  const inferredKind = tryInferEndpointKindFromProvider(props.provider)
  const defaultKindIndex = Math.max(0, channelTypeOptions.findIndex((option) => option.kind === inferredKind.kind))
  const [mode, setMode] = useState<Mode>("menu")
  const [selectSelected, setSelectSelected] = useState(0)
  const [channelTypeIndex, setChannelTypeIndex] = useState(defaultKindIndex)
  const [draft, setDraft] = useState<ExistingProviderEditDraft>({})
  const [inputValue, setInputValue] = useState(() => editableTextInput())
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()

  const currentName = typeof props.provider.name === "string" ? props.provider.name : ""
  const currentBaseURL = optionValue(props.provider, "baseURL") ?? ""
  const currentApiKey = optionValue(props.provider, "apiKey") ?? ""
  const displayedBaseURL = draft.baseURL ?? currentBaseURL
  const displayedApiKey = draft.apiKeyValue ? maskSecret(draft.apiKeyValue) : currentApiKey ? maskSecret(currentApiKey) : t("common.missing")
  const cacheOptions = [false, true]
  const currentChannelType = draft.endpointKind ?? inferredKind.kind
  const selectedChannelType = channelTypeOptions[channelTypeIndex]!

  const menuGroups: OpenCodeMenuGroup[] = [{
    title: t("provider.group"),
    items: [
      { id: "channel-type", label: t("provider.channelType"), meta: currentChannelType ? channelTypeLabel(currentChannelType) : t("provider.unknown") },
      { id: "name", label: t("provider.displayName"), meta: (draft.name ?? currentName) || t("common.missing"), detail: (draft.name ?? currentName) ? t("provider.detail.displayName", { value: draft.name ?? currentName }) : undefined },
      { id: "base-url", label: t("provider.baseURL"), meta: displayedBaseURL || t("common.missing"), detail: displayedBaseURL ? t("provider.detail.baseURL", { value: displayedBaseURL }) : undefined },
      { id: "api-key", label: t("provider.apiKey"), meta: displayedApiKey },
      { id: "cache", label: t("provider.cacheKey"), meta: t((draft.setCacheKey ?? cacheValue(props.provider)) ? "common.true" : "common.false") },
      { id: "edit-models", label: t("provider.editModels") },
      { id: "review", label: t("provider.reviewDiff") },
      { id: "delete", label: t("provider.title.delete"), danger: true },
    ],
  }]
  const menuSelection = useRememberedOpenCodeMenuSelection({ memoryKey: `provider-edit-existing:${props.providerID}`, groups: menuGroups })
  const selected = mode === "menu" ? menuSelection.selected : selectSelected
  const setSelected = mode === "menu" ? menuSelection.setSelected : setSelectSelected

  const selectGroups: OpenCodeMenuGroup[] = mode === "channel-type"
    ? [{ title: t("provider.channelType"), items: channelTypeOptions.map((option) => ({ id: option.kind, label: option.label })) }]
    : [{ title: t("provider.cacheKey"), items: cacheOptions.map((value) => ({ id: String(value), label: t(value ? "common.true" : "common.false") })) }]

  function startField(field: Field) {
    setError(undefined)
    if (field === "review") {
      if (!inferredKind.kind && draft.endpointKind === undefined) return setError(t("provider.error.unknownType"))
      props.onComplete(draft)
      return
    }
    if (field === "edit-models") return props.onEditModels()
    if (field === "delete") return props.onDelete()
    if (field === "channel-type") {
      setChannelTypeIndex(Math.max(0, channelTypeOptions.findIndex((option) => option.kind === (draft.endpointKind ?? inferredKind.kind ?? channelTypeOptions[0]!.kind))))
      setMode("channel-type")
      setSelectSelected(0)
      return
    }
    if (field === "cache") {
      setMode("cache")
      setSelectSelected((draft.setCacheKey ?? cacheValue(props.provider)) ? 1 : 0)
      return
    }
    if (field === "name") setInputValue(editableTextInput(draft.name ?? currentName))
    if (field === "base-url") setInputValue(editableTextInput(draft.baseURL ?? currentBaseURL))
    if (field === "api-key") setInputValue(editableTextInput())
    setMode(field)
  }

  function savePrompt() {
    const value = inputValue.value.trim()
    if (mode === "name") setDraft((current) => ({ ...current, name: value }))
    if (mode === "base-url") setDraft((current) => ({ ...current, baseURL: value }))
    if (mode === "api-key") {
      if (!value) return setError(t("provider.error.apiKeyRequired"))
      setDraft((current) => ({ ...current, apiKeyValue: value }))
    }
    setInputValue(editableTextInput())
    setMode("menu")
  }

  function runMenuIndex(index = selected) {
    const item = openCodeMenuRows(menuGroups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind === "item") {
      menuSelection.rememberSelected(index)
      startField(item.item.id as Field)
    }
  }

  function menuIndexForField(field: "channel-type" | "cache") {
    const item = openCodeMenuRows(menuGroups, "").find((row) => row.kind === "item" && row.item.id === field)
    return item?.kind === "item" ? item.itemIndex : 0
  }

  function runSelectIndex(index = selected) {
    const item = openCodeMenuRows(selectGroups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind !== "item") return
    if (mode === "channel-type") setDraft((current) => ({ ...current, endpointKind: item.item.id as EndpointKind }))
    if (mode === "cache") setDraft((current) => ({ ...current, setCacheKey: item.item.id === "true" }))
    const returnIndex = mode === "channel-type" || mode === "cache" ? menuIndexForField(mode) : 0
    setMode("menu")
    menuSelection.setSelected(returnIndex)
  }

  useTuiInput((input, key) => {
    if (["name", "base-url", "api-key"].includes(mode)) {
      if (matchesKeybind("cancel", input, key, keybinds)) {
        setMode("menu")
        setInputValue(editableTextInput())
        setError(undefined)
        return
      }
      if (matchesKeybind("left", input, key, keybinds)) setInputValue((current) => moveEditableTextInput(current, "left"))
      else if (matchesKeybind("right", input, key, keybinds)) setInputValue((current) => moveEditableTextInput(current, "right"))
      else if (isBackwardDeleteInput(input, key)) setInputValue(deleteEditableTextInputBackward)
      else if (isForwardDeleteInput(input, key)) setInputValue(deleteEditableTextInputForward)
      else if (matchesKeybind("confirm", input, key, keybinds)) savePrompt()
      else setInputValue((current) => insertEditableTextInput(current, input))
      return
    }

    const groups = mode === "menu" ? menuGroups : selectGroups
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
      if (mode === "menu") runMenuIndex()
      else runSelectIndex()
    }
  })

  if (mode === "name" || mode === "base-url" || mode === "api-key") {
    return (
      <OpenCodePrompt
        title={t("provider.title.edit")}
        label={mode === "name" ? t("provider.displayName") : mode === "base-url" ? t("provider.baseURL") : t("provider.apiKey")}
        value={inputValue.value}
        cursor={inputValue.cursor}
        masked={mode === "api-key"}
        error={error}
        hint={mode === "api-key" ? t("provider.hint.storedAt", { path: defaultSecretFilePath(props.providerID) }) : undefined}
      />
    )
  }

  return (
    <OpenCodeMenu
      title={mode === "menu" ? t("provider.title.editId", { id: props.providerID }) : mode === "channel-type" ? t("provider.channelType") : t("provider.cacheKey")}
      query=""
      rows={openCodeMenuRows(mode === "menu" ? menuGroups : selectGroups, "")}
      selectedIndex={selected}
      footer={mode === "menu" ? [`${t("common.back")}\tesc`, `${t("common.open")}\tenter`] : [`${t("common.cancel")}\tesc`, `${t("common.select")}\tenter`]}
      emptyText={error}
    />
  )
}
