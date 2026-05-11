import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import type { EndpointKind, SecretRef } from "../../core/types.js"
import type { ProviderFlowDraft } from "../types.js"

type SecretKind = "env" | "file" | "plaintext"
type Step = "endpoint" | "provider-id" | "name" | "base-url" | "secret-kind" | "secret-value" | "plaintext-confirm" | "cache"

const endpointKinds: EndpointKind[] = ["openai-compatible", "openai-responses", "anthropic-compatible", "gemini-compatible"]
const secretKinds: SecretKind[] = ["env", "file", "plaintext"]

function defaultCache(kind: EndpointKind) {
  return kind === "openai-compatible" || kind === "anthropic-compatible"
}

function appendInput(value: string, input: string) {
  if (input.length !== 1) return value
  return `${value}${input}`
}

export function ProviderEditScreen(props: { onComplete: (draft: ProviderFlowDraft) => void; onBack: () => void }) {
  const [step, setStep] = useState<Step>("endpoint")
  const [endpointIndex, setEndpointIndex] = useState(0)
  const [secretIndex, setSecretIndex] = useState(0)
  const [cacheIndex, setCacheIndex] = useState(0)
  const [providerID, setProviderID] = useState("")
  const [name, setName] = useState("")
  const [baseURL, setBaseURL] = useState("")
  const [secretValue, setSecretValue] = useState("")
  const [plaintextConfirmed, setPlaintextConfirmed] = useState(false)
  const [error, setError] = useState<string>()

  const endpointKind = endpointKinds[endpointIndex]!
  const secretKind = secretKinds[secretIndex]!
  const cacheOptions = [defaultCache(endpointKind), !defaultCache(endpointKind)]
  const setCacheKey = cacheOptions[cacheIndex]!

  function currentInput() {
    if (step === "provider-id") return providerID
    if (step === "name") return name
    if (step === "base-url") return baseURL
    if (step === "secret-value") return secretValue
    return ""
  }

  function updateCurrentInput(value: string) {
    if (step === "provider-id") setProviderID(value)
    if (step === "name") setName(value)
    if (step === "base-url") setBaseURL(value)
    if (step === "secret-value") setSecretValue(value)
  }

  function goNext() {
    setError(undefined)
    if (step === "endpoint") return setStep("provider-id")
    if (step === "provider-id") {
      if (!providerID.trim()) return setError("Provider ID is required.")
      return setStep("name")
    }
    if (step === "name") return setStep("base-url")
    if (step === "base-url") return setStep("secret-kind")
    if (step === "secret-kind") return setStep("secret-value")
    if (step === "secret-value") {
      if (!secretValue.trim()) return setError("Secret value is required.")
      return secretKind === "plaintext" ? setStep("plaintext-confirm") : setStep("cache")
    }
    if (step === "plaintext-confirm") {
      if (!plaintextConfirmed) return setError("Plaintext secrets require explicit confirmation.")
      return setStep("cache")
    }
    const apiKey: SecretRef =
      secretKind === "env"
        ? { type: "env", name: secretValue.trim() }
        : secretKind === "file"
          ? { type: "file", path: secretValue.trim() }
          : { type: "plaintext", value: secretValue, explicit: true }
    props.onComplete({
      endpointKind,
      providerID: providerID.trim(),
      name: name.trim() || providerID.trim(),
      baseURL: baseURL.trim() || undefined,
      apiKey,
      setCacheKey,
    })
  }

  useInput((input, key) => {
    if (input === "q") props.onBack()
    if (key.upArrow || key.leftArrow) {
      if (step === "endpoint") setEndpointIndex((current) => (current === 0 ? endpointKinds.length - 1 : current - 1))
      if (step === "secret-kind") setSecretIndex((current) => (current === 0 ? secretKinds.length - 1 : current - 1))
      if (step === "cache") setCacheIndex((current) => (current === 0 ? cacheOptions.length - 1 : current - 1))
    }
    if (key.downArrow || key.rightArrow) {
      if (step === "endpoint") setEndpointIndex((current) => (current === endpointKinds.length - 1 ? 0 : current + 1))
      if (step === "secret-kind") setSecretIndex((current) => (current === secretKinds.length - 1 ? 0 : current + 1))
      if (step === "cache") setCacheIndex((current) => (current === cacheOptions.length - 1 ? 0 : current + 1))
    }
    if (input === "y" && step === "plaintext-confirm") setPlaintextConfirmed(true)
    if (input === "n" && step === "plaintext-confirm") setPlaintextConfirmed(false)
    if (key.backspace || key.delete) updateCurrentInput(currentInput().slice(0, -1))
    else if (key.return) goNext()
    else if (["provider-id", "name", "base-url", "secret-value"].includes(step)) updateCurrentInput(appendInput(currentInput(), input))
  })

  return (
    <Box flexDirection="column">
      <Text bold>Add Provider</Text>
      <Text dimColor>q or Esc cancels. Enter advances.</Text>
      {error ? <Text color="red">{error}</Text> : null}
      {step === "endpoint" ? (
        <Box flexDirection="column">
          <Text>Select endpoint kind:</Text>
          {endpointKinds.map((kind, index) => <Text key={kind} color={index === endpointIndex ? "green" : undefined}>{index === endpointIndex ? "›" : " "} {kind}</Text>)}
        </Box>
      ) : null}
      {step === "provider-id" ? <Text>Provider ID: {providerID || "_"}</Text> : null}
      {step === "name" ? <Text>Display name: {name || "_"} <Text dimColor>(empty uses provider ID)</Text></Text> : null}
      {step === "base-url" ? <Text>Base URL: {baseURL || "_"} <Text dimColor>(optional)</Text></Text> : null}
      {step === "secret-kind" ? (
        <Box flexDirection="column">
          <Text>Select secret strategy:</Text>
          {secretKinds.map((kind, index) => <Text key={kind} color={index === secretIndex ? "green" : undefined}>{index === secretIndex ? "›" : " "} {kind}</Text>)}
        </Box>
      ) : null}
      {step === "secret-value" ? <Text>{secretKind} value: {secretKind === "plaintext" ? "*".repeat(secretValue.length) || "_" : secretValue || "_"}</Text> : null}
      {step === "plaintext-confirm" ? (
        <Box flexDirection="column">
          <Text color="yellow">Plaintext API keys are unsafe. Prefer env or file references.</Text>
          <Text>Confirmed: {plaintextConfirmed ? "yes" : "no"} (press y/n, Enter to continue)</Text>
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
