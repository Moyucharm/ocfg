import React, { useState } from "react"
import { Text } from "ink"
import { detectModels, type DetectedModel } from "../../core/model-detector.js"
import { loadModelsDev } from "../../core/models-dev.js"
import { createProviderDraftFromEndpoint, type GeneratedProviderDraft } from "../../core/provider-generator.js"
import type { ModelDraft } from "../../core/types.js"
import { getEndpointTemplate } from "../../templates/index.js"
import { configuredModelIDs, selectableDetectedModels, splitExistingModelIDs } from "../model-add.js"
import { useTuiInput } from "../input.js"
import { inferEndpointKindFromProvider, providerApiKeyRef, providerBaseURL, resolveProviderApiKey } from "../provider-metadata.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { parseTuiMouseEvent } from "../mouse.js"
import { menuItemIndexFromMouse, OpenCodeMenu, openCodeMenuRows, OpenCodePrompt, type OpenCodeMenuGroup } from "../ui.js"

type Step = "choose" | "input" | "detecting" | "select" | "review" | "loading"

const reviewActions = ["View diff", "Back"] as const

function summarizeModel(model: ModelDraft) {
  const limit = model.limit ? `${model.limit.context}/${model.limit.output}` : "missing limit"
  return `limit ${limit}, reasoning=${String(model.reasoning ?? false)}, tools=${String(model.tool_call ?? false)}`
}

