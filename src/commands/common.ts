import { locateConfig } from "../core/config-locator.js"
import { readConfig } from "../core/config-reader.js"
import { hasHighSeverity } from "../core/doctor.js"
import { restoreSecretFile, snapshotSecretFile, writeSecretFileSafely } from "../core/secret-file.js"
import { validateConfig } from "../core/schema-validator.js"
import { writeConfigSafely, type ValidationResult, type WriteConfigSafelyResult } from "../core/config-writer.js"
import type { ConfigDocument, ConfigScope, Diagnostic, EndpointKind } from "../core/types.js"

export type ConfigCommandOptions = {
  configScope?: ConfigScope
  configPath?: string
  cwd?: string
  home?: string
  json?: boolean
}

export type MutatingCommandOptions = ConfigCommandOptions & {
  dryRun?: boolean
  yes?: boolean
  validate?: (config: Record<string, unknown>) => Promise<ValidationResult> | ValidationResult
}

export type ManagedSecretCommandOptions = {
  apiKey?: string
}

const endpointKinds = new Set<EndpointKind>([
  "openai-compatible",
  "openai-responses",
  "anthropic-compatible",
  "gemini-compatible",
])

export async function loadConfigForCommand(options: ConfigCommandOptions) {
  const target = locateConfig({ scope: options.configScope, configPath: options.configPath, cwd: options.cwd, home: options.home })
  const document = await readConfig(target)
  return { target, document }
}

export function printDiagnostics(diagnostics: Diagnostic[], json = false) {
  if (json) {
    console.log(JSON.stringify({ diagnostics }, null, 2))
    return
  }

  if (diagnostics.length === 0) {
    console.log("No diagnostics found.")
    return
  }

  for (const diagnostic of diagnostics) {
    const path = diagnostic.path ? ` ${diagnostic.path}` : ""
    console.log(`[${diagnostic.severity}]${path} ${diagnostic.message}`)
  }
}

export function setExitCodeForDiagnostics(diagnostics: Diagnostic[]) {
  if (hasHighSeverity(diagnostics)) process.exitCode = 1
}

export function parseEndpointKind(value: string): EndpointKind {
  if (endpointKinds.has(value as EndpointKind)) return value as EndpointKind
  throw new Error(`Invalid endpoint kind "${value}"`)
}

export function parseManagedApiKeyValue(options: ManagedSecretCommandOptions): string {
  const value = options.apiKey?.trim()
  if (!value) throw new Error("--api-key is required")
  return value
}

export async function validateForWrite(
  config: Record<string, unknown>,
  validate: MutatingCommandOptions["validate"],
): Promise<ValidationResult> {
  if (validate) return validate(config)
  return validateConfig(config, { relaxModelEnum: true })
}

export async function writeMutation(input: {
  document: ConfigDocument
  options: MutatingCommandOptions
  nextConfig: Record<string, unknown>
  nextText: string
  secretFile?: {
    path: string
    value: string
  }
}) {
  const validation = await validateForWrite(input.nextConfig, input.options.validate)
  let secretSnapshot: Awaited<ReturnType<typeof snapshotSecretFile>> | undefined
  try {
    if (input.secretFile && !input.options.dryRun && validation.valid) {
      secretSnapshot = await snapshotSecretFile(input.secretFile.path)
      await writeSecretFileSafely(input.secretFile)
    }
    const result = await writeConfigSafely({
      document: input.document,
      nextConfig: input.nextConfig,
      nextText: input.nextText,
      dryRun: input.options.dryRun,
      validate: () => validation,
    })
    if (result.diagnostics.length > 0 && secretSnapshot && !input.options.dryRun) await restoreSecretFile(secretSnapshot)
    printWriteResult(result, input.options.json)
    setExitCodeForDiagnostics(result.diagnostics)
    return result
  } catch (caught) {
    if (secretSnapshot && !input.options.dryRun) await restoreSecretFile(secretSnapshot)
    throw caught
  }
}

export function printWriteResult(result: WriteConfigSafelyResult, json = false) {
  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (result.diagnostics.length > 0) {
    printDiagnostics(result.diagnostics)
    return
  }

  if (result.dryRun) {
    console.log(`Dry run for ${result.targetPath}`)
    console.log(result.diff)
    return
  }

  console.log(`Wrote ${result.targetPath}`)
  if (result.backupPath) console.log(`Backup: ${result.backupPath}`)
}

export function failCommand(message: string, json = false): never {
  process.exitCode = 1
  if (json) {
    console.log(JSON.stringify({ diagnostics: [{ severity: "high", source: "config", message }] }, null, 2))
  } else {
    console.error(message)
  }
  throw new Error(message)
}
