import { hasHighSeverity, runDoctor } from "../core/doctor.js"
import { loadConfigForCommand, printDiagnostics, type ConfigCommandOptions } from "./common.js"

export async function doctorCommand(options: ConfigCommandOptions) {
  const { target, document } = await loadConfigForCommand(options)
  const diagnostics = runDoctor(document)

  if (!options.json) {
    console.log(`Inspecting ${target.scope} config: ${target.path}${target.exists ? "" : " (missing; not created)"}`)
  }
  printDiagnostics(diagnostics, options.json)

  if (hasHighSeverity(diagnostics)) process.exitCode = 1
}
