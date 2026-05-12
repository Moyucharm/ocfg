import React, { useEffect, useState } from "react"
import { Box, Text, useInput } from "ink"
import { locateConfig } from "../../core/config-locator.js"
import { readConfig } from "../../core/config-reader.js"
import type { TuiConfigSelection } from "../types.js"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function ModelListScreen(props: {
  selection: TuiConfigSelection
  providerID: string
  onAddModel: () => void
  onSelectModel: (modelID: string) => void
  onDeleteModel: (modelID: string) => void
  onBack: () => void
}) {
  const [models, setModels] = useState<Array<{ id: string; name?: string }>>([])
  const [selected, setSelected] = useState(0)
  const [targetPath, setTargetPath] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  useInput((input, key) => {
    if (input === "q" || input === "b") props.onBack()
    const itemCount = models.length + 1
    if (key.upArrow) setSelected((current) => (current === 0 ? itemCount - 1 : current - 1))
    if (key.downArrow) setSelected((current) => (current === itemCount - 1 ? 0 : current + 1))
    if (input === "d") {
      const model = models[selected - 1]
      if (model) props.onDeleteModel(model.id)
      return
    }
    if (key.return) {
      if (selected === 0) {
        props.onAddModel()
        return
      }
      const model = models[selected - 1]
      if (model) props.onSelectModel(model.id)
    }
  })

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const target = props.selection.target ?? locateConfig({ scope: props.selection.scope })
        const document = await readConfig(target)
        const providerMap = isRecord(document.data.provider) ? document.data.provider : {}
        const provider = providerMap[props.providerID]
        if (!isRecord(provider)) throw new Error(`Provider "${props.providerID}" does not exist`)
        const modelMap = isRecord(provider.models) ? provider.models : {}
        const nextModels = Object.entries(modelMap).map(([id, value]) => ({
          id,
          name: isRecord(value) && typeof value.name === "string" ? value.name : undefined,
        }))
        if (!active) return
        setTargetPath(target.path)
        setModels(nextModels)
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : String(caught))
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [props.providerID, props.selection])

  if (loading) return <Text>Loading models...</Text>
  if (error) return <Text color="red">Failed to load models: {error}</Text>

  return (
    <Box flexDirection="column">
      <Text bold>Edit Model</Text>
      <Text dimColor>{targetPath || "No config target"}</Text>
      <Text dimColor>Provider: {props.providerID}</Text>
      {models.length === 0 ? <Text color="yellow">No models configured for this provider yet.</Text> : null}
      <Text color={selected === 0 ? "green" : undefined}>{selected === 0 ? "›" : " "} Add new model</Text>
      {models.map((model, index) => (
        <Text key={model.id} color={index + 1 === selected ? "green" : undefined}>
          {index + 1 === selected ? "›" : " "} {model.id}{model.name ? ` (${model.name})` : ""}
        </Text>
      ))}
      <Text dimColor>Enter adds or edits. d deletes the selected model. b, q, or Esc returns.</Text>
    </Box>
  )
}
