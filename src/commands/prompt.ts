import { readFile } from "node:fs/promises"
import path from "node:path"
import { applyConfigEdits } from "../core/jsonc-editor.js"
import {
  addInstructionRef,
  assessRuleOverwriteRisk,
  defaultPromptTemplates,
  deletePromptFileSafely,
  deleteRuleProfileSafely,
  deleteRuleFileSafely,
  findPromptTemplate,
  installPromptTemplate,
  instructionRefForPromptFile,
  listConfigInstructionItems,
  listPromptFiles,
  listRuleProfiles,
  listRuleFiles,
  normalizePromptFileName,
  promptRefForFile,
  readPromptFile,
  readRuleProfile,
  removeInstructionRef,
  removePromptReferences,
  resolvePromptFileName,
  resolveRuleProfileFileName,
  setAgentPrompt,
  writeRuleFileSafely,
  writeRuleProfileSafely,
  writePromptFileSafely,
  type PromptWriteResult,
  type RuleOverwriteRisk,
} from "../core/prompt-manager.js"
import {
  loadConfigForCommand,
  validateForWrite,
  writeMutation,
  type ConfigCommandOptions,
  type MutatingCommandOptions,
} from "./common.js"

export type PromptCommandOptions = MutatingCommandOptions & {
  content?: string
  contentFile?: string
  template?: string
  agent?: string
  globalInstructions?: boolean
  rules?: boolean
}

function resolveUserPath(filePath: string, options: ConfigCommandOptions) {
  const home = options.home ?? process.env.HOME
  const expanded = home && (filePath === "~" || filePath.startsWith("~/")) ? path.join(home, filePath === "~" ? "" : filePath.slice(2)) : filePath
  return path.isAbsolute(expanded) ? expanded : path.resolve(options.cwd ?? process.cwd(), expanded)
}

async function readContentFromOptions(options: PromptCommandOptions, fallback?: string) {
  if (options.content !== undefined && options.contentFile !== undefined) throw new Error("Use either --content or --content-file, not both")
  if (options.contentFile !== undefined) return readFile(resolveUserPath(options.contentFile, options), "utf8")
  if (options.content !== undefined) return options.content
  if (options.template !== undefined) {
    const template = findPromptTemplate(options.template)
    if (!template) throw new Error(`Prompt template "${options.template}" does not exist`)
    return template.content
  }
  if (fallback !== undefined) return fallback
  throw new Error("Prompt content is required. Use --content, --content-file, or --template")
}

function promptSkeleton(name: string) {
  return `# ${name}

Describe how this OpenCode agent should behave.
`
}

function ruleProfileSkeleton(name: string) {
  return `---
name: ${name}
description: OpenCode global AGENTS.md rules.
---

# ${name}

Describe the global OpenCode behavior, tone, workflow, and project rules.
`
}

function promptResultPayload(result: PromptWriteResult) {
  return {
    action: result.action,
    changed: result.changed,
    dryRun: result.dryRun,
    path: result.path,
    backupPath: result.backupPath,
    preservedPath: result.preservedPath,
  }
}

function printPromptWriteResult(result: PromptWriteResult, json = false) {
  if (json) {
    console.log(JSON.stringify(promptResultPayload(result), null, 2))
    return
  }

  if (result.dryRun) {
    console.log(`Dry run ${result.action} prompt: ${result.path}`)
    return
  }

  const action = result.action === "delete" ? "Deleted" : "Wrote"
  console.log(`${action} prompt: ${result.path}`)
  if (result.preservedPath) console.log(`Saved previous AGENTS.md config: ${result.preservedPath}`)
  if (result.backupPath) console.log(`Backup: ${result.backupPath}`)
}

function printRuleOverwriteRiskWarning(risk: RuleOverwriteRisk, json = false) {
  if (!risk.risky || json) return
  console.warn([
    "WARNING: current AGENTS.md is not saved in ocfg before replacement.",
    `Current AGENTS.md: ${risk.rulesPath}`,
    `ocfg will save a reusable copy under: ${risk.profileDirectory}`,
    `A timestamped backup can be found under: ${risk.backupDirectory}`,
  ].join("\n"))
}

