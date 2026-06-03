import React, { useEffect, useState } from "react"
import type { ConfigInstructionItem, PromptFile, PromptTemplate, RuleFile, RuleOverwriteRisk, RuleProfile } from "../../core/prompt-manager.js"
import { useTuiText } from "../i18n.js"
import { deleteEditableTextInputBackward, deleteEditableTextInputForward, editableTextInput, insertEditableTextInput, moveEditableTextInput, printableInput, useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import { cursorAtEnd, deleteBackward, deleteForward, insertNewline, insertText, moveCursor, type TextCursor } from "../text-editor.js"
import { OpenCodeMenu, openCodeMenuRows, OpenCodePrompt, OpenCodeTextArea, type OpenCodeMenuGroup } from "../ui.js"

export type PromptEditState =
  | {
      kind: "file"
      prompt: PromptFile
      content: string
    }
  | {
      kind: "template"
      template: PromptTemplate
      content: string
    }
  | {
      kind: "rule"
      rule: RuleFile
      content: string
    }
  | {
      kind: "rule-profile"
      profile: RuleProfile
      content: string
    }
  | {
      kind: "instruction"
      instruction: ConfigInstructionItem
      content: string
    }

type Mode = "menu" | "content" | "agent" | "confirm"
type PendingAction = "apply-rules" | "switch-rule-profile" | "delete" | "delete-rule" | "delete-rule-profile" | "remove-instruction"

function defaultFileName(state: PromptEditState) {
  if (state.kind === "file") return state.prompt.fileName
  if (state.kind === "template") return state.template.fileName
  if (state.kind === "rule") return state.rule.fileName
  if (state.kind === "rule-profile") return state.profile.fileName
  return state.instruction.title
}

function title(state: PromptEditState) {
  if (state.kind === "file") return state.prompt.title
  if (state.kind === "template") return state.template.title
  if (state.kind === "rule") return state.rule.title
  if (state.kind === "rule-profile") return state.profile.title
  return state.instruction.title
}

export function PromptEditScreen(props: {
  state: PromptEditState
  onSaveContent: (fileName: string, content: string) => void
  onSaveRule: (content: string) => void
  onSaveRuleProfile: (profile: RuleProfile, content: string) => void
  onSaveInstruction: (instruction: ConfigInstructionItem, content: string) => void
  onAssessRuleOverwriteRisk: (content: string) => Promise<RuleOverwriteRisk> | RuleOverwriteRisk
  onApplyRules: (content: string) => void
  onSwitchRuleProfile: (profile: RuleProfile) => void
  onApplyGlobal: (fileName: string, content: string, shouldWritePrompt: boolean) => void
  onApply: (fileName: string, content: string, agentID: string, shouldWritePrompt: boolean) => void
  onDelete: (prompt: PromptFile) => void
  onDeleteRule: (rule: RuleFile) => void
  onDeleteRuleProfile: (profile: RuleProfile) => void
  onRemoveInstruction: (instruction: ConfigInstructionItem) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const [mode, setMode] = useState<Mode>("menu")
  const [selected, setSelected] = useState(0)
  const [content, setContent] = useState(props.state.content)
  const [contentCursor, setContentCursor] = useState<TextCursor>(() => cursorAtEnd(props.state.content))
  const [agentID, setAgentID] = useState(() => editableTextInput())
  const [error, setError] = useState<string>()
  const [pendingAction, setPendingAction] = useState<PendingAction>()
  const [confirmSelected, setConfirmSelected] = useState(0)
  const [overwriteRisk, setOverwriteRisk] = useState<RuleOverwriteRisk>()
  const keybinds = useTuiKeybinds()
  const promptTitle = title(props.state)
  const fileName = defaultFileName(props.state)
  const shouldWritePrompt = props.state.kind === "template"
  const isPromptLike = props.state.kind === "file" || props.state.kind === "template"
  const ruleProfile = props.state.kind === "rule-profile" ? props.state.profile : undefined
  const canEditContent = props.state.kind !== "instruction" || props.state.instruction.editable

  const menuGroups: OpenCodeMenuGroup[] = [{
    title: t("prompt.prompt"),
    items: isPromptLike ? [
      { id: "apply-rules", label: t("prompt.applyRules") },
      { id: "apply-global", label: t("prompt.applyGlobal"), meta: props.state.kind === "file" && props.state.prompt.instructionRefs.length > 0 ? t("common.current") : undefined },
      { id: "apply-build", label: t("prompt.applyBuild"), meta: props.state.kind === "file" && props.state.prompt.activeAgents.includes("build") ? t("common.current") : undefined },
      { id: "apply-plan", label: t("prompt.applyPlan"), meta: props.state.kind === "file" && props.state.prompt.activeAgents.includes("plan") ? t("common.current") : undefined },
      { id: "apply-custom", label: t("prompt.applyCustom") },
      { id: "edit", label: props.state.kind === "file" ? t("prompt.editContent") : t("prompt.editBeforeInstall") },
      ...(props.state.kind === "template" ? [{ id: "save-template", label: t("prompt.saveTemplate"), meta: fileName }] : []),
      ...(props.state.kind === "file" ? [{ id: "delete", label: t("prompt.delete"), danger: true }] : []),
    ] : ruleProfile ? [
      { id: "switch-rule-profile", label: t("prompt.switchRuleConfig"), meta: ruleProfile.active ? t("common.current") : undefined },
      { id: "edit", label: t("prompt.editContent") },
      { id: "delete-rule-profile", label: t("prompt.deleteRuleConfig"), danger: true },
    ] : [
      ...(canEditContent ? [{ id: "edit", label: props.state.kind === "rule" && !props.state.rule.exists ? t("prompt.createRules") : t("prompt.editContent") }] : []),
      ...(props.state.kind === "instruction" ? [{ id: "remove-instruction", label: t("prompt.removeInstruction"), danger: true }] : []),
      ...(props.state.kind === "rule" && props.state.rule.exists ? [{ id: "delete-rule", label: t("prompt.deleteRule"), danger: true }] : []),
    ],
  }]

  const confirmGroups: OpenCodeMenuGroup[] = [{
    title: t("prompt.confirmActions"),
    items: [
      { id: "confirm", label: t("common.confirm"), danger: true },
      { id: "cancel", label: t("common.cancel") },
    ],
  }]

  useEffect(() => {
    setContent(props.state.content)
    setContentCursor(cursorAtEnd(props.state.content))
    setMode("menu")
    setSelected(0)
    setConfirmSelected(0)
    setPendingAction(undefined)
    setOverwriteRisk(undefined)
    setError(undefined)
  }, [props.state])

  function apply(agent: string) {
    const trimmed = agent.trim()
    if (!trimmed) {
      setError(t("prompt.agentRequired"))
      return
    }
    props.onApply(fileName, content, trimmed, shouldWritePrompt)
  }

  function needsRuleOverwriteRiskCheck(action: string) {
    return action === "apply-rules" || action === "switch-rule-profile"
  }

  function requiresConfirmation(action: string): action is PendingAction {
    return action === "delete" ||
      action === "delete-rule" ||
      action === "delete-rule-profile" ||
      action === "remove-instruction"
  }

  function runAction(action: string) {
    setError(undefined)
    if (action === "apply-build") {
      apply("build")
      return
    }
    if (action === "apply-plan") {
      apply("plan")
      return
    }
    if (action === "apply-custom") {
      setAgentID(editableTextInput())
      setMode("agent")
      return
    }
    if (action === "apply-global") {
      props.onApplyGlobal(fileName, content, shouldWritePrompt)
      return
    }
    if (action === "apply-rules") {
      props.onApplyRules(content)
      return
    }
    if (action === "switch-rule-profile" && props.state.kind === "rule-profile") {
      props.onSwitchRuleProfile(props.state.profile)
      return
    }
    if (action === "edit") {
      setMode("content")
      return
    }
    if (action === "save-template") {
      props.onSaveContent(fileName, content)
      return
    }
    if (action === "delete" && props.state.kind === "file") props.onDelete(props.state.prompt)
    if (action === "delete-rule" && props.state.kind === "rule") props.onDeleteRule(props.state.rule)
    if (action === "delete-rule-profile" && props.state.kind === "rule-profile") props.onDeleteRuleProfile(props.state.profile)
    if (action === "remove-instruction" && props.state.kind === "instruction") props.onRemoveInstruction(props.state.instruction)
  }

  async function startAction(action: string) {
    if (needsRuleOverwriteRiskCheck(action)) {
      try {
        const risk = await props.onAssessRuleOverwriteRisk(content)
        if (risk.risky) {
          setOverwriteRisk(risk)
          setPendingAction(action)
          setConfirmSelected(0)
          setMode("confirm")
          setError(undefined)
          return
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught))
        return
      }
    }
    if (requiresConfirmation(action)) {
      setOverwriteRisk(undefined)
      setPendingAction(action)
      setConfirmSelected(0)
      setMode("confirm")
      setError(undefined)
      return
    }
    runAction(action)
  }

  function confirmPendingAction(confirmed: boolean) {
    const action = pendingAction
    setPendingAction(undefined)
    setOverwriteRisk(undefined)
    setConfirmSelected(0)
    setMode("menu")
    if (confirmed && action) runAction(action)
  }

  function saveContent() {
    if (!content.trim()) {
      setError(t("prompt.contentRequired"))
      return
    }
    if (props.state.kind === "rule") props.onSaveRule(content)
    else if (props.state.kind === "rule-profile") props.onSaveRuleProfile(props.state.profile, content)
    else if (props.state.kind === "instruction") props.onSaveInstruction(props.state.instruction, content)
    else props.onSaveContent(fileName, content)
  }

  function applyContentEdit(result: { value: string; cursor: TextCursor }) {
    setContent(result.value)
    setContentCursor(result.cursor)
  }

  function runSelected(index = selected) {
    const item = openCodeMenuRows(menuGroups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind === "item") void startAction(item.item.id)
  }

  function runSelectedConfirm(index = confirmSelected) {
    const item = openCodeMenuRows(confirmGroups, "").find((row) => row.kind === "item" && row.itemIndex === index)
    if (item?.kind === "item") confirmPendingAction(item.item.id === "confirm")
  }

  useTuiInput((input, key) => {
    if (mode === "content") {
      if (key.ctrl && input.toLowerCase() === "x") {
        saveContent()
        return
      }
      if (matchesKeybind("cancel", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
        setMode("menu")
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
      return
    }

    if (mode === "agent") {
      if (matchesKeybind("cancel", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
        setMode("menu")
        setError(undefined)
        return
      }
      if (matchesKeybind("left", input, key, keybinds)) setAgentID((current) => moveEditableTextInput(current, "left"))
      else if (matchesKeybind("right", input, key, keybinds)) setAgentID((current) => moveEditableTextInput(current, "right"))
      else if (key.backspace) setAgentID(deleteEditableTextInputBackward)
      else if (key.delete) setAgentID(deleteEditableTextInputForward)
      else if (matchesKeybind("confirm", input, key, keybinds)) apply(agentID.value)
      else {
        setError(undefined)
        setAgentID((current) => insertEditableTextInput(current, input))
      }
      return
    }

    if (mode === "confirm") {
      const rows = openCodeMenuRows(confirmGroups, "")
      const count = rows.filter((row) => row.kind === "item").length
      if (matchesKeybind("cancel", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
        confirmPendingAction(false)
        return
      }
      if (matchesKeybind("up", input, key, keybinds)) setConfirmSelected((current) => (current === 0 ? Math.max(0, count - 1) : current - 1))
      if (matchesKeybind("down", input, key, keybinds)) setConfirmSelected((current) => (current === count - 1 ? 0 : current + 1))
      if (matchesKeybind("confirm", input, key, keybinds)) runSelectedConfirm()
      return
    }

    const rows = openCodeMenuRows(menuGroups, "")
    const count = rows.filter((row) => row.kind === "item").length
    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
      props.onBack()
      return
    }
    if (matchesKeybind("up", input, key, keybinds)) setSelected((current) => (current === 0 ? Math.max(0, count - 1) : current - 1))
    if (matchesKeybind("down", input, key, keybinds)) setSelected((current) => (current === count - 1 ? 0 : current + 1))
    if (matchesKeybind("confirm", input, key, keybinds)) runSelected()
  })

  if (mode === "content") {
    return (
      <OpenCodeTextArea
        title={t("prompt.title.editId", { id: promptTitle })}
        label={t("prompt.content")}
        value={content}
        cursor={contentCursor}
        error={error}
        hint={t("prompt.contentHint")}
        footer={[`${t("common.save")}\tctrl+x`, `${t("common.cancel")}\tesc`, `${t("prompt.newLine")}\tenter`]}
      />
    )
  }

  if (mode === "agent") {
    return (
      <OpenCodePrompt
        title={t("prompt.title.editId", { id: promptTitle })}
        label={t("prompt.agentId")}
        value={agentID.value}
        cursor={agentID.cursor}
        error={error}
        hint={t("prompt.agentHint")}
        footer={[`${t("common.save")}\tenter`, `${t("common.cancel")}\tesc`]}
      />
    )
  }

  if (mode === "confirm") {
    const isOverwrite = pendingAction === "apply-rules" || pendingAction === "switch-rule-profile"
    return (
      <OpenCodeMenu
        title={t(isOverwrite ? "prompt.unsavedRulesTitle" : "prompt.confirmDeleteTitle")}
        query=""
        rows={openCodeMenuRows(confirmGroups, "")}
        selectedIndex={confirmSelected}
        footer={[`${t("common.confirm")}\tenter`, `${t("common.cancel")}\tesc`]}
        emptyText={isOverwrite && overwriteRisk
          ? t("prompt.unsavedRulesWarning", { profileDir: overwriteRisk.profileDirectory, backupDir: overwriteRisk.backupDirectory })
          : t("prompt.confirmDeleteHint")}
      />
    )
  }

  return (
    <OpenCodeMenu
      title={t("prompt.title.editId", { id: promptTitle })}
      query=""
      rows={openCodeMenuRows(menuGroups, "")}
      selectedIndex={selected}
      footer={[`${t("common.open")}\tenter`, `${t("common.back")}\tesc`]}
      emptyText={error}
    />
  )
}
