#!/usr/bin/env node
import { Command } from "commander"
import { addProviderCommand } from "./commands/add.js"
import { deleteModelCommand, deleteProviderCommand } from "./commands/delete.js"
import { doctorCommand } from "./commands/doctor.js"
import { editModelCommand, editProviderCommand } from "./commands/edit.js"
import {
  addPluginCommand,
  deletePluginCommand,
  disablePluginCommand,
  editPluginCommand,
  enablePluginCommand,
  installPluginCommand,
  listPluginsCommand,
} from "./commands/plugin.js"
import {
  addPromptCommand,
  addRuleProfileCommand,
  deleteRulesCommand,
  deletePromptCommand,
  deleteRuleProfileCommand,
  editPromptCommand,
  editRuleProfileCommand,
  editRulesCommand,
  listPromptsCommand,
  removeInstructionCommand,
  switchRuleProfileCommand,
  switchPromptCommand,
} from "./commands/prompt.js"
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
  .name("ocfg")
  .description("OpenCode configuration editor.")
  .version("0.1.0")

addConfigOptions(program.command("doctor").description("Inspect OpenCode config for common provider risks."))
  .action(async (options) => {
    await runAction(() => doctorCommand(normalizeOptions(options)))
  })

addConfigOptions(program.command("validate").description("Validate OpenCode config against the official schema."))
  .action(async (options) => {
    await runAction(() => validateCommand(normalizeOptions(options)))
  })

const add = program.command("add").description("Add OpenCode configuration entries.")
addMutatingOptions(add.command("provider <provider-id>").description("Add a provider."))
  .requiredOption("--channel-type <kind>", "Channel type")
  .option("--name <name>", "Provider display name")
  .option("--base-url <url>", "Provider base URL")
  .requiredOption("--api-key <value>", "API key content to store in the managed secret file")
  .option("--model <id>", "Model ID to add", collect, [])
  .action(async (providerID, options) => {
    await runAction(() => addProviderCommand(providerID, normalizeOptions(options) as never))
  })

addMutatingOptions(add.command("plugin <package-name>").description("Add an OpenCode npm plugin."))
  .option("--options-json <json>", "Plugin options object as JSON")
  .action(async (packageName, options) => {
    await runAction(() => addPluginCommand(packageName, normalizeOptions(options) as never))
  })

addMutatingOptions(add.command("prompt <name>").description("Add an OpenCode prompt file."))
  .option("--content <text>", "Prompt content")
  .option("--content-file <path>", "Read prompt content from a file")
  .option("--template <id>", "Use a built-in prompt template")
  .option("--global-instructions", "Add this prompt file to top-level instructions", false)
  .option("--agent <agent-id>", "Apply this prompt to an OpenCode agent")
  .action(async (name, options) => {
    await runAction(() => addPromptCommand(name, normalizeOptions(options) as never))
  })

addMutatingOptions(add.command("rules").description("Create or replace the selected OpenCode AGENTS.md rules file."))
  .option("--content <text>", "Rules content")
  .option("--content-file <path>", "Read rules content from a file")
  .action(async (options) => {
    await runAction(() => editRulesCommand(normalizeOptions(options) as never))
  })

addMutatingOptions(add.command("rules-config <name>").description("Add a reusable AGENTS.md rules config."))
  .option("--content <text>", "Rules content")
  .option("--content-file <path>", "Read rules content from a file")
  .action(async (name, options) => {
    await runAction(() => addRuleProfileCommand(name, normalizeOptions(options) as never))
  })

addMutatingOptions(program.command("install").description("Install OpenCode plugins.").command("plugin <plugin>").description("Install an OpenCode npm or local plugin."))
  .option("--local", "Install from a local JavaScript or TypeScript plugin file", false)
  .option("--as <filename>", "Destination filename for --local installs")
  .option("--options-json <json>", "Plugin options object as JSON for npm installs")
  .action(async (plugin, options) => {
    await runAction(() => installPluginCommand(plugin, normalizeOptions(options) as never))
  })

addMutatingOptions(program.command("enable").description("Enable OpenCode plugins.").command("plugin <plugin>").description("Enable an OpenCode npm or local plugin."))
  .option("--local", "Enable a local plugin file by renaming it from .disabled", false)
  .option("--options-json <json>", "Plugin options object as JSON for npm plugins")
  .action(async (plugin, options) => {
    await runAction(() => enablePluginCommand(plugin, normalizeOptions(options) as never))
  })

addMutatingOptions(program.command("disable").description("Disable OpenCode plugins.").command("plugin <plugin>").description("Disable an OpenCode npm or local plugin."))
  .option("--local", "Disable a local plugin file by adding a .disabled suffix", false)
  .action(async (plugin, options) => {
    await runAction(() => disablePluginCommand(plugin, normalizeOptions(options) as never))
  })