function parseModelIDs(value: string) {
  return value.split(",").map((part) => part.trim()).filter(Boolean)
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
  const [selected, setSelected] = useState(0)
  const [modelText, setModelText] = useState("")
  const [detectedModels, setDetectedModels] = useState<DetectedModel[]>([])
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  const [generated, setGenerated] = useState<GeneratedProviderDraft>()
  const [error, setError] = useState<string>()
  const [metadataWarnings, setMetadataWarnings] = useState<string[]>([])
  const keybinds = useTuiKeybinds()

  async function resolveModels(modelIDs = parseModelIDs(modelText)) {
    const { newModelIDs, alreadyAdded } = splitExistingModelIDs(modelIDs, existingModelIDs)
    if (newModelIDs.length === 0) {
      setError(alreadyAdded.length > 0 ? `Already configured: ${alreadyAdded.join(", ")}` : "At least one model ID is required.")
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
        setMetadataWarnings([`models.dev unavailable; using built-in templates: ${caught instanceof Error ? caught.message : String(caught)}`])
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
      setSelected(Object.keys(result.provider.models).length)
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
      if (result.models.length === 0) return setStep("input")
      const selectableModels = selectableDetectedModels(result.models, existingModelIDs)
      setDetectedModels(result.models)
      setSelectedModels(new Set(selectableModels))
      setSelected(0)
      setMetadataWarnings(selectableModels.length === result.models.length ? [] : ["Already configured models are shown for reference."])
      setStep("select")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setStep("input")
    }
  }

  function toggleSelectedModel(index = selected) {
    const model = detectedModels[index]
    if (!model || existingModelIDs.has(model.id)) return
    setSelectedModels((current) => {
      const next = new Set(current)
      if (next.has(model.id)) next.delete(model.id)
      else next.add(model.id)
      return next
    })
  }

  function menuGroups(): OpenCodeMenuGroup[] {
    if (step === "choose") {
      return [{ title: "Options", items: [{ id: "auto", label: "Auto detect models" }, { id: "manual", label: "Manual input" }] }]
    }
    if (step === "select") {
      return [{ title: "Recent", items: detectedModels.map((model) => ({ id: model.id, label: model.id, description: model.name, marker: selectedModels.has(model.id) ? "*" : " ", disabled: existingModelIDs.has(model.id) })) }]
    }
    const modelItems = generated ? Object.entries(generated.provider.models).map(([modelID, model]) => ({ id: `model:${modelID}`, label: modelID, description: summarizeModel(model), disabled: true })) : []
    return [{ title: "Resolved", items: modelItems }, { title: "Actions", items: reviewActions.map((action) => ({ id: action, label: action })) }]
  }

  function runSelected(index = selected) {
    if (step === "choose") {
      if (index === 0) void probeModels()
      else setStep("input")
      return
    }
    if (step === "select") {
      toggleSelectedModel(index)
      return
    }
    if (step === "review" && generated) {
      const modelCount = Object.keys(generated.provider.models).length
      const action = reviewActions[index - modelCount]
      if (action === "View diff") void props.onReviewDiff(generated)
      if (action === "Back") setStep(detectedModels.length > 0 ? "select" : "input")
    }
  }

  useTuiInput((input, key) => {
    if (matchesKeybind("cancel", input, key, keybinds)) return props.onBack()
    if (step === "detecting" || step === "loading") return
    if (step === "input") {
      if (key.backspace || key.delete) setModelText((current) => current.slice(0, -1))
      else if (matchesKeybind("confirm", input, key, keybinds)) void resolveModels()
      else {
        const printable = input.replace(/[\u0000-\u001F\u007F]/g, "")
        if (printable && !printable.startsWith("[<")) setModelText((current) => `${current}${printable}`)
      }
      return
    }

    const rows = openCodeMenuRows(menuGroups(), "")
    const count = rows.filter((row) => row.kind === "item").length
    const mouse = parseTuiMouseEvent(input)
    if (mouse) {
      if (mouse.kind === "wheel") setSelected((current) => mouse.button === "wheel-up" ? Math.max(0, current - 1) : Math.min(Math.max(0, count - 1), current + 1))
      const clicked = menuItemIndexFromMouse(mouse, rows)
      if (clicked !== undefined) {
        setSelected(clicked)
        runSelected(clicked)
      }
      return
    }
    if (matchesKeybind("back", input, key, keybinds)) {
      if (step === "review") setStep(detectedModels.length > 0 ? "select" : "input")
      else props.onBack()
      return
    }
    if (matchesKeybind("up", input, key, keybinds) || matchesKeybind("left", input, key, keybinds)) setSelected((current) => (current === 0 ? Math.max(0, count - 1) : current - 1))
    if (matchesKeybind("down", input, key, keybinds) || matchesKeybind("right", input, key, keybinds)) setSelected((current) => (current === count - 1 ? 0 : current + 1))
    if (matchesKeybind("toggle", input, key, keybinds) && step === "select") toggleSelectedModel()
    if (matchesKeybind("toggleAll", input, key, keybinds) && step === "select") setSelectedModels((current) => current.size === selectableDetectedModels(detectedModels, existingModelIDs).length ? new Set() : new Set(selectableDetectedModels(detectedModels, existingModelIDs)))
    if (matchesKeybind("manual", input, key, keybinds) && step === "select") setStep("input")
    if (matchesKeybind("retry", input, key, keybinds) && step === "select") void probeModels()
    if (matchesKeybind("confirm", input, key, keybinds)) {
      if (step === "select") void resolveModels(detectedModels.map((model) => model.id).filter((id) => selectedModels.has(id)))
      else runSelected()
    }
    if (matchesKeybind("diff", input, key, keybinds) && step === "review" && generated) void props.onReviewDiff(generated)
  })

  if (step === "input") return <OpenCodePrompt title="Add models" label="Model IDs" value={modelText} error={error} hint="Separate multiple model IDs with commas." footer={["Continue\tenter", "Cancel\tesc"]} />
  if (step === "detecting") return <Text>Detecting models from {baseURL}/models...</Text>
  if (step === "loading") return <Text>Resolving model capabilities...</Text>

  return (
    <OpenCodeMenu
      title={step === "choose" ? "Add models" : step === "select" ? "Select models" : "Resolved models"}
      query=""
      rows={openCodeMenuRows(menuGroups(), "")}
      selectedIndex={selected}
      footer={step === "select" ? ["Toggle\tspace", "All\ta", "Manual\tm", "Retry\tr", "Continue\tenter"] : step === "review" ? ["Diff\td", "Back\tb"] : ["Select\tenter", "Cancel\tesc"]}
      emptyText={metadataWarnings[0] ?? error}
    />
  )
}
