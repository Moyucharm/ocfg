# Execution Plan

This plan is written for an AI coding agent. Execute waves in order. Tasks within the same wave may be parallelized when they do not touch the same files.

## Wave 1: Package Foundation

<task type="auto" id="1.1">
  <title>Initialize package scaffold</title>
  <files>
    <file>package.json</file>
    <file>tsconfig.json</file>
    <file>vitest.config.ts</file>
    <file>src/cli.ts</file>
  </files>
  <instructions>
    Create a TypeScript npm package with a bin named `opencode-provider-editor`.
    Add scripts for `build`, `test`, `typecheck`, and `dev`.
    Use ESM unless a dependency forces otherwise.
    Add dependencies: `commander`, `ink`, `react`, `jsonc-parser`, `ajv`, `zod`.
    Add dev dependencies: `typescript`, `vitest`, `@types/node`, and React/Ink types if needed.
  </instructions>
  <verification>
    <command>npm run build</command>
    <command>node dist/cli.js --help</command>
  </verification>
</task>

<task type="auto" id="1.2">
  <title>Add shared types</title>
  <files>
    <file>src/core/types.ts</file>
  </files>
  <instructions>
    Define `EndpointKind`, `SecretRef`, `ProviderDraft`, `ModelDraft`, `ConfigScope`, `ConfigTarget`, `Diagnostic`, and `Severity`.
    Keep types aligned with OpenCode schema-supported fields.
    Do not add unsupported model fields such as `vision`.
  </instructions>
  <verification>
    <command>npm run typecheck</command>
  </verification>
</task>

## Wave 2: Config Discovery And Reading

<task type="auto" id="2.1">
  <title>Implement config locator</title>
  <files>
    <file>src/core/config-locator.ts</file>
    <file>tests/config-locator.test.ts</file>
  </files>
  <instructions>
    Implement global config target resolution.
    Default global target should be `~/.config/opencode/opencode.jsonc`.
    Implement project config discovery by walking upward from cwd for `opencode.jsonc` or `opencode.json`.
    Implement explicit path override.
    If no project config exists and project scope is requested, propose creating `opencode.jsonc` in cwd.
  </instructions>
  <verification>
    <command>npm test -- config-locator</command>
  </verification>
</task>

<task type="auto" id="2.2">
  <title>Implement JSONC reader</title>
  <files>
    <file>src/core/config-reader.ts</file>
    <file>tests/config-reader.test.ts</file>
  </files>
  <instructions>
    Read config files as text.
    Parse JSON and JSONC with `jsonc-parser`.
    Return parsed data, original text, parse errors, and file path.
    For missing config files, return an empty config document with `$schema` initialized when writing is requested, but do not create files during read.
  </instructions>
  <verification>
    <command>npm test -- config-reader</command>
  </verification>
</task>

## Wave 3: Validation And Diagnostics

<task type="auto" id="3.1">
  <title>Implement OpenCode schema validation</title>
  <files>
    <file>src/core/schema-validator.ts</file>
    <file>tests/schema-validator.test.ts</file>
  </files>
  <instructions>
    Load `https://opencode.ai/config.json` with a timeout.
    Cache the schema locally in memory for a process run.
    Allow tests to inject a schema fixture.
    Validate complete config objects with Ajv.
    Return normalized diagnostics with path, message, severity, and source.
  </instructions>
  <verification>
    <command>npm test -- schema-validator</command>
  </verification>
</task>

<task type="auto" id="3.2">
  <title>Implement doctor checks</title>
  <files>
    <file>src/core/doctor.ts</file>
    <file>tests/doctor.test.ts</file>
  </files>
  <instructions>
    Add checks for missing provider/model references from `model` and `small_model`.
    Add checks for plaintext-looking API keys.
    Add checks for missing provider models.
    Add checks for missing model limits.
    Add endpoint/npm mismatch checks based on known template metadata.
    Do not mutate config.
  </instructions>
  <verification>
    <command>npm test -- doctor</command>
  </verification>
</task>

## Wave 4: Templates And Metadata