const edit = program.command("edit").description("Edit OpenCode configuration entries.")
addMutatingOptions(edit.command("provider <provider-id>").description("Edit a provider."))
  .option("--name <name>", "Provider display name")
  .option("--channel-type <kind>", "Channel type")
  .option("--base-url <url>", "Provider base URL")
  .option("--api-key <value>", "API key content to store in the managed secret file")
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

addMutatingOptions(edit.command("plugin <package-name>").description("Edit an OpenCode npm plugin."))
  .option("--options-json <json>", "Replace plugin options with a JSON object")
  .option("--clear-options", "Remove plugin options and store the package as a string", false)
  .action(async (packageName, options) => {
    await runAction(() => editPluginCommand(packageName, normalizeOptions(options) as never))
  })

addMutatingOptions(edit.command("prompt <name>").description("Edit an OpenCode prompt file."))
  .option("--content <text>", "Prompt content")
  .option("--content-file <path>", "Read prompt content from a file")
  .action(async (name, options) => {
    await runAction(() => editPromptCommand(name, normalizeOptions(options) as never))
  })

addMutatingOptions(edit.command("rules").description("Edit the selected OpenCode AGENTS.md rules file."))
  .option("--content <text>", "Rules content")
  .option("--content-file <path>", "Read rules content from a file")
  .action(async (options) => {
    await runAction(() => editRulesCommand(normalizeOptions(options) as never))
  })

addMutatingOptions(edit.command("rules-config <name>").description("Edit a reusable AGENTS.md rules config."))
  .option("--content <text>", "Rules content")
  .option("--content-file <path>", "Read rules content from a file")
  .action(async (name, options) => {
    await runAction(() => editRuleProfileCommand(name, normalizeOptions(options) as never))
  })

const del = program.command("delete").description("Delete OpenCode configuration entries.")
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

addMutatingOptions(del.command("plugin <package-name>").description("Delete an OpenCode npm plugin."))
  .action(async (packageName, options) => {
    await runAction(() => deletePluginCommand(packageName, normalizeOptions(options) as never))
  })

addMutatingOptions(del.command("prompt <name>").description("Delete an OpenCode prompt file and clear matching agent references."))
  .action(async (name, options) => {
    await runAction(() => deletePromptCommand(name, normalizeOptions(options) as never))
  })

addMutatingOptions(del.command("rules").description("Delete the selected OpenCode AGENTS.md rules file."))
  .action(async (options) => {
    await runAction(() => deleteRulesCommand(normalizeOptions(options) as never))
  })

addMutatingOptions(del.command("rules-config <name>").description("Delete a reusable AGENTS.md rules config."))
  .action(async (name, options) => {
    await runAction(() => deleteRuleProfileCommand(name, normalizeOptions(options) as never))
  })

addMutatingOptions(del.command("instruction <ref>").description("Remove an entry from top-level instructions."))
  .action(async (ref, options) => {
    await runAction(() => removeInstructionCommand(ref, normalizeOptions(options) as never))
  })

const switchCommand = program.command("switch").description("Switch OpenCode configuration selections.")
addMutatingOptions(switchCommand.command("prompt <name>").description("Apply a prompt file or built-in prompt template globally or to an agent."))
  .option("--agent <agent-id>", "OpenCode agent ID, such as build or plan")
  .option("--global-instructions", "Add this prompt file to top-level instructions", false)
  .option("--rules", "Replace the selected AGENTS.md rules file with this prompt", false)
  .action(async (name, options) => {
    await runAction(() => switchPromptCommand(name, normalizeOptions(options) as never))
  })

addMutatingOptions(switchCommand.command("rules-config <name>").description("Switch the selected AGENTS.md to a reusable rules config."))
  .action(async (name, options) => {
    await runAction(() => switchRuleProfileCommand(name, normalizeOptions(options) as never))
  })

const list = program.command("list").description("List OpenCode configuration entries.")
addConfigOptions(list.command("plugins").description("List configured OpenCode npm and local plugins."))
  .action(async (options) => {
    await runAction(() => listPluginsCommand(normalizeOptions(options)))
  })

addConfigOptions(list.command("prompts").description("List OpenCode rules, instructions, prompt files, and built-in templates."))
  .action(async (options) => {
    await runAction(() => listPromptsCommand(normalizeOptions(options)))
  })

program.command("tui").description("Open the interactive terminal UI.").action(async () => {
  await runAction(async () => {
    const [{ render }, React, { App }] = await Promise.all([import("ink"), import("react"), import("./tui/app.js")])
    render(React.createElement(App))
  })
})

program.parseAsync(process.argv)
