#!/usr/bin/env node
import { Command } from "commander"
import type { ComponentType } from "react"
import type { ConfigScope } from "./core/types.js"
import type { LoadedTuiPreferences } from "./tui/preferences.js"

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

async function openTui() {
  const [{ render }, React, { App }, initialPreferences] = await Promise.all([
    import("ink"),
    import("react"),
    import("./tui/app.js"),
    import("./tui/preferences.js").then((module) => module.loadTuiPreferences()),
  ])
  const AppComponent = App as ComponentType<{ initialPreferences: LoadedTuiPreferences }>
  render(React.createElement(AppComponent, { initialPreferences }))
}

function collect(value: string, previous: string[]) {
  previous.push(value)
  return previous
}

program
  .name("ocfg")
  .description("OpenCode configuration editor.")
  .version("0.2.0")
  .action(async () => {
    await runAction(openTui)
  })

addConfigOptions(program.command("doctor").description("Inspect OpenCode config for common provider risks."))
  .action(async (options) => {
    await runAction(async () => {
      const { doctorCommand } = await import("./commands/doctor.js")
      return doctorCommand(normalizeOptions(options))
    })
  })

addConfigOptions(program.command("validate").description("Validate OpenCode config against the official schema."))
  .action(async (options) => {
    await runAction(async () => {
      const { validateCommand } = await import("./commands/validate.js")
      return validateCommand(normalizeOptions(options))
    })
  })

const add = program.command("add").description("Add OpenCode configuration entries.")
addMutatingOptions(add.command("provider <provider-id>").description("Add a provider."))
  .requiredOption("--channel-type <kind>", "Channel type")
  .option("--name <name>", "Provider display name")
  .option("--base-url <url>", "Provider base URL")
  .requiredOption("--api-key <value>", "API key content to store in the managed secret file")
  .option("--model <id>", "Model ID to add", collect, [])
  .option("--gpt-5-long-context", "Use the GPT-5 1M context preset for supported OpenAI GPT-5.4/5.5 models", undefined)
  .action(async (providerID, options) => {
    await runAction(async () => {
      const { addProviderCommand } = await import("./commands/add.js")
      return addProviderCommand(providerID, normalizeOptions(options) as never)
    })
  })

addMutatingOptions(add.command("plugin <package-name>").description("Add an OpenCode npm plugin."))
  .option("--options-json <json>", "Plugin options object as JSON")
  .action(async (packageName, options) => {
    await runAction(async () => {
      const { addPluginCommand } = await import("./commands/plugin.js")
      return addPluginCommand(packageName, normalizeOptions(options) as never)
    })
  })

addMutatingOptions(add.command("prompt <name>").description("Add an OpenCode prompt file."))
  .option("--content <text>", "Prompt content")
  .option("--content-file <path>", "Read prompt content from a file")
  .option("--template <id>", "Use a built-in prompt template")
  .option("--global-instructions", "Add this prompt file to top-level instructions", false)
  .option("--agent <agent-id>", "Apply this prompt to an OpenCode agent")
  .action(async (name, options) => {
    await runAction(async () => {
      const { addPromptCommand } = await import("./commands/prompt.js")
      return addPromptCommand(name, normalizeOptions(options) as never)
    })
  })

addMutatingOptions(add.command("rules").description("Create or replace the selected OpenCode AGENTS.md rules file."))
  .option("--content <text>", "Rules content")
  .option("--content-file <path>", "Read rules content from a file")
  .action(async (options) => {
    await runAction(async () => {
      const { editRulesCommand } = await import("./commands/prompt.js")
      return editRulesCommand(normalizeOptions(options) as never)
    })
  })

addMutatingOptions(add.command("rules-config <name>").description("Add a reusable AGENTS.md rules config."))
  .option("--content <text>", "Rules content")
  .option("--content-file <path>", "Read rules content from a file")
  .action(async (name, options) => {
    await runAction(async () => {
      const { addRuleProfileCommand } = await import("./commands/prompt.js")
      return addRuleProfileCommand(name, normalizeOptions(options) as never)
    })
  })

addMutatingOptions(program.command("install").description("Install OpenCode plugins.").command("plugin <plugin>").description("Install an OpenCode npm or local plugin."))
  .option("--local", "Install from a local JavaScript or TypeScript plugin file", false)
  .option("--as <filename>", "Destination filename for --local installs")
  .option("--options-json <json>", "Plugin options object as JSON for npm installs")
  .action(async (plugin, options) => {
    await runAction(async () => {
      const { installPluginCommand } = await import("./commands/plugin.js")
      return installPluginCommand(plugin, normalizeOptions(options) as never)
    })
  })

