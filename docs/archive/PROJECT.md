# OCfg Project Spec

## App Concept

OCfg is a TypeScript CLI/TUI tool that configures global and project-level OpenCode model providers with schema validation, templates, backups, and diagnostics.

## Core Decision

Use route A: an independent CLI/TUI configuration tool. The previously planned optional OpenCode plugin wrapper is deprecated for v1 because it does not add meaningful capability beyond the standalone tool.

This avoids maintaining an OpenCode fork and keeps the product surface focused on the standalone CLI/TUI.

## Non-Goals

- Do not fork or patch OpenCode core in v1.
- Do not replace or modify OpenCode's built-in `/models` picker in v1.
- Do not promise runtime provider hot reload in v1.
- Do not support the OpenCode Web UI in v1.
- Do not store API keys in plaintext by default.
- Do not treat commercial proxy names as templates. Templates are protocol/endpoint based.

## Target Users

Developers who use OpenCode and need to configure custom third-party model endpoints safely without manually editing fragile `opencode.jsonc` provider blocks.

## Tech Stack

- Language: TypeScript
- Runtime: Node.js-compatible CLI, Bun-compatible where practical
- TUI: Ink + React
- CLI: commander
- JSONC parsing/editing: jsonc-parser
- Validation: Ajv with OpenCode config schema
- Internal validation: zod where useful for draft objects
- Diff output: structured textual diff
- Tests: Vitest
- Package distribution: npm

## OpenCode Configuration Facts

OpenCode officially supports both global and project-level config files.

Global config:

```text
~/.config/opencode/opencode.json
~/.config/opencode/opencode.jsonc
```

Project-level config:

```text
opencode.json
opencode.jsonc
```

Project config is real and officially documented. OpenCode searches the current directory and walks upward toward the nearest Git directory. Config files are merged, and later sources override earlier sources. Project config can override global config.

For this project, the default target is global config first because model providers are usually user-level preferences. The TUI must allow switching to project-level config.

Default selection rule:

1. Default to global config at `~/.config/opencode/opencode.jsonc`.
2. If the user explicitly chooses project mode, edit the nearest project `opencode.jsonc` or create one in the current working directory.
3. If both `.json` and `.jsonc` exist in a target scope, prefer editing the existing file that OpenCode would load for that scope and warn about duplicate config files.

## Provider Types For MVP

Endpoint templates are protocol-based:

- OpenAI-compatible Chat Completions
- OpenAI Responses
- Claude-compatible Anthropic Messages
- Gemini-compatible / Google Generative AI

These templates define recommended `provider.npm`, endpoint expectations, model capability defaults, and safe validation rules.

## Security Model

Configuration mistakes can break OpenCode startup or waste model quota. The tool must therefore be conservative.

Mandatory safety behavior:

- Always validate the full target config before writing.
- Always show a diff before writing.
- Always create a timestamped backup before writing.
- Always write through a temporary file and atomic rename.
- Never write API keys in plaintext by default.
- Prefer `{env:VARIABLE}` and `{file:path}` secrets.
- Warn before deleting a provider referenced by `model`, `small_model`, or any agent.
- Warn before changing the default model.
- Refuse unknown top-level model fields that OpenCode schema does not support.
- Provide `--dry-run` for all mutating commands.

## API Key Strategy

Supported key reference strategies:

```jsonc
"apiKey": "{env:CUSTOM_PROVIDER_API_KEY}"
```

```jsonc
"apiKey": "{file:~/.secrets/custom-provider-key}"
```

Plaintext API keys are allowed only through an explicit advanced confirmation. They must never be the default path.

## Cache Key Strategy

The correct OpenCode option is `setCacheKey`, not `setCache`.

Provider-level configuration:

```jsonc
{
  "provider": {
    "custom-provider": {
      "options": {
        "setCacheKey": true
      }
    }
  }
}
```

Known behavior:

- `provider.options.setCacheKey: true` causes OpenCode to set `promptCacheKey` to the current session ID.
- `openai` provider sets `promptCacheKey` automatically.
- Some providers have special cache behavior, such as `openrouter` using `prompt_cache_key` and AI Gateway using `gateway.caching = "auto"`.

## Model Metadata Priority

Resolve model capabilities in this order:

1. `models.dev` metadata when there is a reliable provider/model match.
2. Built-in endpoint-family templates.
3. User manual input.

Never infer expensive or risky capabilities from model name alone without showing the result for confirmation.

## Data Model

