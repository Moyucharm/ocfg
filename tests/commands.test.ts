import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parse } from "jsonc-parser"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { addProviderCommand } from "../src/commands/add.js"
import { deleteModelCommand, deleteProviderCommand } from "../src/commands/delete.js"
import { doctorCommand } from "../src/commands/doctor.js"
import { editModelCommand, editProviderCommand } from "../src/commands/edit.js"
import { validateCommand } from "../src/commands/validate.js"
import type { ValidationResult } from "../src/core/config-writer.js"

function valid(): ValidationResult {
  return { valid: true, diagnostics: [] }
}

function invalid(): ValidationResult {
  return { valid: false, diagnostics: [{ severity: "high", source: "schema", path: "/", message: "invalid" }] }
}

async function tempFile(name = "opencode.jsonc") {
  const dir = await mkdtemp(path.join(os.tmpdir(), "oc-provider-editor-commands-"))
  return path.join(dir, name)
}

async function writeConfig(text: string) {
  const filePath = await tempFile()
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, text)
  return filePath
}

describe("commands", () => {
  let exitCode: string | number | undefined
  let log: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    exitCode = process.exitCode
    process.exitCode = undefined
    log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({}), { status: 200 }))
  })

  afterEach(() => {
    process.exitCode = exitCode
    log.mockRestore()
    error.mockRestore()
    vi.unstubAllGlobals()
  })

  test("validate reports parse diagnostics as JSON without schema fetch", async () => {
    const filePath = await writeConfig('{ "model": ')

    await validateCommand({ configPath: filePath, json: true })

    const output = JSON.parse(log.mock.calls[0]?.[0] as string)
    expect(output.diagnostics[0].source).toBe("parse")
    expect(process.exitCode).toBe(1)
  })

  test("doctor exits non-zero on high severity diagnostics", async () => {
    const filePath = await writeConfig('{ "model": "p/missing", "provider": { "p": { "models": {} } } }')

    await doctorCommand({ configPath: filePath })

    expect(process.exitCode).toBe(1)
    expect(log.mock.calls.some((call) => String(call[0]).includes("missing model"))).toBe(true)
  })

  test("add provider dry-run does not create missing config", async () => {
    const filePath = await tempFile()

    await addProviderCommand("custom", {
      configPath: filePath,
      endpointKind: "openai-compatible",
      apiKeyEnv: "CUSTOM_API_KEY",
      model: ["model"],
      dryRun: true,
      validate: valid,
    })

    await expect(stat(filePath)).rejects.toThrow()
    expect(log.mock.calls.some((call) => String(call[0]).includes("Dry run"))).toBe(true)
  })

  test("add provider writes generated provider config", async () => {
    const filePath = await tempFile()

    await addProviderCommand("custom", {
      configPath: filePath,
      endpointKind: "gemini-compatible",
      apiKeyFile: "~/.secrets/gemini",
      model: ["gemini-2.5-pro"],
      validate: valid,
    })

    const config = parse(await readFile(filePath, "utf8"))
    expect(config.provider.custom.npm).toBe("@ai-sdk/google")
    expect(config.provider.custom.options.apiKey).toBe("{file:~/.secrets/gemini}")
  })

  test("add provider refuses unconfirmed plaintext secrets", async () => {
    const filePath = await tempFile()

    await expect(
      addProviderCommand("custom", {
        configPath: filePath,
        endpointKind: "openai-compatible",
        apiKeyPlaintext: "sk-test1234567890",
        model: ["model"],
        validate: valid,
      }),
    ).rejects.toThrow()
    await expect(stat(filePath)).rejects.toThrow()
  })

  test("edit provider preserves existing options", async () => {
    const filePath = await writeConfig(`{
  // keep
  "provider": {
    "custom": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Old",
      "options": { "apiKey": "{env:OLD}", "timeout": 10 },
      "models": { "model": { "limit": { "context": 1, "output": 1 } } }
    }
  }
}
`)

    await editProviderCommand("custom", { configPath: filePath, name: "New", baseUrl: "https://example.com/v1", validate: valid })

    const text = await readFile(filePath, "utf8")
    const config = parse(text)
    expect(text).toContain("// keep")
    expect(config.provider.custom.name).toBe("New")
    expect(config.provider.custom.options.timeout).toBe(10)
    expect(config.provider.custom.options.baseURL).toBe("https://example.com/v1")
  })

  test("edit model updates limits without dropping name", async () => {
    const filePath = await writeConfig(`{
  "provider": {
    "custom": {
      "models": { "model": { "name": "Model", "limit": { "context": 1, "output": 1 } } }
    }
  }
}
`)

    await editModelCommand("custom/model", { configPath: filePath, context: "100", output: "20", validate: valid })

    const config = parse(await readFile(filePath, "utf8"))
    expect(config.provider.custom.models.model.name).toBe("Model")
    expect(config.provider.custom.models.model.limit).toEqual({ context: 100, output: 20 })
  })

  test("delete provider requires exact token when referenced", async () => {
    const filePath = await writeConfig(`{
  "model": "custom/model",
  "provider": { "custom": { "models": { "model": {} } } }
}
`)

    await expect(deleteProviderCommand("custom", { configPath: filePath, yes: true, validate: valid })).rejects.toThrow()
    expect(parse(await readFile(filePath, "utf8")).provider.custom).toBeDefined()

    await deleteProviderCommand("custom", { configPath: filePath, confirmToken: "delete:custom", validate: valid })
    expect(parse(await readFile(filePath, "utf8")).provider.custom).toBeUndefined()
  })

  test("delete model supports dry-run and real delete", async () => {
    const filePath = await writeConfig(`{
  "provider": { "custom": { "models": { "model": {}, "other": {} } } }
}
`)

    await deleteModelCommand("custom/model", { configPath: filePath, dryRun: true, validate: valid })
    expect(parse(await readFile(filePath, "utf8")).provider.custom.models.model).toBeDefined()

    await deleteModelCommand("custom/model", { configPath: filePath, validate: valid })
    expect(parse(await readFile(filePath, "utf8")).provider.custom.models.model).toBeUndefined()
  })

  test("validation failure prevents mutating command writes", async () => {
    const filePath = await tempFile()

    await addProviderCommand("custom", {
      configPath: filePath,
      endpointKind: "openai-compatible",
      apiKeyEnv: "CUSTOM_API_KEY",
      model: ["model"],
      validate: invalid,
    })

    expect(process.exitCode).toBe(1)
    await expect(stat(filePath)).rejects.toThrow()
  })
})
