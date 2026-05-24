import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { isRecord } from "./object-utils.js"
import type { ConfigTarget } from "./types.js"

export class PromptManagerError extends Error {}

export type PromptTemplate = {
  id: string
  title: string
  description: string
  fileName: string
  content: string
}

export type PromptFile = {
  id: string
  title: string
  description?: string
  directory: string
  fileName: string
  path: string
  ref: string
  activeAgents: string[]
  instructionRefs: string[]
}

export type RuleFile = {
  kind: "agents"
  scope: ConfigTarget["scope"]
  title: string
  fileName: string
  path: string
  exists: boolean
  description?: string
}

export type RuleProfile = {
  id: string
  title: string
  description?: string
  directory: string
  fileName: string
  path: string
  active: boolean
}

export type ConfigInstructionItem = {
  ref: string
  kind: "file" | "glob" | "remote"
  path?: string
  exists?: boolean
  editable: boolean
  title: string
  description?: string
}

export type AgentPromptAssignment = {
  agentID: string
  prompt?: string
}

export type PromptWriteResult = {
  action: "write" | "delete"
  changed: boolean
  dryRun: boolean
  path: string
  backupPath?: string
  preservedPath?: string
}

export type RuleOverwriteRisk = {
  risky: boolean
  rulesPath: string
  profileDirectory: string
  backupDirectory: string
}

export type PromptManagerOptions = {
  dryRun?: boolean
  backup?: boolean
  backupDirectory?: string
  now?: Date
}

const supportedPromptExtensions = new Set([".md", ".markdown", ".txt"])
const builtInAgentIDs = ["build", "plan", "general", "explore", "scout"]
const defaultPromptExtension = ".md"
const agentsFileName = "AGENTS.md"

export const defaultPromptTemplates: PromptTemplate[] = [
  {
    id: "build-focused",
    title: "Build focused",
    description: "Primary coding agent prompt for careful implementation work.",
    fileName: "build-focused.md",
    content: `You are the primary OpenCode implementation agent.

Work from the repository as it exists now. Read the relevant files before changing them, keep edits scoped to the requested outcome, and preserve user changes you did not make.

When implementation details are open, prefer existing project patterns over new abstractions. Make small, coherent changes and verify them with the closest meaningful command before reporting completion.
`,
  },
  {
    id: "plan-readonly",
    title: "Plan readonly",
    description: "Planning prompt for analysis before code changes.",
    fileName: "plan-readonly.md",
    content: `You are an OpenCode planning agent.

Analyze the request and the current codebase before proposing changes. Do not edit files unless the user explicitly asks you to move from planning into implementation.

Focus on requirements, affected modules, risks, and the shortest verification path. Ask only for information that blocks a correct plan.
`,
  },
  {
    id: "review-strict",
    title: "Review strict",
    description: "Code review prompt that prioritizes defects and missing verification.",
    fileName: "review-strict.md",
    content: `You are an OpenCode code reviewer.

Review changes for correctness, regressions, security issues, maintainability risks, and missing tests. Findings come first and should include concrete file and line references when available.

Avoid rewriting the implementation unless asked. If no issues are found, say that clearly and mention any residual verification gaps.
`,
  },
  {
    id: "explore-fast",
    title: "Explore fast",
    description: "Read-only codebase exploration prompt for focused answers.",
    fileName: "explore-fast.md",
    content: `You are an OpenCode exploration agent.

Answer by inspecting the codebase, not by guessing. Use fast search first, read only the files needed for the question, and return concise evidence with paths.

Do not modify files. If the answer is uncertain, state what evidence is missing and where to look next.
`,
  },
  {
    id: "small-model-concise",
    title: "Small model concise",
    description: "Compact prompt for smaller or local coding models.",
    fileName: "small-model-concise.md",
    content: `You are a concise coding agent.

Follow the user request exactly. Inspect relevant files, make minimal correct changes, and avoid broad refactors. Keep explanations short.

Before finishing, run the most relevant check available. If you cannot verify, state the reason.
`,
  },
]

function timestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

async function pathExists(filePath: string) {
  return stat(filePath)
    .then(() => true)
    .catch(() => false)
}

