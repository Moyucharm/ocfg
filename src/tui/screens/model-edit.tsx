import React, { useState } from "react"
import { Text } from "ink"
import { detectModels, type DetectedModel } from "../../core/model-detector.js"
import { loadModelsDev } from "../../core/models-dev.js"
import { createProviderDraftFromEndpoint, type GeneratedProviderDraft } from "../../core/provider-generator.js"
import type { ModelDraft } from "../../core/types.js"
import { getEndpointTemplate } from "../../templates/index.js"
import { useTuiText } from "../i18n.js"
import { appendPrintableInput, printableInput, useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { parseTuiMouseEvent } from "../mouse.js"
import type { ProviderFlowDraft } from "../types.js"
import { menuItemIndexFromMouse, OpenCodeMenu, openCodeMenuRows, OpenCodeNotice, OpenCodePrompt, type OpenCodeMenuGroup } from "../ui.js"

type Step = "choose" | "input" | "detecting" | "select" | "review" | "loading"
const reviewActions = ["save", "view-diff", "back"] as const

function summarizeModel(model: ModelDraft, t: ReturnType<typeof useTuiText>) {
  return t("model.summary", {
    limit: model.limit ? `${model.limit.context}/${model.limit.output}` : t("model.missingLimit"),
    reasoning: t(model.reasoning ? "common.true" : "common.false"),
    tools: t(model.tool_call ? "common.true" : "common.false"),
  })
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
  const t = useTuiText()
  const template = getEndpointTemplate(props.draft.endpointKind)
  const [step, setStep] = useState<Step>(template.supportsModelProbe && props.draft.baseURL ? "choose" : "input")
  const [selected, setSelected] = useState(0)
  const [query, setQuery] = useState("")
  const [modelText, setModelText] = useState("")
  const [detectedModels, setDetectedModels] = useState<DetectedModel[]>([])
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  const [generated, setGenerated] = useState<GeneratedProviderDraft>()
  const [error, setError] = useState<string>()
  const [metadataWarnings, setMetadataWarnings] = useState<string[]>([])
  const keybinds = useTuiKeybinds()

  async function resolveModels(modelIDs = parseModelIDs(modelText)) {
    if (modelIDs.length === 0) {
      setError(t("model.atLeastOne"))
      return
    }
    setError(undefined)
    const warnings: string[] = []
    setMetadataWarnings(warnings)
    setStep("loading")
    try {
      let modelsDevData
      try {
        modelsDevData = await loadModelsDev()
      } catch (caught) {
        warnings.push(t("model.modelsDevUnavailable", { message: caught instanceof Error ? caught.message : String(caught) }))
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
      setMetadataWarnings([...warnings, ...result.warnings])
      setSelected(Object.keys(result.provider.models).length)
      setStep("review")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setStep("input")
    }
  }

  async function probeModels() {
    if (!props.draft.baseURL) {
      setError(t("model.baseRequired"))
      setStep("input")
      return
    }
    setError(undefined)
    setStep("detecting")
    try {
      const apiKey = props.draft.apiKeyValue.trim()
      if (!apiKey) {
        setError(t("model.apiUnavailable"))
        setStep("input")
        return
      }
      const result = await detectModels(props.draft.endpointKind, props.draft.baseURL, { apiKey })
      if (result.diagnostics.length > 0) setError(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"))
      if (result.models.length === 0) return setStep("input")
      setDetectedModels(result.models)
      setSelectedModels(new Set(result.models.map((model) => model.id)))
      setSelected(0)
      setQuery("")
      setStep("select")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setStep("input")
    }
  }

  function menuQuery() {
    return step === "select" ? query : ""
  }

  function rowsForStep() {
    return openCodeMenuRows(menuGroups(), menuQuery())
  }

  function selectedMenuItem(rows = rowsForStep(), index = selected) {
    const row = rows.find((entry) => entry.kind === "item" && entry.itemIndex === index)
    return row?.kind === "item" ? row.item : undefined
  }

  function selectableVisibleModelIDs(rows = rowsForStep()) {
    return rows.flatMap((row) => row.kind === "item" && !row.item.disabled ? [row.item.id] : [])
  }

  function toggleSelectedModel(modelID = selectedMenuItem()?.id) {
    if (!modelID) return
    setSelectedModels((current) => {
      const next = new Set(current)
      if (next.has(modelID)) next.delete(modelID)
      else next.add(modelID)
      return next
    })
  }

  function menuGroups(): OpenCodeMenuGroup[] {
    if (step === "choose") return [{ title: t("model.options"), items: [{ id: "auto", label: t("model.autoDetect") }, { id: "manual", label: t("model.manualInput") }] }]
    if (step === "select") {
      return [{
        title: t("model.recent"),
        items: detectedModels.map((model) => {
          const isSelected = selectedModels.has(model.id)
          return { id: model.id, label: model.id, description: model.name, marker: isSelected ? "x" : " ", selected: isSelected }
        }),
      }]
    }
    const modelItems = generated ? Object.entries(generated.provider.models).map(([modelID, model]) => ({ id: `model:${modelID}`, label: modelID, description: summarizeModel(model, t), disabled: true })) : []
    return [{ title: t("model.resolved"), items: modelItems }, { title: t("model.actions"), items: reviewActions.map((action) => ({ id: action, label: action === "save" ? t("common.save") : action === "view-diff" ? t("model.viewDiff") : t("common.back") })) }]
  }

  function runSelected(index = selected) {
    if (step === "choose") {
      if (index === 0) void probeModels()
      else setStep("input")
      return
    }
    if (step === "select") {
      toggleSelectedModel(selectedMenuItem(rowsForStep(), index)?.id)
      return
    }
    if (step === "review" && generated) {
      const modelCount = Object.keys(generated.provider.models).length
      const action = reviewActions[index - modelCount]
      if (action === "save") void props.onSave(generated)
      if (action === "view-diff") void props.onReviewDiff(generated)
      if (action === "back") setStep(detectedModels.length > 0 ? "select" : "input")
    }
  }

  useTuiInput((input, key) => {
    if (matchesKeybind("cancel", input, key, keybinds)) return props.onBack()
    if (step === "detecting" || step === "loading") return
    if (step === "input") {
      if (key.backspace || key.delete) setModelText((current) => current.slice(0, -1))
      else if (matchesKeybind("confirm", input, key, keybinds)) void resolveModels()
      else {
        setModelText((current) => appendPrintableInput(current, input))
      }
      return
    }

    const rows = rowsForStep()
    const count = rows.filter((row) => row.kind === "item").length
    const mouse = parseTuiMouseEvent(input)
    if (mouse) {
      if (mouse.kind === "wheel") setSelected((current) => mouse.button === "wheel-up" ? Math.max(0, current - 1) : Math.min(Math.max(0, count - 1), current + 1))
      const clicked = menuItemIndexFromMouse(mouse, rows, { showSearch: step === "select", selectedIndex: selected, hasFooter: true })
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
    if (step === "select" && (key.backspace || key.delete)) {
      setQuery((current) => current.slice(0, -1))
      setSelected(0)
      return
    }
    if (matchesKeybind("up", input, key, keybinds) || matchesKeybind("left", input, key, keybinds)) {
      setSelected((current) => count <= 0 ? 0 : current === 0 ? Math.max(0, count - 1) : Math.min(current - 1, count - 1))
      return
    }
    if (matchesKeybind("down", input, key, keybinds) || matchesKeybind("right", input, key, keybinds)) {
      setSelected((current) => count <= 0 ? 0 : current === count - 1 ? 0 : Math.min(current + 1, count - 1))
      return
    }
    if (matchesKeybind("toggle", input, key, keybinds) && step === "select") {
      toggleSelectedModel()
      return
    }
    if (key.ctrl && matchesKeybind("toggleAll", input, key, keybinds) && step === "select") {
      const visibleModelIDs = selectableVisibleModelIDs(rows)
      setSelectedModels((current) => {
        const next = new Set(current)
        const allVisibleSelected = visibleModelIDs.length > 0 && visibleModelIDs.every((id) => next.has(id))
        for (const modelID of visibleModelIDs) {
          if (allVisibleSelected) next.delete(modelID)
          else next.add(modelID)
        }
        return next
      })
      return
    }
    if (key.ctrl && matchesKeybind("manual", input, key, keybinds) && step === "select") {
      setStep("input")
      setQuery("")
      return
    }
    if (key.ctrl && matchesKeybind("retry", input, key, keybinds) && step === "select") {
      setQuery("")
      void probeModels()
      return
    }
    if (matchesKeybind("save", input, key, keybinds) && step === "review" && generated) void props.onSave(generated)
    if (matchesKeybind("diff", input, key, keybinds) && step === "review" && generated) void props.onReviewDiff(generated)
    if (matchesKeybind("confirm", input, key, keybinds)) {
      if (step === "select") void resolveModels(detectedModels.map((model) => model.id).filter((id) => selectedModels.has(id)))
      else runSelected()
      return
    }
    if (step === "select") {
      const printable = printableInput(input)
      if (printable) {
        setQuery((current) => `${current}${printable}`)
        setSelected(0)
      }
    }
  })

  if (step === "input") return <OpenCodePrompt title={t("model.models")} label={t("model.ids")} value={modelText} error={error} hint={t("model.inputHint")} footer={[`${t("common.continue")}\tenter`, `${t("common.cancel")}\tesc`]} />
  if (step === "detecting") return <Text>{t("model.detecting", { baseURL: props.draft.baseURL ?? "" })}</Text>
  if (step === "loading") return <Text>{t("model.resolving")}</Text>

  const menu = (
    <OpenCodeMenu
      title={step === "choose" ? t("model.models") : step === "select" ? t("model.title.select") : t("model.title.resolved")}
      query={menuQuery()}
      rows={rowsForStep()}
      selectedIndex={selected}
      showSearch={step === "select"}
      footer={step === "select" ? [`${t("common.toggle")}\tspace`, `${t("common.all")}\tctrl+a`, `${t("common.manual")}\tctrl+m`, `${t("common.retry")}\tctrl+r`, `${t("common.continue")}\tenter`] : step === "review" ? [`${t("common.save")}\ty`, `${t("common.diff")}\td`, `${t("common.back")}\tb`] : [`${t("common.select")}\tenter`, `${t("common.cancel")}\tesc`]}
      emptyText={error}
    />
  )
  if (metadataWarnings.length === 0) return menu
  return (
    <>
      {metadataWarnings.map((warning, index) => <OpenCodeNotice key={`${index}-${warning}`} tone="warning">{warning}</OpenCodeNotice>)}
      {menu}
    </>
  )
}
