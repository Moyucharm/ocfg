# Security

OpenCode Provider Editor is designed to reduce the risk of breaking OpenCode config files or accidentally storing API keys in plaintext provider blocks.

## Supported Security Model

The tool edits local OpenCode configuration files only.

It validates the complete next config before mutating writes.

It avoids plaintext API keys in the OpenCode config by default.

It writes config changes through backup creation and atomic rename.

It requires extra confirmation tokens for deleting providers or models referenced by top-level defaults.

It does not send API keys to a production API except when probing a user-provided endpoint for model discovery.

## API Key Handling

The default strategy stores API key content in a managed secret file and writes a `{file:...}` reference into OpenCode config.

Default managed secret path pattern:

```text
~/.config/opencode-provider-editor/secrets/<provider-id>.api-key
```

Default config reference pattern:

```jsonc
"apiKey": "{file:~/.config/opencode-provider-editor/secrets/custom.api-key}"
```

The managed secrets directory is created with `0700` permissions.

Managed secret files are written with `0600` permissions.

Provider IDs are normalized before being used as secret file names.

## CLI Secret Risks

Passing secrets through `--api-key` can expose them through shell history, terminal scrollback, process listings, audit logs, or command wrappers.

Prefer running commands in a trusted local shell.

Avoid sharing terminal recordings or logs that include command lines with `--api-key`.

Rotate keys if command history or logs may have exposed them.

## TUI Secret Risks

The TUI masks typed API key length in the display, but terminal software, accessibility tools, recorders, or compromised systems may still observe input.

Use the TUI only on trusted local machines.

## Model Detection Network Access

OpenAI-compatible model detection can call a configured endpoint's `/models` route.

The request may include the provider API key if the endpoint requires authentication.

Only probe endpoints you trust.

Use manual model entry when you do not want the tool to contact an endpoint.

## Write Safety

TUI mutating flows show a diff before writing and require explicit confirmation.

CLI mutating flows support `--dry-run` to validate and print the planned diff without writing.

Real writes validate the complete next config before writing.

Real writes create a timestamped backup beside an existing target config before replacing it.

Real writes use a temporary file followed by atomic rename.

Dry runs do not create config files, secret files, backups, or temporary write outputs.

## Destructive Operations

Deleting a provider referenced by `model` or `small_model` requires an exact token such as `delete:custom`.

Deleting a model referenced by `model` or `small_model` requires an exact token such as `delete:custom/model`.

The TUI displays references before allowing referenced deletes.

The CLI accepts `--confirm-token` for referenced deletes.

## Backups And Recovery

Backups are written beside the target config file with a timestamped `.bak` suffix.

If a write fails after a managed secret file was changed, the tool attempts to restore the previous secret file snapshot.

Backup files may contain previous provider metadata and secret references.

Protect backup files with the same care as the main OpenCode config file.

## Boundaries

This tool does not encrypt secret files.

This tool does not manage operating system keychains.

This tool does not guarantee OpenCode runtime hot reload.

This tool does not patch or fork OpenCode core.

This tool does not provide a v1 OpenCode plugin workflow; the plugin wrapper is deprecated for v1.

Users remain responsible for local file permissions, shell history hygiene, endpoint trust, key rotation, and system compromise response.

## Reporting Security Issues

Do not disclose sensitive API keys, production configs, or private endpoint URLs in public reports.

When reporting an issue, include the command shape, operating system, Node version, and redacted config snippets sufficient to reproduce the problem.
