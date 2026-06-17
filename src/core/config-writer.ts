import { createHash } from "node:crypto"
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createConfigDiff, stringifyConfig } from "./diff.js"
import type { ConfigDocument, ConfigTarget, Diagnostic } from "./types.js"

const maxConfigBackups = 10

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

function backupPrefixFor(targetPath: string) {
  const hash = createHash("sha256").update(path.resolve(targetPath)).digest("hex").slice(0, 12)
  return `${path.basename(targetPath)}.${hash}.bak.`
}

function resolveOcfgDataDirectory(target: ConfigTarget) {
  return target.ocfgDataPath ?? process.env.OCFG_DATA_DIR ?? path.join(process.env.HOME || os.homedir(), ".config", "ocfg")
}

export function resolveConfigBackupDirectory(target: ConfigTarget) {
  return path.join(resolveOcfgDataDirectory(target), "backups", "configs")
}

function backupPathFor(targetPath: string, date: Date, directory: string) {
  return path.join(directory, `${backupPrefixFor(targetPath)}${timestamp(date)}`)
}

async function fileExists(filePath: string) {
  return stat(filePath)
    .then(() => true)
    .catch(() => false)
}

async function availableBackupPath(targetPath: string, date: Date, directory: string) {
  const basePath = backupPathFor(targetPath, date, directory)
  if (!(await fileExists(basePath))) return basePath

  let index = 1
  while (await fileExists(`${basePath}.${index}`)) index += 1
  return `${basePath}.${index}`
}

function isConfigBackupFile(fileName: string, targetPath: string) {
  const prefix = backupPrefixFor(targetPath)
  if (!fileName.startsWith(prefix)) return false
  return /^\d{8}T\d{6}Z(?:\.\d+)?$/.test(fileName.slice(prefix.length))
}

async function pruneOldConfigBackups(directory: string, targetPath: string) {
  const entries = await readdir(directory).catch(() => [])
  const backupFiles = entries.filter((entry) => isConfigBackupFile(entry, targetPath)).sort()
  const staleBackups = backupFiles.slice(0, Math.max(0, backupFiles.length - maxConfigBackups))

  for (const fileName of staleBackups) await unlink(path.join(directory, fileName))
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
  let backupDirectory: string | undefined
  const shouldBackup = input.backup ?? true
  if (shouldBackup && (await fileExists(targetPath))) {
    const currentText = await readFile(targetPath, "utf8")
    if (currentText.trim()) {
      backupDirectory = resolveConfigBackupDirectory(input.document.target)
      await mkdir(backupDirectory, { recursive: true })
      backupPath = await availableBackupPath(targetPath, input.now ?? new Date(), backupDirectory)
      await writeFile(backupPath, currentText, "utf8")
    }
  }

  const tempPath = path.join(targetDir, `.${path.basename(targetPath)}.tmp-${process.pid}-${Date.now()}`)
  try {
    await writeFile(tempPath, afterText, "utf8")
    await rename(tempPath, targetPath)
  } catch (error) {
    await unlink(tempPath).catch(() => undefined)
    throw error
  }
  if (backupDirectory) await pruneOldConfigBackups(backupDirectory, targetPath)

  return {
    written: true,
    dryRun: false,
    targetPath,
    backupPath,
    diff,
    diagnostics: [],
  }
}
