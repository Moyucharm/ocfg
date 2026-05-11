import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { createConfigDiff, stringifyConfig } from "./diff.js"
import type { ConfigDocument, Diagnostic } from "./types.js"

export type ValidationResult = {
  valid: boolean
  diagnostics: Diagnostic[]
}

export type WriteConfigSafelyInput = {
  document: ConfigDocument
  nextConfig: Record<string, unknown>
  nextText?: string
  validate: (config: Record<string, unknown>) => Promise<ValidationResult> | ValidationResult
  dryRun?: boolean
  backup?: boolean
  now?: Date
}

export type WriteConfigSafelyResult = {
  written: boolean
  dryRun: boolean
  targetPath: string
  backupPath?: string
  diff: string
  diagnostics: Diagnostic[]
}

function timestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

function backupPathFor(targetPath: string, date: Date) {
  return `${targetPath}.bak.${timestamp(date)}`
}

async function fileExists(filePath: string) {
  return stat(filePath)
    .then(() => true)
    .catch(() => false)
}

async function availableBackupPath(targetPath: string, date: Date) {
  const basePath = backupPathFor(targetPath, date)
  if (!(await fileExists(basePath))) return basePath

  let index = 1
  while (await fileExists(`${basePath}.${index}`)) index += 1
  return `${basePath}.${index}`
}

export async function writeConfigSafely(input: WriteConfigSafelyInput): Promise<WriteConfigSafelyResult> {
  const afterText = input.nextText ?? stringifyConfig(input.nextConfig)
  const beforeText = input.document.target.exists ? input.document.text : ""
  const diff = createConfigDiff(beforeText, afterText)
  const validation = await input.validate(input.nextConfig)
  const dryRun = input.dryRun ?? false

  if (!validation.valid) {
    return {
      written: false,
      dryRun,
      targetPath: input.document.target.path,
      diff,
      diagnostics: validation.diagnostics,
    }
  }

  if (dryRun) {
    return {
      written: false,
      dryRun: true,
      targetPath: input.document.target.path,
      diff,
      diagnostics: [],
    }
  }

  const targetPath = input.document.target.path
  const targetDir = path.dirname(targetPath)
  await mkdir(targetDir, { recursive: true })

  let backupPath: string | undefined
  const shouldBackup = input.backup ?? true
  if (shouldBackup && (await fileExists(targetPath))) {
    backupPath = await availableBackupPath(targetPath, input.now ?? new Date())
    await writeFile(backupPath, await readFile(targetPath, "utf8"), "utf8")
  }

  const tempPath = path.join(targetDir, `.${path.basename(targetPath)}.tmp-${process.pid}-${Date.now()}`)
  try {
    await writeFile(tempPath, afterText, "utf8")
    await rename(tempPath, targetPath)
  } catch (error) {
    await unlink(tempPath).catch(() => undefined)
    throw error
  }

  return {
    written: true,
    dryRun: false,
    targetPath,
    backupPath,
    diff,
    diagnostics: [],
  }
}
