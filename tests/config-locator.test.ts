import { mkdirSync, writeFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { locateConfig, locateGlobalConfig, locateProjectConfig } from "../src/core/config-locator.js"

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), "oc-provider-editor-"))
}

describe("config locator", () => {
  test("defaults to global jsonc path", async () => {
    const home = await tempDir()
    const target = locateGlobalConfig(home)
    expect(target.scope).toBe("global")
    expect(target.path).toBe(path.join(home, ".config", "opencode", "opencode.jsonc"))
    expect(target.exists).toBe(false)
  })

  test("uses existing global json when jsonc is absent", async () => {
    const home = await tempDir()
    const configDir = path.join(home, ".config", "opencode")
    mkdirSync(configDir, { recursive: true })
    writeFileSync(path.join(configDir, "opencode.json"), "{}")

    const target = locateGlobalConfig(home)
    expect(target.path.endsWith("opencode.json")).toBe(true)
    expect(target.format).toBe("json")
    expect(target.exists).toBe(true)
  })

  test("locates global tui config alongside opencode config", async () => {
    const home = await tempDir()
    const target = locateGlobalConfig(home, "tui")

    expect(target.path).toBe(path.join(home, ".config", "opencode", "tui.jsonc"))
    expect(target.exists).toBe(false)
  })

  test("ignores empty global tui json during automatic lookup", async () => {
    const home = await tempDir()
    const configDir = path.join(home, ".config", "opencode")
    mkdirSync(configDir, { recursive: true })
    writeFileSync(path.join(configDir, "tui.json"), "")

    const target = locateGlobalConfig(home, "tui")
    expect(target.path).toBe(path.join(configDir, "tui.jsonc"))
    expect(target.exists).toBe(false)
  })

  test("uses non-empty global tui json when jsonc is absent", async () => {
    const home = await tempDir()
    const configDir = path.join(home, ".config", "opencode")
    mkdirSync(configDir, { recursive: true })
    writeFileSync(path.join(configDir, "tui.json"), "{}")

    const target = locateGlobalConfig(home, "tui")
    expect(target.path).toBe(path.join(configDir, "tui.json"))
    expect(target.exists).toBe(true)
    expect(target.format).toBe("json")
  })

  test("finds project config by walking upward", async () => {
    const root = await tempDir()
    const nested = path.join(root, "a", "b")
    mkdirSync(nested, { recursive: true })
    writeFileSync(path.join(root, "opencode.jsonc"), "{}")

    const target = locateProjectConfig(nested)
    expect(target.path).toBe(path.join(root, "opencode.jsonc"))
    expect(target.exists).toBe(true)
  })

  test("finds project tui config by walking upward", async () => {
    const root = await tempDir()
    const nested = path.join(root, "a", "b")
    mkdirSync(nested, { recursive: true })
    writeFileSync(path.join(root, "tui.jsonc"), "{}")

    const target = locateProjectConfig(nested, undefined, "tui")
    expect(target.path).toBe(path.join(root, "tui.jsonc"))
    expect(target.exists).toBe(true)
  })

  test("ignores project tui json during automatic lookup", async () => {
    const root = await tempDir()
    const nested = path.join(root, "a", "b")
    mkdirSync(nested, { recursive: true })
    writeFileSync(path.join(root, "tui.json"), "")

    const target = locateProjectConfig(nested, undefined, "tui")
    expect(target.path).toBe(path.join(nested, "tui.jsonc"))
    expect(target.exists).toBe(false)
  })

  test("uses non-empty project tui json when jsonc is absent", async () => {
    const root = await tempDir()
    const nested = path.join(root, "a", "b")
    mkdirSync(nested, { recursive: true })
    writeFileSync(path.join(root, "tui.json"), "{}")

    const target = locateProjectConfig(nested, undefined, "tui")
    expect(target.path).toBe(path.join(root, "tui.json"))
    expect(target.exists).toBe(true)
    expect(target.format).toBe("json")
  })

  test("custom path overrides scope", async () => {
    const root = await tempDir()
    const custom = path.join(root, "custom.jsonc")
    const target = locateConfig({ configPath: custom, scope: "global" })
    expect(target.scope).toBe("custom")
    expect(target.path).toBe(custom)
  })

  test("custom path stays exact for named config lookup", async () => {
    const root = await tempDir()
    const custom = path.join(root, "custom-tui.jsonc")
    const target = locateConfig({ configPath: custom, scope: "global" }, "tui")

    expect(target.scope).toBe("custom")
    expect(target.path).toBe(custom)
  })
})
