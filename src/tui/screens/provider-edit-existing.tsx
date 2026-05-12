import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import type { SecretRef } from "../../core/types.js"
import type { ExistingProviderEditDraft } from "../provider-edit-existing.js"

type Step = "menu" | "name" | "npm" | "base-url" | "api-key-strategy" | "api-key-value" | "plaintext-confirm" | "cache"
type Field = "name" | "npm" | "base-url" | "api-key" | "cache" | "edit-models" | "review"
type SecretStrategy = "env" | "file" | "plaintext"

const fields: Array<{ field: Field; label: string }> = [
  { field: "name", label: "Display name" },
  { field: "npm", label: "NPM package" },
  { field: "base-url", label: "Base URL" },
  { field: "api-key", label: "API key reference" },
  { field: "cache", label: "setCacheKey" },
  { field: "edit-models", label: "Edit models" },
  { field: "review", label: "Review diff" },
]

const secretStrategies: Array<{ strategy: SecretStrategy; label: string }> = [
  { strategy: "env", label: "Environment variable" },
  { strategy: "file", label: "File reference" },
  { strategy: "plaintext", label: "Plaintext advanced" },
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
  const [strategyIndex, setStrategyIndex] = useState(0)
  const [cacheIndex, setCacheIndex] = useState(cacheValue(props.provider) ? 1 : 0)
  const [draft, setDraft] = useState<ExistingProviderEditDraft>({})
  const [inputValue, setInputValue] = useState("")
  const [pendingPlaintext, setPendingPlaintext] = useState("")
  const [selectedStrategy, setSelectedStrategy] = useState<SecretStrategy>("env")
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
    if (field === "api-key") setStep("api-key-strategy")
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

  function secretFromInput(strategy: SecretStrategy, value: string): SecretRef | undefined {
    if (strategy === "env") return value ? { type: "env", name: value } : undefined
    if (strategy === "file") return value ? { type: "file", path: value } : undefined
    return value ? { type: "plaintext", value, explicit: true } : undefined
  }

  function saveSecretValue() {
    const value = inputValue.trim()
    const ref = secretFromInput(selectedStrategy, value)
    if (!ref) {
      setError("API key reference value is required.")
      return
    }
    if (selectedStrategy === "plaintext") {
      setPendingPlaintext(value)
      setInputValue("")
      setStep("plaintext-confirm")
      return
    }
    setDraft((current) => ({ ...current, apiKey: ref }))
    setInputValue("")
    setStep("menu")
  }

  function confirmPlaintext() {
    if (inputValue !== "PLAINTEXT") {
      setError("Type PLAINTEXT to confirm plaintext API key output.")
      return
    }
    const ref = secretFromInput(selectedStrategy, pendingPlaintext)
    if (!ref || ref.type !== "plaintext") return
    setDraft((current) => ({ ...current, apiKey: ref }))
    setPendingPlaintext("")
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
    if (step === "api-key-strategy") {
      if (key.upArrow || key.leftArrow) setStrategyIndex((current) => (current === 0 ? secretStrategies.length - 1 : current - 1))
      if (key.downArrow || key.rightArrow) setStrategyIndex((current) => (current === secretStrategies.length - 1 ? 0 : current + 1))
      if (key.return) {
        const strategy = secretStrategies[strategyIndex]!.strategy
        setSelectedStrategy(strategy)
        setInputValue("")
        setStep("api-key-value")
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
      if (step === "api-key-value") saveSecretValue()
      else if (step === "plaintext-confirm") confirmPlaintext()
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
      {step === "api-key-strategy" ? (
        <Box flexDirection="column">
          <Text>Select API key strategy:</Text>
          {secretStrategies.map((item, index) => <Text key={item.strategy} color={index === strategyIndex ? "green" : undefined}>{index === strategyIndex ? "›" : " "} {item.label}</Text>)}
        </Box>
      ) : null}
      {step === "api-key-value" ? <Text>{selectedStrategy} value: {selectedStrategy === "plaintext" ? "*".repeat(inputValue.length) || "_" : inputValue || "_"}</Text> : null}
      {step === "plaintext-confirm" ? <Text color="yellow">Type PLAINTEXT to confirm plaintext output: {inputValue || "_"}</Text> : null}
      {step === "cache" ? (
        <Box flexDirection="column">
          <Text>Set provider.options.setCacheKey?</Text>
          {cacheOptions.map((value, index) => <Text key={String(value)} color={index === cacheIndex ? "green" : undefined}>{index === cacheIndex ? "›" : " "} {String(value)}</Text>)}
        </Box>
      ) : null}
    </Box>
  )
}