```ts
export type EndpointKind =
  | "openai-compatible"
  | "openai-responses"
  | "anthropic-compatible"
  | "gemini-compatible"

export type SecretRef =
  | { type: "env"; name: string }
  | { type: "file"; path: string }
  | { type: "plaintext"; value: string; explicit: true }

export type ProviderDraft = {
  id: string
  name: string
  npm: string
  options: {
    baseURL?: string
    apiKey?: string
    headers?: Record<string, string>
    timeout?: number | false
    chunkTimeout?: number
    setCacheKey?: boolean
  }
  models: Record<string, ModelDraft>
}

export type ModelDraft = {
  id?: string
  name?: string
  family?: string
  release_date?: string
  attachment?: boolean
  reasoning?: boolean
  temperature?: boolean
  tool_call?: boolean
  interleaved?: true | { field: "reasoning_content" | "reasoning_details" }
  limit?: {
    context: number
    output: number
    input?: number
  }
  modalities?: {
    input: Array<"text" | "audio" | "image" | "video" | "pdf">
    output: Array<"text" | "audio" | "image" | "video" | "pdf">
  }
  options?: Record<string, unknown>
  headers?: Record<string, string>
  variants?: Record<string, Record<string, unknown>>
}
```

## Architecture

```text
src/
  cli.ts
  tui/
    app.tsx
    screens/
      home.tsx
      select-config.tsx
      provider-list.tsx
      provider-edit.tsx
      model-edit.tsx
      diff-review.tsx
      doctor.tsx
  core/
    config-locator.ts
    config-reader.ts
    config-writer.ts
    schema-validator.ts
    provider-editor.ts
    model-detector.ts
    template-resolver.ts
    secret-strategy.ts
    diff.ts
    doctor.ts
    types.ts
  templates/
    openai-compatible.ts
    openai-responses.ts
    anthropic-compatible.ts
    gemini-compatible.ts
    index.ts
  plugin/
    index.ts  # deprecated for v1; do not implement unless plugin value is re-established
```

## CLI Commands

```text
ocfg
ocfg doctor
ocfg add
ocfg edit
ocfg delete
ocfg validate
ocfg templates
```

All mutating commands must support:

```text
--config-scope global|project
--config-path <path>
--dry-run
--yes
```

`--yes` must not bypass destructive provider deletion if the provider is referenced by current defaults.

## TUI Flow

Home screen actions:

- Doctor
- Add provider
- Edit provider
- Delete provider
- Set default model
- Switch config target

Add provider flow:

1. Choose config target. Default: global.
2. Choose endpoint type.
3. Enter provider ID.
4. Enter provider display name.
5. Enter base URL.
6. Choose secret strategy.
7. Choose whether to enable `setCacheKey`.
8. Probe models if endpoint supports probing.
9. Select detected models or add model manually.
10. Resolve metadata from models.dev, built-in templates, and manual edits.
11. Review capabilities.
12. Review diff.
13. Validate schema.
14. Backup and write.
15. Show next steps.

## Doctor Checks

Doctor must report actionable diagnostics with severity.

High severity:

- Config fails OpenCode schema validation.
- Default `model` references a missing provider or model.
- Default `small_model` references a missing provider or model.
- Provider has invalid `baseURL`.
- Provider has no models and no reliable dynamic discovery support.
- Model has unknown schema-forbidden fields.

Medium severity:

- API key appears to be plaintext.
- Model lacks `limit.context` or `limit.output`.
- Provider `npm` does not match endpoint kind.
- Claude-compatible provider lacks `setCacheKey` recommendation.
- OpenAI-compatible endpoint cannot be probed.

Low severity:

- Provider display name is missing.
- Model display name is missing.
- Model lacks cost metadata.
- Project config overrides global default model.

## Plugin Wrapper Scope

Status: deprecated for v1.

The standalone CLI/TUI already provides the safe configuration path. A plugin wrapper that only logs installation status or hints at running the CLI is not valuable enough to include in v1.

The plugin wrapper is optional and intentionally small.

Responsibilities:

- Log that the helper is installed.
- Show a TUI toast or log hint to run `ocfg` when possible.
- Optionally run lightweight diagnostics at startup in later versions.

Non-responsibilities:

- It must not attempt to replace OpenCode's `/models` UI.
- It must not implement full forms inside OpenCode TUI.
- It must not assume config hot reload is available.

## Verification Requirements

Minimum tests:

- Config locator global/project/custom path behavior.
- JSONC parse and edit preserving comments where practical.
- Schema validation with valid and invalid provider blocks.
- Secret reference rendering.
- Endpoint template defaults.
- models.dev metadata merge priority.
- OpenAI-compatible `/models` probe success and failure.
- Safe writer backup and dry-run behavior.
- Doctor diagnostics for missing model references.

Manual verification:

- Generate global config for OpenAI-compatible endpoint.
- Generate global config for Claude-compatible endpoint.
- Generate global config for Gemini-compatible endpoint.
- Validate generated config against `https://opencode.ai/config.json`.
- Confirm `model` value format is `provider_id/model_id`.
