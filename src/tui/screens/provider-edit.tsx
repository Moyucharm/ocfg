import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import type { EndpointKind, SecretRef } from "../../core/types.js"
import { defaultSecretFilePath } from "../../core/secret-file.js"
import { getEndpointTemplate } from "../../templates/index.js"
import type { ProviderFlowDraft } from "../types.js"

type Step = "endpoint" | "provider-id" | "name" | "base-url" | "api-key" | "cache"

const endpointKinds: EndpointKind[] = ["openai-compatible", "openai-responses", "anthropic-compatible", "gemini-compatible"]

function defaultCache(kind: EndpointKind) {
  return kind === "openai-compatible" || kind === "anthropic-compatible"
}

function appendInput(value: string, input: string) {
  const printable = input.replace(/[\u0000-\u001F\u007F]/g, "")
  if (!printable) return value
  return `${value}${printable}`
}

export function ProviderEditScreen(props: { onComplete: (draft: ProviderFlowDraft) => void; onBack: () => void }) {
  const [step, setStep] = useState<Step>("endpoint")
  const [endpointIndex, setEndpointIndex] = useState(0)
  const [cacheIndex, setCacheIndex] = useState(0)
  const [providerID, setProviderID] = useState("")
  const [name, setName] = useState("")
  const [baseURL, setBaseURL] = useState("")
  const [apiKeyValue, setApiKeyValue] = useState("")
  const [error, setError] = useState<string>()

  const endpointKind = endpointKinds[endpointIndex]!
  const cacheOptions = [defaultCache(endpointKind), !defaultCache(endpointKind)]
  const setCacheKey = cacheOptions[cacheIndex]!
  const endpointTemplate = getEndpointTemplate(endpointKind)

  function currentInput() {
    if (step === "provider-id") return providerID
    if (step === "name") return name
    if (step === "base-url") return baseURL
    if (step === "api-key") return apiKeyValue
    return ""
  }

  function updateCurrentInput(value: string) {
    if (step === "provider-id") setProviderID(value)
    if (step === "name") setName(value)
    if (step === "base-url") setBaseURL(value)
    if (step === "api-key") setApiKeyValue(value)
  }

  function goNext() {
    setError(undefined)
    if (step === "endpoint") return setStep("provider-id")
    if (step === "provider-id") {
      if (!providerID.trim()) return setError("Provider ID is required.")
      return setStep("name")
    }
    if (step === "name") return setStep("base-url")
    if (step === "base-url") return setStep("api-key")
    if (step === "api-key") {
      if (!apiKeyValue.trim()) return setError("API key is required.")
      return setStep("cache")
    }
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

  useInput((input, key) => {
    if (input === "q" && key.ctrl) {
      props.onBack()
      return
    }
    if (key.upArrow || key.leftArrow) {
      if (step === "endpoint") setEndpointIndex((current) => (current === 0 ? endpointKinds.length - 1 : current - 1))
      if (step === "cache") setCacheIndex((current) => (current === 0 ? cacheOptions.length - 1 : current - 1))
    }
    if (key.downArrow || key.rightArrow) {
      if (step === "endpoint") setEndpointIndex((current) => (current === endpointKinds.length - 1 ? 0 : current + 1))
      if (step === "cache") setCacheIndex((current) => (current === cacheOptions.length - 1 ? 0 : current + 1))
    }
    if (key.backspace || key.delete) updateCurrentInput(currentInput().slice(0, -1))
      else if (key.return) goNext()
      else if (["provider-id", "name", "base-url", "api-key"].includes(step)) updateCurrentInput(appendInput(currentInput(), input))
  })

  return (
    <Box flexDirection="column">
      <Text bold>Add Provider</Text>
      <Text dimColor>Ctrl+Q or Esc cancels. Enter advances.</Text>
      {error ? <Text color="red">{error}</Text> : null}
      {step === "endpoint" ? (
        <Box flexDirection="column">
          <Text>Select endpoint kind:</Text>
          {endpointKinds.map((kind, index) => <Text key={kind} color={index === endpointIndex ? "green" : undefined}>{index === endpointIndex ? "›" : " "} {kind}</Text>)}
          <Text dimColor>{endpointTemplate.label}</Text>
          <Text dimColor>NPM: {endpointTemplate.recommendedNpm}</Text>
          {endpointTemplate.baseURLHint ? <Text dimColor>Base URL example: {endpointTemplate.baseURLHint}</Text> : null}
        </Box>
      ) : null}
      {step === "provider-id" ? <Text>Provider ID: {providerID || "_"}</Text> : null}
      {step === "name" ? <Text>Display name: {name || "_"} <Text dimColor>(empty uses provider ID)</Text></Text> : null}
      {step === "base-url" ? (
        <Box flexDirection="column">
          <Text>Base URL: {baseURL || "_"} <Text dimColor>(optional)</Text></Text>
          {endpointTemplate.baseURLHint ? <Text dimColor>Example: {endpointTemplate.baseURLHint}</Text> : null}
        </Box>
      ) : null}
      {step === "api-key" ? (
        <Box flexDirection="column">
          <Text>API key: {"*".repeat(apiKeyValue.length) || "_"}</Text>
          {providerID.trim() ? <Text dimColor>Will be stored at: {defaultSecretFilePath(providerID.trim())}</Text> : null}
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
