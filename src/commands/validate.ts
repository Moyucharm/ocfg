import { hasHighSeverity } from "../core/doctor.js"
import { validateConfig } from "../core/schema-validator.js"
import { loadConfigForCommand, printDiagnostics, type ConfigCommandOptions } from "./common.js"

export async function validateCommand(options: ConfigCommandOptions) {
  const { target, document } = await loadConfigForCommand(options)
  const diagnostics = [...document.diagnostics]

  if (diagnostics.length === 0) {
    const result = await validateConfig(document.data, { relaxModelEnum: true })
    diagnostics.push(...result.diagnostics)
  }

  if (!options.json) {
    console.log(`Validating ${target.scope} config: ${target.path}${target.exists ? "" : " (missing; not created)"}`)
  }
  printDiagnostics(diagnostics, options.json)

  if (hasHighSeverity(diagnostics)) process.exitCode = 1
}
