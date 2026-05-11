# Phase 2 Detailed Plan: Safe Editing Core

## Goal

Implement safe, testable configuration mutation primitives before any full TUI is built.

## Scope

Phase 2 includes:

- Secret reference rendering and plaintext key detection.
- Pure provider/model editing functions.
- Default `model` and `small_model` setters.
- Reference checks before destructive deletes.
- Readable config diff generation.
- Dry-run-safe config writer.
- Backup creation before real writes.
- Atomic write through a temporary file.

Phase 2 excludes:

- Ink TUI screens.
- Endpoint templates.
- `/v1/models` probing.
- models.dev metadata merging.
- OpenCode plugin wrapper.
- Runtime hot reload.

## Safety Rules

- All core editor functions must be pure and must not mutate the input config object.
- Real writes must validate the next config before writing.
- Dry-run must not create, modify, or delete any file.
- Existing files must be backed up before real writes.
- Deleting a provider or model referenced by `model` or `small_model` must require an explicit confirmation token.
- Plaintext API keys must not be emitted unless explicitly confirmed by the caller.

## Implementation Order

1. Implement `src/core/secret-strategy.ts` and `tests/secret-strategy.test.ts`.
2. Implement `src/core/provider-editor.ts` and `tests/provider-editor.test.ts`.
3. Implement `src/core/diff.ts`.
4. Implement `src/core/config-writer.ts` and `tests/config-writer.test.ts`.
5. Run full verification.

## Verification

Run:

```bash
npm run typecheck
npm test
npm run build
```

Manual smoke checks remain read-only unless a temporary `--config-path` is used.
