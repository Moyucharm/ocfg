import React, { useState } from "react"
import { normalizePromptFileName } from "../../core/prompt-manager.js"
import { useTuiText } from "../i18n.js"
import { deleteEditableTextInputBackward, deleteEditableTextInputForward, editableTextInput, insertEditableTextInput, moveEditableTextInput, printableInput, useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { cursorAtEnd, deleteBackward, deleteForward, insertNewline, insertText, moveCursor, type TextCursor } from "../text-editor.js"
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
  const [content, setContent] = useState("")
  const [contentCursor, setContentCursor] = useState<TextCursor>(() => cursorAtEnd(""))
  const [error, setError] = useState<string>()
  const keybinds = useTuiKeybinds()

  function continueToContent() {
    try {
      const fileName = normalizePromptFileName(name.value)
      const nextContent = kind === "rule-profile" ? ruleProfileSkeleton(fileName) : skeleton(fileName)
      setContent(nextContent)
      setContentCursor(cursorAtEnd(nextContent))
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

  function applyContentEdit(result: { value: string; cursor: TextCursor }) {
    setContent(result.value)
    setContentCursor(result.cursor)
  }

  useTuiInput((input, key) => {
    if (step === "name") {
      if (matchesKeybind("cancel", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
        props.onBack()
        return
      }
      if (matchesKeybind("left", input, key, keybinds)) setName((current) => moveEditableTextInput(current, "left"))
      else if (matchesKeybind("right", input, key, keybinds)) setName((current) => moveEditableTextInput(current, "right"))
      else if (key.backspace) setName(deleteEditableTextInputBackward)
      else if (key.delete) setName(deleteEditableTextInputForward)
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
    if (matchesKeybind("left", input, key, keybinds)) setContentCursor((current) => moveCursor(content, current, "left"))
    else if (matchesKeybind("right", input, key, keybinds)) setContentCursor((current) => moveCursor(content, current, "right"))
    else if (matchesKeybind("up", input, key, keybinds)) setContentCursor((current) => moveCursor(content, current, "up"))
    else if (matchesKeybind("down", input, key, keybinds)) setContentCursor((current) => moveCursor(content, current, "down"))
    else if (key.backspace) applyContentEdit(deleteBackward(content, contentCursor))
    else if (key.delete) applyContentEdit(deleteForward(content, contentCursor))
    else if (matchesKeybind("confirm", input, key, keybinds)) applyContentEdit(insertNewline(content, contentCursor))
    else {
      setError(undefined)
      const printable = printableInput(input)
      if (printable) applyContentEdit(insertText(content, contentCursor, printable))
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
