import React, { useEffect, useState, type Dispatch, type SetStateAction } from "react"
import { Text } from "ink"
import { collectPermissionAgentIDs, normalizePermissionAgentID, permissionActions, permissionKeys, permissionValueSummary, type BashPermissionPresetAction, type PermissionAction, type PermissionEdit, type PermissionKey, type PermissionScope, type PermissionValueSummary } from "../../core/permission-control.js"
import { locateConfig } from "../../core/config-locator.js"
import { readConfig } from "../../core/config-reader.js"
import { isRecord } from "../../core/object-utils.js"
import { useTuiText, type TuiTextKey } from "../i18n.js"
import { deleteEditableTextInputBackward, deleteEditableTextInputForward, editableTextInput, insertEditableTextInput, isBackwardDeleteInput, isForwardDeleteInput, moveEditableTextInput, useTuiInput } from "../input.js"
import { matchesKeybind, useTuiKeybinds } from "../keybinds.js"
import type { TuiConfigSelection } from "../types.js"
import { OpenCodeMenu, openCodeMenuRows, OpenCodePrompt, useDelayedLoading, type OpenCodeMenuGroup, type OpenCodeMenuItem } from "../ui.js"

type Mode = "scope" | "agent" | "custom-agent" | "permissions" | "action" | "bash-preset"
type PermissionActionChoice = PermissionAction | BashPermissionPresetAction | "restore"

const permissionLabelKeys: Record<PermissionKey, TuiTextKey> = {
  "*": "permission.key.all",
  read: "permission.key.read",
  list: "permission.key.list",
  edit: "permission.key.edit",
  glob: "permission.key.glob",
  grep: "permission.key.grep",
  bash: "permission.key.bash",
  task: "permission.key.task",
  skill: "permission.key.skill",
  lsp: "permission.key.lsp",
  todowrite: "permission.key.todowrite",
  question: "permission.key.question",
  webfetch: "permission.key.webfetch",
  websearch: "permission.key.websearch",
  external_directory: "permission.key.externalDirectory",
  doom_loop: "permission.key.doomLoop",
}

const permissionDetailKeys: Record<PermissionKey, TuiTextKey> = {
  "*": "permission.detail.all",
  read: "permission.detail.read",
  list: "permission.detail.list",
  edit: "permission.detail.edit",
  glob: "permission.detail.glob",
  grep: "permission.detail.grep",
  bash: "permission.detail.bash",
  task: "permission.detail.task",
  skill: "permission.detail.skill",
  lsp: "permission.detail.lsp",
  todowrite: "permission.detail.todowrite",
  question: "permission.detail.question",
  webfetch: "permission.detail.webfetch",
  websearch: "permission.detail.websearch",
  external_directory: "permission.detail.externalDirectory",
  doom_loop: "permission.detail.doomLoop",
}

function selectedItem(groups: OpenCodeMenuGroup[], index: number): OpenCodeMenuItem | undefined {
  const row = openCodeMenuRows(groups, "").find((entry) => entry.kind === "item" && entry.itemIndex === index)
  return row?.kind === "item" ? row.item : undefined
}

function actionText(action: PermissionAction, t: ReturnType<typeof useTuiText>) {
  return t(action === "allow" ? "permission.action.allow" : action === "ask" ? "permission.action.ask" : "permission.action.deny")
}

function summaryMeta(summary: PermissionValueSummary, t: ReturnType<typeof useTuiText>) {
  if (summary.kind === "default") return t("permission.default")
  if (summary.kind === "rules") return summary.source === "inherited" ? t("permission.inheritedRules") : t("permission.rules")
  const value = actionText(summary.action, t)
  if (summary.source === "direct") return value
  if (summary.source === "all") return t("permission.fromAll", { value })
  return t("permission.inherited", { value })
}

function scopeTitle(scope: PermissionScope | undefined, t: ReturnType<typeof useTuiText>) {
  if (!scope) return t("permission.title")
  return scope.type === "global" ? t("permission.global") : t("permission.agentTitle", { agent: scope.agentID })
}

function agentHasPermission(config: Record<string, unknown>, agentID: string) {
  const agents = isRecord(config.agent) ? config.agent : {}
  const agent = agents[agentID]
  return isRecord(agent) && agent.permission !== undefined
}

