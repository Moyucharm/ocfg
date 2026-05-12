import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import type { ExistingProviderEditDraft } from "../provider-edit-existing.js"

type Step = "menu" | "name" | "npm" | "base-url" | "api-key-file" | "cache"
type Field = "name" | "npm" | "base-url" | "api-key" | "cache" | "edit-models" | "review"

const fields: Array<{ field: Field; label: string }> = [
  { field: "name", label: "Display name" },
  { field: "npm", label: "NPM package" },
  { field: "base-url", label: "Base URL" },
  { field: "api-key", label: "API key file" },
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
  const [cacheIndex, setCacheIndex] = useState(cacheValue(props.provider) ? 1 : 0)
  const [draft, setDraft] = useState<ExistingProviderEditDraft>({})
  const [inputValue, setInputValue] = useState("")
  const [error, setError] = useState<string>()

  const currentName = typeof props.provider.name === "string" ? props.provider.name : ""
  const currentNpm = typeof props.provider.npm === "string" ? props.provider.npm : ""
  const currentBaseURL = optionValue(props.provider, "baseURL") ?? ""
  const currentApiKey = optionValue(props.provider, "apiKey") ?? ""
  const cacheOptions = [false, true]

  function startField(field: Field) {
    setError(undefined)
    if (field === "review") {
      props.onComplete(draft)
      return
    }
    if (field === "edit-models") {
      props.onEditModels()
      return
    }
    if (field === "name") {
      setInputValue(draft.name ?? currentName)
      setStep("name")
    }
    if (field === "npm") {
      setInputValue(draft.npm ?? currentNpm)
      setStep("npm")
    }
    if (field === "base-url") {
      setInputValue(draft.baseURL ?? currentBaseURL)
      setStep("base-url")
    }
    if (field === "api-key") {
      const currentFileRef = /^\{file:(.*)\}$/.exec(currentApiKey)?.[1] ?? ""
      const draftFileRef = draft.apiKey?.type === "file" ? draft.apiKey.path : undefined
      setInputValue(draftFileRef ?? currentFileRef)
      setStep("api-key-file")
    }
    if (field === "cache") setStep("cache")
  }

  function saveTextField() {
    const value = inputValue.trim()
    if (step === "name") setDraft((current) => ({ ...current, name: value }))
    if (step === "npm") {
      if (!value) {
        setError("NPM package is required.")
        return
      }
      setDraft((current) => ({ ...current, npm: value }))
    }
    if (step === "base-url") setDraft((current) => ({ ...current, baseURL: value }))
    setInputValue("")
    setStep("menu")
  }

  function saveApiKeyFile() {
    const value = inputValue.trim()
    if (!value) {
      setError("API key file path is required.")
      return
    }
    setDraft((current) => ({ ...current, apiKey: { type: "file", path: value } }))
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
      if (step === "api-key-file") saveApiKeyFile()
      else saveTextField()
    } else setInputValue((current) => appendInput(current, input))
  })

  return (
    <Box flexDirection="column">
      <Text bold>Edit Provider</Text>
      <Text dimColor>Provider: {props.providerID}</Text>
      <Text dimColor>Ctrl+Q or Esc cancels. Enter selects or saves.</Text>
      {error ? <Text color="red">{error}</Text> : null}
      {step === "menu" ? (
        <Box flexDirection="column">
          <Text>Name: {(draft.name ?? currentName) || "(missing)"}</Text>
          <Text>NPM: {(draft.npm ?? currentNpm) || "(missing)"}</Text>
          <Text>Base URL: {(draft.baseURL ?? currentBaseURL) || "(missing)"}</Text>
          <Text>API key: {draft.apiKey ? "updated" : currentApiKey || "(missing)"}</Text>
          <Text>setCacheKey: {String(draft.setCacheKey ?? cacheValue(props.provider))}</Text>
          {fields.map((item, index) => <Text key={item.field} color={index === fieldIndex ? "green" : undefined}>{index === fieldIndex ? "›" : " "} {item.label}</Text>)}
        </Box>
      ) : null}
      {["name", "npm", "base-url"].includes(step) ? <Text>{step}: {inputValue || "_"}</Text> : null}
      {step === "api-key-file" ? <Text>API key file path: {inputValue || "_"}</Text> : null}
      {step === "cache" ? (
        <Box flexDirection="column">
          <Text>Set provider.options.setCacheKey?</Text>
          {cacheOptions.map((value, index) => <Text key={String(value)} color={index === cacheIndex ? "green" : undefined}>{index === cacheIndex ? "›" : " "} {String(value)}</Text>)}
        </Box>
      ) : null}
    </Box>
  )
}
