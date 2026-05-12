import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import { detectModels, type DetectedModel } from "../../core/model-detector.js"
import { loadModelsDev } from "../../core/models-dev.js"
import { createProviderDraftFromEndpoint, type GeneratedProviderDraft } from "../../core/provider-generator.js"
import type { ModelDraft } from "../../core/types.js"
import { getEndpointTemplate } from "../../templates/index.js"
import { configuredModelIDs, selectableDetectedModels, splitExistingModelIDs } from "../model-add.js"
import { inferEndpointKindFromProvider, providerApiKeyRef, providerBaseURL, resolveProviderApiKey } from "../provider-metadata.js"

type Step = "choose" | "input" | "detecting" | "select" | "review" | "loading"

const reviewActions = ["View diff", "Back"] as const

function summarizeModel(model: ModelDraft) {
  const limit = model.limit ? `${model.limit.context}/${model.limit.output}` : "missing limit"
  const input = model.modalities?.input.join(",") ?? "unknown input"
  const output = model.modalities?.output.join(",") ?? "unknown output"
  return `limit ${limit}, ${input} -> ${output}, reasoning=${String(model.reasoning ?? false)}, tools=${String(model.tool_call ?? false)}`
}

function summarizeSources(generated: GeneratedProviderDraft, modelID: string) {
  const resolution = generated.modelResolutions[modelID]
  if (!resolution) return "Metadata: unknown"
  const modelsDev = resolution.sources.find((source) => source.type === "models.dev")
  if (modelsDev?.type === "models.dev") return `Metadata: models.dev ${modelsDev.providerID}/${modelsDev.modelID} (${modelsDev.confidence})`
  const family = resolution.sources.find((source) => source.type === "template" && source.template === "family")
  if (family?.type === "template") return `Metadata: built-in ${family.family ?? "family"} template fallback`
  return "Metadata: built-in generic template fallback"
}

function summarizeVariants(model: ModelDraft) {
  const variants = Object.keys(model.variants ?? {})
  return variants.length > 0 ? `Variants: ${variants.join(", ")}` : "Variants: not available"
}

function parseModelIDs(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
}