export function PermissionsScreen(props: {
  selection: TuiConfigSelection
  onReview: (edit: PermissionEdit) => void
  onBack: () => void
}) {
  const t = useTuiText()
  const keybinds = useTuiKeybinds()
  const [mode, setMode] = useState<Mode>("scope")
  const [configData, setConfigData] = useState<Record<string, unknown>>({})
  const [scope, setScope] = useState<PermissionScope>()
  const [activeKey, setActiveKey] = useState<PermissionKey>("*")
  const [scopeSelected, setScopeSelected] = useState(0)
  const [agentSelected, setAgentSelected] = useState(0)
  const [permissionSelected, setPermissionSelected] = useState(0)
  const [actionSelected, setActionSelected] = useState(0)
  const [bashPresetSelected, setBashPresetSelected] = useState(0)
  const [agentInput, setAgentInput] = useState(() => editableTextInput())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [promptError, setPromptError] = useState<string>()

  const scopeGroups: OpenCodeMenuGroup[] = [{
    title: t("permission.scope"),
    items: [
      { id: "global", label: t("permission.global"), detail: t("permission.globalDetail") },
      { id: "agent", label: t("permission.agent"), detail: t("permission.agentDetail") },
    ],
  }]
  const agentGroups: OpenCodeMenuGroup[] = [{
    title: t("permission.agent"),
    items: [
      ...collectPermissionAgentIDs(configData).map((agentID) => ({
        id: agentID,
        label: agentID,
        meta: agentHasPermission(configData, agentID) ? t("permission.configured") : undefined,
        detail: t("permission.agentItemDetail", { agent: agentID }),
      })),
      { id: "__custom", label: t("permission.customAgent"), detail: t("permission.customAgentDetail") },
    ],
  }]
  const permissionGroups: OpenCodeMenuGroup[] = scope ? [{
    title: scopeTitle(scope, t),
    items: permissionKeys.map((key) => ({
      id: key,
      label: t(permissionLabelKeys[key]),
      meta: summaryMeta(permissionValueSummary(configData, scope, key), t),
      detail: t(permissionDetailKeys[key]),
    })),
  }] : []
  const actionGroups: OpenCodeMenuGroup[] = [{
    title: t(permissionLabelKeys[activeKey]),
    items: [
      ...(activeKey === "bash" ? [{ id: "git-preset", label: t("permission.gitPreset.menu"), detail: t("permission.gitPreset.menuDetail") }] : []),
      ...permissionActions.map((action) => ({ id: action, label: actionText(action, t), detail: t(action === "allow" ? "permission.action.allowDetail" : action === "ask" ? "permission.action.askDetail" : "permission.action.denyDetail") })),
      { id: "restore", label: t("permission.restoreDefault"), detail: t("permission.restoreDefaultDetail") },
    ],
  }]
  const bashPresetGroups: OpenCodeMenuGroup[] = [{
    title: t("permission.gitPreset.menu"),
    items: [
      { id: "apply-git-sensitive-bash", label: t("permission.gitPreset.apply"), detail: t("permission.gitPreset.applyDetail") },
      { id: "cancel-git-sensitive-bash", label: t("permission.gitPreset.cancel"), detail: t("permission.gitPreset.cancelDetail") },
    ],
  }]

  function groupsForMode() {
    if (mode === "agent") return agentGroups
    if (mode === "permissions") return permissionGroups
    if (mode === "action") return actionGroups
    if (mode === "bash-preset") return bashPresetGroups
    return scopeGroups
  }

  function selectedForMode() {
    if (mode === "agent") return agentSelected
    if (mode === "permissions") return permissionSelected
    if (mode === "action") return actionSelected
    if (mode === "bash-preset") return bashPresetSelected
    return scopeSelected
  }

  function setSelectedForMode(): Dispatch<SetStateAction<number>> {
    if (mode === "agent") return setAgentSelected
    if (mode === "permissions") return setPermissionSelected
    if (mode === "action") return setActionSelected
    if (mode === "bash-preset") return setBashPresetSelected
    return setScopeSelected
  }

  function openPermissionList(nextScope: PermissionScope) {
    setScope(nextScope)
    setPermissionSelected(0)
    setMode("permissions")
  }

  function reviewChoice(choice: PermissionActionChoice) {
    if (!scope) return
    if (choice === "apply-git-sensitive-bash" || choice === "cancel-git-sensitive-bash") {
      props.onReview({ scope, key: activeKey, preset: choice })
      return
    }
    props.onReview({ scope, key: activeKey, action: choice === "restore" ? undefined : choice })
  }

  function restoreSelectedPermission() {
    if (!scope) return
    const item = selectedItem(permissionGroups, permissionSelected)
    if (!item) return
    props.onReview({ scope, key: item.id as PermissionKey })
  }

  function runSelected(index = selectedForMode()) {
    const item = selectedItem(groupsForMode(), index)
    if (!item) return
    if (mode === "scope") {
      if (item.id === "global") openPermissionList({ type: "global" })
      else {
        setAgentSelected(0)
        setMode("agent")
      }
      return
    }
    if (mode === "agent") {
      if (item.id === "__custom") {
        setAgentInput(editableTextInput())
        setPromptError(undefined)
        setMode("custom-agent")
        return
      }
      openPermissionList({ type: "agent", agentID: item.id })
      return
    }
    if (mode === "permissions") {
      setActiveKey(item.id as PermissionKey)
      setActionSelected(0)
      setMode("action")
      return
    }
    if (mode === "action" && item.id === "git-preset") {
      setBashPresetSelected(0)
      setMode("bash-preset")
      return
    }
    reviewChoice(item.id as PermissionActionChoice)
  }

  function saveCustomAgent() {
    try {
      openPermissionList({ type: "agent", agentID: normalizePermissionAgentID(agentInput.value) })
      setPromptError(undefined)
    } catch (caught) {
      setPromptError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError(undefined)
      try {
        const target = props.selection.target ?? locateConfig({ scope: props.selection.scope })
        const document = await readConfig(target)
        if (!active) return
        if (document.diagnostics.length > 0) throw new Error(document.diagnostics.map((diagnostic) => diagnostic.message).join("\n"))
        setConfigData(document.data)
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

  useTuiInput((input, key) => {
    if (mode === "custom-agent") {
      if (matchesKeybind("cancel", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
        setMode("agent")
        setPromptError(undefined)
        return
      }
      if (matchesKeybind("left", input, key, keybinds)) setAgentInput((current) => moveEditableTextInput(current, "left"))
      else if (matchesKeybind("right", input, key, keybinds)) setAgentInput((current) => moveEditableTextInput(current, "right"))
      else if (isBackwardDeleteInput(input, key)) setAgentInput(deleteEditableTextInputBackward)
      else if (isForwardDeleteInput(input, key)) setAgentInput(deleteEditableTextInputForward)
      else if (matchesKeybind("confirm", input, key, keybinds)) saveCustomAgent()
      else {
        setPromptError(undefined)
        setAgentInput((current) => insertEditableTextInput(current, input))
      }
      return
    }

    if (matchesKeybind("quit", input, key, keybinds) || matchesKeybind("back", input, key, keybinds)) {
      if (mode === "bash-preset") setMode("action")
      else if (mode === "action") setMode("permissions")
      else if (mode === "permissions") setMode(scope?.type === "agent" ? "agent" : "scope")
      else if (mode === "agent") setMode("scope")
      else props.onBack()
      return
    }
    if (loading || error) return
    if (mode === "permissions" && matchesKeybind("restore", input, key, keybinds)) {
      restoreSelectedPermission()
      return
    }

    const groups = groupsForMode()
    const count = openCodeMenuRows(groups, "").filter((row) => row.kind === "item").length
    const setSelected = setSelectedForMode()
    if (matchesKeybind("up", input, key, keybinds)) setSelected((current) => (current === 0 ? Math.max(0, count - 1) : current - 1))
    if (matchesKeybind("down", input, key, keybinds)) setSelected((current) => (current === count - 1 ? 0 : current + 1))
    if (matchesKeybind("confirm", input, key, keybinds)) runSelected()
  })

  const showLoading = useDelayedLoading(loading)

  if (loading) return showLoading ? <Text>{t("permission.loading")}</Text> : null
  if (error) return <Text color="red">{t("permission.failed", { message: error })}</Text>

  if (mode === "custom-agent") {
    return (
      <OpenCodePrompt
        title={t("permission.customAgent")}
        label={t("permission.agentId")}
        value={agentInput.value}
        cursor={agentInput.cursor}
        error={promptError}
        hint={t("permission.agentIdHint")}
        footer={[`${t("common.continue")}\tenter`, `${t("common.cancel")}\tesc`]}
      />
    )
  }

  return (
    <OpenCodeMenu
      title={mode === "bash-preset" ? t("permission.gitPreset.menu") : mode === "permissions" || mode === "action" ? scopeTitle(scope, t) : t("permission.title")}
      query=""
      rows={openCodeMenuRows(groupsForMode(), "")}
      selectedIndex={selectedForMode()}
      footer={mode === "permissions" ? [`${t("common.open")}\tenter`, `${t("permission.restoreDefault")}\tr`, `${t("common.back")}\tesc`] : [`${t("common.open")}\tenter`, `${t("common.back")}\tesc`]}
    />
  )
}
