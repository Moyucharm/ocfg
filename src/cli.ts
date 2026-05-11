#!/usr/bin/env node
import { Command } from "commander"
import { addProviderCommand } from "./commands/add.js"
import { deleteModelCommand, deleteProviderCommand } from "./commands/delete.js"
import { doctorCommand } from "./commands/doctor.js"
import { editModelCommand, editProviderCommand } from "./commands/edit.js"
import { validateCommand } from "./commands/validate.js"
import type { ConfigScope } from "./core/types.js"

const program = new Command()

function addConfigOptions(command: Command) {
  return command
    .option("--config-scope <scope>", "Config scope: global or project", "global")
    .option("--config-path <path>", "Explicit OpenCode config path")
    .option("--json", "Print diagnostics as JSON", false)
}

function addMutatingOptions(command: Command) {
  return addConfigOptions(command).option("--dry-run", "Show planned diff without writing", false).option("--yes", "Confirm safe non-destructive prompts", false)
}

function normalizeOptions(options: { configScope?: string; configPath?: string; json?: boolean; dryRun?: boolean; yes?: boolean }) {
  const scope = options.configScope
  if (scope !== undefined && scope !== "global" && scope !== "project") {
    throw new Error(`Invalid --config-scope "${scope}". Expected global or project.`)
  }
  return {
    ...options,
    configScope: scope as ConfigScope | undefined,
  }
}

async function runAction(action: () => Promise<unknown>) {
  try {
    await action()
  } catch (error) {
    process.exitCode = 1
    console.error(error instanceof Error ? error.message : String(error))
  }
}

function collect(value: string, previous: string[]) {
  previous.push(value)
  return previous
}

program
  .name("opencode-provider-editor")
  .description("Safely inspect and edit OpenCode model provider configuration.")
  .version("0.1.0")

addConfigOptions(program.command("doctor").description("Inspect OpenCode config for common provider risks."))
  .action(async (options) => {
    await runAction(() => doctorCommand(normalizeOptions(options)))
  })

addConfigOptions(program.command("validate").description("Validate OpenCode config against the official schema."))
  .action(async (options) => {
    await runAction(() => validateCommand(normalizeOptions(options)))
  })

const add = program.command("add").description("Add OpenCode provider configuration.")
addMutatingOptions(add.command("provider <provider-id>").description("Add a provider."))
  .requiredOption("--endpoint-kind <kind>", "Endpoint kind")
  .option("--name <name>", "Provider display name")
  .option("--base-url <url>", "Provider base URL")
  .option("--api-key-env <name>", "API key environment variable")
  .option("--api-key-file <path>", "API key file reference")
  .option("--api-key-plaintext <value>", "Plaintext API key value")
  .option("--confirm-plaintext", "Confirm plaintext API key output", false)
  .option("--model <id>", "Model ID to add", collect, [])
  .action(async (providerID, options) => {
    await runAction(() => addProviderCommand(providerID, normalizeOptions(options) as never))
  })

const edit = program.command("edit").description("Edit OpenCode provider configuration.")
addMutatingOptions(edit.command("provider <provider-id>").description("Edit a provider."))
  .option("--name <name>", "Provider display name")
  .option("--npm <package>", "Provider npm package")
  .option("--base-url <url>", "Provider base URL")
  .option("--api-key-env <name>", "API key environment variable")
  .option("--api-key-file <path>", "API key file reference")
  .option("--api-key-plaintext <value>", "Plaintext API key value")
  .option("--confirm-plaintext", "Confirm plaintext API key output", false)
  .option("--set-cache-key", "Enable provider setCacheKey", undefined)
  .action(async (providerID, options) => {
    await runAction(() => editProviderCommand(providerID, normalizeOptions(options) as never))
  })

addMutatingOptions(edit.command("model <provider-id/model-id>").description("Edit a model."))
  .option("--name <name>", "Model display name")
  .option("--context <tokens>", "Context token limit")
  .option("--output <tokens>", "Output token limit")
  .option("--reasoning", "Enable reasoning capability", undefined)
  .option("--tool-call", "Enable tool call capability", undefined)
  .option("--temperature", "Enable temperature capability", undefined)
  .action(async (modelRef, options) => {
    await runAction(() => editModelCommand(modelRef, normalizeOptions(options) as never))
  })

const del = program.command("delete").description("Delete OpenCode provider configuration.")
addMutatingOptions(del.command("provider <provider-id>").description("Delete a provider."))
  .option("--confirm-token <token>", "Required token for referenced deletes")
  .action(async (providerID, options) => {
    await runAction(() => deleteProviderCommand(providerID, normalizeOptions(options) as never))
  })

addMutatingOptions(del.command("model <provider-id/model-id>").description("Delete a model."))
  .option("--confirm-token <token>", "Required token for referenced deletes")
  .action(async (modelRef, options) => {
    await runAction(() => deleteModelCommand(modelRef, normalizeOptions(options) as never))
  })

program.parseAsync(process.argv)
