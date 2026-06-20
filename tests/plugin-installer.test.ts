import { mkdir, readFile, writeFile } from "node:fs/promises"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parse } from "jsonc-parser"
import { describe, expect, test } from "vitest"
import { locatePluginHostConfig, pluginTargetsFromPackage, preparePluginInstallWrites, PluginInstallError, resolveNpmViewCommand } from "../src/core/plugin-installer.js"

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), "ocfg-plugin-installer-"))
}

describe("plugin installer", () => {
  test("uses npm directly for npm view on non-Windows platforms", () => {
    expect(resolveNpmViewCommand("opencode-cache-hit@latest", { platform: "linux" })).toEqual({
      command: "npm",
      args: ["view", "opencode-cache-hit@latest", "--json"],
    })
  })

  test("uses npm cli js through node for npm view on Windows", () => {
    const nodePath = path.win32.join("C:/Program Files/nodejs", "node.exe")
    const npmCliPath = path.win32.join("C:/Program Files/nodejs", "node_modules", "npm", "bin", "npm-cli.js")

    expect(resolveNpmViewCommand("opencode-cache-hit@latest", {
      platform: "win32",
      execPath: nodePath,
      env: {},
      fileExists: (filePath) => filePath === npmCliPath,
    })).toEqual({
      command: nodePath,
      args: [npmCliPath, "view", "opencode-cache-hit@latest", "--json"],
    })
  })

  test("prefers npm execpath when it points at npm cli js on Windows", () => {
    const nodePath = path.win32.join("C:/Tools/node", "node.exe")
    const npmCliPath = path.win32.join("C:/Users/Azusa/AppData/Roaming/npm", "node_modules", "npm", "bin", "npm-cli.js")

    expect(resolveNpmViewCommand("acme", {
      platform: "win32",
      execPath: nodePath,
      env: { npm_execpath: npmCliPath },
      fileExists: (filePath) => filePath === npmCliPath,
    })).toEqual({
      command: nodePath,
      args: [npmCliPath, "view", "acme", "--json"],
    })
  })

  test("falls back to npm exe when npm cli js is unavailable on Windows", () => {
    const nodePath = path.win32.join("C:/Tools/node", "node.exe")
    const npmExePath = path.win32.join("C:/Users/Azusa/AppData/Local/Volta/bin", "npm.exe")

    expect(resolveNpmViewCommand("acme", {
      platform: "win32",
      execPath: nodePath,
      env: { Path: path.win32.dirname(npmExePath) },
      fileExists: (filePath) => filePath === npmExePath,
    })).toEqual({
      command: npmExePath,
      args: ["view", "acme", "--json"],
    })
  })

  test("reports a helpful error when npm cannot be found on Windows", () => {
    expect(() => resolveNpmViewCommand("acme", {
      platform: "win32",
      execPath: path.win32.join("C:/Tools/node", "node.exe"),
      env: {},
      fileExists: () => false,
    })).toThrow("Could not locate npm CLI on Windows")
  })

  test("detects server and tui targets from package metadata", () => {
    expect(pluginTargetsFromPackage("acme", { main: "./server.js" })).toEqual([{ kind: "server" }])
    expect(pluginTargetsFromPackage("acme", { exports: { "./server": "./server.js" } })).toEqual([{ kind: "server", options: undefined }])
    expect(pluginTargetsFromPackage("acme", { exports: { "./tui": { import: "./tui.js", config: { compact: true } } } })).toEqual([{ kind: "tui", options: { compact: true } }])
    expect(pluginTargetsFromPackage("acme", { "oc-themes": ["themes/forest.json"] })).toEqual([{ kind: "tui" }])
  })

  test("rejects invalid theme metadata", () => {
    expect(() => pluginTargetsFromPackage("acme", { "oc-themes": ["../outside.json"] })).toThrow(PluginInstallError)
    expect(() => pluginTargetsFromPackage("acme", { "oc-themes": ["file:///tmp/theme.json"] })).toThrow(PluginInstallError)
  })

  test("prepares server and tui writes while preserving existing JSONC comments", async () => {
    const dir = await tempDir()
    await mkdir(dir, { recursive: true })
    const serverPath = path.join(dir, "opencode.jsonc")
    const tuiPath = path.join(dir, "tui.jsonc")
    await writeFile(serverPath, `{
  // keep server
  "plugin": [
    "seed"
  ]
}
`, "utf8")
    await writeFile(tuiPath, `{
  // keep tui
  "plugin": [
    "seed"
  ]
}
`, "utf8")

    const writes = await preparePluginInstallWrites({
      spec: "acme@1.2.3",
      configPath: serverPath,
      resolveManifest: async () => [{ kind: "server", options: { server: true } }, { kind: "tui", options: { tui: true } }],
    })

    expect(writes.map((write) => [write.kind, write.target.path])).toEqual([["server", serverPath], ["tui", tuiPath]])
    expect(writes[0]?.nextText).toContain("// keep server")
    expect(writes[1]?.nextText).toContain("// keep tui")
    expect(parse(writes[0]?.nextText ?? "").plugin).toEqual(["seed", ["acme@1.2.3", { server: true }]])
    expect(parse(writes[1]?.nextText ?? "").plugin).toEqual(["seed", ["acme@1.2.3", { tui: true }]])
  })

  test("derives sibling host configs only from canonical custom paths", async () => {
    const dir = await tempDir()
    const serverPath = path.join(dir, "opencode.jsonc")
    const tuiPath = path.join(dir, "tui.jsonc")
    const customTuiPath = path.join(dir, "custom-tui.jsonc")

    expect(locatePluginHostConfig({ configPath: serverPath }, "tui").path).toBe(path.join(dir, "tui.json"))
    expect(locatePluginHostConfig({ configPath: tuiPath }, "server").path).toBe(path.join(dir, "opencode.json"))
    expect(locatePluginHostConfig({ configPath: customTuiPath }, "tui").path).toBe(customTuiPath)
  })

  test("prefers existing tui json sibling even when it is empty", async () => {
    const dir = await tempDir()
    const serverPath = path.join(dir, "opencode.jsonc")
    const tuiJsonPath = path.join(dir, "tui.json")
    await writeFile(tuiJsonPath, "", "utf8")

    expect(locatePluginHostConfig({ configPath: serverPath }, "tui").path).toBe(tuiJsonPath)
  })

  test("uses existing tui jsonc sibling when tui json is absent", async () => {
    const dir = await tempDir()
    const serverPath = path.join(dir, "opencode.jsonc")
    const tuiJsoncPath = path.join(dir, "tui.jsonc")
    await writeFile(tuiJsoncPath, "{}", "utf8")

    expect(locatePluginHostConfig({ configPath: serverPath }, "tui").path).toBe(tuiJsoncPath)
  })

  test("uses non-empty tui json sibling when jsonc is absent", async () => {
    const dir = await tempDir()
    const serverPath = path.join(dir, "opencode.jsonc")
    const tuiJsonPath = path.join(dir, "tui.json")
    await writeFile(tuiJsonPath, "{}", "utf8")

    expect(locatePluginHostConfig({ configPath: serverPath }, "tui").path).toBe(tuiJsonPath)
  })

  test("uses project .opencode json files for missing plugin configs", async () => {
    const dir = await tempDir()

    expect(locatePluginHostConfig({ scope: "project", cwd: dir }, "server").path).toBe(path.join(dir, ".opencode", "opencode.json"))
    expect(locatePluginHostConfig({ scope: "project", cwd: dir }, "tui").path).toBe(path.join(dir, ".opencode", "tui.json"))
  })

  test("keeps non-canonical custom config paths as a single plugin host", async () => {
    const dir = await tempDir()
    const customPath = path.join(dir, "custom.jsonc")
    await writeFile(customPath, `{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["acme"]
}
`, "utf8")

    const writes = await preparePluginInstallWrites({
      spec: "acme",
      configPath: customPath,
      pluginTarget: "server",
    })

    expect(writes.map((write) => [write.kind, write.target.path, write.mode])).toEqual([["server", customPath, "noop"]])
  })

  test("rejects multi-target installs into a non-canonical custom config path", async () => {
    const dir = await tempDir()
    const customPath = path.join(dir, "custom.jsonc")

    await expect(preparePluginInstallWrites({
      spec: "acme",
      configPath: customPath,
      resolveManifest: async () => [{ kind: "server" }, { kind: "tui" }],
    })).rejects.toThrow("cannot be used for multiple plugin targets")
  })

  test("anchors missing project host config to discovered .opencode directory", async () => {
    const dir = await tempDir()
    const child = path.join(dir, "src")
    await mkdir(path.join(dir, ".opencode"), { recursive: true })
    await mkdir(child, { recursive: true })
    await writeFile(path.join(dir, ".opencode", "opencode.json"), "{}", "utf8")

    expect(locatePluginHostConfig({ scope: "project", cwd: child }, "tui").path).toBe(path.join(dir, ".opencode", "tui.json"))
  })
})