addMutatingOptions(program.command("enable").description("Enable OpenCode plugins.").command("plugin <plugin>").description("Enable an OpenCode npm or local plugin."))
  .option("--local", "Enable a local plugin file by renaming it from .disabled", false)
  .option("--options-json <json>", "Plugin options object as JSON for npm plugins")
  .action(async (plugin, options) => {
    await runAction(async () => {
      const { enablePluginCommand } = await import("./commands/plugin.js")
      return enablePluginCommand(plugin, normalizeOptions(options) as never)
    })
  })

addMutatingOptions(program.command("disable").description("Disable OpenCode plugins.").command("plugin <plugin>").description("Disable an OpenCode npm or local plugin."))
  .option("--local", "Disable a local plugin file by adding a .disabled suffix", false)
  .action(async (plugin, options) => {
    await runAction(async () => {
      const { disablePluginCommand } = await import("./commands/plugin.js")
      return disablePluginCommand(plugin, normalizeOptions(options) as never)
    })
  })

const edit = program.command("edit").description("Edit OpenCode configuration entries.")
addMutatingOptions(edit.command("provider <provider-id>").description("Edit a provider."))
  .option("--name <name>", "Provider display name")
  .option("--channel-type <kind>", "Channel type")
  .option("--base-url <url>", "Provider base URL")
  .option("--api-key <value>", "API key content to store in the managed secret file")
  .option("--set-cache-key", "Enable provider setCacheKey", undefined)
  .action(async (providerID, options) => {
    await runAction(async () => {
      const { editProviderCommand } = await import("./commands/edit.js")
      return editProviderCommand(providerID, normalizeOptions(options) as never)
    })
  })

addMutatingOptions(edit.command("model <provider-id/model-id>").description("Edit a model."))
  .option("--name <name>", "Model display name")
  .option("--context <tokens>", "Context token limit")
  .option("--input <tokens>", "Input token limit")
  .option("--output <tokens>", "Output token limit")
  .option("--gpt-5-long-context", "Use the GPT-5 1M context preset for supported OpenAI GPT-5.4/5.5 models", undefined)
  .option("--no-gpt-5-long-context", "Use the budget-friendly 400K context preset for supported GPT-5.4/5.5 models")
  .option("--reasoning", "Enable reasoning capability", undefined)
  .option("--tool-call", "Enable tool call capability", undefined)
  .option("--temperature", "Enable temperature capability", undefined)
  .action(async (modelRef, options) => {
    await runAction(async () => {
      const { editModelCommand } = await import("./commands/edit.js")
      return editModelCommand(modelRef, normalizeOptions(options) as never)
    })
  })

addMutatingOptions(edit.command("plugin <package-name>").description("Edit an OpenCode npm plugin."))
  .option("--options-json <json>", "Replace plugin options with a JSON object")
  .option("--clear-options", "Remove plugin options and store the package as a string", false)
  .action(async (packageName, options) => {
    await runAction(async () => {
      const { editPluginCommand } = await import("./commands/plugin.js")
      return editPluginCommand(packageName, normalizeOptions(options) as never)
    })
  })

addMutatingOptions(edit.command("prompt <name>").description("Edit an OpenCode prompt file."))
  .option("--content <text>", "Prompt content")
  .option("--content-file <path>", "Read prompt content from a file")
  .action(async (name, options) => {
    await runAction(async () => {
      const { editPromptCommand } = await import("./commands/prompt.js")
      return editPromptCommand(name, normalizeOptions(options) as never)
    })
  })

addMutatingOptions(edit.command("rules").description("Edit the selected OpenCode AGENTS.md rules file."))
  .option("--content <text>", "Rules content")
  .option("--content-file <path>", "Read rules content from a file")
  .action(async (options) => {
    await runAction(async () => {
      const { editRulesCommand } = await import("./commands/prompt.js")
      return editRulesCommand(normalizeOptions(options) as never)
    })
  })

addMutatingOptions(edit.command("rules-config <name>").description("Edit a reusable AGENTS.md rules config."))
  .option("--content <text>", "Rules content")
  .option("--content-file <path>", "Read rules content from a file")
  .action(async (name, options) => {
    await runAction(async () => {
      const { editRuleProfileCommand } = await import("./commands/prompt.js")
      return editRuleProfileCommand(name, normalizeOptions(options) as never)
    })
  })

