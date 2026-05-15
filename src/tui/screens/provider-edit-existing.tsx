import React, { useState } from "react"
import { channelTypeOptions, channelTypeLabel } from "../../core/channel-types.js"
import { defaultSecretFilePath } from "../../core/secret-file.js"
import type { EndpointKind } from "../../core/types.js"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { parseTuiMouseEvent } from "../mouse.js"
import type { ExistingProviderEditDraft } from "../provider-edit-existing.js"
import { tryInferEndpointKindFromProvider } from "../provider-metadata.js"
import { menuItemIndexFromMouse, OpenCodeMenu, openCodeMenuRows, OpenCodePrompt, type OpenCodeMenuGroup } from "../ui.js"

type Mode = "menu" | "name" | "base-url" | "api-key" | "channel-type" | "cache"
type Field = "channel-type" | "name" | "base-url" | "api-key" | "cache" | "edit-models" | "review"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function appendInput(value: string, input: string) {
  const printable = input.replace(/[\u0000-\u001F\u007F]/g, "")
  if (!printable || printable.startsWith("[<")) return value
  return `${value}${printable}`
}

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
  onBack: () => void
}) {
  const inferredKind = tryInferEndpointKindFromProvider(props.provider)
  const defaultKindIndex = Math.max(0, channelTypeOptions.findIndex((option) => option.kind === inferredKind.kind))
  const [mode, setMode] = useState<Mode>("menu")
  const [selected, setSelected] = useState(0)
  const [query, setQuery] = useState("")
  const [channelTypeIndex, setChannelTypeIndex] = useState(defaultKindIndex)
  const [cacheIndex, setCacheIndex] = useState(cacheValue(props.provider) ? 1 : 0)
  const [draft, setDraft] = useState<ExistingProviderEditDraft>({})
  const [inputValue, setInputValue] = useState("")
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()

  const currentName = typeof props.provider.name === "string" ? props.provider.name : ""
  const currentBaseURL = optionValue(props.provider, "baseURL") ?? ""
  const currentApiKey = optionValue(props.provider, "apiKey") ?? ""
  const cacheOptions = [false, true]
  const currentChannelType = draft.endpointKind ?? inferredKind.kind
  const selectedChannelType = channelTypeOptions[channelTypeIndex]!

  const menuGroups: OpenCodeMenuGroup[] = [{
    title: "Provider",
    items: [
      { id: "channel-type", label: "Channel type", shortcut: currentChannelType ? channelTypeLabel(currentChannelType) : "(unknown)" },
      { id: "name", label: "Display name", shortcut: (draft.name ?? currentName) || "(missing)" },
      { id: "base-url", label: "Base URL", shortcut: (draft.baseURL ?? currentBaseURL) || "(missing)" },
      { id: "api-key", label: "API key", shortcut: draft.apiKeyValue ? "updated" : currentApiKey || "(missing)" },
      { id: "cache", label: "setCacheKey", shortcut: String(draft.setCacheKey ?? cacheValue(props.provider)) },
      { id: "edit-models", label: "Edit models", shortcut: "enter" },
      { id: "review", label: "Review diff", shortcut: "enter" },
    ],
  }]

  const selectGroups: OpenCodeMenuGroup[] = mode === "channel-type"
    ? [{ title: "Channel type", items: channelTypeOptions.map((option) => ({ id: option.kind, label: option.label, description: option.description })) }]
    : [{ title: "setCacheKey", items: cacheOptions.map((value) => ({ id: String(value), label: String(value) })) }]

  function startField(field: Field) {
    setError(undefined)
    if (field === "review") {
      if (!inferredKind.kind && draft.endpointKind === undefined) return setError("Unknown provider type. Choose a channel type before saving.")
      props.onComplete(draft)
      return
    }
    if (field === "edit-models") return props.onEditModels()
    if (field === "channel-type") {
      setChannelTypeIndex(Math.max(0, channelTypeOptions.findIndex((option) => option.kind === (draft.endpointKind ?? inferredKind.kind ?? channelTypeOptions[0]!.kind))))
      setMode("channel-type")
      setSelected(0)
      setQuery("")
      return
    }
    if (field === "cache") {
      setCacheIndex((draft.setCacheKey ?? cacheValue(props.provider)) ? 1 : 0)
      setMode("cache")
      setSelected((draft.setCacheKey ?? cacheValue(props.provider)) ? 1 : 0)
      setQuery("")
      return
    }
    if (field === "name") setInputValue(draft.name ?? currentName)
    if (field === "base-url") setInputValue(draft.baseURL ?? currentBaseURL)
    if (field === "api-key") setInputValue("")
    setMode(field)
  }

  function savePrompt() {
    const value = inputValue.trim()
    if (mode === "name") setDraft((current) => ({ ...current, name: value }))
    if (mode === "base-url") setDraft((current) => ({ ...current, baseURL: value }))
    if (mode === "api-key") {
      if (!value) return setError("API key is required.")
      setDraft((current) => ({ ...current, apiKeyValue: value }))
    }
    setInputValue("")
    setMode("menu")
  }

  function runMenuIndex(index = selected) {
    const item = openCodeMenuRows(menuGroups, query).find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind === "item") startField(item.item.id as Field)
  }

  function runSelectIndex(index = selected) {
    const item = openCodeMenuRows(selectGroups, query).find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind !== "item") return
    if (mode === "channel-type") setDraft((current) => ({ ...current, endpointKind: item.item.id as EndpointKind }))
    if (mode === "cache") setDraft((current) => ({ ...current, setCacheKey: item.item.id === "true" }))
    setMode("menu")
    setSelected(0)
    setQuery("")
  }

  useTuiInput((input, key) => {
    if (["name", "base-url", "api-key"].includes(mode)) {
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

    const groups = mode === "menu" ? menuGroups : selectGroups
    const rows = openCodeMenuRows(groups, query)
    const count = rows.filter((row) => row.kind === "item").length
    const mouse = parseTuiMouseEvent(input)
    if (mouse) {
      if (mouse.kind === "wheel") setSelected((current) => mouse.button === "wheel-up" ? Math.max(0, current - 1) : Math.min(Math.max(0, count - 1), current + 1))
      const clicked = menuItemIndexFromMouse(mouse, rows, { showSearch: true })
      if (clicked !== undefined) {
        setSelected(clicked)
        if (mode === "menu") runMenuIndex(clicked)
        else runSelectIndex(clicked)
      }
      return
    }
    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
      if (mode === "menu") props.onBack()
      else {
        setMode("menu")
        setQuery("")
      }
      return
    }
    if (key.backspace || key.delete) {
      setQuery((current) => current.slice(0, -1))
      setSelected(0)
      return
    }
    if (matchesKeybind("up", input, key, keybinds)) setSelected((current) => (current === 0 ? Math.max(0, count - 1) : current - 1))
    if (matchesKeybind("down", input, key, keybinds)) setSelected((current) => (current === count - 1 ? 0 : current + 1))
    if (matchesKeybind("confirm", input, key, keybinds)) {
      if (mode === "menu") runMenuIndex()
      else runSelectIndex()
    }
    const printable = input.replace(/[\u0000-\u001F\u007F]/g, "")
    if (printable && !printable.startsWith("[<") && !matchesKeybind("confirm", input, key, keybinds)) {
      setQuery((current) => `${current}${printable}`)
      setSelected(0)
    }
  })

  if (mode === "name" || mode === "base-url" || mode === "api-key") {
    return (
      <OpenCodePrompt
        title="Edit provider"
        label={mode === "name" ? "Display name" : mode === "base-url" ? "Base URL" : "API key"}
        value={inputValue}
        masked={mode === "api-key"}
        error={error}
        hint={mode === "api-key" ? `Stored automatically at ${defaultSecretFilePath(props.providerID)}` : undefined}
      />
    )
  }

  return (
    <OpenCodeMenu
      title={mode === "menu" ? `Edit ${props.providerID}` : mode === "channel-type" ? "Channel type" : "setCacheKey"}
      query={query}
      rows={openCodeMenuRows(mode === "menu" ? menuGroups : selectGroups, query)}
      selectedIndex={selected}
      showSearch
      footer={mode === "menu" ? ["Back\tesc", "Open\tenter"] : ["Cancel\tesc", "Select\tenter"]}
      emptyText={error}
    />
  )
}
