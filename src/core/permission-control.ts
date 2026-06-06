import { applyConfigEdit, applyConfigEdits } from "./jsonc-editor.js"
import { isRecord } from "./object-utils.js"
import type { ConfigDocument } from "./types.js"

const OPENCODE_SCHEMA = "https://opencode.ai/config.json"

export const permissionActions = ["allow", "ask", "deny"] as const
export type PermissionAction = typeof permissionActions[number]

export const permissionKeys = [
  "*",
  "read",
  "list",
  "edit",
  "glob",
  "grep",
  "bash",
  "task",
  "skill",
  "lsp",
  "todowrite",
  "question",
  "webfetch",
  "websearch",
  "external_directory",
  "doom_loop",
] as const
export type PermissionKey = typeof permissionKeys[number]

export const builtInPermissionAgentIDs = ["build", "plan", "general", "explore", "title", "summary", "compaction", "scout"] as const

export const gitSensitiveBashRules = {
  "*": "ask",
  "git status*": "allow",
  "git diff*": "allow",
  "git log*": "allow",
  "git show*": "allow",
  "git branch": "allow",
  "git commit*": "ask",
  "git push*": "ask",
  "git push --force*": "deny",
  "git push --force-with-lease*": "ask",
  "git reset --hard*": "deny",
} satisfies Record<string, PermissionAction>

const legacyGitSensitiveBashRuleKeys = ["git branch*"]

export type BashPermissionPresetAction = "apply-git-sensitive-bash" | "cancel-git-sensitive-bash"

export type PermissionScope =
  | { type: "global" }
  | { type: "agent"; agentID: string }

export type PermissionValueSummary =
  | { kind: "action"; action: PermissionAction; source: "direct" | "all" | "inherited" }
  | { kind: "rules"; source: "direct" | "inherited" }
  | { kind: "default" }

export type PermissionEdit = {
  scope: PermissionScope
  key: PermissionKey
  action?: PermissionAction
  preset?: BashPermissionPresetAction
}

function isPermissionAction(value: unknown): value is PermissionAction {
  return permissionActions.includes(value as PermissionAction)
}

