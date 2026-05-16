import React, { useState } from "react"
import { channelTypeOptions } from "../../core/channel-types.js"
import type { SecretRef } from "../../core/types.js"
import { defaultSecretFilePath } from "../../core/secret-file.js"
import { getEndpointTemplate } from "../../templates/index.js"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { parseTuiMouseEvent } from "../mouse.js"
import type { ProviderFlowDraft } from "../types.js"
import { menuItemIndexFromMouse, OpenCodeMenu, openCodeMenuRows, OpenCodePrompt, type OpenCodeMenuGroup } from "../ui.js"

type Step = "endpoint" | "provider-id" | "name" | "base-url" | "api-key" | "cache"

function defaultCache(kind: ProviderFlowDraft["endpointKind"]) {
  return kind === "openai-compatible" || kind === "anthropic-compatible"
}

function appendInput(value: string, input: string) {
  const printable = input.replace(/[\u0000-\u001F\u007F]/g, "")
  if (!printable || printable.startsWith("[<")) return value
  return `${value}${printable}`
}

export function ProviderEditScreen(props: { onComplete: (draft: ProviderFlowDraft) => void; onBack: () => void }) {
  const [step, setStep] = useState<Step>("endpoint")
  const [selected, setSelected] = useState(0)
  const [query, setQuery] = useState("")
  const [endpointIndex, setEndpointIndex] = useState(0)
  const [providerID, setProviderID] = useState("")
  const [name, setName] = useState("")
  const [baseURL, setBaseURL] = useState("")
  const [apiKeyValue, setApiKeyValue] = useState("")
  const [inputValue, setInputValue] = useState("")
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()

  const endpointKind = channelTypeOptions[endpointIndex]!.kind
  const cacheOptions = [defaultCache(endpointKind), !defaultCache(endpointKind)]
  const endpointTemplate = getEndpointTemplate(endpointKind)

  const selectGroups: OpenCodeMenuGroup[] = step === "endpoint"
    ? [{ title: "Channel type", items: channelTypeOptions.map((option) => ({ id: option.kind, label: option.label })) }]
    : [{ title: "setCacheKey", items: cacheOptions.map((value) => ({ id: String(value), label: String(value) })) }]

  function finish(setCacheKey: boolean) {
    const apiKeyFilePath = defaultSecretFilePath(providerID.trim())
    const apiKey: SecretRef = { type: "file", path: apiKeyFilePath }
    props.onComplete({
      endpointKind,
      providerID: providerID.trim(),
      name: name.trim() || providerID.trim(),
      baseURL: baseURL.trim() || undefined,
      apiKey,
      apiKeyValue,
      apiKeyFilePath,
      setCacheKey,
    })
  }

  function openPrompt(nextStep: Step) {
    setStep(nextStep)
    if (nextStep === "provider-id") setInputValue(providerID)
    if (nextStep === "name") setInputValue(name)
    if (nextStep === "base-url") setInputValue(baseURL)
    if (nextStep === "api-key") setInputValue(apiKeyValue)
  }

  function savePrompt() {
    setError(undefined)
    if (step === "provider-id") {
      if (!inputValue.trim()) return setError("Provider ID is required.")
      setProviderID(inputValue.trim())
      openPrompt("name")
      return
    }
    if (step === "name") {
      setName(inputValue)
      openPrompt("base-url")
      return
    }
    if (step === "base-url") {
      setBaseURL(inputValue)
      openPrompt("api-key")
      return
    }
    if (step === "api-key") {
      if (!inputValue.trim()) return setError("API key is required.")
      setApiKeyValue(inputValue)
      setStep("cache")
      setSelected(0)
      setQuery("")
    }
  }

  function runSelect(index = selected) {
    const item = openCodeMenuRows(selectGroups, query).find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind !== "item") return
    if (step === "endpoint") {
      const nextIndex = Math.max(0, channelTypeOptions.findIndex((option) => option.kind === item.item.id))
      setEndpointIndex(nextIndex)
      openPrompt("provider-id")
      return
    }
    finish(item.item.id === "true")
  }

  useTuiInput((input, key) => {
    if (["provider-id", "name", "base-url", "api-key"].includes(step)) {
      if (matchesKeybind("cancel", input, key, keybinds)) {
        props.onBack()
        return
      }
      if (key.backspace || key.delete) setInputValue((current) => current.slice(0, -1))
      else if (matchesKeybind("confirm", input, key, keybinds)) savePrompt()
      else setInputValue((current) => appendInput(current, input))
      return
    }

    const rows = openCodeMenuRows(selectGroups, query)
    const count = rows.filter((row) => row.kind === "item").length
    const mouse = parseTuiMouseEvent(input)
    if (mouse) {
      if (mouse.kind === "wheel") setSelected((current) => mouse.button === "wheel-up" ? Math.max(0, current - 1) : Math.min(Math.max(0, count - 1), current + 1))
      const clicked = menuItemIndexFromMouse(mouse, rows, { showSearch: true, selectedIndex: selected, hasFooter: true })
      if (clicked !== undefined) {
        setSelected(clicked)
        runSelect(clicked)
      }
      return
    }
    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) props.onBack()
    if (key.backspace || key.delete) {
      setQuery((current) => current.slice(0, -1))
      setSelected(0)
      return
    }
    if (matchesKeybind("up", input, key, keybinds)) setSelected((current) => (current === 0 ? Math.max(0, count - 1) : current - 1))
    if (matchesKeybind("down", input, key, keybinds)) setSelected((current) => (current === count - 1 ? 0 : current + 1))
    if (matchesKeybind("confirm", input, key, keybinds)) runSelect()
    const printable = input.replace(/[\u0000-\u001F\u007F]/g, "")
    if (printable && !printable.startsWith("[<") && !matchesKeybind("confirm", input, key, keybinds)) {
      setQuery((current) => `${current}${printable}`)
      setSelected(0)
    }
  })

  if (["provider-id", "name", "base-url", "api-key"].includes(step)) {
    return (
      <OpenCodePrompt
        title="Connect provider"
        label={step === "provider-id" ? "Provider ID" : step === "name" ? "Display name" : step === "base-url" ? "Base URL" : "API key"}
        value={inputValue}
        masked={step === "api-key"}
        error={error}
        hint={step === "base-url" ? endpointTemplate.baseURLHint : step === "api-key" && providerID.trim() ? `Stored automatically at ${defaultSecretFilePath(providerID.trim())}` : undefined}
        footer={["Next\tenter", "Cancel\tesc"]}
      />
    )
  }

  return <OpenCodeMenu title={step === "endpoint" ? "Connect provider" : "setCacheKey"} query={query} rows={openCodeMenuRows(selectGroups, query)} selectedIndex={selected} showSearch footer={["Cancel\tesc", "Select\tenter"]} />
}