function sameJSON(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function promptConfigText(document: Awaited<ReturnType<typeof loadConfigForCommand>>["document"], nextConfig: Record<string, unknown>) {
  const changes: { path: (string | number)[]; value: unknown }[] = []
  if (!sameJSON(document.data.agent, nextConfig.agent)) changes.push({ path: ["agent"], value: nextConfig.agent })
  if (!sameJSON(document.data.instructions, nextConfig.instructions)) changes.push({ path: ["instructions"], value: nextConfig.instructions })
  return changes.length > 0 ? applyConfigEdits(document, changes) : document.text || "{}\n"
}

async function preparePromptSelection(
  document: Awaited<ReturnType<typeof loadConfigForCommand>>["document"],
  target: Awaited<ReturnType<typeof loadConfigForCommand>>["target"],
  fileName: string,
  options: PromptCommandOptions,
) {
  const nextConfig = options.globalInstructions
    ? addInstructionRef(document.data, instructionRefForPromptFile(fileName, target))
    : setAgentPrompt(document.data, options.agent!, promptRefForFile(fileName, target), {
      description: `Uses ${fileName}`,
      mode: "primary",
    })
  const nextText = promptConfigText(document, nextConfig)
  const validation = await validateForWrite(nextConfig, options.validate)
  const validatedOptions = { ...options, validate: () => validation }
  return { nextConfig, nextText, validation, validatedOptions }
}

export async function listPromptsCommand(options: ConfigCommandOptions) {
  const { target, document } = await loadConfigForCommand(options)
  const rules = await listRuleFiles(target)
  const ruleProfiles = await listRuleProfiles(target)
  const instructions = await listConfigInstructionItems(target, document.data)
  const prompts = await listPromptFiles(target, document.data)

  if (options.json) {
    console.log(JSON.stringify({ target, rules, ruleProfiles, instructions, prompts, templates: defaultPromptTemplates }, null, 2))
    return
  }

  console.log(`Listing ${target.scope} prompts: ${target.path}${target.exists ? "" : " (missing; not created)"}`)
  console.log("rules:")
  for (const rule of rules) console.log(`- ${rule.title}: ${rule.path}${rule.exists ? "" : " (missing)"}`)
  if (ruleProfiles.length > 0) {
    console.log("AGENTS.md configs:")
    for (const profile of ruleProfiles) console.log(`- ${profile.fileName}${profile.active ? " (current)" : ""}`)
  }
  if (instructions.length > 0) {
    console.log("config instructions:")
    for (const instruction of instructions) {
      const suffix = instruction.kind === "file" ? instruction.exists ? "" : " (missing)" : ` (${instruction.kind})`
      console.log(`- ${instruction.ref}${suffix}`)
    }
  }
  if (prompts.length === 0) console.log("No prompt files installed.")
  if (prompts.length > 0) {
    console.log("prompt files:")
    for (const prompt of prompts) {
      const usage = [
        prompt.instructionRefs.length > 0 ? "global" : undefined,
        prompt.activeAgents.length > 0 ? `active: ${prompt.activeAgents.join(", ")}` : undefined,
      ].filter(Boolean).join(", ")
      console.log(`- ${prompt.fileName}${usage ? ` (${usage})` : ""}`)
    }
  }
  console.log("Default templates:")
  for (const template of defaultPromptTemplates) console.log(`- ${template.id}: ${template.description}`)
}

export async function addPromptCommand(name: string, options: PromptCommandOptions) {
  const { target, document } = await loadConfigForCommand(options)
  const content = await readContentFromOptions(options, promptSkeleton(name))

  if (!options.agent && !options.globalInstructions) {
    const promptResult = await writePromptFileSafely(target, name, content, { dryRun: options.dryRun })
    printPromptWriteResult(promptResult, options.json)
    return promptResult
  }

  const fileName = normalizePromptFileName(name)
  const { nextConfig, nextText, validation, validatedOptions } = await preparePromptSelection(document, target, fileName, options)
  if (!validation.valid) return writeMutation({ document, options: validatedOptions, nextConfig, nextText })

  const promptResult = await writePromptFileSafely(target, fileName, content, { dryRun: options.dryRun })
  if (!options.json) printPromptWriteResult(promptResult)
  return writeMutation({ document, options: validatedOptions, nextConfig, nextText })
}

export async function editPromptCommand(name: string, options: PromptCommandOptions) {
  const { target } = await loadConfigForCommand(options)
  const fileName = await resolvePromptFileName(target, name)
  const content = await readContentFromOptions(options)
  const result = await writePromptFileSafely(target, fileName, content, { dryRun: options.dryRun })
  printPromptWriteResult(result, options.json)
  return result
}

export async function addRuleProfileCommand(name: string, options: PromptCommandOptions) {
  const { target } = await loadConfigForCommand(options)
  const content = await readContentFromOptions(options, ruleProfileSkeleton(name))
  const result = await writeRuleProfileSafely(target, name, content, { dryRun: options.dryRun })
  printPromptWriteResult(result, options.json)
  return result
}

export async function editRuleProfileCommand(name: string, options: PromptCommandOptions) {
  const { target } = await loadConfigForCommand(options)
  const fileName = await resolveRuleProfileFileName(target, name)
  const content = await readContentFromOptions(options)
  const result = await writeRuleProfileSafely(target, fileName, content, { dryRun: options.dryRun })
  printPromptWriteResult(result, options.json)
  return result
}

export async function switchRuleProfileCommand(name: string, options: PromptCommandOptions) {
  const { target } = await loadConfigForCommand(options)
  const content = await readRuleProfile(target, name)
  printRuleOverwriteRiskWarning(await assessRuleOverwriteRisk(target, content), options.json)
  const result = await writeRuleFileSafely(target, content, { dryRun: options.dryRun })
  printPromptWriteResult(result, options.json)
  return result
}

export async function deleteRuleProfileCommand(name: string, options: PromptCommandOptions) {
  const { target } = await loadConfigForCommand(options)
  const result = await deleteRuleProfileSafely(target, name, { dryRun: options.dryRun })
  printPromptWriteResult(result, options.json)
  return result
}

export async function switchPromptCommand(name: string, options: PromptCommandOptions) {
  const targetCount = [options.agent, options.globalInstructions, options.rules].filter(Boolean).length
  if (targetCount === 0) throw new Error("--agent, --global-instructions, or --rules is required")
  if (targetCount > 1) throw new Error("Use only one of --agent, --global-instructions, or --rules")
  const { target, document } = await loadConfigForCommand(options)
  let fileName: string
  let templateID: string | undefined
  let templateContent: string | undefined
  try {
    fileName = await resolvePromptFileName(target, name)
  } catch (caught) {
    const template = findPromptTemplate(name)
    if (!template) throw caught
    fileName = template.fileName
    templateID = template.id
    templateContent = template.content
  }

  if (options.rules) {
    const content = templateContent ?? await readPromptFile(target, fileName)
    printRuleOverwriteRiskWarning(await assessRuleOverwriteRisk(target, content), options.json)
    const result = await writeRuleFileSafely(target, content, { dryRun: options.dryRun })
    printPromptWriteResult(result, options.json)
    return result
  }

  const { nextConfig, nextText, validation, validatedOptions } = await preparePromptSelection(document, target, fileName, options)
  if (!validation.valid) return writeMutation({ document, options: validatedOptions, nextConfig, nextText })
  if (templateID) await installPromptTemplate(target, templateID, { dryRun: options.dryRun, backup: false })
  return writeMutation({ document, options: validatedOptions, nextConfig, nextText })
}

export async function editRulesCommand(options: PromptCommandOptions) {
  const { target } = await loadConfigForCommand(options)
  const content = await readContentFromOptions(options)
  printRuleOverwriteRiskWarning(await assessRuleOverwriteRisk(target, content), options.json)
  const result = await writeRuleFileSafely(target, content, { dryRun: options.dryRun })
  printPromptWriteResult(result, options.json)
  return result
}

export async function deleteRulesCommand(options: PromptCommandOptions) {
  const { target } = await loadConfigForCommand(options)
  const result = await deleteRuleFileSafely(target, { dryRun: options.dryRun })
  printPromptWriteResult(result, options.json)
  return result
}

export async function removeInstructionCommand(ref: string, options: PromptCommandOptions) {
  const { document } = await loadConfigForCommand(options)
  const nextConfig = removeInstructionRef(document.data, ref)
  const nextText = promptConfigText(document, nextConfig)
  return writeMutation({ document, options, nextConfig, nextText })
}

export async function deletePromptCommand(name: string, options: PromptCommandOptions) {
  const { target, document } = await loadConfigForCommand(options)
  const fileName = await resolvePromptFileName(target, name)
  const promptRef = promptRefForFile(fileName, target)
  const instructionRef = instructionRefForPromptFile(fileName, target)
  const nextConfig = removePromptReferences(document.data, promptRef, instructionRef)
  const shouldWriteConfig = !sameJSON(document.data.agent, nextConfig.agent) || !sameJSON(document.data.instructions, nextConfig.instructions)

  if (shouldWriteConfig) {
    const nextText = promptConfigText(document, nextConfig)
    const result = await writeMutation({ document, options, nextConfig, nextText })
    if (result.diagnostics.length > 0) return result
  }

  const deleteResult = await deletePromptFileSafely(target, fileName, { dryRun: options.dryRun })
  if (!options.json || !shouldWriteConfig) printPromptWriteResult(deleteResult, options.json)
  return deleteResult
}
