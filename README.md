# OCfg

OpenCode configuration editor.

[中文文档](./README.zh-CN.md)

## Features

- Inspect config health with `doctor`.
- Validate config against the OpenCode schema with `validate`.
- Add providers from protocol-oriented endpoint templates.
- Edit provider name, channel type, base URL, API key file reference, and `setCacheKey`.
- Edit model display names, limits, and common capability flags.
- Add or delete models under existing providers.
- Delete providers with reference checks for top-level defaults.
- Set or clear top-level `model` and `small_model` from the TUI.
- Install, enable, and disable OpenCode npm plugins and local plugin files.
- Preserve JSONC comments outside edited paths where practical.
- Write through validation, backup creation, and atomic rename.

## Installation

Install the package when published:

```bash
npm install -g ocfg
```

Run from a source checkout:

```bash
npm install
npm run build
node dist/cli.js --help
```

The package binary is named `ocfg`.

## Quick Start

Open the interactive terminal UI:

```bash
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

Add a provider with a managed secret file:

```bash
ocfg add provider custom \
  --channel-type openai-compatible \
  --base-url https://example.com/v1 \
  --api-key sk-example \
  --model example-model
```

Install an OpenCode npm plugin:

```bash
ocfg install plugin opencode-wakatime
```

Install a local plugin file:

```bash
ocfg install plugin ./my-plugin.ts --local --config-scope project
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
  [--dry-run]
```

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
  [--output <tokens>] \
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
ocfg list plugins [--config-scope global|project] [--config-path path] [--json]
```

Install or enable an npm plugin:

```bash
ocfg install plugin <package-name> [--options-json <json>] [--dry-run]
ocfg enable plugin <package-name> [--options-json <json>] [--dry-run]
```

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
ocfg add plugin <package-name> [--options-json <json>] [--dry-run]
```

Edit a plugin:

```bash
ocfg edit plugin <package-name> [--options-json <json> | --clear-options] [--dry-run]
```

Disable or delete an npm plugin:

```bash
ocfg disable plugin <package-name> [--dry-run]
ocfg delete plugin <package-name> [--dry-run]
```

Open the TUI:

```bash
ocfg tui
```

Referenced deletes require an exact confirmation token. For example, deleting provider `custom` while it is referenced by `model` or `small_model` requires `--confirm-token delete:custom`.

## TUI Flows

The TUI is opened with `ocfg tui`.

- `Doctor` shows actionable config diagnostics.
- `Add Provider` creates a provider through endpoint type, provider metadata, secret file storage, model detection or manual model entry, capability review, and diff review.
- `Edit Provider` selects an existing provider, edits provider fields, and can enter model management.
- `Manage Plugins` lists npm and local plugins, installs npm packages into config, installs local files into the OpenCode plugin directory, edits npm option JSON, and toggles local plugin files.
- `Delete Provider` selects an existing provider and requires extra confirmation for referenced providers.
- `Set Default Model` sets or clears top-level `model` and `small_model` using existing provider/model refs.
- `Switch Config Target` changes between global and project config targets before writing.

Config-mutating TUI flows show a diff before writing and require explicit confirmation. Local plugin installs report the affected file path; enable/disable changes are reflected directly in the plugin list status.

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

TUI writes show a diff and require explicit confirmation before writing.

CLI writes support `--dry-run` to print the planned diff and validate without creating, modifying, or deleting files.

Real writes create a timestamped backup next to the target file when the target already exists.

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