function sameJSON(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function isEmptyRecord(value: Record<string, unknown>) {
  return Object.keys(value).length === 0
}

function permissionObjectForSet(permission: unknown): Record<string, unknown> {
  if (isRecord(permission)) return { ...permission }
  if (isPermissionAction(permission)) return { "*": permission }
  return {}
}

function applyGitSensitiveBashRules(permission: unknown): Record<string, unknown> {
  const next = permissionObjectForSet(permission)
  const bash = isRecord(next.bash) ? { ...next.bash } : {}
  for (const key of [...Object.keys(gitSensitiveBashRules), ...legacyGitSensitiveBashRuleKeys]) delete bash[key]
  next.bash = {
    ...bash,
    ...gitSensitiveBashRules,
  }
  return next
}

function cancelGitSensitiveBashRules(permission: unknown): unknown {
  if (!isRecord(permission)) return permission
  if (!isRecord(permission.bash)) return permission

  const next = { ...permission }
  const bash = { ...permission.bash }
  for (const key of [...Object.keys(gitSensitiveBashRules), ...legacyGitSensitiveBashRuleKeys]) delete bash[key]
  if (isEmptyRecord(bash)) delete next.bash
  else next.bash = bash
  return next
}

function setGlobalPermission(next: Record<string, unknown>, permission: unknown) {
  if (isRecord(permission) && isEmptyRecord(permission)) delete next.permission
  else if (permission === undefined) delete next.permission
  else next.permission = permission
}

function setAgentPermission(next: Record<string, unknown>, agentID: string, permission: unknown) {
  if (next.agent === undefined) next.agent = {}
  if (!isRecord(next.agent)) throw new Error("Top-level agent config must be an object")
  const existing = next.agent[agentID]
  if (existing !== undefined && !isRecord(existing)) throw new Error(`Agent "${agentID}" config must be an object`)
  const agent = existing ? { ...existing } : {}
  if (isRecord(permission) && isEmptyRecord(permission)) delete agent.permission
  else if (permission === undefined) delete agent.permission
  else agent.permission = permission
  next.agent[agentID] = agent
  cleanupAgentPermission(next, agentID)
}

function summarizePermissionValue(permission: unknown, key: PermissionKey): PermissionValueSummary {
  if (isPermissionAction(permission)) return { kind: "action", action: permission, source: key === "*" ? "direct" : "all" }
  if (!isRecord(permission)) return { kind: "default" }

  const direct = permission[key]
  if (isPermissionAction(direct)) return { kind: "action", action: direct, source: "direct" }
  if (isRecord(direct)) return { kind: "rules", source: "direct" }

  const all = permission["*"]
  if (key !== "*" && isPermissionAction(all)) return { kind: "action", action: all, source: "all" }
  return { kind: "default" }
}

function inheritedSummary(summary: PermissionValueSummary): PermissionValueSummary {
  if (summary.kind === "action") return { kind: "action", action: summary.action, source: "inherited" }
  if (summary.kind === "rules") return { kind: "rules", source: "inherited" }
  return summary
}

function agentConfig(config: Record<string, unknown>, agentID: string) {
  const agents = isRecord(config.agent) ? config.agent : {}
  const agent = agents[agentID]
  return isRecord(agent) ? agent : undefined
}

function permissionAtScope(config: Record<string, unknown>, scope: PermissionScope) {
  if (scope.type === "global") return config.permission
  return agentConfig(config, scope.agentID)?.permission
}

function permissionPath(scope: PermissionScope): (string | number)[] {
  return scope.type === "global" ? ["permission"] : ["agent", scope.agentID, "permission"]
}

function applyNestedRecordEdit(document: ConfigDocument, basePath: (string | number)[], before: Record<string, unknown>, after: Record<string, unknown>) {
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
  const changes = keys
    .filter((key) => !sameJSON(before[key], after[key]))
    .map((key) => ({ path: [...basePath, key], value: after[key] }))
  return changes.length > 0 ? applyConfigEdits(document, changes) : document.text || "{}\n"
}

function cleanupAgentPermission(next: Record<string, unknown>, agentID: string) {
  if (!isRecord(next.agent)) return
  const agent = next.agent[agentID]
  if (isRecord(agent) && isEmptyRecord(agent)) delete next.agent[agentID]
  if (isEmptyRecord(next.agent)) delete next.agent
}

export function normalizePermissionAgentID(value: string) {
  const agentID = value.trim()
  if (!agentID) throw new Error("Agent ID is required")
  if (!/^[a-zA-Z0-9_.-]+$/.test(agentID)) throw new Error("Agent ID can only contain letters, numbers, dots, underscores, and hyphens")
  return agentID
}

export function collectPermissionAgentIDs(config: Record<string, unknown>) {
  const configured = isRecord(config.agent) ? Object.keys(config.agent) : []
  const all = Array.from(new Set([...builtInPermissionAgentIDs, ...configured]))
  return all.sort((left, right) => {
    const leftBuiltIn = builtInPermissionAgentIDs.indexOf(left as typeof builtInPermissionAgentIDs[number])
    const rightBuiltIn = builtInPermissionAgentIDs.indexOf(right as typeof builtInPermissionAgentIDs[number])
    if (leftBuiltIn !== -1 || rightBuiltIn !== -1) {
      if (leftBuiltIn === -1) return 1
      if (rightBuiltIn === -1) return -1
      return leftBuiltIn - rightBuiltIn
    }
    return left.localeCompare(right)
  })
}

export function permissionValueSummary(config: Record<string, unknown>, scope: PermissionScope, key: PermissionKey): PermissionValueSummary {
  const local = summarizePermissionValue(permissionAtScope(config, scope), key)
  if (scope.type === "global" || local.kind !== "default") return local

  const inherited = summarizePermissionValue(config.permission, key)
  return inherited.kind === "default" ? inherited : inheritedSummary(inherited)
}

export function applyPermissionEdit(config: Record<string, unknown>, edit: PermissionEdit): Record<string, unknown> {
  const next = structuredClone(config) as Record<string, unknown>

  if (edit.preset !== undefined) {
    if (edit.key !== "bash") throw new Error("Bash permission presets can only be applied to bash")
    if (edit.preset === "apply-git-sensitive-bash") {
      if (!next.$schema) next.$schema = OPENCODE_SCHEMA
      if (edit.scope.type === "global") setGlobalPermission(next, applyGitSensitiveBashRules(next.permission))
      else setAgentPermission(next, edit.scope.agentID, applyGitSensitiveBashRules(agentConfig(next, edit.scope.agentID)?.permission))
      return next
    }

    if (edit.scope.type === "global") setGlobalPermission(next, cancelGitSensitiveBashRules(next.permission))
    else {
      const agent = agentConfig(next, edit.scope.agentID)
      if (agent) setAgentPermission(next, edit.scope.agentID, cancelGitSensitiveBashRules(agent.permission))
    }
    return next
  }

  if (edit.action !== undefined) {
    if (!next.$schema) next.$schema = OPENCODE_SCHEMA
    if (edit.scope.type === "global") {
      const permission = permissionObjectForSet(next.permission)
      permission[edit.key] = edit.action
      next.permission = permission
      return next
    }

    if (next.agent === undefined) next.agent = {}
    if (!isRecord(next.agent)) throw new Error("Top-level agent config must be an object")
    const existing = next.agent[edit.scope.agentID]
    if (existing !== undefined && !isRecord(existing)) throw new Error(`Agent "${edit.scope.agentID}" config must be an object`)
    const agent = existing ? { ...existing } : {}
    const permission = permissionObjectForSet(agent.permission)
    permission[edit.key] = edit.action
    agent.permission = permission
    next.agent[edit.scope.agentID] = agent
    return next
  }

  if (edit.scope.type === "global") {
    if (isPermissionAction(next.permission)) {
      if (edit.key === "*") delete next.permission
      return next
    }
    if (!isRecord(next.permission)) return next
    delete next.permission[edit.key]
    if (isEmptyRecord(next.permission)) delete next.permission
    return next
  }

  if (!isRecord(next.agent)) return next
  const agent = next.agent[edit.scope.agentID]
  if (!isRecord(agent)) return next
  if (isPermissionAction(agent.permission)) {
    if (edit.key === "*") delete agent.permission
    cleanupAgentPermission(next, edit.scope.agentID)
    return next
  }
  if (!isRecord(agent.permission)) return next
  delete agent.permission[edit.key]
  if (isEmptyRecord(agent.permission)) delete agent.permission
  cleanupAgentPermission(next, edit.scope.agentID)
  return next
}

export function applyPermissionText(document: ConfigDocument, edit: PermissionEdit, nextConfig: Record<string, unknown>): string {
  let nextText = document.text || "{}\n"
  if (nextConfig.$schema !== undefined && (!document.target.exists || document.data.$schema !== nextConfig.$schema)) {
    nextText = applyConfigEdit({ ...document, text: nextText }, ["$schema"], nextConfig.$schema)
  }

  const currentDocument = { ...document, text: nextText }
  if (edit.scope.type === "global") {
    const before = document.data.permission
    const after = nextConfig.permission
    if (sameJSON(before, after)) return nextText
    if (isRecord(before) && isRecord(after)) {
      const beforeValue = before[edit.key]
      const afterValue = after[edit.key]
      if (isRecord(beforeValue) && isRecord(afterValue)) return applyNestedRecordEdit(currentDocument, ["permission", edit.key], beforeValue, afterValue)
      return applyConfigEdit(currentDocument, ["permission", edit.key], afterValue)
    }
    return applyConfigEdit(currentDocument, ["permission"], after)
  }

  const beforeAgents = isRecord(document.data.agent) ? document.data.agent : undefined
  const afterAgents = isRecord(nextConfig.agent) ? nextConfig.agent : undefined
  if (sameJSON(beforeAgents, afterAgents)) return nextText
  if (!afterAgents) return applyConfigEdit(currentDocument, ["agent"], undefined)

  const beforeAgent = beforeAgents?.[edit.scope.agentID]
  const afterAgent = afterAgents[edit.scope.agentID]
  if (afterAgent === undefined) return applyConfigEdit(currentDocument, ["agent", edit.scope.agentID], undefined)
  if (!isRecord(beforeAgent) || !isRecord(afterAgent)) return applyConfigEdit(currentDocument, ["agent", edit.scope.agentID], afterAgent)

  const before = beforeAgent.permission
  const after = afterAgent.permission
  if (sameJSON(before, after)) return nextText
  if (isRecord(before) && isRecord(after)) {
    const path = [...permissionPath(edit.scope), edit.key]
    const beforeValue = before[edit.key]
    const afterValue = after[edit.key]
    if (isRecord(beforeValue) && isRecord(afterValue)) return applyNestedRecordEdit(currentDocument, path, beforeValue, afterValue)
    return applyConfigEdit(currentDocument, path, afterValue)
  }
  return applyConfigEdit(currentDocument, permissionPath(edit.scope), after)
}
