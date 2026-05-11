import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import { createProviderDraftFromEndpoint, type GeneratedProviderDraft } from "../../core/provider-generator.js"
import type { ModelDraft } from "../../core/types.js"
import type { ProviderFlowDraft } from "../types.js"

type Step = "input" | "review" | "loading"

function summarizeModel(model: ModelDraft) {
  const limit = model.limit ? `${model.limit.context}/${model.limit.output}` : "missing limit"
  const input = model.modalities?.input.join(",") ?? "unknown input"
  const output = model.modalities?.output.join(",") ?? "unknown output"
  return `limit ${limit}, ${input} -> ${output}, reasoning=${String(model.reasoning ?? false)}, tools=${String(model.tool_call ?? false)}`
}

function parseModelIDs(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
}

export function ModelEditScreen(props: {
  draft: ProviderFlowDraft
  onReview: (generated: GeneratedProviderDraft) => Promise<void> | void
  onBack: () => void
}) {
  const [step, setStep] = useState<Step>("input")
  const [modelText, setModelText] = useState("")
  const [generated, setGenerated] = useState<GeneratedProviderDraft>()
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string>()

  async function resolveModels() {
    const modelIDs = parseModelIDs(modelText)
    if (modelIDs.length === 0) {
      setError("At least one model ID is required.")
      return
    }
    setError(undefined)
    setStep("loading")
    try {
      const result = await createProviderDraftFromEndpoint({
        endpointKind: props.draft.endpointKind,
        providerID: props.draft.providerID,
        name: props.draft.name,
        baseURL: props.draft.baseURL,
        apiKey: props.draft.apiKey,
        modelIDs,
        setCacheKey: props.draft.setCacheKey,
        modelsDev: { data: {} },
      })
      setGenerated(result)
      setConfirmed(false)
      setStep("review")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setStep("input")
    }
  }

  useInput((input, key) => {
    if (input === "q") props.onBack()
    if (step === "loading") return
    if (step === "input") {
      if (key.backspace || key.delete) setModelText((current) => current.slice(0, -1))
      else if (key.return) void resolveModels()
      else if (input.length === 1) setModelText((current) => `${current}${input}`)
    }
    if (step === "review") {
      if (input === "y") setConfirmed(true)
      if (input === "n") setConfirmed(false)
      if (key.return && generated) {
        if (!confirmed && Object.values(generated.modelConfirmations).some(Boolean)) {
          setError("Generated or family-matched capabilities require confirmation. Press y, then Enter.")
          return
        }
        void props.onReview(generated)
      }
    }
  })

  return (
    <Box flexDirection="column">
      <Text bold>Models</Text>
      <Text dimColor>Provider: {props.draft.providerID} ({props.draft.endpointKind})</Text>
      {error ? <Text color="red">{error}</Text> : null}
      {step === "input" ? (
        <Box flexDirection="column">
          <Text>Enter model IDs separated by commas:</Text>
          <Text>{modelText || "_"}</Text>
        </Box>
      ) : null}
      {step === "loading" ? <Text>Resolving model capabilities...</Text> : null}
      {step === "review" && generated ? (
        <Box flexDirection="column">
          <Text bold>Resolved Capabilities</Text>
          {Object.entries(generated.provider.models).map(([modelID, model]) => (
            <Box key={modelID} flexDirection="column" marginBottom={1}>
              <Text color={generated.modelConfirmations[modelID] ? "yellow" : "green"}>{modelID}</Text>
              <Text>{summarizeModel(model)}</Text>
              {generated.modelConfirmations[modelID] ? <Text color="yellow">Needs confirmation: family/generic metadata.</Text> : null}
            </Box>
          ))}
          <Text>Confirmed: {confirmed ? "yes" : "no"} (press y/n, Enter to review diff)</Text>
        </Box>
      ) : null}
      <Text dimColor>q or Esc returns Home.</Text>
    </Box>
  )
}
