import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import { channelTypeOptions, channelTypeLabel } from "../../core/channel-types.js"
import { defaultSecretFilePath } from "../../core/secret-file.js"
import type { EndpointKind } from "../../core/types.js"
import type { ExistingProviderEditDraft } from "../provider-edit-existing.js"
import { tryInferEndpointKindFromProvider } from "../provider-metadata.js"

type Step = "menu" | "channel-type" | "name" | "base-url" | "api-key" | "cache"
type Field = "channel-type" | "name" | "base-url" | "api-key" | "cache" | "edit-models" | "review"

const fields: Array<{ field: Field; label: string }> = [
  { field: "channel-type", label: "Channel type" },
  { field: "name", label: "Display name" },
  { field: "base-url", label: "Base URL" },
  { field: "api-key", label: "Replace API key" },
  { field: "cache", label: "setCacheKey" },
  { field: "edit-models", label: "Edit models" },
  { field: "review", label: "Review diff" },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function appendInput(value: string, input: string) {
  const printable = input.replace(/[\u0000-\u001F\u007F]/g, "")
  if (!printable) return value
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
  const [step, setStep] = useState<Step>("menu")
  const [fieldIndex, setFieldIndex] = useState(0)
  const inferredKind = tryInferEndpointKindFromProvider(props.provider)
  const defaultKindIndex = Math.max(0, channelTypeOptions.findIndex((option) => option.kind === inferredKind.kind))
  const [channelTypeIndex, setChannelTypeIndex] = useState(defaultKindIndex)
  const [cacheIndex, setCacheIndex] = useState(cacheValue(props.provider) ? 1 : 0)
  const [draft, setDraft] = useState<ExistingProviderEditDraft>({})
  const [inputValue, setInputValue] = useState("")
  const [error, setError] = useState<string>()

  const currentName = typeof props.provider.name === "string" ? props.provider.name : ""
  const currentBaseURL = optionValue(props.provider, "baseURL") ?? ""
  const currentApiKey = optionValue(props.provider, "apiKey") ?? ""
  const cacheOptions = [false, true]
  const selectedChannelType = channelTypeOptions[channelTypeIndex]!
  const currentChannelType = draft.endpointKind ?? inferredKind.kind

  function startField(field: Field) {
    setError(undefined)
    if (field === "review") {
      if (!inferredKind.kind && draft.endpointKind === undefined) {
        setError("Unknown provider type. Please choose a channel type before saving.")
        return
      }
      props.onComplete(draft)
      return
    }
    if (field === "edit-models") {
      props.onEditModels()
      return
    }
    if (field === "channel-type") {
      setChannelTypeIndex(Math.max(0, channelTypeOptions.findIndex((option) => option.kind === (draft.endpointKind ?? inferredKind.kind ?? channelTypeOptions[0]!.kind))))
      setStep("channel-type")
    }
    if (field === "name") {
      setInputValue(draft.name ?? currentName)
      setStep("name")
    }
    if (field === "base-url") {
      setInputValue(draft.baseURL ?? currentBaseURL)
      setStep("base-url")
    }
    if (field === "api-key") {
      setInputValue("")
      setStep("api-key")
    }
    if (field === "cache") setStep("cache")
  }

  function saveTextField() {
    const value = inputValue.trim()
    if (step === "name") setDraft((current) => ({ ...current, name: value }))
    if (step === "base-url") setDraft((current) => ({ ...current, baseURL: value }))
    if (step === "api-key") {
      if (!value) {
        setError("API key is required.")
        return
      }
      setDraft((current) => ({ ...current, apiKeyValue: value }))
    }
    setInputValue("")
    setStep("menu")
  }

  useInput((input, key) => {
    if (input === "q" && key.ctrl) {
      props.onBack()
      return
    }
    if (step === "menu") {
      if (key.upArrow) setFieldIndex((current) => (current === 0 ? fields.length - 1 : current - 1))
      if (key.downArrow) setFieldIndex((current) => (current === fields.length - 1 ? 0 : current + 1))
      if (key.return) startField(fields[fieldIndex]!.field)
      return
    }
    if (step === "channel-type") {
      if (key.upArrow || key.leftArrow) setChannelTypeIndex((current) => (current === 0 ? channelTypeOptions.length - 1 : current - 1))
      if (key.downArrow || key.rightArrow) setChannelTypeIndex((current) => (current === channelTypeOptions.length - 1 ? 0 : current + 1))
      if (key.return) {
        setDraft((current) => ({ ...current, endpointKind: selectedChannelType.kind as EndpointKind }))
        setStep("menu")
      }
      return
    }
    if (step === "cache") {
      if (key.upArrow || key.leftArrow || key.downArrow || key.rightArrow) setCacheIndex((current) => (current === 0 ? 1 : 0))
      if (key.return) {
        setDraft((current) => ({ ...current, setCacheKey: cacheOptions[cacheIndex]! }))
        setStep("menu")
      }
      return
    }
    if (key.backspace || key.delete) setInputValue((current) => current.slice(0, -1))
    else if (key.return) {
      setError(undefined)
      saveTextField()
    } else setInputValue((current) => appendInput(current, input))
  })

  return (
    <Box flexDirection="column">
      <Text bold>Edit Provider</Text>
      <Text dimColor>Provider: {props.providerID}</Text>
      <Text dimColor>Ctrl+Q or Esc cancels. Enter selects or saves.</Text>
      {!inferredKind.kind ? <Text color="yellow">Unknown provider type. Please choose a channel type before saving.</Text> : null}
      {error ? <Text color="red">{error}</Text> : null}
      {step === "menu" ? (
        <Box flexDirection="column">
          <Text>Channel type: {currentChannelType ? channelTypeLabel(currentChannelType) : "(unknown)"}</Text>
          <Text>Name: {(draft.name ?? currentName) || "(missing)"}</Text>
          <Text>Base URL: {(draft.baseURL ?? currentBaseURL) || "(missing)"}</Text>
          <Text>API key: {draft.apiKeyValue ? "updated" : currentApiKey || "(missing)"}</Text>
          <Text>setCacheKey: {String(draft.setCacheKey ?? cacheValue(props.provider))}</Text>
          {fields.map((item, index) => <Text key={item.field} color={index === fieldIndex ? "green" : undefined}>{index === fieldIndex ? "›" : " "} {item.label}</Text>)}
        </Box>
      ) : null}
      {["name", "base-url"].includes(step) ? <Text>{step}: {inputValue || "_"}</Text> : null}
      {step === "api-key" ? (
        <Box flexDirection="column">
          <Text>API key: {"*".repeat(inputValue.length) || "_"}</Text>
          <Text dimColor>Stored automatically at: {defaultSecretFilePath(props.providerID)}</Text>
        </Box>
      ) : null}
      {step === "channel-type" ? (
        <Box flexDirection="column">
          <Text>Select channel type:</Text>
          {channelTypeOptions.map((option, index) => <Text key={option.kind} color={index === channelTypeIndex ? "green" : undefined}>{index === channelTypeIndex ? "›" : " "} {option.label}</Text>)}
          <Text dimColor>{selectedChannelType.description}</Text>
        </Box>
      ) : null}
      {step === "cache" ? (
        <Box flexDirection="column">
          <Text>Set provider.options.setCacheKey?</Text>
          {cacheOptions.map((value, index) => <Text key={String(value)} color={index === cacheIndex ? "green" : undefined}>{index === cacheIndex ? "›" : " "} {String(value)}</Text>)}
        </Box>
      ) : null}
    </Box>
  )
}
