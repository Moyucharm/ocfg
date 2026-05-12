import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import type { ExistingModelEditDraft } from "../model-edit-existing.js"

type Field = "name" | "context" | "output" | "reasoning" | "tool-call" | "temperature" | "attachment" | "review"
type Step = "menu" | "name" | "context" | "output" | "boolean"
type BooleanField = "reasoning" | "toolCall" | "temperature" | "attachment"

const fields: Array<{ field: Field; label: string }> = [
  { field: "name", label: "Display name" },
  { field: "context", label: "Context limit" },
  { field: "output", label: "Output limit" },
  { field: "reasoning", label: "Reasoning" },
  { field: "tool-call", label: "Tool call" },
  { field: "temperature", label: "Temperature" },
  { field: "attachment", label: "Attachment" },
  { field: "review", label: "Review diff" },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function appendInput(value: string, input: string) {
  const printable = input.replace(/[\u0000-\u001F\u007F]/g, "")
  if (!printable) return value
  return `${value}${printable}`
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : ""
}

function limitValue(model: Record<string, unknown>, key: "context" | "output") {
  const limit = isRecord(model.limit) ? model.limit : {}
  return numberValue(limit[key])
}

function booleanValue(model: Record<string, unknown>, key: "reasoning" | "tool_call" | "temperature" | "attachment") {
  return typeof model[key] === "boolean" ? model[key] : false
}

function parsePositiveInteger(value: string, label: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`)
  return parsed
}

export function ModelEditExistingScreen(props: {
  providerID: string
  modelID: string
  model: Record<string, unknown>
  onComplete: (draft: ExistingModelEditDraft) => void
  onBack: () => void
}) {
  const [step, setStep] = useState<Step>("menu")
  const [fieldIndex, setFieldIndex] = useState(0)
  const [draft, setDraft] = useState<ExistingModelEditDraft>({})
  const [inputValue, setInputValue] = useState("")
  const [booleanField, setBooleanField] = useState<BooleanField>("reasoning")
  const [booleanIndex, setBooleanIndex] = useState(0)
  const [error, setError] = useState<string>()

  const currentName = typeof props.model.name === "string" ? props.model.name : ""

  function currentBooleanValue(field: BooleanField) {
    if (field === "toolCall") return draft.toolCall ?? booleanValue(props.model, "tool_call")
    return (draft[field] as boolean | undefined) ?? booleanValue(props.model, field)
  }

  function startField(field: Field) {
    setError(undefined)
    if (field === "review") {
      props.onComplete(draft)
      return
    }
    if (field === "name") {
      setInputValue(draft.name ?? currentName)
      setStep("name")
    }
    if (field === "context") {
      setInputValue(draft.context === undefined ? limitValue(props.model, "context") : String(draft.context))
      setStep("context")
    }
    if (field === "output") {
      setInputValue(draft.output === undefined ? limitValue(props.model, "output") : String(draft.output))
      setStep("output")
    }
    if (["reasoning", "tool-call", "temperature", "attachment"].includes(field)) {
      const nextField = field === "tool-call" ? "toolCall" : (field as BooleanField)
      setBooleanField(nextField)
      setBooleanIndex(currentBooleanValue(nextField) ? 1 : 0)
      setStep("boolean")
    }
  }

  function saveTextField() {
    try {
      if (step === "name") setDraft((current) => ({ ...current, name: inputValue.trim() }))
      if (step === "context") setDraft((current) => ({ ...current, context: parsePositiveInteger(inputValue.trim(), "context") }))
      if (step === "output") setDraft((current) => ({ ...current, output: parsePositiveInteger(inputValue.trim(), "output") }))
      setInputValue("")
      setStep("menu")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  function saveBooleanField() {
    const value = booleanIndex === 1
    setDraft((current) => ({ ...current, [booleanField]: value }))
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
    if (step === "boolean") {
      if (key.upArrow || key.leftArrow || key.downArrow || key.rightArrow) setBooleanIndex((current) => (current === 0 ? 1 : 0))
      if (key.return) saveBooleanField()
      return
    }
    if (key.backspace || key.delete) setInputValue((current) => current.slice(0, -1))
    else if (key.return) {
      setError(undefined)
      saveTextField()
    } else setInputValue((current) => appendInput(current, input))
  })

  return (
    <Box flexDirection="column">
      <Text bold>Edit Model</Text>
      <Text dimColor>Provider: {props.providerID}</Text>
      <Text dimColor>Model: {props.modelID}</Text>
      <Text dimColor>Ctrl+Q or Esc cancels. Enter selects or saves.</Text>
      {error ? <Text color="red">{error}</Text> : null}
      {step === "menu" ? (
        <Box flexDirection="column">
          <Text>Name: {(draft.name ?? currentName) || "(missing)"}</Text>
          <Text>Context: {(draft.context ?? limitValue(props.model, "context")) || "(missing)"}</Text>
          <Text>Output: {(draft.output ?? limitValue(props.model, "output")) || "(missing)"}</Text>
          <Text>Reasoning: {String(currentBooleanValue("reasoning"))}</Text>
          <Text>Tool call: {String(currentBooleanValue("toolCall"))}</Text>
          <Text>Temperature: {String(currentBooleanValue("temperature"))}</Text>
          <Text>Attachment: {String(currentBooleanValue("attachment"))}</Text>
          {fields.map((item, index) => <Text key={item.field} color={index === fieldIndex ? "green" : undefined}>{index === fieldIndex ? "›" : " "} {item.label}</Text>)}
        </Box>
      ) : null}
      {["name", "context", "output"].includes(step) ? <Text>{step}: {inputValue || "_"}</Text> : null}
      {step === "boolean" ? (
        <Box flexDirection="column">
          <Text>{booleanField}:</Text>
          {[false, true].map((value, index) => <Text key={String(value)} color={index === booleanIndex ? "green" : undefined}>{index === booleanIndex ? "›" : " "} {String(value)}</Text>)}
        </Box>
      ) : null}
    </Box>
  )
}
