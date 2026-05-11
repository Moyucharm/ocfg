import { locateConfig } from "../core/config-locator.js"
import { readConfig } from "../core/config-reader.js"
import { hasHighSeverity } from "../core/doctor.js"
import { validateConfig } from "../core/schema-validator.js"
import { writeConfigSafely, type ValidationResult, type WriteConfigSafelyResult } from "../core/config-writer.js"
import type { ConfigDocument, ConfigScope, Diagnostic, EndpointKind, SecretRef } from "../core/types.js"

export type ConfigCommandOptions = {
  configScope?: ConfigScope
  configPath?: string
  json?: boolean
}

export type MutatingCommandOptions = ConfigCommandOptions & {
  dryRun?: boolean
  yes?: boolean
  validate?: (config: Record<string, unknown>) => Promise<ValidationResult> | ValidationResult
}

export type SecretCommandOptions = {
  apiKeyEnv?: string
  apiKeyFile?: string
  apiKeyPlaintext?: string
  confirmPlaintext?: boolean
}

const endpointKinds = new Set<EndpointKind>([
  "openai-compatible",
  "openai-responses",
  "anthropic-compatible",
  "gemini-compatible",
])

export async function loadConfigForCommand(options: ConfigCommandOptions) {
  const target = locateConfig({ scope: options.configScope, configPath: options.configPath })
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

export function parseSecretRef(options: SecretCommandOptions): SecretRef {
  const provided = [options.apiKeyEnv, options.apiKeyFile, options.apiKeyPlaintext].filter((value) => value !== undefined)
  if (provided.length !== 1) throw new Error("Exactly one API key option is required")
  if (options.apiKeyEnv) return { type: "env", name: options.apiKeyEnv }
  if (options.apiKeyFile) return { type: "file", path: options.apiKeyFile }
  if (options.confirmPlaintext === true) return { type: "plaintext", value: options.apiKeyPlaintext!, explicit: true }
  return { type: "plaintext", value: options.apiKeyPlaintext!, explicit: false } as unknown as SecretRef
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
}) {
  const result = await writeConfigSafely({
    document: input.document,
    nextConfig: input.nextConfig,
    nextText: input.nextText,
    dryRun: input.options.dryRun,
    validate: (config) => validateForWrite(config, input.options.validate),
  })
  printWriteResult(result, input.options.json)
  setExitCodeForDiagnostics(result.diagnostics)
  return result
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
