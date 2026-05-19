import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { disableLocalPlugin, enableLocalPlugin, installLocalPlugin, listLocalPlugins, resolveLocalPluginDirectory } from "../src/core/local-plugin-manager.js"

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), "ocfg-local-plugins-"))
}

describe("local plugin manager", () => {
  test("resolves global and project plugin directories", async () => {
    const home = await tempDir()
    const cwd = await tempDir()

    expect(resolveLocalPluginDirectory({ scope: "global", home })).toBe(path.join(home, ".config", "opencode", "plugins"))
    expect(resolveLocalPluginDirectory({ scope: "project", cwd })).toBe(path.join(cwd, ".opencode", "plugins"))
  })

  test("installs local plugin files", async () => {
    const cwd = await tempDir()
    const source = path.join(cwd, "source-plugin.ts")
    await writeFile(source, "export const Plugin = async () => ({})\n")

    const result = await installLocalPlugin("source-plugin.ts", { scope: "project", cwd })
    const installed = await readFile(result.toPath, "utf8")

    expect(result.changed).toBe(true)
    expect(result.toPath).toBe(path.join(cwd, ".opencode", "plugins", "source-plugin.ts"))
    expect(installed).toContain("Plugin")
  })

  test("dry-run install does not write files", async () => {
    const cwd = await tempDir()
    const source = path.join(cwd, "source-plugin.js")
    await writeFile(source, "export const Plugin = async () => ({})\n")

    const result = await installLocalPlugin(source, { scope: "project", cwd, dryRun: true })

    expect(result.dryRun).toBe(true)
    await expect(stat(result.toPath)).rejects.toThrow()
  })

  test("lists enables and disables local plugins", async () => {
    const cwd = await tempDir()
    const directory = path.join(cwd, ".opencode", "plugins")
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, "enabled.ts"), "")
    await writeFile(path.join(directory, "disabled.js.disabled"), "")

    expect((await listLocalPlugins({ scope: "project", cwd })).map((plugin) => [plugin.fileName, plugin.status])).toEqual([
      ["disabled.js.disabled", "disabled"],
      ["enabled.ts", "enabled"],
    ])

    await disableLocalPlugin("enabled", { scope: "project", cwd })
    await enableLocalPlugin("disabled", { scope: "project", cwd })

    expect((await listLocalPlugins({ scope: "project", cwd })).map((plugin) => [plugin.fileName, plugin.status])).toEqual([
      ["disabled.js", "enabled"],
      ["enabled.ts.disabled", "disabled"],
    ])
  })
})
