# Roadmap

## Phase 0: Architecture Lock

Status: complete.

Decisions:

- Use TypeScript + Ink.
- Default to global OpenCode config.
- Allow explicit project-level config editing.
- Use endpoint/protocol templates, not commercial proxy templates.
- Resolve model metadata by `models.dev`, then built-in templates, then manual input.
- Store API keys via `{env:...}` or `{file:...}` by default.
- Use an optional plugin wrapper, not an OpenCode core fork.

## Phase 1: Foundation

Goal: create a working CLI package with safe config discovery and validation.

Deliverables:

- npm package scaffold.
- TypeScript build and test setup.
- CLI entrypoint `opencode-provider-editor`.
- Config target discovery for global, project, and explicit path.
- JSONC parsing.
- OpenCode schema validation.
- `doctor` command with initial diagnostics.

Exit criteria:

- `opencode-provider-editor --help` works.
- `opencode-provider-editor doctor` can inspect an existing config.
- Invalid config reports schema paths and human-readable messages.

## Phase 2: Safe Editing Core

Goal: support safe config mutation without a full TUI.

Deliverables:

- Provider add/edit/delete core functions.
- Model add/edit/delete core functions.
- Secret reference rendering.
- Diff generation.
- Backup writer.
- Atomic file writer.
- `--dry-run` support.

Exit criteria:

- A provider can be added to a temp JSONC config without deleting comments outside edited paths.
- Invalid output is rejected before write.
- Backup is created before real writes.
- Dry-run produces no file changes.

## Phase 3: Templates And Detection

Goal: make provider creation useful and safe for common endpoint protocols.

Deliverables:

- OpenAI-compatible template.
- OpenAI Responses template.
- Claude-compatible template.
- Gemini-compatible template.
- models.dev metadata fetcher with cache.
- OpenAI-compatible `/models` probe.
- Metadata merge rules.

Exit criteria:

- Tool can generate a valid provider config for all four endpoint types.
- Detected models are shown as untrusted IDs until capabilities are resolved or confirmed.
- Template fields never include schema-forbidden model fields.

## Phase 4: Ink TUI MVP

Goal: provide a usable visual configuration flow.

Deliverables:

- Home screen.
- Config target screen.
- Provider list screen.
- Add provider flow.
- Model capability review screen.
- Diff review screen.
- Doctor screen.

Exit criteria:

- User can add a global provider from the TUI.
- User can switch to project-level config before writing.
- User must confirm diff before write.
- User sees clear next steps after write.

## Phase 5: Edit And Delete Flows

Goal: support complete provider lifecycle management.

Deliverables:

- Edit provider options.
- Edit model capabilities.
- Add/remove models.
- Delete provider with reference checks.
- Set `model` and `small_model` defaults.

Exit criteria:

- Tool warns when deleting the provider used by `model` or `small_model`.
- Tool blocks accidental destructive actions unless explicitly confirmed.
- Config validates after every write.

## Phase 6: Plugin Wrapper

Goal: make the tool feel part of the OpenCode plugin ecosystem without relying on unsupported TUI hooks.

Deliverables:

- OpenCode plugin entrypoint.
- Plugin README instructions.
- Startup log/toast hint when possible.
- Optional lightweight diagnostics hook if stable in current OpenCode plugin API.

Exit criteria:

- Package can be referenced from OpenCode `plugin` config.
- Plugin does not break OpenCode startup if the CLI is unavailable.
- Plugin does not mutate config automatically.

## Phase 7: Runtime Reload Experiment

Goal: investigate best-effort runtime refresh without promising it.

Deliverables:

- Version-gated reload adapter.
- Detection of current OpenCode version/capabilities.
- Clear fallback message when restart is required.

Exit criteria:

- If reload works on supported versions, tell the user.
- If reload cannot be proven safe, tell the user to restart OpenCode.
- No hidden mutation of running OpenCode state.

## Phase 8: Hardening And Release

Goal: prepare a stable v1.

Deliverables:

- Full test suite.
- Fixture configs for all endpoint templates.
- README.
- Security notes.
- Changelog.
- npm package publishing workflow.

Exit criteria:

- Generated configs validate against OpenCode schema.
- No plaintext API key is written in the default path.
- All destructive flows require confirmation.
- Package installs and runs on Linux/macOS.
