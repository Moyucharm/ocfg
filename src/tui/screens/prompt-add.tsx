import React, { useState } from "react"
import { normalizePromptFileName } from "../../core/prompt-manager.js"
import { useTuiText } from "../i18n.js"
import { deleteEditableTextInputBackward, deleteEditableTextInputForward, editableTextInput, insertEditableTextInput, insertMultilineTextInput, isBackwardDeleteInput, isForwardDeleteInput, moveEditableTextInput, useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { insertNewline } from "../text-editor.js"
import { OpenCodePrompt, OpenCodeTextArea } from "../ui.js"

type Step = "name" | "content"
type PromptAddKind = "prompt" | "rule-profile"

function skeleton(fileName: string) {
  return `# ${fileName.replace(/\.[^.]+$/, "")}

Describe how this OpenCode agent should behave.
`
}

function ruleProfileSkeleton(fileName: string) {
  const name = fileName.replace(/\.[^.]+$/, "")
  return `---
name: ${name}
description: OpenCode global AGENTS.md rules.
---

# ${name}

Describe the global OpenCode behavior, tone, workflow, and project rules.
`
}

export function PromptAddScreen(props: {
  kind?: PromptAddKind
  onSave: (fileName: string, content: string) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const kind = props.kind ?? "prompt"
  const [step, setStep] = useState<Step>("name")
  const [name, setName] = useState(() => editableTextInput())
  const [editor, setEditor] = useState(() => editableTextInput())
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()
  const content = editor.value
  const contentCursor = editor.cursor

  function continueToContent() {
    try {
      const fileName = normalizePromptFileName(name.value)
      const nextContent = kind === "rule-profile" ? ruleProfileSkeleton(fileName) : skeleton(fileName)
      setEditor(editableTextInput(nextContent))
      setError(undefined)
      setStep("content")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  function saveContent() {
    try {
      const fileName = normalizePromptFileName(name.value)
      if (!content.trim()) throw new Error(t("prompt.contentRequired"))
      props.onSave(fileName, content)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  useTuiInput((input, key) => {
    if (step === "name") {
      if (matchesKeybind("cancel", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
        props.onBack()
        return
      }
      if (matchesKeybind("left", input, key, keybinds)) setName((current) => moveEditableTextInput(current, "left"))
      else if (matchesKeybind("right", input, key, keybinds)) setName((current) => moveEditableTextInput(current, "right"))
      else if (isBackwardDeleteInput(input, key)) setName(deleteEditableTextInputBackward)
      else if (isForwardDeleteInput(input, key)) setName(deleteEditableTextInputForward)
      else if (matchesKeybind("confirm", input, key, keybinds)) continueToContent()
      else {
        setError(undefined)
        setName((current) => insertEditableTextInput(current, input))
      }
      return
    }

    if (key.ctrl && input.toLowerCase() === "x") {
      saveContent()
      return
    }
    if (matchesKeybind("cancel", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
      setStep("name")
      setError(undefined)
      return
    }
    if (matchesKeybind("left", input, key, keybinds)) setEditor((current) => moveEditableTextInput(current, "left"))
    else if (matchesKeybind("right", input, key, keybinds)) setEditor((current) => moveEditableTextInput(current, "right"))
    else if (matchesKeybind("up", input, key, keybinds)) setEditor((current) => moveEditableTextInput(current, "up"))
    else if (matchesKeybind("down", input, key, keybinds)) setEditor((current) => moveEditableTextInput(current, "down"))
    else if (isBackwardDeleteInput(input, key)) setEditor(deleteEditableTextInputBackward)
    else if (isForwardDeleteInput(input, key)) setEditor(deleteEditableTextInputForward)
    else if (matchesKeybind("confirm", input, key, keybinds)) setEditor((current) => insertNewline(current.value, current.cursor))
    else {
      setError(undefined)
      setEditor((current) => insertMultilineTextInput(current, input))
    }
  })

  if (step === "content") {
    return (
      <OpenCodeTextArea
        title={t(kind === "rule-profile" ? "prompt.title.addRuleConfig" : "prompt.title.add")}
        label={t("prompt.content")}
        value={content}
        cursor={contentCursor}
        error={error}
        hint={t("prompt.contentHint")}
        footer={[`${t("common.save")}\tctrl+x`, `${t("common.cancel")}\tesc`, `${t("prompt.newLine")}\tenter`]}
      />
    )
  }

  return (
    <OpenCodePrompt
      title={t(kind === "rule-profile" ? "prompt.title.addRuleConfig" : "prompt.title.add")}
      label={t(kind === "rule-profile" ? "prompt.ruleConfigName" : "prompt.fileName")}
      value={name.value}
      cursor={name.cursor}
      error={error}
      hint={t(kind === "rule-profile" ? "prompt.ruleConfigNameHint" : "prompt.fileNameHint")}
      footer={[`${t("common.continue")}\tenter`, `${t("common.cancel")}\tesc`]}
    />
  )
}