function backupPathFor(filePath: string, date: Date, directory?: string) {
  const backupFileName = `${path.basename(filePath)}.bak.${timestamp(date)}`
  return directory ? path.join(directory, backupFileName) : `${filePath}.bak.${timestamp(date)}`
}

async function availableBackupPath(filePath: string, date: Date, directory?: string) {
  const basePath = backupPathFor(filePath, date, directory)
  if (!(await pathExists(basePath))) return basePath

  let index = 1
  while (await pathExists(`${basePath}.${index}`)) index += 1
  return `${basePath}.${index}`
}

function sanitizePromptBaseName(value: string) {
  const base = value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}._-]/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
  if (!base) throw new PromptManagerError("Prompt name is required")
  return base
}

function normalizeExistingPromptLookup(value: string) {
  return path.basename(value.trim()).toLowerCase()
}

function isSupportedPromptFile(fileName: string) {
  return supportedPromptExtensions.has(path.extname(fileName).toLowerCase())
}

function titleFromFileName(fileName: string) {
  const base = path.basename(fileName, path.extname(fileName))
  return base
    .split(/[-_.]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ") || fileName
}

function extractPromptTitle(content: string, fileName: string) {
  const frontmatterName = frontmatterValue(content, "name")
  if (frontmatterName) return frontmatterName
  const heading = content.split(/\r?\n/).find((line) => /^#\s+\S/.test(line))
  if (heading) return heading.replace(/^#\s+/, "").trim()
  return titleFromFileName(fileName)
}

function frontmatterValue(content: string, key: string) {
  const lines = content.split(/\r?\n/)
  if (lines[0]?.trim() !== "---") return undefined
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? ""
    if (line === "---") break
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (match?.[1] === key) return match[2]?.replace(/^["']|["']$/g, "").trim()
  }
  return undefined
}

function extractPromptDescription(content: string) {
  const frontmatterDescription = frontmatterValue(content, "description")
  if (frontmatterDescription) return frontmatterDescription
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && line !== "---" && !line.startsWith("#") && !/^[A-Za-z0-9_-]+:\s*/.test(line))
}

export function normalizePromptFileName(value: string) {
  const raw = path.basename(value.trim())
  if (!raw) throw new PromptManagerError("Prompt name is required")
  const extension = path.extname(raw).toLowerCase()
  const base = sanitizePromptBaseName(extension ? raw.slice(0, -extension.length) : raw)
  const resolvedExtension = extension || defaultPromptExtension
  if (!supportedPromptExtensions.has(resolvedExtension)) {
    throw new PromptManagerError("Prompt file must use .md, .markdown, or .txt")
  }
  return `${base}${resolvedExtension}`
}

export function normalizeAgentID(value: string) {
  const agentID = value.trim()
  if (!agentID) throw new PromptManagerError("Agent ID is required")
  if (!/^[a-zA-Z0-9_.-]+$/.test(agentID)) throw new PromptManagerError("Agent ID can only contain letters, numbers, dots, underscores, and hyphens")
  return agentID
}

export function resolveOcfgDataDirectory(target: ConfigTarget) {
  return target.ocfgDataPath ?? process.env.OCFG_DATA_DIR ?? path.join(process.env.HOME || os.homedir(), ".config", "ocfg")
}

export function resolvePromptDirectory(target: ConfigTarget) {
  return path.join(resolveOcfgDataDirectory(target), "prompts")
}

export function resolveRuleProfileDirectory(target: ConfigTarget) {
  return path.join(resolveOcfgDataDirectory(target), "agents")
}

export function resolveRuleBackupDirectory(target: ConfigTarget) {
  return path.join(resolveOcfgDataDirectory(target), "backups", "agents")
}

export function promptRefForFile(fileName: string, target?: ConfigTarget) {
  const ref = target ? instructionRefForFile(target, promptFilePath(target, fileName)) : `./prompts/${normalizePromptFileName(fileName)}`
  return `{file:${ref}}`
}

export function instructionRefForPromptFile(fileName: string, target?: ConfigTarget) {
  return target ? instructionRefForFile(target, promptFilePath(target, fileName)) : `./prompts/${normalizePromptFileName(fileName)}`
}

export function promptFilePath(target: ConfigTarget, fileName: string) {
  return path.join(resolvePromptDirectory(target), normalizePromptFileName(fileName))
}

export function rulesFilePath(target: ConfigTarget) {
  return path.join(path.dirname(target.path), agentsFileName)
}

export function ruleProfilePath(target: ConfigTarget, fileName: string) {
  return path.join(resolveRuleProfileDirectory(target), normalizePromptFileName(fileName))
}

async function availableRuleProfileSnapshotPath(target: ConfigTarget, date: Date) {
  const directory = resolveRuleProfileDirectory(target)
  const baseName = `previous-agents-${timestamp(date)}`
  const basePath = path.join(directory, `${baseName}.md`)
  if (!(await pathExists(basePath))) return basePath

  let index = 1
  while (await pathExists(path.join(directory, `${baseName}-${index}.md`))) index += 1
  return path.join(directory, `${baseName}-${index}.md`)
}

function isRemoteInstructionRef(ref: string) {
  return /^https?:\/\//i.test(ref)
}

function hasGlobPattern(ref: string) {
  return /[*?[\]{}]/.test(ref)
}

function expandHome(filePath: string) {
  if (filePath === "~") return process.env.HOME ?? filePath
  if (filePath.startsWith("~/")) return path.join(process.env.HOME ?? "~", filePath.slice(2))
  return filePath
}

export function resolveInstructionRefPath(target: ConfigTarget, ref: string) {
  const expanded = expandHome(ref)
  if (path.isAbsolute(expanded)) return expanded
  return path.resolve(path.dirname(target.path), expanded)
}

export function instructionRefForFile(target: ConfigTarget, filePath: string) {
  const resolved = path.resolve(filePath)
  const relative = path.relative(path.dirname(target.path), resolved)
  return relative.startsWith("..") || path.isAbsolute(relative) ? resolved : relative.split(path.sep).join("/")
}

export function collectInstructionRefs(config: Record<string, unknown>): string[] {
  if (config.instructions === undefined) return []
  if (!Array.isArray(config.instructions)) throw new PromptManagerError("Top-level instructions config must be an array")
  return config.instructions.map((entry) => {
    if (typeof entry !== "string" || !entry.trim()) throw new PromptManagerError("Instruction entries must be non-empty strings")
    return entry
  })
}

export function collectAgentPromptAssignments(config: Record<string, unknown>): AgentPromptAssignment[] {
  const agentConfig = isRecord(config.agent) ? config.agent : {}
  const agentIDs = Array.from(new Set([...builtInAgentIDs, ...Object.keys(agentConfig)])).sort((left, right) => {
    const leftBuiltIn = builtInAgentIDs.indexOf(left)
    const rightBuiltIn = builtInAgentIDs.indexOf(right)
    if (leftBuiltIn !== -1 || rightBuiltIn !== -1) {
      if (leftBuiltIn === -1) return 1
      if (rightBuiltIn === -1) return -1
      return leftBuiltIn - rightBuiltIn
    }
    return left.localeCompare(right)
  })

  return agentIDs.map((agentID) => {
    const entry = agentConfig[agentID]
    return {
      agentID,
      prompt: isRecord(entry) && typeof entry.prompt === "string" ? entry.prompt : undefined,
    }
  })
}

export function activeAgentsForPrompt(config: Record<string, unknown>, promptRef: string) {
  return collectAgentPromptAssignments(config)
    .filter((assignment) => assignment.prompt === promptRef)
    .map((assignment) => assignment.agentID)
}

export function instructionRefsForPrompt(target: ConfigTarget, config: Record<string, unknown>, fileName: string) {
  const promptPath = promptFilePath(target, fileName)
  return collectInstructionRefs(config).filter((ref) => {
    if (isRemoteInstructionRef(ref) || hasGlobPattern(ref)) return false
    return path.resolve(resolveInstructionRefPath(target, ref)) === path.resolve(promptPath)
  })
}

export async function listRuleFiles(target: ConfigTarget): Promise<RuleFile[]> {
  const filePath = rulesFilePath(target)
  const exists = await pathExists(filePath)
  let description: string | undefined
  if (exists) {
    const content = await readFile(filePath, "utf8").catch(() => "")
    description = extractPromptDescription(content)
  }
  const scopeLabel = target.scope === "global" ? "Global" : target.scope === "project" ? "Project" : "Custom"
  return [{
    kind: "agents",
    scope: target.scope,
    title: `${scopeLabel} AGENTS.md`,
    fileName: agentsFileName,
    path: filePath,
    exists,
    description,
  }]
}

export async function listRuleProfiles(target: ConfigTarget): Promise<RuleProfile[]> {
  const directory = resolveRuleProfileDirectory(target)
  let entries: string[]
  try {
    entries = await readdir(directory)
  } catch {
    return []
  }

  const activeContent = await readRuleFile(target)
  const files = await Promise.all(entries
    .filter(isSupportedPromptFile)
    .sort((left, right) => left.localeCompare(right))
    .map(async (fileName): Promise<RuleProfile | undefined> => {
      const filePath = path.join(directory, fileName)
      const fileStat = await stat(filePath).catch(() => undefined)
      if (!fileStat?.isFile()) return undefined
      const content = await readFile(filePath, "utf8").catch(() => "")
      return {
        id: path.basename(fileName, path.extname(fileName)),
        title: extractPromptTitle(content, fileName),
        description: extractPromptDescription(content),
        directory,
        fileName,
        path: filePath,
        active: activeContent.length > 0 && content === activeContent,
      }
    }))

  return files.filter((file): file is RuleProfile => file !== undefined)
}

export async function listConfigInstructionItems(target: ConfigTarget, config: Record<string, unknown>): Promise<ConfigInstructionItem[]> {
  const refs = collectInstructionRefs(config)
  return Promise.all(refs.map(async (ref): Promise<ConfigInstructionItem> => {
    if (isRemoteInstructionRef(ref)) {
      return {
        ref,
        kind: "remote",
        editable: false,
        title: ref,
        description: "Remote instruction URL",
      }
    }

    if (hasGlobPattern(ref)) {
      return {
        ref,
        kind: "glob",
        path: resolveInstructionRefPath(target, ref),
        editable: false,
        title: ref,
        description: "Instruction glob pattern",
      }
    }

    const filePath = resolveInstructionRefPath(target, ref)
    const exists = await pathExists(filePath)
    let description: string | undefined
    if (exists) {
      const content = await readFile(filePath, "utf8").catch(() => "")
      description = extractPromptDescription(content)
    }
    return {
      ref,
      kind: "file",
      path: filePath,
      exists,
      editable: true,
      title: path.basename(ref),
      description,
    }
  }))
}

export async function listPromptFiles(target: ConfigTarget, config: Record<string, unknown> = {}): Promise<PromptFile[]> {
  const directory = resolvePromptDirectory(target)
  let entries: string[]
  try {
    entries = await readdir(directory)
  } catch {
    return []
  }

  const files = await Promise.all(entries
    .filter(isSupportedPromptFile)
    .sort((left, right) => left.localeCompare(right))
    .map(async (fileName): Promise<PromptFile | undefined> => {
      const filePath = path.join(directory, fileName)
      const fileStat = await stat(filePath).catch(() => undefined)
      if (!fileStat?.isFile()) return undefined
      const content = await readFile(filePath, "utf8").catch(() => "")
      const ref = promptRefForFile(fileName, target)
      return {
        id: path.basename(fileName, path.extname(fileName)),
        title: extractPromptTitle(content, fileName),
        description: extractPromptDescription(content),
        directory,
        fileName,
        path: filePath,
        ref,
        activeAgents: activeAgentsForPrompt(config, ref),
        instructionRefs: instructionRefsForPrompt(target, config, fileName),
      }
    }))

  return files.filter((file): file is PromptFile => file !== undefined)
}

export async function readPromptFile(target: ConfigTarget, value: string) {
  const fileName = await resolvePromptFileName(target, value)
  return readFile(promptFilePath(target, fileName), "utf8")
}

export async function readRuleFile(target: ConfigTarget) {
  return readFile(rulesFilePath(target), "utf8").catch(() => "")
}

export async function readRuleProfile(target: ConfigTarget, value: string) {
  const fileName = await resolveRuleProfileFileName(target, value)
  return readFile(ruleProfilePath(target, fileName), "utf8")
}

export async function readInstructionFile(item: ConfigInstructionItem) {
  if (!item.editable || !item.path) throw new PromptManagerError(`Instruction "${item.ref}" is not an editable local file`)
  return readFile(item.path, "utf8").catch(() => "")
}

export async function resolvePromptFileName(target: ConfigTarget, value: string) {
  const lookup = normalizeExistingPromptLookup(value)
  const normalized = normalizePromptFileName(value)
  const files = await listPromptFiles(target)
  const match = files.find((file) => {
    const id = file.id.toLowerCase()
    const fileName = file.fileName.toLowerCase()
    return fileName === lookup || fileName === normalized.toLowerCase() || id === lookup || id === path.basename(normalized, path.extname(normalized)).toLowerCase()
  })
  if (!match) throw new PromptManagerError(`Prompt "${value}" does not exist`)
  return match.fileName
}

export async function resolveRuleProfileFileName(target: ConfigTarget, value: string) {
  const lookup = normalizeExistingPromptLookup(value)
  const normalized = normalizePromptFileName(value)
  const files = await listRuleProfiles(target)
  const match = files.find((file) => {
    const id = file.id.toLowerCase()
    const fileName = file.fileName.toLowerCase()
    return fileName === lookup || fileName === normalized.toLowerCase() || id === lookup || id === path.basename(normalized, path.extname(normalized)).toLowerCase()
  })
  if (!match) throw new PromptManagerError(`AGENTS.md config "${value}" does not exist`)
  return match.fileName
}

export function findPromptTemplate(value: string) {
  const lookup = value.trim().toLowerCase()
  return defaultPromptTemplates.find((template) => template.id === lookup || template.fileName.toLowerCase() === lookup)
}

export async function writePromptFileSafely(target: ConfigTarget, value: string, content: string, options: PromptManagerOptions = {}): Promise<PromptWriteResult> {
  const fileName = normalizePromptFileName(value)
  const directory = resolvePromptDirectory(target)
  const targetPath = path.join(directory, fileName)
  const dryRun = options.dryRun ?? false
  const exists = await pathExists(targetPath)
  let backupPath: string | undefined

  if (dryRun) return { action: "write", changed: true, dryRun: true, path: targetPath }

  await mkdir(directory, { recursive: true })
  if (exists && (options.backup ?? true)) {
    backupPath = await availableBackupPath(targetPath, options.now ?? new Date())
    await writeFile(backupPath, await readFile(targetPath, "utf8"), "utf8")
  }

  const tempPath = path.join(directory, `.${fileName}.tmp-${process.pid}-${Date.now()}`)
  try {
    await writeFile(tempPath, content, "utf8")
    await rename(tempPath, targetPath)
  } catch (error) {
    await unlink(tempPath).catch(() => undefined)
    throw error
  }

  return { action: "write", changed: true, dryRun: false, path: targetPath, backupPath }
}

async function writeTextFileSafely(filePath: string, content: string, options: PromptManagerOptions = {}): Promise<PromptWriteResult> {
  const dryRun = options.dryRun ?? false
  const exists = await pathExists(filePath)
  let backupPath: string | undefined

  if (dryRun) return { action: "write", changed: true, dryRun: true, path: filePath }

  await mkdir(path.dirname(filePath), { recursive: true })
  if (exists && (options.backup ?? true)) {
    backupPath = await availableBackupPath(filePath, options.now ?? new Date(), options.backupDirectory)
    await mkdir(path.dirname(backupPath), { recursive: true })
    await writeFile(backupPath, await readFile(filePath, "utf8"), "utf8")
  }

  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`)
  try {
    await writeFile(tempPath, content, "utf8")
    await rename(tempPath, filePath)
  } catch (error) {
    await unlink(tempPath).catch(() => undefined)
    throw error
  }

  return { action: "write", changed: true, dryRun: false, path: filePath, backupPath }
}

async function deleteTextFileSafely(filePath: string, options: PromptManagerOptions = {}): Promise<PromptWriteResult> {
  const dryRun = options.dryRun ?? false
  let backupPath: string | undefined

  if (dryRun) return { action: "delete", changed: true, dryRun: true, path: filePath }

  if (options.backup ?? true) {
    backupPath = await availableBackupPath(filePath, options.now ?? new Date(), options.backupDirectory)
    await mkdir(path.dirname(backupPath), { recursive: true })
    await writeFile(backupPath, await readFile(filePath, "utf8"), "utf8")
  }

  await unlink(filePath)
  return { action: "delete", changed: true, dryRun: false, path: filePath, backupPath }
}

async function ruleProfileContentExists(target: ConfigTarget, content: string) {
  const directory = resolveRuleProfileDirectory(target)
  let entries: string[]
  try {
    entries = await readdir(directory)
  } catch {
    return false
  }

  for (const fileName of entries.filter(isSupportedPromptFile)) {
    const filePath = path.join(directory, fileName)
    const fileStat = await stat(filePath).catch(() => undefined)
    if (!fileStat?.isFile()) continue
    if (await readFile(filePath, "utf8").catch(() => undefined) === content) return true
  }
  return false
}

export async function assessRuleOverwriteRisk(target: ConfigTarget, nextContent?: string): Promise<RuleOverwriteRisk> {
  const risk = {
    risky: false,
    rulesPath: rulesFilePath(target),
    profileDirectory: resolveRuleProfileDirectory(target),
    backupDirectory: resolveRuleBackupDirectory(target),
  }
  if (!(await pathExists(risk.rulesPath))) return risk

  const content = await readFile(risk.rulesPath, "utf8")
  if (!content.trim()) return risk
  if (nextContent !== undefined && content === nextContent) return risk
  if (await ruleProfileContentExists(target, content)) return risk
  return { ...risk, risky: true }
}

async function preserveCurrentRuleProfile(target: ConfigTarget, nextContent: string | undefined, options: PromptManagerOptions = {}) {
  const filePath = rulesFilePath(target)
  if (!(await pathExists(filePath))) return undefined

  const content = await readFile(filePath, "utf8")
  if (!content.trim()) return undefined
  if (nextContent !== undefined && content === nextContent) return undefined
  if (await ruleProfileContentExists(target, content)) return undefined

  const preservedPath = await availableRuleProfileSnapshotPath(target, options.now ?? new Date())
  if (options.dryRun) return preservedPath

  await mkdir(path.dirname(preservedPath), { recursive: true })
  await writeFile(preservedPath, content, "utf8")
  return preservedPath
}

export async function writeRuleFileSafely(target: ConfigTarget, content: string, options: PromptManagerOptions = {}) {
  const now = options.now ?? new Date()
  const preservedPath = await preserveCurrentRuleProfile(target, content, { ...options, now })
  const result = await writeTextFileSafely(rulesFilePath(target), content, { backupDirectory: resolveRuleBackupDirectory(target), ...options, now })
  return { ...result, preservedPath }
}

export async function writeRuleProfileSafely(target: ConfigTarget, value: string, content: string, options: PromptManagerOptions = {}) {
  return writeTextFileSafely(ruleProfilePath(target, value), content, options)
}

export async function writeInstructionFileSafely(item: ConfigInstructionItem, content: string, options: PromptManagerOptions = {}) {
  if (!item.editable || !item.path) throw new PromptManagerError(`Instruction "${item.ref}" is not an editable local file`)
  return writeTextFileSafely(item.path, content, options)
}

export async function installPromptTemplate(target: ConfigTarget, templateID: string, options: PromptManagerOptions = {}) {
  const template = findPromptTemplate(templateID)
  if (!template) throw new PromptManagerError(`Prompt template "${templateID}" does not exist`)
  return writePromptFileSafely(target, template.fileName, template.content, options)
}

export async function deletePromptFileSafely(target: ConfigTarget, value: string, options: PromptManagerOptions = {}): Promise<PromptWriteResult> {
  const fileName = await resolvePromptFileName(target, value)
  const targetPath = promptFilePath(target, fileName)
  return deleteTextFileSafely(targetPath, options)
}

export async function deleteRuleFileSafely(target: ConfigTarget, options: PromptManagerOptions = {}): Promise<PromptWriteResult> {
  const targetPath = rulesFilePath(target)
  const now = options.now ?? new Date()
  const preservedPath = await preserveCurrentRuleProfile(target, undefined, { ...options, now })
  const result = await deleteTextFileSafely(targetPath, { backupDirectory: resolveRuleBackupDirectory(target), ...options, now })
  return { ...result, preservedPath }
}

export async function deleteRuleProfileSafely(target: ConfigTarget, value: string, options: PromptManagerOptions = {}): Promise<PromptWriteResult> {
  const fileName = await resolveRuleProfileFileName(target, value)
  const targetPath = ruleProfilePath(target, fileName)
  return deleteTextFileSafely(targetPath, options)
}

export function setAgentPrompt(config: Record<string, unknown>, agentIDInput: string, promptRef: string, options: { description?: string; mode?: "primary" | "subagent" } = {}) {
  const agentID = normalizeAgentID(agentIDInput)
  const next = structuredClone(config) as Record<string, unknown>
  if (!next.$schema) next.$schema = "https://opencode.ai/config.json"
  if (next.agent === undefined) next.agent = {}
  if (!isRecord(next.agent)) throw new PromptManagerError("Top-level agent config must be an object")

  const agents = next.agent
  const existing = agents[agentID]
  if (existing !== undefined && !isRecord(existing)) throw new PromptManagerError(`Agent "${agentID}" config must be an object`)
  const agent = existing ? { ...existing } : {}
  agent.prompt = promptRef
  if (!builtInAgentIDs.includes(agentID)) {
    if (options.description && agent.description === undefined) agent.description = options.description
    if (options.mode && agent.mode === undefined) agent.mode = options.mode
  }
  agents[agentID] = agent
  return next
}

export function clearAgentPrompt(config: Record<string, unknown>, agentIDInput: string) {
  const agentID = normalizeAgentID(agentIDInput)
  const next = structuredClone(config) as Record<string, unknown>
  if (!isRecord(next.agent)) return next
  const entry = next.agent[agentID]
  if (!isRecord(entry)) return next
  delete entry.prompt
  return next
}

export function removePromptReferences(config: Record<string, unknown>, promptRef: string, instructionRef?: string) {
  let next = structuredClone(config) as Record<string, unknown>
  const agentConfig = isRecord(next.agent) ? next.agent : undefined
  if (agentConfig) {
    for (const [agentID, entry] of Object.entries(agentConfig)) {
      if (isRecord(entry) && entry.prompt === promptRef) {
        next = clearAgentPrompt(next, agentID)
      }
    }
  }

  if (Array.isArray(next.instructions)) {
    const refsToRemove = new Set([promptRef, instructionRef].filter((entry): entry is string => Boolean(entry)))
    const filtered = next.instructions.filter((entry) => !refsToRemove.has(entry))
    if (filtered.length === 0) delete next.instructions
    else next.instructions = filtered
  }

  return next
}

export function addInstructionRef(config: Record<string, unknown>, ref: string) {
  const trimmed = ref.trim()
  if (!trimmed) throw new PromptManagerError("Instruction ref is required")
  const next = structuredClone(config) as Record<string, unknown>
  if (!next.$schema) next.$schema = "https://opencode.ai/config.json"
  const instructions = collectInstructionRefs(next)
  if (!instructions.includes(trimmed)) instructions.push(trimmed)
  next.instructions = instructions
  return next
}

export function removeInstructionRef(config: Record<string, unknown>, ref: string) {
  const next = structuredClone(config) as Record<string, unknown>
  const instructions = collectInstructionRefs(next).filter((entry) => entry !== ref)
  if (instructions.length === 0) delete next.instructions
  else next.instructions = instructions
  return next
}
