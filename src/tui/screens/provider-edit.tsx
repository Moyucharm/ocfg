import React, { useState } from "react"
import { channelTypeOptions } from "../../core/channel-types.js"
import type { SecretRef } from "../../core/types.js"
import { defaultSecretFilePath } from "../../core/secret-file.js"
import { getEndpointTemplate } from "../../templates/index.js"
import { useTuiText } from "../i18n.js"
import { deleteEditableTextInputBackward, deleteEditableTextInputForward, editableTextInput, insertEditableTextInput, isBackwardDeleteInput, isForwardDeleteInput, moveEditableTextInput, printableInput, useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import type { ProviderFlowDraft } from "../types.js"
import { OpenCodeMenu, openCodeMenuRows, OpenCodePrompt, type OpenCodeMenuGroup } from "../ui.js"

type Step = "endpoint" | "provider-id" | "name" | "base-url" | "api-key" | "cache"

function defaultCache(kind: ProviderFlowDraft["endpointKind"]) {
  return kind === "openai-compatible" || kind === "anthropic-compatible"
}

export function ProviderEditScreen(props: { onComplete: (draft: ProviderFlowDraft) => void; onBack: () => void }) {
  const t = useTuiText()
  const [step, setStep] = useState<Step>("endpoint")
  const [selected, setSelected] = useState(0)
  const [query, setQuery] = useState(() => editableTextInput())
  const [endpointIndex, setEndpointIndex] = useState(0)
  const [providerID, setProviderID] = useState("")
  const [name, setName] = useState("")
  const [baseURL, setBaseURL] = useState("")
  const [apiKeyValue, setApiKeyValue] = useState("")
  const [inputValue, setInputValue] = useState(() => editableTextInput())
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()

  const endpointKind = channelTypeOptions[endpointIndex]!.kind
  const cacheOptions = [defaultCache(endpointKind), !defaultCache(endpointKind)]
  const endpointTemplate = getEndpointTemplate(endpointKind)

  const selectGroups: OpenCodeMenuGroup[] = step === "endpoint"
    ? [{ title: t("provider.channelType"), items: channelTypeOptions.map((option) => ({ id: option.kind, label: option.label })) }]
    : [{ title: t("provider.cacheKey"), items: cacheOptions.map((value) => ({ id: String(value), label: t(value ? "common.true" : "common.false") })) }]

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
    if (nextStep === "provider-id") setInputValue(editableTextInput(providerID))
    if (nextStep === "name") setInputValue(editableTextInput(name))
    if (nextStep === "base-url") setInputValue(editableTextInput(baseURL))
    if (nextStep === "api-key") setInputValue(editableTextInput(apiKeyValue))
  }

  function savePrompt() {
    setError(undefined)
    if (step === "provider-id") {
      if (!inputValue.value.trim()) return setError(t("provider.error.providerIdRequired"))
      setProviderID(inputValue.value.trim())
      openPrompt("name")
      return
    }
    if (step === "name") {
      setName(inputValue.value)
      openPrompt("base-url")
      return
    }
    if (step === "base-url") {
      setBaseURL(inputValue.value)
      openPrompt("api-key")
      return
    }
    if (step === "api-key") {
      if (!inputValue.value.trim()) return setError(t("provider.error.apiKeyRequired"))
      setApiKeyValue(inputValue.value)
      setStep("cache")
      setSelected(0)
      setQuery(editableTextInput())
    }
  }

  function runSelect(index = selected) {
    const item = openCodeMenuRows(selectGroups, query.value).find((row) => row.kind === "item" && row.itemIndex === index)
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
      if (matchesKeybind("left", input, key, keybinds)) setInputValue((current) => moveEditableTextInput(current, "left"))
      else if (matchesKeybind("right", input, key, keybinds)) setInputValue((current) => moveEditableTextInput(current, "right"))
      else if (isBackwardDeleteInput(input, key)) setInputValue(deleteEditableTextInputBackward)
      else if (isForwardDeleteInput(input, key)) setInputValue(deleteEditableTextInputForward)
      else if (matchesKeybind("confirm", input, key, keybinds)) savePrompt()
      else setInputValue((current) => insertEditableTextInput(current, input))
      return
    }

    const rows = openCodeMenuRows(selectGroups, query.value)
    const count = rows.filter((row) => row.kind === "item").length
    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
      props.onBack()
      return
    }
    if (matchesKeybind("left", input, key, keybinds)) {
      setQuery((current) => moveEditableTextInput(current, "left"))
      return
    }
    if (matchesKeybind("right", input, key, keybinds)) {
      setQuery((current) => moveEditableTextInput(current, "right"))
      return
    }
    if (isBackwardDeleteInput(input, key)) {
      setQuery(deleteEditableTextInputBackward)
      setSelected(0)
      return
    }
    if (isForwardDeleteInput(input, key)) {
      setQuery(deleteEditableTextInputForward)
      setSelected(0)
      return
    }
    if (matchesKeybind("up", input, key, keybinds)) {
      setSelected((current) => (current === 0 ? Math.max(0, count - 1) : current - 1))
      return
    }
    if (matchesKeybind("down", input, key, keybinds)) {
      setSelected((current) => (current === count - 1 ? 0 : current + 1))
      return
    }
    if (matchesKeybind("confirm", input, key, keybinds)) {
      runSelect()
      return
    }
    if (printableInput(input)) {
      setQuery((current) => insertEditableTextInput(current, input))
      setSelected(0)
    }
  })

  if (["provider-id", "name", "base-url", "api-key"].includes(step)) {
    return (
      <OpenCodePrompt
        title={t("provider.title.connect")}
        label={step === "provider-id" ? t("provider.providerId") : step === "name" ? t("provider.displayName") : step === "base-url" ? t("provider.baseURL") : t("provider.apiKey")}
        value={inputValue.value}
        cursor={inputValue.cursor}
        masked={step === "api-key"}
        error={error}
        hint={step === "base-url" ? endpointTemplate.baseURLHint : step === "api-key" && providerID.trim() ? t("provider.hint.storedAt", { path: defaultSecretFilePath(providerID.trim()) }) : undefined}
        footer={[`${t("common.continue")}\tenter`, `${t("common.cancel")}\tesc`]}
      />
    )
  }

  return <OpenCodeMenu title={step === "endpoint" ? t("provider.title.connect") : t("provider.cacheKey")} query={query.value} queryCursor={query.cursor} rows={openCodeMenuRows(selectGroups, query.value)} selectedIndex={selected} showSearch footer={[`${t("common.cancel")}\tesc`, `${t("common.select")}\tenter`]} />
}
