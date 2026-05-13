import React, { useEffect, useState } from "react"
import { Box, Text, useInput } from "ink"
import { locateConfig } from "../../core/config-locator.js"
import { readConfig } from "../../core/config-reader.js"
import { collectDefaultModelOptions, type DefaultModelKey, type DefaultModelOption } from "../default-model.js"
import type { TuiConfigSelection } from "../types.js"

type Step = "target" | "model"

const targets: Array<{ key: DefaultModelKey; label: string; description: string }> = [
  { key: "model", label: "model", description: "Primary default model" },
  { key: "small_model", label: "small_model", description: "Small/default lightweight model" },
]

function currentValue(config: Record<string, unknown>, key: DefaultModelKey) {
  return typeof config[key] === "string" ? config[key] : undefined
}

export function DefaultModelScreen(props: {
  selection: TuiConfigSelection
  onSelect: (key: DefaultModelKey, ref?: string) => void
  onBack: () => void
}) {
  const [step, setStep] = useState<Step>("target")
  const [targetIndex, setTargetIndex] = useState(0)
  const [modelIndex, setModelIndex] = useState(0)
  const [targetPath, setTargetPath] = useState("")
  const [options, setOptions] = useState<DefaultModelOption[]>([])
  const [current, setCurrent] = useState<Record<DefaultModelKey, string | undefined>>({ model: undefined, small_model: undefined })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const selectedTarget = targets[targetIndex]!
  const selectedOption = options[modelIndex]

  function enterTarget() {
    const selectedCurrent = current[selectedTarget.key]
    const currentOptionIndex = options.findIndex((option) => option.ref === selectedCurrent)
    setModelIndex(Math.max(0, currentOptionIndex))
    setStep("model")
  }

  useInput((input, key) => {
    if (input === "q" || input === "b") {
      if (step === "model") setStep("target")
      else props.onBack()
      return
    }
    if (loading || error) return
    if (step === "target") {
      if (key.upArrow || key.leftArrow) setTargetIndex((value) => (value === 0 ? targets.length - 1 : value - 1))
      if (key.downArrow || key.rightArrow) setTargetIndex((value) => (value === targets.length - 1 ? 0 : value + 1))
      if (key.return) enterTarget()
      return
    }
    if (key.upArrow || key.leftArrow) setModelIndex((value) => (value === 0 ? Math.max(0, options.length - 1) : value - 1))
    if (key.downArrow || key.rightArrow) setModelIndex((value) => (value === options.length - 1 ? 0 : value + 1))
    if (key.return && selectedOption) props.onSelect(selectedTarget.key, selectedOption.ref)
  })

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const target = props.selection.target ?? locateConfig({ scope: props.selection.scope })
        const document = await readConfig(target)
        if (!active) return
        setTargetPath(target.path)
        setOptions(collectDefaultModelOptions(document.data))
        setCurrent({ model: currentValue(document.data, "model"), small_model: currentValue(document.data, "small_model") })
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
  }, [props.selection])

  if (loading) return <Text>Loading models...</Text>
  if (error) return <Text color="red">Failed to load models: {error}</Text>

  return (
    <Box flexDirection="column">
      <Text bold>Set Default Model</Text>
      <Text dimColor>{targetPath || "No config target"}</Text>
      <Text dimColor>Choose (empty) to clear a default. Writes require diff confirmation.</Text>
      <Text>Current model: {current.model ?? "(empty)"}</Text>
      <Text>Current small_model: {current.small_model ?? "(empty)"}</Text>
      {step === "target" ? (
        <Box flexDirection="column" marginY={1}>
          <Text>Choose setting:</Text>
          {targets.map((target, index) => (
            <Text key={target.key} color={index === targetIndex ? "green" : undefined}>
              {index === targetIndex ? "›" : " "} {target.label} - {target.description}
            </Text>
          ))}
        </Box>
      ) : null}
      {step === "model" ? (
        <Box flexDirection="column" marginY={1}>
          <Text>Choose value for {selectedTarget.label}:</Text>
          {options.length === 1 ? <Text color="yellow">No provider models found. Only the empty option is available.</Text> : null}
          {options.map((option, index) => {
            const isCurrent = option.ref === current[selectedTarget.key]
            return (
              <Text key={option.ref ?? "empty"} color={index === modelIndex ? "green" : undefined}>
                {index === modelIndex ? "›" : " "} {option.label}{isCurrent ? " [current]" : ""}
              </Text>
            )
          })}
        </Box>
      ) : null}
      <Text dimColor>{step === "model" ? "Enter reviews diff, b/q returns to setting choice, Esc returns." : "Enter selects, b/q or Esc returns."}</Text>
    </Box>
  )
}
