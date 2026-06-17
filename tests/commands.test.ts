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
import {
  addPluginCommand,
  deletePluginCommand,
  disablePluginCommand,
  editPluginCommand,
  enablePluginCommand,
  installPluginCommand,
  listPluginsCommand,
} from "../src/commands/plugin.js"
import {
  addPromptCommand,
  addRuleProfileCommand,
  deleteRulesCommand,
  deletePromptCommand,
  deleteRuleProfileCommand,
  editPromptCommand,
  editRuleProfileCommand,
  editRulesCommand,
  listPromptsCommand,
  removeInstructionCommand,
  switchRuleProfileCommand,
  switchPromptCommand,
} from "../src/commands/prompt.js"
import { defaultSecretFilePath, expandHomePath } from "../src/core/secret-file.js"
import { validateCommand } from "../src/commands/validate.js"
import { instructionRefForPromptFile, promptRefForFile } from "../src/core/prompt-manager.js"
import type { ValidationResult } from "../src/core/config-writer.js"
import { clearModelsDevCache } from "../src/core/models-dev.js"

function valid(): ValidationResult {
  return { valid: true, diagnostics: [] }
}

function invalid(): ValidationResult {
  return { valid: false, diagnostics: [{ severity: "high", source: "schema", path: "/", message: "invalid" }] }
}

const serverPluginManifest = async () => [{ kind: "server" as const }]

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

function ocfgDataPath() {
  if (!process.env.HOME) throw new Error("HOME is required for ocfg test data")
  return path.join(process.env.HOME, ".config", "ocfg")
}

function stubOpenAIGpt5Metadata() {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({
    openai: {
      id: "openai",
      name: "OpenAI",
      models: {
        "gpt-5.5": {
          id: "gpt-5.5",
          name: "GPT-5.5",
          limit: { context: 1050000, input: 922000, output: 128000 },
        },
      },
    },
  }), { status: 200 }))
}

