import Ajv2020 from "ajv/dist/2020.js"
import type { ErrorObject, ValidateFunction } from "ajv"
import type { Diagnostic } from "./types.js"

export type SchemaValidatorOptions = {
  schema?: Record<string, unknown>
  modelSchema?: Record<string, unknown>
  fetchImpl?: typeof fetch
  schemaUrl?: string
  modelSchemaUrl?: string
  relaxModelEnum?: boolean
}

export type SchemaValidationResult = {
  valid: boolean
  diagnostics: Diagnostic[]
}

const DEFAULT_SCHEMA_URL = "https://opencode.ai/config.json"
const DEFAULT_TUI_SCHEMA_URL = "https://opencode.ai/tui.json"
const DEFAULT_MODEL_SCHEMA_URL = "https://models.dev/model-schema.json"

let cachedValidator: ValidateFunction | undefined
let cachedTuiValidator: ValidateFunction | undefined

type AjvInstance = {
  addSchema: (schema: Record<string, unknown>, key?: string) => AjvInstance
  compile: (schema: Record<string, unknown>) => ValidateFunction
}

const AjvConstructor = Ajv2020 as unknown as new (options: Record<string, unknown>) => AjvInstance

function createAjv() {
  return new AjvConstructor({
    allErrors: true,
    strict: false,
    validateSchema: false,
  })
}

function normalizeError(error: ErrorObject): Diagnostic {
  const path = error.instancePath || "/"
  return {
    severity: "high",
    source: "schema",
    path,
    message: `${path} ${error.message ?? "is invalid"}`,
  }
}

export async function loadOpenCodeSchema(options: SchemaValidatorOptions = {}) {
  if (options.schema) return options.schema

  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(options.schemaUrl ?? DEFAULT_SCHEMA_URL, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Failed to fetch OpenCode schema: HTTP ${response.status}`)
  return (await response.json()) as Record<string, unknown>
}

export async function loadOpenCodeTuiSchema(options: SchemaValidatorOptions = {}) {
  if (options.schema) return options.schema

  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(options.schemaUrl ?? DEFAULT_TUI_SCHEMA_URL, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Failed to fetch OpenCode TUI schema: HTTP ${response.status}`)
  return (await response.json()) as Record<string, unknown>
}

async function loadModelSchema(options: SchemaValidatorOptions = {}) {
  const relaxModelEnum = options.relaxModelEnum ?? true
  if (options.modelSchema) return relaxModelEnum ? relaxModelSchema(options.modelSchema) : options.modelSchema

  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(options.modelSchemaUrl ?? DEFAULT_MODEL_SCHEMA_URL, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Failed to fetch models.dev schema: HTTP ${response.status}`)
  const schema = (await response.json()) as Record<string, unknown>
  return relaxModelEnum ? relaxModelSchema(schema) : schema
}

function relaxModelSchema(schema: Record<string, unknown>) {
  const clone = structuredClone(schema) as Record<string, unknown>
  const defs = clone.$defs
  if (defs && typeof defs === "object" && !Array.isArray(defs)) {
    ;(defs as Record<string, unknown>).Model = { type: "string" }
  }
  return clone
}

export async function createSchemaValidator(options: SchemaValidatorOptions = {}) {
  if (!options.schema && cachedValidator) return cachedValidator

  const schema = await loadOpenCodeSchema(options)
  const modelSchema = await loadModelSchema(options)
  const ajv = createAjv()
  ajv.addSchema(modelSchema, DEFAULT_MODEL_SCHEMA_URL)
  const validate = ajv.compile(schema)
  if (!options.schema) cachedValidator = validate
  return validate
}

export async function createTuiSchemaValidator(options: SchemaValidatorOptions = {}) {
  if (!options.schema && cachedTuiValidator) return cachedTuiValidator

  const schema = await loadOpenCodeTuiSchema(options)
  const ajv = createAjv()
  const validate = ajv.compile(schema)
  if (!options.schema) cachedTuiValidator = validate
  return validate
}

export async function validateConfig(
  config: Record<string, unknown>,
  options: SchemaValidatorOptions = {},
): Promise<SchemaValidationResult> {
  const validate = await createSchemaValidator(options)
  const valid = validate(config)
  return {
    valid,
    diagnostics: valid ? [] : (validate.errors ?? []).map(normalizeError),
  }
}

export async function validateTuiConfig(
  config: Record<string, unknown>,
  options: SchemaValidatorOptions = {},
): Promise<SchemaValidationResult> {
  const validate = await createTuiSchemaValidator(options)
  const valid = validate(config)
  return {
    valid,
    diagnostics: valid ? [] : (validate.errors ?? []).map(normalizeError),
  }
}
