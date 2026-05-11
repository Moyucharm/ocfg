#!/usr/bin/env node
import { Command } from "commander"
import { doctorCommand } from "./commands/doctor.js"
import { validateCommand } from "./commands/validate.js"
import type { ConfigScope } from "./core/types.js"

const program = new Command()

function addConfigOptions(command: Command) {
  return command
    .option("--config-scope <scope>", "Config scope: global or project", "global")
    .option("--config-path <path>", "Explicit OpenCode config path")
    .option("--json", "Print diagnostics as JSON", false)
}

function normalizeOptions(options: { configScope?: string; configPath?: string; json?: boolean }) {
  const scope = options.configScope
  if (scope !== undefined && scope !== "global" && scope !== "project") {
    throw new Error(`Invalid --config-scope "${scope}". Expected global or project.`)
  }
  return {
    configScope: scope as ConfigScope | undefined,
    configPath: options.configPath,
    json: options.json,
  }
}

program
  .name("opencode-provider-editor")
  .description("Safely inspect and edit OpenCode model provider configuration.")
  .version("0.1.0")

addConfigOptions(program.command("doctor").description("Inspect OpenCode config for common provider risks."))
  .action(async (options) => {
    await doctorCommand(normalizeOptions(options))
  })

addConfigOptions(program.command("validate").description("Validate OpenCode config against the official schema."))
  .action(async (options) => {
    await validateCommand(normalizeOptions(options))
  })

program.parseAsync(process.argv)