describe("commands", () => {
  let exitCode: string | number | undefined
  let log: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>
  let warn: ReturnType<typeof vi.spyOn>
  let originalHome: string | undefined

  beforeEach(async () => {
    exitCode = process.exitCode
    process.exitCode = undefined
    originalHome = process.env.HOME
    process.env.HOME = await mkdtemp(path.join(os.tmpdir(), "oc-provider-editor-home-"))
    log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    clearModelsDevCache()
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({}), { status: 200 }))
  })

  afterEach(() => {
    process.exitCode = exitCode
    process.env.HOME = originalHome
    log.mockRestore()
    error.mockRestore()
    warn.mockRestore()
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
      channelType: "openai-compatible",
      apiKey: "sk-test",
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
      channelType: "gemini-compatible",
      apiKey: "sk-gemini-test",
      model: ["gemini-2.5-pro"],
      validate: valid,
    })

    const config = parse(await readFile(filePath, "utf8"))
    expect(config.provider.custom.npm).toBe("@ai-sdk/google")
    expect(config.provider.custom.options.apiKey).toBe(`{file:${defaultSecretFilePath("custom")}}`)
    await expect(readFile(expandHomePath(defaultSecretFilePath("custom")), "utf8")).resolves.toBe("sk-gemini-test")
  })

  test("add provider defaults GPT-5 long context off", async () => {
    stubOpenAIGpt5Metadata()
    const filePath = await tempFile()

    await addProviderCommand("custom", {
      configPath: filePath,
      channelType: "openai-compatible",
      apiKey: "sk-test",
      model: ["gpt-5.5"],
      validate: valid,
    })

    const config = parse(await readFile(filePath, "utf8"))
    expect(config.provider.custom.models["gpt-5.5"].limit).toEqual({ context: 400000, input: 272000, output: 128000 })
  })

  test("add provider fills missing GPT-5 input limit", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({
      openai: {
        id: "openai",
        name: "OpenAI",
        models: {
          "gpt-5.5": {
            id: "gpt-5.5",
            name: "GPT-5.5",
            limit: { context: 1000000, output: 128000 },
          },
        },
      },
    }), { status: 200 }))
    const filePath = await tempFile()

    await addProviderCommand("custom", {
      configPath: filePath,
      channelType: "openai-compatible",
      apiKey: "sk-test",
      model: ["gpt-5.5"],
      validate: valid,
    })

    const config = parse(await readFile(filePath, "utf8"))
    expect(config.provider.custom.models["gpt-5.5"].limit).toEqual({ context: 400000, input: 272000, output: 128000 })
  })

  test("add provider can enable GPT-5 long context", async () => {
    stubOpenAIGpt5Metadata()
    const filePath = await tempFile()

    await addProviderCommand("custom", {
      configPath: filePath,
      channelType: "openai-compatible",
      apiKey: "sk-test",
      model: ["gpt-5.5"],
      gpt5LongContext: true,
      validate: valid,
    })

    const config = parse(await readFile(filePath, "utf8"))
    expect(config.provider.custom.models["gpt-5.5"].limit).toEqual({ context: 1050000, input: 922000, output: 128000 })
  })

  test("add provider reports missing metadata warnings", async () => {
    const filePath = await tempFile()

    await addProviderCommand("custom", {
      configPath: filePath,
      channelType: "openai-compatible",
      apiKey: "sk-test",
      model: ["unknown-model"],
      validate: valid,
    })

    expect(warn.mock.calls.some((call) => String(call[0]).includes("no model limit or capabilities were guessed"))).toBe(true)
    const config = parse(await readFile(filePath, "utf8"))
    expect(config.provider.custom.models["unknown-model"].limit).toBeUndefined()
  })

  test("add provider includes metadata warnings in JSON output", async () => {
    const filePath = await tempFile()

    await addProviderCommand("custom", {
      configPath: filePath,
      channelType: "openai-compatible",
      apiKey: "sk-test",
      model: ["unknown-model"],
      dryRun: true,
      json: true,
      validate: valid,
    })

    const output = JSON.parse(log.mock.calls[0]?.[0] as string)
    expect(output.warnings[0]).toContain("no model limit or capabilities were guessed")
  })

  test("add provider requires api key content", async () => {
    const filePath = await tempFile()

    await expect(addProviderCommand("custom", { configPath: filePath, channelType: "openai-compatible", model: ["model"], validate: valid })).rejects.toThrow()
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

  test("edit provider rewrites channel type and managed api key", async () => {
    const filePath = await writeConfig(`{
  "provider": {
    "custom": {
      "npm": "@ai-sdk/openai-compatible",
      "options": { "apiKey": "{env:OLD}" },
      "models": { "model": {} }
    }
  }
}
`)

    await editProviderCommand("custom", { configPath: filePath, channelType: "openai-responses", apiKey: "sk-updated", validate: valid })

    const config = parse(await readFile(filePath, "utf8"))
    expect(config.provider.custom.npm).toBe("@ai-sdk/openai")
    expect(config.provider.custom.options.apiKey).toBe(`{file:${defaultSecretFilePath("custom")}}`)
    await expect(readFile(expandHomePath(defaultSecretFilePath("custom")), "utf8")).resolves.toBe("sk-updated")
  })

  test("edit provider requires channel type when current npm is unknown", async () => {
    const filePath = await writeConfig(`{
  "provider": {
    "custom": {
      "npm": "unknown-package",
      "options": { "apiKey": "{env:OLD}" },
      "models": { "model": {} }
    }
  }
}
`)

    await expect(editProviderCommand("custom", { configPath: filePath, name: "New", validate: valid })).rejects.toThrow(
      "Unknown provider type; re-run with --channel-type to continue",
    )
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

  test("edit model preserves existing input limit", async () => {
    const filePath = await writeConfig(`{
  "provider": {
    "custom": {
      "models": { "model": { "limit": { "context": 1050000, "input": 922000, "output": 128000 } } }
    }
  }
}
`)

    await editModelCommand("custom/model", { configPath: filePath, context: "400000", validate: valid })

    const config = parse(await readFile(filePath, "utf8"))
    expect(config.provider.custom.models.model.limit).toEqual({ context: 400000, input: 922000, output: 128000 })
  })

  test("edit model toggles GPT-5 long context preset", async () => {
    const filePath = await writeConfig(`{
  "provider": {
    "openai": {
      "models": { "gpt-5.5": { "limit": { "context": 400000, "input": 272000, "output": 128000 } } }
    }
  }
}
`)

    await editModelCommand("openai/gpt-5.5", { configPath: filePath, gpt5LongContext: true, validate: valid })

    let config = parse(await readFile(filePath, "utf8"))
    expect(config.provider.openai.models["gpt-5.5"].limit).toEqual({ context: 1050000, input: 922000, output: 128000 })

    await editModelCommand("openai/gpt-5.5", { configPath: filePath, gpt5LongContext: false, validate: valid })

    config = parse(await readFile(filePath, "utf8"))
    expect(config.provider.openai.models["gpt-5.5"].limit).toEqual({ context: 400000, input: 272000, output: 128000 })
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

  test("delete referenced model clears default model settings", async () => {
    const filePath = await writeConfig(`{
  "model": "custom/model",
  "small_model": "custom/model",
  "provider": { "custom": { "models": { "model": {}, "other": {} } } }
}
`)

    await deleteModelCommand("custom/model", { configPath: filePath, confirmToken: "delete:custom/model", validate: valid })

    const config = parse(await readFile(filePath, "utf8"))
    expect(config.model).toBeUndefined()
    expect(config.small_model).toBeUndefined()
    expect(config.provider.custom.models.model).toBeUndefined()
    expect(config.provider.custom.models.other).toBeDefined()
  })

  test("lists configured plugins", async () => {
    const filePath = await writeConfig(`{
  "plugin": ["opencode-wakatime", ["@my-org/custom-plugin", { "enabled": true }]]
}
`)

    await listPluginsCommand({ configPath: filePath, configScope: "project", json: true })

    const output = JSON.parse(log.mock.calls[0]?.[0] as string)
    expect(output.plugins.map((plugin: { packageName: string }) => plugin.packageName)).toEqual(["opencode-wakatime", "@my-org/custom-plugin"])
    expect(output.plugins.map((plugin: { status: string }) => plugin.status)).toEqual(["enabled", "enabled"])
    expect(output.npmPlugins).toHaveLength(2)
    expect(output.localPlugins).toEqual([])
  })

  test("lists configured server and tui npm plugins", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ocfg-plugin-list-targets-"))
    const serverPath = path.join(dir, "opencode.jsonc")
    const tuiPath = path.join(dir, "tui.jsonc")
    await writeFile(serverPath, `{
  "plugin": ["server-plugin"]
}
`, "utf8")
    await writeFile(tuiPath, `{
  "plugin": ["tui-plugin"]
}
`, "utf8")

    await listPluginsCommand({ configPath: serverPath, json: true })

    const output = JSON.parse(log.mock.calls.at(-1)?.[0] as string)
    expect(output.plugins.map((plugin: { packageName: string; configKind: string }) => [plugin.packageName, plugin.configKind])).toEqual([
      ["server-plugin", "server"],
      ["tui-plugin", "tui"],
    ])
  })

  test("adds edits and deletes plugin config", async () => {
    const filePath = await tempFile()

    await addPluginCommand("opencode-wakatime", { configPath: filePath, optionsJson: "{\"apiKey\":\"{env:WAKATIME_API_KEY}\"}", validate: valid })
    expect(parse(await readFile(filePath, "utf8")).plugin).toEqual([["opencode-wakatime", { apiKey: "{env:WAKATIME_API_KEY}" }]])

    await editPluginCommand("opencode-wakatime", { configPath: filePath, clearOptions: true, validate: valid })
    expect(parse(await readFile(filePath, "utf8")).plugin).toEqual(["opencode-wakatime"])

    await deletePluginCommand("opencode-wakatime", { configPath: filePath, validate: valid })
    expect(parse(await readFile(filePath, "utf8")).plugin).toEqual([])
  })

  test("installs enables and disables npm plugins", async () => {
    const filePath = await tempFile()

    await installPluginCommand("opencode-wakatime", { configPath: filePath, validate: valid, resolveManifest: serverPluginManifest })
    await installPluginCommand("opencode-wakatime", { configPath: filePath, optionsJson: "{\"enabled\":true}", validate: valid, resolveManifest: serverPluginManifest })
    expect(parse(await readFile(filePath, "utf8")).plugin).toEqual([["opencode-wakatime", { enabled: true }]])

    await disablePluginCommand("opencode-wakatime", { configPath: filePath, validate: valid })
    expect(parse(await readFile(filePath, "utf8")).plugin).toEqual([])

    await listPluginsCommand({ configPath: filePath, json: true })
    let output = JSON.parse(log.mock.calls.at(-1)?.[0] as string)
    expect(output.plugins.map((plugin: { packageName: string; status: string }) => [plugin.packageName, plugin.status])).toEqual([["opencode-wakatime", "disabled"]])

    await enablePluginCommand("opencode-wakatime", { configPath: filePath, validate: valid })
    expect(parse(await readFile(filePath, "utf8")).plugin).toEqual([["opencode-wakatime", { enabled: true }]])

    await disablePluginCommand("opencode-wakatime", { configPath: filePath, validate: valid })
    await deletePluginCommand("opencode-wakatime", { configPath: filePath, validate: valid })
    await listPluginsCommand({ configPath: filePath, json: true })
    output = JSON.parse(log.mock.calls.at(-1)?.[0] as string)
    expect(output.plugins).toEqual([])
  })

  test("installs npm plugins into server and tui configs based on manifest targets", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ocfg-plugin-targets-"))
    const resolveManifest = async () => [
      { kind: "server" as const, options: { custom: true } },
      { kind: "tui" as const, options: { compact: true } },
    ]

    await installPluginCommand("acme@1.2.3", { configScope: "global", home, validate: valid, resolveManifest })

    const configDir = path.join(home, ".config", "opencode")
    expect(parse(await readFile(path.join(configDir, "opencode.jsonc"), "utf8")).plugin).toEqual([["acme@1.2.3", { custom: true }]])
    expect(parse(await readFile(path.join(configDir, "tui.jsonc"), "utf8")).plugin).toEqual([["acme@1.2.3", { compact: true }]])
  })

  test("installs npm plugins into tui config with explicit target fallback", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ocfg-plugin-tui-"))

    await installPluginCommand("tui-only", { configScope: "global", home, pluginTarget: "tui", validate: valid })

    const configDir = path.join(home, ".config", "opencode")
    expect(parse(await readFile(path.join(configDir, "tui.jsonc"), "utf8")).plugin).toEqual(["tui-only"])
    await expect(stat(path.join(configDir, "opencode.jsonc"))).rejects.toThrow()
  })

  test("edits disables enables and deletes tui npm plugins by auto target", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ocfg-plugin-tui-manage-"))
    const serverPath = path.join(dir, "opencode.jsonc")
    const tuiPath = path.join(dir, "tui.jsonc")
    await writeFile(serverPath, `{
  "plugin": []
}
`, "utf8")
    await writeFile(tuiPath, `{
  "theme": "opencode",
  "plugin": ["tui-plugin"]
}
`, "utf8")

    await editPluginCommand("tui-plugin", { configPath: serverPath, optionsJson: "{\"compact\":true}", validate: valid })
    expect(parse(await readFile(tuiPath, "utf8")).plugin).toEqual([["tui-plugin", { compact: true }]])
    expect(parse(await readFile(serverPath, "utf8")).plugin).toEqual([])

    await disablePluginCommand("tui-plugin", { configPath: serverPath, validate: valid })
    expect(parse(await readFile(tuiPath, "utf8")).plugin).toEqual([])

    await listPluginsCommand({ configPath: serverPath, json: true })
    let output = JSON.parse(log.mock.calls.at(-1)?.[0] as string)
    expect(output.plugins.map((plugin: { packageName: string; status: string; configKind: string }) => [plugin.packageName, plugin.status, plugin.configKind])).toEqual([["tui-plugin", "disabled", "tui"]])

    await enablePluginCommand("tui-plugin", { configPath: serverPath, validate: valid })
    expect(parse(await readFile(tuiPath, "utf8")).plugin).toEqual([["tui-plugin", { compact: true }]])

    await disablePluginCommand("tui-plugin", { configPath: serverPath, validate: valid })
    await deletePluginCommand("tui-plugin", { configPath: serverPath, validate: valid })
    await listPluginsCommand({ configPath: serverPath, json: true })
    output = JSON.parse(log.mock.calls.at(-1)?.[0] as string)
    expect(output.plugins).toEqual([])
  })

  test("requires explicit target for ambiguous plugin management", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ocfg-plugin-ambiguous-"))
    const serverPath = path.join(dir, "opencode.jsonc")
    await writeFile(serverPath, `{
  "plugin": ["shared-plugin"]
}
`, "utf8")
    await writeFile(path.join(dir, "tui.jsonc"), `{
  "plugin": ["shared-plugin"]
}
`, "utf8")

    await expect(editPluginCommand("shared-plugin", { configPath: serverPath, optionsJson: "{}", validate: valid })).rejects.toThrow("multiple plugin targets")
  })

  test("enables explicit tui target with tui schema", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ocfg-plugin-tui-schema-"))
    const serverPath = path.join(dir, "opencode.jsonc")
    const tuiPath = path.join(dir, "tui.jsonc")
    await writeFile(serverPath, `{}
`, "utf8")
    await writeFile(tuiPath, `{}
`, "utf8")

    await enablePluginCommand("tui-plugin", { configPath: serverPath, pluginTarget: "tui", validate: valid })

    const tui = parse(await readFile(tuiPath, "utf8"))
    expect(tui.$schema).toBe("https://opencode.ai/tui.json")
    expect(tui.plugin).toEqual(["tui-plugin"])
  })

  test("explicit plugin target does not parse unrelated sibling config", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ocfg-plugin-explicit-target-"))
    const serverPath = path.join(dir, "opencode.jsonc")
    const tuiPath = path.join(dir, "tui.jsonc")
    await writeFile(serverPath, `{
  "plugin": ["server-plugin"]
}
`, "utf8")
    await writeFile(tuiPath, "{", "utf8")

    await disablePluginCommand("server-plugin", { configPath: serverPath, pluginTarget: "server", validate: valid })

    expect(parse(await readFile(serverPath, "utf8")).plugin).toEqual([])
  })

  test("explicit custom tui config path is not remapped", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ocfg-plugin-custom-tui-"))
    const customTuiPath = path.join(dir, "custom-tui.jsonc")

    await enablePluginCommand("tui-plugin", { configPath: customTuiPath, pluginTarget: "tui", validate: valid })

    const tui = parse(await readFile(customTuiPath, "utf8"))
    expect(tui.$schema).toBe("https://opencode.ai/tui.json")
    expect(tui.plugin).toEqual(["tui-plugin"])
    await expect(stat(path.join(dir, "tui.jsonc"))).rejects.toThrow()
  })

  test("plugin install dry-run previews multiple targets without creating files", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "ocfg-plugin-dry-run-"))
    const resolveManifest = async () => [{ kind: "server" as const }, { kind: "tui" as const }]

    await installPluginCommand("acme", { configScope: "global", home, dryRun: true, validate: valid, resolveManifest })

    const configDir = path.join(home, ".config", "opencode")
    await expect(stat(path.join(configDir, "opencode.jsonc"))).rejects.toThrow()
    await expect(stat(path.join(configDir, "tui.jsonc"))).rejects.toThrow()
    expect(log.mock.calls.some((call) => String(call[0]).includes("Dry run"))).toBe(true)
  })

  test("delete plugin both emits one json document for enabled and disabled targets", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ocfg-plugin-delete-json-"))
    const serverPath = path.join(dir, "opencode.jsonc")
    const tuiPath = path.join(dir, "tui.jsonc")
    await writeFile(serverPath, `{
  "plugin": ["shared-plugin"]
}
`, "utf8")
    await writeFile(tuiPath, `{
  "plugin": ["shared-plugin"]
}
`, "utf8")
    await disablePluginCommand("shared-plugin", { configPath: serverPath, pluginTarget: "tui", validate: valid })
    log.mockClear()

    await deletePluginCommand("shared-plugin", { configPath: serverPath, pluginTarget: "both", json: true, validate: valid })

    expect(log.mock.calls).toHaveLength(1)
    const output = JSON.parse(log.mock.calls[0]?.[0] as string)
    expect(output.results).toHaveLength(2)
    expect(output.results.map((result: { kind: string }) => result.kind)).toEqual(["server", "tui"])

    log.mockClear()
    await listPluginsCommand({ configPath: serverPath, json: true })
    expect(JSON.parse(log.mock.calls[0]?.[0] as string).plugins).toEqual([])
  })

  test("delete plugin both keeps disabled state when enabled target validation fails", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ocfg-plugin-delete-rollback-"))
    const serverPath = path.join(dir, "opencode.jsonc")
    const tuiPath = path.join(dir, "tui.jsonc")
    await writeFile(serverPath, `{
  "plugin": ["shared-plugin"]
}
`, "utf8")
    await writeFile(tuiPath, `{
  "plugin": ["shared-plugin"]
}
`, "utf8")
    await disablePluginCommand("shared-plugin", { configPath: serverPath, pluginTarget: "tui", validate: valid })

    await deletePluginCommand("shared-plugin", { configPath: serverPath, pluginTarget: "both", validate: invalid })

    expect(parse(await readFile(serverPath, "utf8")).plugin).toEqual(["shared-plugin"])
    log.mockClear()
    await listPluginsCommand({ configPath: serverPath, json: true })
    const output = JSON.parse(log.mock.calls[0]?.[0] as string)
    expect(output.plugins.map((plugin: { packageName: string; status: string; configKind: string }) => [plugin.packageName, plugin.status, plugin.configKind])).toEqual([
      ["shared-plugin", "enabled", "server"],
      ["shared-plugin", "disabled", "tui"],
    ])
  })

  test("enable plugin does not restore stale disabled options over enabled config", async () => {
    const filePath = await writeConfig(`{
  "plugin": [["opencode-wakatime", { "old": true }]]
}
`)

    await disablePluginCommand("opencode-wakatime", { configPath: filePath, validate: valid })
    await writeFile(filePath, `{
  "plugin": [["opencode-wakatime", { "fresh": true }]]
}
`)

    await enablePluginCommand("opencode-wakatime", { configPath: filePath, validate: valid })

    expect(parse(await readFile(filePath, "utf8")).plugin).toEqual([["opencode-wakatime", { fresh: true }]])
  })

  test("disable plugin does not remove config when disabled-state file is invalid", async () => {
    const filePath = await writeConfig(`{
  "plugin": [["opencode-wakatime", { "enabled": true }]]
}
`)
    const statePath = path.join(ocfgDataPath(), "plugins", "disabled-npm.json")
    await mkdir(path.dirname(statePath), { recursive: true })
    await writeFile(statePath, "not json")

    await expect(disablePluginCommand("opencode-wakatime", { configPath: filePath, validate: valid })).rejects.toThrow("Invalid disabled npm plugin state")

    expect(parse(await readFile(filePath, "utf8")).plugin).toEqual([["opencode-wakatime", { enabled: true }]])
  })

  test("installs enables and disables local plugins", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "ocfg-local-plugin-command-"))
    const source = path.join(cwd, "my-plugin.ts")
    await writeFile(source, "export const Plugin = async () => ({})\n")

    await installPluginCommand(source, { configScope: "project", cwd, local: true, validate: valid })
    await expect(readFile(path.join(cwd, ".opencode", "plugins", "my-plugin.ts"), "utf8")).resolves.toContain("Plugin")

    await disablePluginCommand("my-plugin", { configScope: "project", cwd, local: true, validate: valid })
    await expect(stat(path.join(cwd, ".opencode", "plugins", "my-plugin.ts.disabled"))).resolves.toBeDefined()

    await enablePluginCommand("my-plugin", { configScope: "project", cwd, local: true, validate: valid })
    await expect(stat(path.join(cwd, ".opencode", "plugins", "my-plugin.ts"))).resolves.toBeDefined()
  })

  test("plugin command dry-run does not create missing config", async () => {
    const filePath = await tempFile()

    await addPluginCommand("opencode-wakatime", { configPath: filePath, dryRun: true, validate: valid })

    await expect(stat(filePath)).rejects.toThrow()
    expect(log.mock.calls.some((call) => String(call[0]).includes("Dry run"))).toBe(true)
  })

  test("adds edits switches lists and deletes prompt files", async () => {
    const filePath = await tempFile()

    await addPromptCommand("review strict", { configPath: filePath, content: "# Review\n\nFind bugs.\n", validate: valid })
    await expect(readFile(path.join(ocfgDataPath(), "prompts", "review-strict.md"), "utf8")).resolves.toContain("Find bugs")

    await editPromptCommand("review-strict", { configPath: filePath, content: "Updated prompt\n", validate: valid })
    await expect(readFile(path.join(ocfgDataPath(), "prompts", "review-strict.md"), "utf8")).resolves.toBe("Updated prompt\n")

    await switchPromptCommand("review-strict", { configPath: filePath, agent: "build", validate: valid })
    expect(parse(await readFile(filePath, "utf8")).agent.build.prompt).toBe(promptRefForFile("review-strict.md", { scope: "custom", path: filePath, exists: false, format: "jsonc", ocfgDataPath: ocfgDataPath() }))

    await switchPromptCommand("review-strict", { configPath: filePath, rules: true, validate: valid })
    await expect(readFile(path.join(path.dirname(filePath), "AGENTS.md"), "utf8")).resolves.toBe("Updated prompt\n")

    await switchPromptCommand("review-strict", { configPath: filePath, globalInstructions: true, validate: valid })
    expect(parse(await readFile(filePath, "utf8")).instructions).toEqual([instructionRefForPromptFile("review-strict.md", { scope: "custom", path: filePath, exists: false, format: "jsonc", ocfgDataPath: ocfgDataPath() })])

    await listPromptsCommand({ configPath: filePath, json: true })
    const output = JSON.parse(log.mock.calls.at(-1)?.[0] as string)
    expect(output.prompts[0].activeAgents).toEqual(["build"])
    expect(output.prompts[0].instructionRefs).toEqual([instructionRefForPromptFile("review-strict.md", { scope: "custom", path: filePath, exists: false, format: "jsonc", ocfgDataPath: ocfgDataPath() })])
    expect(output.templates.length).toBeGreaterThan(0)

    await removeInstructionCommand(instructionRefForPromptFile("review-strict.md", { scope: "custom", path: filePath, exists: false, format: "jsonc", ocfgDataPath: ocfgDataPath() }), { configPath: filePath, validate: valid })
    expect(parse(await readFile(filePath, "utf8")).instructions).toBeUndefined()

    await deletePromptCommand("review-strict", { configPath: filePath, validate: valid })
    await expect(stat(path.join(ocfgDataPath(), "prompts", "review-strict.md"))).rejects.toThrow()
    expect(parse(await readFile(filePath, "utf8")).agent.build.prompt).toBeUndefined()
  })

  test("edits and deletes selected AGENTS.md rules", async () => {
    const filePath = await tempFile()
    const rulesPath = path.join(path.dirname(filePath), "AGENTS.md")

    await editRulesCommand({ configPath: filePath, content: "# Rules\n\nUse tests.\n", validate: valid })
    await expect(readFile(rulesPath, "utf8")).resolves.toContain("Use tests")

    await deleteRulesCommand({ configPath: filePath, validate: valid })
    await expect(stat(rulesPath)).rejects.toThrow()
  })

  test("adds edits switches and deletes reusable AGENTS.md configs", async () => {
    const filePath = await tempFile()
    const configDir = path.dirname(filePath)
    const ocfgDir = ocfgDataPath()

    await addRuleProfileCommand("fufu", { configPath: filePath, content: "# Fufu\n", validate: valid })
    await expect(readFile(path.join(ocfgDir, "agents", "fufu.md"), "utf8")).resolves.toBe("# Fufu\n")

    await editRuleProfileCommand("fufu", { configPath: filePath, content: "# Fufu updated\n", validate: valid })
    await editRulesCommand({ configPath: filePath, content: "# Original rules\n", validate: valid })
    const switchResult = await switchRuleProfileCommand("fufu", { configPath: filePath, validate: valid })
    await expect(readFile(path.join(configDir, "AGENTS.md"), "utf8")).resolves.toBe("# Fufu updated\n")
    expect(switchResult.preservedPath).toMatch(/previous-agents-\d{8}T\d{6}Z\.md$/)
    await expect(readFile(switchResult.preservedPath!, "utf8")).resolves.toBe("# Original rules\n")
    expect(warn.mock.calls.at(-1)?.[0]).toContain("current AGENTS.md is not saved in ocfg")

    warn.mockClear()
    await addRuleProfileCommand("other", { configPath: filePath, content: "# Other\n", validate: valid })
    await switchRuleProfileCommand("other", { configPath: filePath, validate: valid })
    expect(warn).not.toHaveBeenCalled()

    await listPromptsCommand({ configPath: filePath, json: true })
    const output = JSON.parse(log.mock.calls.at(-1)?.[0] as string)
    expect(output.ruleProfiles.find((profile: { fileName: string }) => profile.fileName === "other.md")).toMatchObject({ fileName: "other.md", active: true })

    await deleteRuleProfileCommand("fufu", { configPath: filePath, validate: valid })
    await expect(stat(path.join(ocfgDir, "agents", "fufu.md"))).rejects.toThrow()
  })

  test("validation failure prevents mutating command writes", async () => {
    const filePath = await tempFile()
    const secretPath = expandHomePath(defaultSecretFilePath("custom"))

    await addProviderCommand("custom", {
      configPath: filePath,
      channelType: "openai-compatible",
      apiKey: "sk-test",
      model: ["model"],
      validate: invalid,
    })

    expect(process.exitCode).toBe(1)
    await expect(stat(filePath)).rejects.toThrow()
    await expect(stat(secretPath)).rejects.toThrow()
    await expect(stat(path.dirname(secretPath))).rejects.toThrow()
  })
})
