# Execution Plan v2

This plan replaces the legacy wave plan after the Plugin Wrapper wave was deprecated.

The product direction is now a standalone CLI/TUI OpenCode provider configuration tool. Do not implement the deprecated plugin wrapper unless a future OpenCode plugin API provides concrete value that the standalone tool cannot safely provide.

## Current Baseline

The following capabilities are treated as already accepted:

- Package foundation.
- Config discovery and reading.
- Schema validation and doctor diagnostics.
- Endpoint templates and model metadata resolution.
- Safe config writing with dry-run, validation, backup, and atomic rename.
- CLI commands for doctor, validate, add, edit, and delete.
- TUI shell, config selection, doctor screen, add provider flow, capability review, and diff review.
- Plugin Wrapper is deprecated for v1.

## Execution Rules

- Implement one task at a time and stop for acceptance after each task.
- Do not skip verification commands for a completed task unless there is a documented blocker.
- Do not implement deprecated plugin wrapper work.
- Do not enter release documentation until TUI actions exposed on Home have real flows or are deliberately removed from v1 scope.
- Every mutating TUI flow must show a diff before writing, require explicit confirmation, validate before writing, and use the existing safe writer.
- Preserve JSONC comments where practical by using existing JSONC edit helpers.

## Wave 8R: TUI Provider Lifecycle

Goal: complete the TUI actions already exposed by Home so users are not sent to placeholder flows.

### 8R.1 Edit Provider Flow

Files:

- `src/tui/app.tsx`
- `src/tui/types.ts`
- `src/tui/screens/home.tsx`
- `src/tui/screens/provider-list.tsx`
- `src/tui/screens/provider-edit.tsx`
- `src/core/provider-editor.ts` if needed
- Tests where practical

Instructions:

- Replace the Edit Provider placeholder with a real TUI flow.
- Load providers from the selected config target.
- Let the user select an existing provider.
- Support editing provider display name.
- Support editing npm package.
- Support editing baseURL.
- Support editing apiKey using existing secret strategies.
- Support editing setCacheKey.
- Show diff before write.
- Require explicit confirmation before write.
- Validate before write.
- Preserve JSONC comments where practical.

Verification:

- `npm run typecheck`
- `npm test`
- `npm run build`
- Manual TUI smoke: Edit Provider no longer shows the placeholder message.

Acceptance:

- Home -> Edit Provider opens provider selection.
- Empty provider list shows a clear empty state.
- Existing providers can be selected.
- Editing name/baseURL/npm/setCacheKey produces a diff.
- Cancel does not write.
- Confirm writes only after validation.
- Successful write shows backup and restart hint.
- Secret handling does not default to plaintext.

### 8R.2 Edit Model Flow

Files:

- `src/tui/app.tsx`
- `src/tui/types.ts`
- `src/tui/screens/provider-list.tsx`
- `src/tui/screens/model-edit.tsx`
- Possibly new `src/tui/screens/model-list.tsx`
- Tests where practical

Instructions:

- Add a TUI path for editing existing model capabilities.
- Let the user select provider then model.
- Support editing model display name.
- Support editing context/output limits.
- Support toggling reasoning, tool_call, temperature, and attachment if practical.
- Show diff before write.
- Require confirmation before write.
- Validate before write.

Verification:

- `npm run typecheck`
- `npm test`
- `npm run build`

Acceptance:

- Existing models can be selected.
- Editing limits does not drop existing unrelated model fields.
- Diff is shown before write.
- Cancel does not write.
- Confirm writes only after validation.

### 8R.3 Add And Remove Models

Files:

- `src/tui/app.tsx`
- `src/tui/types.ts`
- `src/tui/screens/provider-list.tsx`
- `src/tui/screens/model-edit.tsx`
- Possibly new `src/tui/screens/model-list.tsx`
- Tests where practical

Instructions:

- Add TUI support for adding models to an existing provider.
- Reuse model detection and template resolver where applicable.
- Show resolved model capabilities before diff review.
- Add TUI support for deleting a model.
- Block deleting a model referenced by `model` or `small_model` unless explicitly confirmed.

Verification:

- `npm run typecheck`
- `npm test`
- `npm run build`

Acceptance:

- A model can be added to an existing provider.
- Model capabilities are shown before diff review.
- A non-referenced model can be deleted after diff confirmation.
- A referenced model requires explicit confirmation.
- Config validates after write.

### 8R.4 Delete Provider Flow

Files:

- `src/tui/app.tsx`
- `src/tui/types.ts`
- `src/tui/screens/provider-list.tsx`
- Possibly new `src/tui/screens/delete-confirm.tsx`
- Tests where practical

Instructions:

- Replace Delete Provider placeholder with a real TUI flow.
- Let the user select a provider.
- Show provider references from `model` and `small_model`.
- Block referenced deletion unless the user enters an explicit confirmation token.
- Show diff before write.
- Require confirmation before write.
- Validate before write.

Verification:

- `npm run typecheck`
- `npm test`
- `npm run build`

Acceptance:

- Home -> Delete Provider no longer shows placeholder.
- Non-referenced provider deletion requires diff confirmation.
- Referenced provider deletion requires explicit token.
- Cancel does not write.
- Confirm writes only after validation.

### 8R.5 Set Default Model Flow

Files:

- `src/tui/app.tsx`
- `src/tui/types.ts`
- `src/tui/screens/home.tsx`
- Possibly new `src/tui/screens/default-model.tsx`
- Tests where practical

Instructions:

- Add or wire TUI support for setting `model` and `small_model`.
- Let the user select provider/model from existing config.
- Warn before changing defaults.
- Show diff before write.
- Require confirmation before write.
- Validate before write.

Verification:

- `npm run typecheck`
- `npm test`
- `npm run build`

Acceptance:

- User can set top-level `model`.
- User can set top-level `small_model`.
- Only existing provider/model refs can be selected.
- Diff is shown before write.
- Cancel does not write.
- Confirm writes only after validation.

## Wave 9: Release Documentation

Goal: document the actual standalone CLI/TUI product after provider lifecycle flows are complete.

### 9.1 User Documentation

Files:

- `README.md`
- `SECURITY.md`

Instructions:

- Document installation.
- Document CLI commands.
- Document TUI flows.
- Document config target behavior.
- Document secret handling.
- Document dry-run, validation, diff, backup, and atomic write behavior.
- Document limitations.
- Explicitly state that Plugin Wrapper is deprecated for v1.
- Explicitly state that OpenCode restart may be required.

Verification:

- `npm run build`

Acceptance:

- README explains standalone CLI/TUI usage.
- SECURITY explains secret policy and safe writing.
- No plugin-based workflow is advertised as a v1 feature.
- Runtime hot reload is not promised.

## Wave 10: Fixture Integration Tests

Goal: prove generated provider configs are valid and safe.

### 10.1 Endpoint Fixtures

Files:

- `tests/fixtures/openai-compatible.config.jsonc`
- `tests/fixtures/openai-responses.config.jsonc`
- `tests/fixtures/anthropic-compatible.config.jsonc`
- `tests/fixtures/gemini-compatible.config.jsonc`
- `tests/integration/generated-configs.test.ts`

Instructions:

- Add fixture configs for all endpoint kinds.
- Validate fixtures against schema fixture or injected schema.
- Ensure no fixture contains plaintext API keys.
- Ensure generated model fields are schema-supported.
- Ensure provider npm matches endpoint kind.

Verification:

- `npm test`
- `npm run typecheck`
- `npm run build`

Acceptance:

- All endpoint fixtures validate.
- No fixture contains plaintext API keys.
- Fixtures cover all endpoint kinds.
- Tests fail if unsupported model fields appear.

## Wave 11: Release Hardening

Goal: prepare v1 release without adding new product scope.

### 11.1 Final Verification And Packaging Checks

Files:

- `package.json`
- `README.md` if needed
- `SECURITY.md` if needed
- Optional `CHANGELOG.md`

Instructions:

- Run full verification.
- Check bin entrypoint.
- Check package metadata.
- Add changelog only if needed.
- Do not reintroduce Plugin Wrapper.
- Do not add runtime reload promises.

Verification:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `node dist/cli.js --help`
- `node dist/cli.js doctor --help`
- `node dist/cli.js validate --help`

Acceptance:

- CLI help works from dist.
- Full test suite passes.
- Build succeeds.
- Package metadata matches standalone CLI/TUI positioning.
