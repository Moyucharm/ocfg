import type { Diagnostic, SecretRef } from "./types.js"

export class PlaintextSecretError extends Error {
  constructor() {
    super("Plaintext API keys require explicit confirmation")
  }
}

export function renderSecretRef(ref: SecretRef): string {
  if (ref.type === "env") return `{env:${ref.name}}`
  if (ref.type === "file") return `{file:${ref.path}}`
  if (!ref.explicit) throw new PlaintextSecretError()
  return ref.value
}

export function looksLikeSecret(value: string): boolean {
  if (value.startsWith("{env:") || value.startsWith("{file:")) return false
  return /^(sk-|sk_|AIza|xai-|claude-|ghp_|glpat-|[A-Za-z0-9_-]{32,})/.test(value)
}

export function detectPlaintextApiKey(value: string, path = "/provider/options/apiKey"): Diagnostic[] {
  if (!looksLikeSecret(value)) return []
  return [
    {
      severity: "medium",
      source: "config",
      path,
      message: "API key appears to be plaintext; prefer {env:...} or {file:...}",
    },
  ]
}

export function assertPlaintextAllowed(ref: SecretRef): void {
  if (ref.type === "plaintext" && !ref.explicit) throw new PlaintextSecretError()
}
