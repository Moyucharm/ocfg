import React, { useState } from "react"
import { Text } from "ink"
import { detectModels, type DetectedModel } from "../../core/model-detector.js"
import { loadModelsDev } from "../../core/models-dev.js"
import { createProviderDraftFromEndpoint, type GeneratedProviderDraft } from "../../core/provider-generator.js"
import type { ModelDraft } from "../../core/types.js"
import { getEndpointTemplate } from "../../templates/index.js"
import { useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { parseTuiMouseEvent } from "../mouse.js"
import type { ProviderFlowDraft } from "../types.js"
import { menuItemIndexFromMouse, OpenCodeMenu, openCodeMenuRows, OpenCodePrompt, type OpenCodeMenuGroup } from "../ui.js"

type Step = "choose" | "input" | "detecting" | "select" | "review" | "loading"
const reviewActions = ["Save", "View diff", "Back"] as const

function summarizeModel(model: ModelDraft) {
  const limit = model.limit ? `${model.limit.context}/${model.limit.output}` : "missing limit"
  return `limit ${limit}, reasoning=${String(model.reasoning ?? false)}, tools=${String(model.tool_call ?? false)}`
}

function parseModelIDs(value: string) {
  return value.split(",").map((part) => part.trim()).filter(Boolean)
}

export function ModelEditScreen(props: {
  draft: ProviderFlowDraft
  onSave: (generated: GeneratedProviderDraft) => Promise<void> | void
  onReviewDiff: (generated: GeneratedProviderDraft) => Promise<void> | void
  onBack: () => void
}) {
  const template = getEndpointTemplate(props.draft.endpointKind)
  const [step, setStep] = useState<Step>(template.supportsModelProbe && props.draft.baseURL ? "choose" : "input")
  const [selected, setSelected] = useState(0)
  const [modelText, setModelText] = useState("")
  const [detectedModels, setDetectedModels] = useState<DetectedModel[]>([])
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  const [generated, setGenerated] = useState<GeneratedProviderDraft>()
  const [error, setError] = useState<string>()
  const [metadataWarnings, setMetadataWarnings] = useState<string[]>([])
  const keybinds = useTuiKeybinds()

  async function resolveModels(modelIDs = parseModelIDs(modelText)) {
    if (modelIDs.length === 0) {
      setError("At least one model ID is required.")
      return
    }
    setError(undefined)
    setMetadataWarnings([])
    setStep("loading")
    try {
      let modelsDevData
      try {
        modelsDevData = await loadModelsDev()
      } catch (caught) {
        setMetadataWarnings([`models.dev unavailable; using built-in templates: ${caught instanceof Error ? caught.message : String(caught)}`])
        modelsDevData = {}
      }
      const result = await createProviderDraftFromEndpoint({
        endpointKind: props.draft.endpointKind,
        providerID: props.draft.providerID,
        name: props.draft.name,
        baseURL: props.draft.baseURL,
        apiKey: props.draft.apiKey,
        modelIDs,
        setCacheKey: props.draft.setCacheKey,
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
    if (!props.draft.baseURL) {
      setError("Base URL is required for model detection. Use manual input instead.")
      setStep("input")
      return
    }
    setError(undefined)
    setStep("detecting")
    try {
      const apiKey = props.draft.apiKeyValue.trim()
      if (!apiKey) {
        setError("API key is unavailable for model detection. Use manual input instead.")
        setStep("input")
        return
      }
      const result = await detectModels(props.draft.endpointKind, props.draft.baseURL, { apiKey })
      if (result.diagnostics.length > 0) setError(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"))
      if (result.models.length === 0) return setStep("input")
      setDetectedModels(result.models)
      setSelectedModels(new Set(result.models.map((model) => model.id)))
      setSelected(0)
      setStep("select")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setStep("input")
    }
  }

  function toggleSelectedModel(index = selected) {
    const model = detectedModels[index]
    if (!model) return
    setSelectedModels((current) => {
      const next = new Set(current)
      if (next.has(model.id)) next.delete(model.id)
      else next.add(model.id)
      return next
    })
  }

  function menuGroups(): OpenCodeMenuGroup[] {
    if (step === "choose") return [{ title: "Options", items: [{ id: "auto", label: "Auto detect models" }, { id: "manual", label: "Manual input" }] }]
    if (step === "select") return [{ title: "Recent", items: detectedModels.map((model) => ({ id: model.id, label: model.id, description: model.name, marker: selectedModels.has(model.id) ? "●" : " " })) }]
    const modelItems = generated ? Object.entries(generated.provider.models).map(([modelID, model]) => ({ id: `model:${modelID}`, label: modelID, description: summarizeModel(model), disabled: true })) : []
    return [{ title: "Resolved", items: modelItems }, { title: "Actions", items: reviewActions.map((action) => ({ id: action, label: action, shortcut: action === "Save" ? "y" : action === "View diff" ? "d" : "b" })) }]
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
      if (action === "Save") void props.onSave(generated)
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
    if (matchesKeybind("toggleAll", input, key, keybinds) && step === "select") setSelectedModels((current) => current.size === detectedModels.length ? new Set() : new Set(detectedModels.map((model) => model.id)))
    if (matchesKeybind("manual", input, key, keybinds) && step === "select") setStep("input")
    if (matchesKeybind("retry", input, key, keybinds) && step === "select") void probeModels()
    if (matchesKeybind("save", input, key, keybinds) && step === "review" && generated) void props.onSave(generated)
    if (matchesKeybind("diff", input, key, keybinds) && step === "review" && generated) void props.onReviewDiff(generated)
    if (matchesKeybind("confirm", input, key, keybinds)) {
      if (step === "select") void resolveModels(detectedModels.map((model) => model.id).filter((id) => selectedModels.has(id)))
      else runSelected()
    }
  })

  if (step === "input") return <OpenCodePrompt title="Models" label="Model IDs" value={modelText} error={error} hint="Separate multiple model IDs with commas." footer={["Continue\tenter", "Cancel\tesc"]} />
  if (step === "detecting") return <Text>Detecting models from {props.draft.baseURL}/models...</Text>
  if (step === "loading") return <Text>Resolving model capabilities...</Text>

  return (
    <OpenCodeMenu
      title={step === "choose" ? "Models" : step === "select" ? "Select models" : "Resolved models"}
      query=""
      rows={openCodeMenuRows(menuGroups(), "")}
      selectedIndex={selected}
      footer={step === "select" ? ["Toggle\tspace", "All\ta", "Manual\tm", "Retry\tr", "Continue\tenter"] : step === "review" ? ["Save\ty", "Diff\td", "Back\tb"] : ["Select\tenter", "Cancel\tesc"]}
      emptyText={metadataWarnings[0] ?? error}
    />
  )
}