export function ModelAddScreen(props: {
  providerID: string
  provider: Record<string, unknown>
  onBack: () => void
  onReviewDiff: (generated: GeneratedProviderDraft) => Promise<void> | void
}) {
  const endpointKind = inferEndpointKindFromProvider(props.provider)
  const template = getEndpointTemplate(endpointKind)
  const baseURL = providerBaseURL(props.provider)
  const existingModelIDs = configuredModelIDs(props.provider)
  const [step, setStep] = useState<Step>(template.supportsModelProbe && baseURL ? "choose" : "input")
  const [modeIndex, setModeIndex] = useState(0)
  const [modelText, setModelText] = useState("")
  const [detectedModels, setDetectedModels] = useState<DetectedModel[]>([])
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [generated, setGenerated] = useState<GeneratedProviderDraft>()
  const [reviewActionIndex, setReviewActionIndex] = useState(0)
  const [error, setError] = useState<string>()
  const [metadataWarnings, setMetadataWarnings] = useState<string[]>([])
  const modes = ["Auto detect models", "Manual input"]

  async function resolveModels(modelIDs = parseModelIDs(modelText)) {
    const { newModelIDs, alreadyAdded } = splitExistingModelIDs(modelIDs, existingModelIDs)
    if (newModelIDs.length === 0) {
      if (alreadyAdded.length > 0) setError(`These models are already configured for this provider: ${alreadyAdded.join(", ")}`)
      else setError("At least one model ID is required.")
      return
    }
    if (modelIDs.length === 0) {
      setError("At least one model ID is required.")
      return
    }
    setError(undefined)
    setMetadataWarnings(alreadyAdded.length > 0 ? [`Skipped already configured models: ${alreadyAdded.join(", ")}`] : [])
    setStep("loading")
    try {
      let modelsDevData
      try {
        modelsDevData = await loadModelsDev()
      } catch (caught) {
        setMetadataWarnings([`models.dev metadata unavailable; falling back to built-in templates: ${caught instanceof Error ? caught.message : String(caught)}`])
        modelsDevData = {}
      }
      const currentName = typeof props.provider.name === "string" ? props.provider.name : props.providerID
      const result = await createProviderDraftFromEndpoint({
        endpointKind,
        providerID: props.providerID,
        name: currentName,
        baseURL,
        apiKey: providerApiKeyRef(props.provider),
        modelIDs: newModelIDs,
        modelsDev: { data: modelsDevData },
      })
      setGenerated(result)
      setReviewActionIndex(0)
      setStep("review")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setStep("input")
    }
  }

  async function probeModels() {
    if (!baseURL) {
      setError("Base URL is required for model detection. Use manual input instead.")
      setStep("input")
      return
    }
    setError(undefined)
    setStep("detecting")
    try {
      const apiKey = await resolveProviderApiKey(props.provider)
      if (!apiKey) {
        setError("API key is unavailable for model detection. Use manual input instead.")
        setStep("input")
        return
      }
      const result = await detectModels(endpointKind, baseURL, { apiKey })
      if (result.diagnostics.length > 0) setError(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"))
      if (result.models.length === 0) {
        setStep("input")
        return
      }
      const selectableModels = selectableDetectedModels(result.models, existingModelIDs)
      setDetectedModels(result.models)
      setSelectedModels(new Set(selectableModels))
      setSelectedIndex(0)
      setMetadataWarnings(selectableModels.length === result.models.length ? [] : ["Already configured models are shown for reference and cannot be selected."])
      setStep("select")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setStep("input")
    }
  }

  function toggleSelectedModel() {
    const model = detectedModels[selectedIndex]
    if (!model) return
    if (existingModelIDs.has(model.id)) {
      setError(`Model "${model.id}" is already configured for this provider.`)
      return
    }
    setSelectedModels((current) => {
      const next = new Set(current)
      if (next.has(model.id)) next.delete(model.id)
      else next.add(model.id)
      return next
    })
  }

  function toggleAllModels() {
    const selectableModels = selectableDetectedModels(detectedModels, existingModelIDs)
    setSelectedModels((current) => current.size === selectableModels.length ? new Set() : new Set(selectableModels))
  }

  useInput((input, key) => {
    if (input === "q" && key.ctrl) {
      props.onBack()
      return
    }
    if (step === "detecting" || step === "loading") return
    if (step === "choose") {
      if (key.upArrow || key.leftArrow) setModeIndex((current) => (current === 0 ? modes.length - 1 : current - 1))
      if (key.downArrow || key.rightArrow) setModeIndex((current) => (current === modes.length - 1 ? 0 : current + 1))
      if (key.return) {
        if (modeIndex === 0) void probeModels()
        else setStep("input")
      }
      return
    }
    if (step === "input") {
      if (key.backspace || key.delete) setModelText((current) => current.slice(0, -1))
      else if (key.return) void resolveModels()
      else {
        const printable = input.replace(/[\u0000-\u001F\u007F]/g, "")
        if (printable) setModelText((current) => `${current}${printable}`)
      }
      return
    }
    if (step === "select") {
      if (key.upArrow || key.leftArrow) setSelectedIndex((current) => (current === 0 ? detectedModels.length - 1 : current - 1))
      if (key.downArrow || key.rightArrow) setSelectedIndex((current) => (current === detectedModels.length - 1 ? 0 : current + 1))
      if (input === " ") toggleSelectedModel()
      if (input === "a") toggleAllModels()
      if (input === "m") setStep("input")
      if (input === "r") void probeModels()
      if (key.return) void resolveModels(detectedModels.map((model) => model.id).filter((id) => selectedModels.has(id)))
      return
    }
    if (step === "review") {
      if (key.upArrow || key.leftArrow) setReviewActionIndex((current) => (current === 0 ? reviewActions.length - 1 : current - 1))
      if (key.downArrow || key.rightArrow) setReviewActionIndex((current) => (current === reviewActions.length - 1 ? 0 : current + 1))
      if (input === "d" && generated) void props.onReviewDiff(generated)
      if (input === "b") setStep(detectedModels.length > 0 ? "select" : "input")
      if (key.return) {
        if (reviewActions[reviewActionIndex] === "View diff" && generated) void props.onReviewDiff(generated)
        else setStep(detectedModels.length > 0 ? "select" : "input")
      }
    }
  })

  return (
    <Box flexDirection="column">
      <Text bold>Add Models</Text>
      <Text dimColor>Provider: {props.providerID} ({template.label})</Text>
      {error ? <Text color="red">{error}</Text> : null}
      {metadataWarnings.map((warning) => <Text key={warning} color="yellow">{warning}</Text>)}
      {step === "choose" ? (
        <Box flexDirection="column">
          <Text>Choose how to add models:</Text>
          {modes.map((mode, index) => <Text key={mode} color={index === modeIndex ? "green" : undefined}>{index === modeIndex ? "›" : " "} {mode}</Text>)}
          <Text dimColor>Auto detection probes {baseURL}/models.</Text>
        </Box>
      ) : null}
      {step === "input" ? (
        <Box flexDirection="column">
          <Text>Enter model IDs separated by commas:</Text>
          <Text>{modelText || "_"}</Text>
        </Box>
      ) : null}
      {step === "detecting" ? <Text>Detecting models from {baseURL}/models...</Text> : null}
      {step === "select" ? (
        <Box flexDirection="column">
          <Text>Select detected models:</Text>
          {detectedModels.map((model, index) => (
            <Text key={model.id} color={existingModelIDs.has(model.id) ? "yellow" : index === selectedIndex ? "green" : undefined}>
              {index === selectedIndex ? "›" : " "} {existingModelIDs.has(model.id) ? "[-]" : selectedModels.has(model.id) ? "[x]" : "[ ]"} {model.id}{model.name ? ` - ${model.name}` : ""}{existingModelIDs.has(model.id) ? " (already added)" : ""}
            </Text>
          ))}
          <Text dimColor>Space toggles, a toggles all, m manual, r retries, Enter continues.</Text>
        </Box>
      ) : null}
      {step === "loading" ? <Text>Resolving model capabilities...</Text> : null}
      {step === "review" && generated ? (
        <Box flexDirection="column">
          <Text bold>Resolved Capabilities</Text>
          {generated.warnings.map((warning) => <Text key={warning} color="yellow">{warning}</Text>)}
          {Object.entries(generated.provider.models).map(([modelID, model]) => (
            <Box key={modelID} flexDirection="column" marginBottom={1}>
              <Text color={generated.modelConfirmations[modelID] ? "yellow" : "green"}>{modelID}</Text>
              {model.name ? <Text>Name: {model.name}</Text> : null}
              <Text>{summarizeModel(model)}</Text>
              <Text>{summarizeSources(generated, modelID)}</Text>
              <Text>{summarizeVariants(model)}</Text>
              {generated.modelConfirmations[modelID] ? <Text color="yellow">Needs confirmation: family/generic metadata.</Text> : null}
            </Box>
          ))}
          <Text>Choose next step:</Text>
          {reviewActions.map((action, index) => (
            <Text key={action} color={index === reviewActionIndex ? "green" : undefined}>
              {index === reviewActionIndex ? "›" : " "} {action}
            </Text>
          ))}
          <Text dimColor>Enter selects, d views diff, b goes back.</Text>
        </Box>
      ) : null}
      <Text dimColor>Ctrl+Q or Esc returns.</Text>
    </Box>
  )
}