const del = program.command("delete").description("Delete OpenCode configuration entries.")
addMutatingOptions(del.command("provider <provider-id>").description("Delete a provider."))
  .option("--confirm-token <token>", "Required token for referenced deletes")
  .action(async (providerID, options) => {
    await runAction(async () => {
      const { deleteProviderCommand } = await import("./commands/delete.js")
      return deleteProviderCommand(providerID, normalizeOptions(options) as never)
    })
  })

addMutatingOptions(del.command("model <provider-id/model-id>").description("Delete a model."))
  .option("--confirm-token <token>", "Required token for referenced deletes")
  .action(async (modelRef, options) => {
    await runAction(async () => {
      const { deleteModelCommand } = await import("./commands/delete.js")
      return deleteModelCommand(modelRef, normalizeOptions(options) as never)
    })
  })

addMutatingOptions(del.command("plugin <package-name>").description("Delete an OpenCode npm plugin."))
  .action(async (packageName, options) => {
    await runAction(async () => {
      const { deletePluginCommand } = await import("./commands/plugin.js")
      return deletePluginCommand(packageName, normalizeOptions(options) as never)
    })
  })

addMutatingOptions(del.command("prompt <name>").description("Delete an OpenCode prompt file and clear matching agent references."))
  .action(async (name, options) => {
    await runAction(async () => {
      const { deletePromptCommand } = await import("./commands/prompt.js")
      return deletePromptCommand(name, normalizeOptions(options) as never)
    })
  })

addMutatingOptions(del.command("rules").description("Delete the selected OpenCode AGENTS.md rules file."))
  .action(async (options) => {
    await runAction(async () => {
      const { deleteRulesCommand } = await import("./commands/prompt.js")
      return deleteRulesCommand(normalizeOptions(options) as never)
    })
  })

addMutatingOptions(del.command("rules-config <name>").description("Delete a reusable AGENTS.md rules config."))
  .action(async (name, options) => {
    await runAction(async () => {
      const { deleteRuleProfileCommand } = await import("./commands/prompt.js")
      return deleteRuleProfileCommand(name, normalizeOptions(options) as never)
    })
  })

addMutatingOptions(del.command("instruction <ref>").description("Remove an entry from top-level instructions."))
  .action(async (ref, options) => {
    await runAction(async () => {
      const { removeInstructionCommand } = await import("./commands/prompt.js")
      return removeInstructionCommand(ref, normalizeOptions(options) as never)
    })
  })

const switchCommand = program.command("switch").description("Switch OpenCode configuration selections.")
addMutatingOptions(switchCommand.command("prompt <name>").description("Apply a prompt file or built-in prompt template globally or to an agent."))
  .option("--agent <agent-id>", "OpenCode agent ID, such as build or plan")
  .option("--global-instructions", "Add this prompt file to top-level instructions", false)
  .option("--rules", "Replace the selected AGENTS.md rules file with this prompt", false)
  .action(async (name, options) => {
    await runAction(async () => {
      const { switchPromptCommand } = await import("./commands/prompt.js")
      return switchPromptCommand(name, normalizeOptions(options) as never)
    })
  })

addMutatingOptions(switchCommand.command("rules-config <name>").description("Switch the selected AGENTS.md to a reusable rules config."))
  .action(async (name, options) => {
    await runAction(async () => {
      const { switchRuleProfileCommand } = await import("./commands/prompt.js")
      return switchRuleProfileCommand(name, normalizeOptions(options) as never)
    })
  })

const list = program.command("list").description("List OpenCode configuration entries.")
addConfigOptions(list.command("plugins").description("List configured OpenCode npm and local plugins."))
  .action(async (options) => {
    await runAction(async () => {
      const { listPluginsCommand } = await import("./commands/plugin.js")
      return listPluginsCommand(normalizeOptions(options))
    })
  })

addConfigOptions(list.command("prompts").description("List OpenCode rules, instructions, prompt files, and built-in templates."))
  .action(async (options) => {
    await runAction(async () => {
      const { listPromptsCommand } = await import("./commands/prompt.js")
      return listPromptsCommand(normalizeOptions(options))
    })
  })

program.command("tui").description("Open the interactive terminal UI.").action(async () => {
  await runAction(openTui)
})

program.parseAsync(process.argv)
