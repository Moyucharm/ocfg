export type EndpointKind = "openai-compatible" | "openai-responses" | "anthropic-compatible" | "gemini-compatible"

export type SecretRef =
  | { type: "env"; name: string }
  | { type: "file"; path: string }
  | { type: "plaintext"; value: string; explicit: true }

export type ModelModality = "text" | "audio" | "image" | "video" | "pdf"

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
    input: ModelModality[]
    output: ModelModality[]
  }
  options?: Record<string, unknown>
  headers?: Record<string, string>
  provider?: { npm?: string; api?: string }
  variants?: Record<string, Record<string, unknown>>
}

export type ConfigScope = "global" | "project"

export type ConfigTarget = {
  scope: ConfigScope | "custom"
  path: string
  exists: boolean
  format: "json" | "jsonc"
}

export type Severity = "high" | "medium" | "low"

export type Diagnostic = {
  severity: Severity
  message: string
  path?: string
  source: "parse" | "schema" | "doctor" | "config"
}

export type ConfigDocument = {
  target: ConfigTarget
  text: string
  data: Record<string, unknown>
  diagnostics: Diagnostic[]
}

export type ConfigLocatorOptions = {
  cwd?: string
  home?: string
  scope?: ConfigScope
  configPath?: string
}