<task type="auto" id="4.1">
  <title>Create endpoint templates</title>
  <files>
    <file>src/templates/openai-compatible.ts</file>
    <file>src/templates/openai-responses.ts</file>
    <file>src/templates/anthropic-compatible.ts</file>
    <file>src/templates/gemini-compatible.ts</file>
    <file>src/templates/index.ts</file>
    <file>tests/templates.test.ts</file>
  </files>
  <instructions>
    Implement template descriptors for each `EndpointKind`.
    Each descriptor must provide recommended npm package, base URL guidance, probing support, and model capability presets.
    OpenAI-compatible should recommend `@ai-sdk/openai-compatible`.
    OpenAI Responses should recommend `@ai-sdk/openai`.
    Claude-compatible should recommend `@ai-sdk/anthropic`.
    Gemini-compatible should recommend `@ai-sdk/google` unless the user explicitly chooses an OpenAI-compatible Gemini proxy.
  </instructions>
  <verification>
    <command>npm test -- templates</command>
  </verification>
</task>

<task type="auto" id="4.2">
  <title>Implement model detection</title>
  <files>
    <file>src/core/model-detector.ts</file>
    <file>tests/model-detector.test.ts</file>
  </files>
  <instructions>
    Implement OpenAI-compatible `/models` probing.
    Normalize model IDs from `data[].id` responses.
    Treat detected IDs as untrusted metadata until capability resolution.
    Use configurable fetch timeout.
    Return recoverable diagnostics on network failure instead of throwing for normal endpoint failures.
  </instructions>
  <verification>
    <command>npm test -- model-detector</command>
  </verification>
</task>

<task type="auto" id="4.3">
  <title>Implement template resolver</title>
  <files>
    <file>src/core/template-resolver.ts</file>
    <file>tests/template-resolver.test.ts</file>
  </files>
  <instructions>
    Merge model metadata by priority: models.dev first, built-in templates second, manual draft third.
    Manual draft must override automatic values.
    Do not output unsupported model fields.
    Provide confidence labels: `exact`, `family`, `generic`, `manual`.
  </instructions>
  <verification>
    <command>npm test -- template-resolver</command>
  </verification>
</task>

## Wave 5: Safe Writing

<task type="auto" id="5.1">
  <title>Implement provider editor core</title>
  <files>
    <file>src/core/provider-editor.ts</file>
    <file>tests/provider-editor.test.ts</file>
  </files>
  <instructions>
    Implement pure functions to add, update, and delete providers on parsed config objects.
    Implement pure functions to add, update, and delete models under providers.
    Implement setting `model` and `small_model`.
    Refuse deletion when provider is referenced unless caller passes an explicit risk confirmation token.
  </instructions>
  <verification>
    <command>npm test -- provider-editor</command>
  </verification>
</task>

<task type="auto" id="5.2">
  <title>Implement diff and safe writer</title>
  <files>
    <file>src/core/diff.ts</file>
    <file>src/core/config-writer.ts</file>
    <file>tests/config-writer.test.ts</file>
  </files>
  <instructions>
    Generate a readable before/after diff.
    Use `jsonc-parser` edits where practical.
    Create timestamped backups beside the target file.
    Write to a temporary file then atomically rename.
    Implement dry-run mode that returns planned output without writing.
  </instructions>
  <verification>
    <command>npm test -- config-writer</command>
  </verification>
</task>

<task type="auto" id="5.3">
  <title>Implement secret strategy</title>
  <files>
    <file>src/core/secret-strategy.ts</file>
    <file>tests/secret-strategy.test.ts</file>
  </files>
  <instructions>
    Render env references as `{env:NAME}`.
    Render file references as `{file:path}`.
    Detect plaintext-looking API keys and return warnings.
    Require explicit advanced confirmation for plaintext output.
  </instructions>
  <verification>
    <command>npm test -- secret-strategy</command>
  </verification>
</task>

## Wave 6: CLI Commands

<task type="auto" id="6.1">
  <title>Wire doctor and validate commands</title>
  <files>
    <file>src/cli.ts</file>
    <file>src/commands/doctor.ts</file>
    <file>src/commands/validate.ts</file>
  </files>
  <instructions>
    Add `doctor` and `validate` commands.
    Support `--config-scope`, `--config-path`, and JSON output option if simple.
    Exit non-zero on high severity diagnostics.
  </instructions>
  <verification>
    <command>npm run build</command>
    <command>node dist/cli.js doctor --help</command>
  </verification>
