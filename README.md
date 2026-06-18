# OCfg

`ocfg` is a CLI and terminal UI for editing OpenCode configuration.

It focuses on everyday OpenCode config work: adding providers, reviewing models, managing plugins, switching prompts/rules, setting default models, and running diagnostics without manually rewriting `opencode.jsonc`.

[中文文档](./README.zh-CN.md)

## Friendly Links

The [LINUX DO](https://linux.do/) forum provides community support for this project. Follow LD, meow; thank you for following LD, meow.

[zcf](https://github.com/UfoMiao/zcf), which focuses on Claude Code configuration editing, and [AI Toolbox](https://github.com/coulsontl/ai-toolbox), an excellent GUI OpenCode editor, inspired this project's implementation. Thanks to the developers and contributors of these projects.

## Features

- Diagnose and validate OpenCode config with `doctor` and `validate`.
- Add, edit, or delete providers using protocol-oriented endpoint kinds, managed API key files, schema validation, and Diff review.
- Detect models from compatible endpoints or enter IDs manually, then review context/input/output limits, GPT-5 long-context presets, and common capability flags.
- Install, enable, disable, edit, and remove OpenCode npm plugins and local plugin files.
- Manage prompt and rule files for `AGENTS.md`, top-level `instructions`, and per-agent `agent.<id>.prompt`.
- Set or clear top-level `model` and `small_model` from the TUI.
- Toggle OpenCode Exa `websearch`/`webfetch` support from the TUI tools menu.
- Preserve JSONC comments where practical and write through validation, backups, and atomic rename.

## Package Status

The npm package name is `ocfg`. Current release: `v0.2.0`.

Runtime requirement: Node.js `>=20`.

## Installation

After the npm package is published:

```bash
npm install -g ocfg
```

The package binary is named `ocfg`.

Run from a source checkout before the npm release:

```bash
npm install
npm run build
node dist/cli.js --help
```

## Quick Start

Open the interactive terminal UI. Running `ocfg` without a subcommand opens the same TUI as `ocfg tui`:

```bash
ocfg
ocfg tui
```

Inspect the current global OpenCode config:

```bash
ocfg doctor
```

Validate the current global OpenCode config:

```bash
ocfg validate
```

Add a provider with a managed API key file:

```bash
ocfg add provider custom \
  --channel-type openai-compatible \
  --base-url https://example.com/v1 \
  --api-key sk-example \
  --model example-model
```

Preview a write without changing files:

```bash
ocfg add provider custom \
  --channel-type openai-compatible \
  --base-url https://example.com/v1 \
  --api-key sk-example \
  --model example-model \
  --dry-run
```

Install an OpenCode npm plugin:

```bash
ocfg install plugin opencode-wakatime
```

`install plugin` reads npm package metadata and writes server plugins to `opencode.json`/`opencode.jsonc`, TUI plugins to `tui.json`/`tui.jsonc`, or both when a package exposes both targets. Plugin config file selection follows OpenCode's installer order: `.json` first, then `.jsonc` when it already exists. Project-scope plugin installs create `.opencode/opencode.json` or `.opencode/tui.json` when no matching file exists. If metadata cannot be read, choose explicitly with `--plugin-target server`, `--plugin-target tui`, or `--plugin-target both`. Restart OpenCode after changing plugin config so newly added, removed, or retargeted plugins are loaded.

Install a local plugin file:

```bash
ocfg install plugin ./my-plugin.ts --local --config-scope project
```

Install a default prompt template as the selected `AGENTS.md` rules file:

```bash
ocfg switch prompt build-focused --rules
```

## Config Targets

By default, commands target the global OpenCode config:

```text
~/.config/opencode/opencode.jsonc
```

Use project scope to target a project-level config:

```bash
ocfg doctor --config-scope project
```

Use an explicit config file path when needed:

```bash
ocfg validate --config-path ./opencode.jsonc
```

New config files are created only during confirmed or non-dry-run writes. Reads and dry runs do not create config files.

## Endpoint Kinds

Provider creation uses protocol-oriented endpoint kinds:

- `openai-compatible`
- `openai-responses`
- `anthropic-compatible`
- `gemini-compatible`

Templates provide recommended provider packages, endpoint behavior, probing support, and model capability defaults. Commercial proxy names are intentionally not treated as templates.

## CLI Commands

Doctor:

```bash
ocfg doctor [--config-scope global|project] [--config-path path] [--json]
```

Validate:

```bash
ocfg validate [--config-scope global|project] [--config-path path] [--json]
```

Add a provider:

```bash
ocfg add provider <provider-id> \
  --channel-type <kind> \
  --api-key <value> \
  --model <id> \
  [--name <name>] \
  [--base-url <url>] \
  [--gpt-5-long-context] \
  [--dry-run]
```

Supported OpenAI GPT-5.4/5.5 long-context models default to a budget-friendly `400000/272000/128000` context/input/output preset. Use `--gpt-5-long-context` to opt into the OpenAI API 1M context preset, `1050000/922000/128000`.

Edit a provider:

```bash
ocfg edit provider <provider-id> \
  [--name <name>] \
  [--channel-type <kind>] \
  [--base-url <url>] \
  [--api-key <value>] \
  [--set-cache-key] \
  [--dry-run]
```

Edit a model:

```bash
ocfg edit model <provider-id/model-id> \
  [--name <name>] \
  [--context <tokens>] \
  [--input <tokens>] \
  [--output <tokens>] \
  [--gpt-5-long-context | --no-gpt-5-long-context] \
  [--reasoning] \
  [--tool-call] \
  [--temperature] \
  [--dry-run]
```

Delete a provider:

```bash
ocfg delete provider <provider-id> [--confirm-token <token>] [--dry-run]
```

Delete a model:

```bash
ocfg delete model <provider-id/model-id> [--confirm-token <token>] [--dry-run]
```

List configured plugins:

```bash
ocfg list plugins [--config-scope global|project] [--config-path path] [--check-targets] [--json]
```

Install or enable an npm plugin:

```bash
ocfg install plugin <package-name> [--plugin-target auto|server|tui|both] [--options-json <json>] [--dry-run]
ocfg enable plugin <package-name> [--plugin-target auto|server|tui|both] [--options-json <json>] [--dry-run]
```

`ocfg install plugin` defaults to `--plugin-target auto`, detecting target files from package `exports["./server"]`, `main`, `exports["./tui"]`, and `oc-themes` metadata. Use `--plugin-target server|tui|both` to bypass auto-detection. `ocfg list plugins` reads both `.json` and `.jsonc` host files for each plugin target, matching the files OpenCode can load. Add `--check-targets` to query npm metadata and warn when a package is configured in the wrong host; the default list command stays offline.

Install a local plugin file:

```bash
ocfg install plugin <path-to-js-or-ts-file> --local [--as <filename>] [--config-scope global|project] [--dry-run]
```

Disable or enable a local plugin file:

```bash
ocfg disable plugin <filename-or-name> --local [--config-scope global|project] [--dry-run]
ocfg enable plugin <filename-or-name> --local [--config-scope global|project] [--dry-run]
```

Add a plugin using the older alias:

```bash
ocfg add plugin <package-name> [--plugin-target auto|server|tui|both] [--options-json <json>] [--dry-run]
```

`ocfg add plugin` is a compatibility alias for `ocfg install plugin` and also defaults to `--plugin-target auto`.

Edit a plugin:

```bash
ocfg edit plugin <package-name> [--plugin-target auto|server|tui|both] [--options-json <json> | --clear-options] [--dry-run]
```

Disable or delete an npm plugin:

```bash
ocfg disable plugin <package-name> [--plugin-target auto|server|tui|both] [--dry-run]
ocfg delete plugin <package-name> [--plugin-target auto|server|tui|both] [--dry-run]
```

List AGENTS.md rules, configured instructions, prompt files, and bundled prompt templates:

```bash
ocfg list prompts [--config-scope global|project] [--config-path path] [--json]
```

Add, edit, switch, or delete prompt files:

```bash
ocfg add prompt <name> [--content <text> | --content-file <path> | --template <id>] [--global-instructions | --agent <agent-id>] [--dry-run]
ocfg edit prompt <name> (--content <text> | --content-file <path>) [--dry-run]
ocfg switch prompt <name-or-template-id> (--rules | --global-instructions | --agent <agent-id>) [--dry-run]
ocfg delete prompt <name> [--dry-run]
```

Edit or remove OpenCode rule/instruction entries:

```bash
ocfg add rules (--content <text> | --content-file <path>) [--config-scope global|project] [--dry-run]
ocfg edit rules (--content <text> | --content-file <path>) [--config-scope global|project] [--dry-run]
ocfg delete rules [--config-scope global|project] [--dry-run]
ocfg delete instruction <ref> [--dry-run]
```

Manage reusable `AGENTS.md` configs:

```bash
ocfg add rules-config <name> [--content <text> | --content-file <path>] [--dry-run]
ocfg edit rules-config <name> (--content <text> | --content-file <path>) [--dry-run]
ocfg switch rules-config <name> [--dry-run]
ocfg delete rules-config <name> [--dry-run]
```

OpenCode uses `AGENTS.md` for global/project rules, `instructions` for extra reusable rule files, and `agent.<id>.prompt` for an individual agent's system prompt. ocfg-owned prompt files are stored under `~/.config/ocfg/prompts/` and reusable `AGENTS.md` configs under `~/.config/ocfg/agents/`; the OpenCode config only receives file references to those ocfg-managed files. `--rules` replaces the selected `AGENTS.md`, `--global-instructions` writes the ocfg prompt file path to `instructions`, and agent switching writes an ocfg prompt file reference to `agent.<id>.prompt`.

Replacing or deleting an existing `AGENTS.md` keeps a timestamped backup under `~/.config/ocfg/backups/agents/` and, when the current rules are not already in the reusable config library, saves them under `~/.config/ocfg/agents/previous-agents-*.md` so they can be switched back later.

When replacing `AGENTS.md` and the current rules are not already saved in `~/.config/ocfg/agents/`, the TUI shows an overwrite-risk confirmation first. CLI commands print the same risk warning before continuing, including where to find the reusable copy and `AGENTS.md.bak.*` backups.

Open the TUI:

```bash
ocfg tui
```

Referenced deletes require an exact confirmation token. For example, deleting provider `custom` while it is referenced by `model` or `small_model` requires `--confirm-token delete:custom`.

## TUI Flows

The TUI is opened with `ocfg tui`.

- `Doctor` shows actionable config diagnostics.
- `Connect provider` creates a provider through endpoint type, provider metadata, secret file storage, model detection or manual model entry, capability review, and Diff review.
- `Edit Provider` selects an existing provider, edits provider fields, can enter model management, and can delete the selected provider with confirmation.
- `Manage Plugins` lists npm and local plugins, installs npm packages into the matching OpenCode plugin host config, installs local files into the OpenCode plugin directory, edits npm option JSON, and toggles local plugin files.
- `Manage Prompts` first separates `Shared rules (AGENTS.md)` from `Agent prompts (agent.prompt)`. Shared rules lists and edits the active `AGENTS.md`, reusable `AGENTS.md` configs, and configured `instructions`; it can create/edit/switch/delete `AGENTS.md` configs with overwrite confirmation and automatic preservation of the previous active rules. Agent prompts lists prompt files and bundled templates, edits multi-line prompt content with arrow-key cursor movement and wrapping, and applies prompts only to `build`, `plan`, or a custom agent.
- `Set Default Model` sets or clears top-level `model` and `small_model` using existing provider/model refs.
- `Tools` includes an OpenCode Exa search toggle. Enabling writes `permission.websearch = "allow"` and `permission.webfetch = "allow"` to the currently selected global or project config, then sets the current user's `OPENCODE_ENABLE_EXA=1`. Disabling only sets `OPENCODE_ENABLE_EXA=0` and leaves config untouched.
- `Switch Config Target` changes between global and project config targets before writing.

Most config-mutating TUI flows show a diff before writing and require explicit confirmation. The Exa search tool is intentionally one-click: it writes immediately, creates normal config backups when it changes the selected OpenCode config, and updates only the current user's environment. Local plugin installs report the affected file path; enable/disable changes are reflected directly in the plugin list status. Restart OpenCode after plugin config changes for runtime plugin loading to catch up.

For Exa search environment changes, Windows uses user-level `setx` and does not require administrator rights. On macOS/Linux, ocfg first reuses an existing ocfg-managed Exa block in `~/.bashrc`, `~/.zshrc`, or `~/.profile`; if none exists, ocfg writes one shell config chosen from the current shell. Close and reopen the current terminal, or open a new terminal window, then start OpenCode.

## Secret Handling

The default API key path writes secret values to managed files, not plaintext inside the OpenCode provider block.

Managed secret files use this default location pattern:

```text
~/.config/ocfg/secrets/<provider-id>.api-key
```

The OpenCode config stores a file reference like this:

```jsonc
"apiKey": "{file:~/.config/ocfg/secrets/custom.api-key}"
```

The tool creates the managed secrets directory with `0700` permissions and secret files with `0600` permissions where supported by the operating system.

CLI `--api-key` values may still be recorded by shell history or process inspection on some systems. Use a trusted shell environment and rotate any secret that may have been exposed.

## Write Safety

Mutating writes validate the full next config before writing.

TUI writes usually show a diff and require explicit confirmation before writing. The Exa search tools toggle is the one-click exception.

CLI writes support `--dry-run` to print the planned diff and validate without creating, modifying, or deleting files.

Real writes create a timestamped backup under the ocfg data directory, defaulting to `~/.config/ocfg/backups/configs/`, when the target already exists. OCfg keeps the latest 10 backups per config file path.

Real writes go through a temporary file and atomic rename.

If validation fails, the config file is not written. If a managed secret file was updated as part of a failed write, the tool attempts to restore its previous state.

## Development

Run checks:

```bash
npm run typecheck
npm test
npm run build
```

Run built CLI help:

```bash
node dist/cli.js --help
```
