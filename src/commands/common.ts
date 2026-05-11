import { locateConfig } from "../core/config-locator.js"
import { readConfig } from "../core/config-reader.js"
import type { ConfigScope, Diagnostic } from "../core/types.js"

export type ConfigCommandOptions = {
  configScope?: ConfigScope
  configPath?: string
  json?: boolean
}

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