</task>

<task type="auto" id="6.2">
  <title>Wire add and edit commands</title>
  <files>
    <file>src/cli.ts</file>
    <file>src/commands/add.ts</file>
    <file>src/commands/edit.ts</file>
    <file>src/commands/delete.ts</file>
  </files>
  <instructions>
    Add non-TUI command paths for add/edit/delete sufficient for tests and automation.
    All mutating commands must support `--dry-run`.
    Do not write unless validation passes.
  </instructions>
  <verification>
    <command>npm run build</command>
  </verification>
</task>

## Wave 7: Ink TUI

<task type="auto" id="7.1">
  <title>Create TUI shell</title>
  <files>
    <file>src/tui/app.tsx</file>
    <file>src/tui/screens/home.tsx</file>
    <file>src/tui/screens/select-config.tsx</file>
  </files>
  <instructions>
    Build a minimal keyboard-driven Ink app.
    Home screen should expose Doctor, Add Provider, Edit Provider, Delete Provider, and Switch Config Target.
    Default config target must be global.
  </instructions>
  <verification>
    <command>npm run build</command>
  </verification>
</task>

<task type="auto" id="7.2">
  <title>Create provider and model screens</title>
  <files>
    <file>src/tui/screens/provider-list.tsx</file>
    <file>src/tui/screens/provider-edit.tsx</file>
    <file>src/tui/screens/model-edit.tsx</file>
  </files>
  <instructions>
    Implement add provider flow screens.
    Collect endpoint kind, provider ID, display name, baseURL, secret strategy, setCacheKey, and models.
    Show resolved model capabilities before diff review.
  </instructions>
  <verification>
    <command>npm run build</command>
  </verification>
</task>

<task type="auto" id="7.3">
  <title>Create diff and doctor screens</title>
  <files>
    <file>src/tui/screens/diff-review.tsx</file>
    <file>src/tui/screens/doctor.tsx</file>
  </files>
  <instructions>
    Show diagnostics grouped by severity.
    Show diff before write.
    Require confirmation before write.
    Show final next steps after write, including whether OpenCode restart may be required.
  </instructions>
  <verification>
    <command>npm run build</command>
  </verification>
</task>

## Wave 8: Plugin Wrapper

<task type="auto" id="8.1">
  <title>Add OpenCode plugin entrypoint</title>
  <files>
    <file>src/plugin/index.ts</file>
    <file>package.json</file>
  </files>
  <instructions>
    Export an OpenCode plugin function.
    Keep behavior minimal and safe.
    Log installation status if `client.app.log` is available.
    If TUI toast hooks are available in the current OpenCode runtime, show a hint to run `opencode-provider-editor`.
    Do not mutate config from the plugin in v1.
  </instructions>
  <verification>
    <command>npm run build</command>
  </verification>
</task>

## Wave 9: Documentation And Release Prep

<task type="auto" id="9.1">
  <title>Add user documentation</title>
  <files>
    <file>README.md</file>
    <file>SECURITY.md</file>
  </files>
  <instructions>
    Document install, CLI commands, plugin usage, config target behavior, secret handling, and limitations.
    Explicitly state that runtime hot reload is best-effort and restart may be required.
  </instructions>
  <verification>
    <command>npm run build</command>
  </verification>
</task>

<task type="auto" id="9.2">
  <title>Add fixture-based integration tests</title>
  <files>
    <file>tests/fixtures/openai-compatible.config.jsonc</file>
    <file>tests/fixtures/openai-responses.config.jsonc</file>
    <file>tests/fixtures/anthropic-compatible.config.jsonc</file>
    <file>tests/fixtures/gemini-compatible.config.jsonc</file>
    <file>tests/integration/generated-configs.test.ts</file>
  </files>
  <instructions>
    Add generated config fixtures for all endpoint kinds.
    Validate each fixture against the OpenCode config schema fixture.
    Ensure no fixture contains plaintext API keys.
  </instructions>
  <verification>
    <command>npm test</command>
    <command>npm run typecheck</command>
    <command>npm run build</command>
  </verification>
</task>
