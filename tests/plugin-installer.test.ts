import { mkdir, readFile, writeFile } from "node:fs/promises"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parse } from "jsonc-parser"
import { describe, expect, test } from "vitest"
import { locatePluginHostConfig, pluginTargetsFromPackage, preparePluginInstallWrites, PluginInstallError } from "../src/core/plugin-installer.js"

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), "ocfg-plugin-installer-"))
}

describe("plugin installer", () => {
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

    expect(locatePluginHostConfig({ configPath: serverPath }, "tui").path).toBe(tuiPath)
    expect(locatePluginHostConfig({ configPath: tuiPath }, "server").path).toBe(serverPath)
    expect(locatePluginHostConfig({ configPath: customTuiPath }, "tui").path).toBe(customTuiPath)
  })
})
